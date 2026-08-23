import "server-only";

import { prisma } from "@vtk/db";
// Rechtstreeks uit @prisma/client, niet via @vtk/db: dat package exporteert
// bewust enkel `prisma` (zie AGENTS.md).
import type { TicketEventStatus, TicketGrantRole } from "@prisma/client";
import { currentWorkingYear, hasPermission, type SessionPayload } from "@vtk/auth";
import { getAuthorizationPreview, requireSession } from "@/lib/session";
import { hasLivePermission } from "@/lib/livePermissions";

export const TICKET_CAPABILITIES = [
  "VIEW_EVENT",
  "MANAGE_EVENT",
  "MANAGE_INVENTORY",
  "VIEW_ATTENDEES",
  "MANAGE_ORDERS",
  "VIEW_FINANCE",
  "REFUND",
  "SCAN",
  "VIEW_REPORTS",
  "MANAGE_ACCESS",
  // Smaller dan MANAGE_ACCESS: enkel scanners toevoegen en weghalen. Bestaat
  // omdat de leads van de eigenaarspost MANAGER krijgen bij het aanmaken, en die
  // rol geen MANAGE_ACCESS draagt; zonder deze capability kon net de post die
  // het event organiseert niemand aan de deur zetten.
  "MANAGE_SCANNERS",
  "VIEW_AUDIT",
] as const;

export type TicketCapability = (typeof TICKET_CAPABILITIES)[number];
type TicketRole = "OWNER" | "MANAGER" | "FINANCE" | "SCANNER" | "REPORTER";

const ROLE_CAPABILITIES: Record<TicketRole, readonly TicketCapability[]> = {
  OWNER: TICKET_CAPABILITIES,
  MANAGER: [
    "VIEW_EVENT",
    "MANAGE_EVENT",
    "MANAGE_INVENTORY",
    "VIEW_ATTENDEES",
    "MANAGE_ORDERS",
    "SCAN",
    "VIEW_REPORTS",
    "MANAGE_SCANNERS",
    "VIEW_AUDIT",
  ],
  FINANCE: [
    "VIEW_EVENT",
    "VIEW_ATTENDEES",
    "MANAGE_ORDERS",
    "VIEW_FINANCE",
    "REFUND",
    "VIEW_REPORTS",
    "VIEW_AUDIT",
  ],
  // Bewust zonder VIEW_EVENT. Die capability bewaakt het event-dashboard in de
  // admin (`admin/tickets/[eventId]/layout.tsx`), en wie aan de deur staat hoort
  // daar niet te geraken; het scanpad zelf heeft ze nergens nodig.
  SCANNER: ["SCAN"],
  REPORTER: ["VIEW_EVENT", "VIEW_REPORTS"],
};

export function capabilitiesForTicketRoles(roles: readonly TicketRole[]): TicketCapability[] {
  const capabilities = new Set<TicketCapability>();
  for (const role of roles) {
    ROLE_CAPABILITIES[role].forEach((capability) => capabilities.add(capability));
  }
  return [...capabilities];
}

export async function hasLiveTicketManageAll(
  userId: string,
  isSuperAdmin = false
): Promise<boolean> {
  return isSuperAdmin || hasLivePermission(userId, "tickets.manageAll");
}

export async function canCreateTicketEventForGroup(
  userId: string,
  groupId: string,
  isSuperAdmin = false
): Promise<boolean> {
  if (isSuperAdmin) return true;
  // De lead van de post mag ticketevents aanmaken voor die post, mits de post een
  // rol toekent die `tickets.create` bevat (praesidium in de seed).
  const membership = await prisma.groupMembership.findFirst({
    where: {
      userId,
      groupId,
      role: "LEAD",
      year: currentWorkingYear(),
      group: {
        roleGrants: {
          some: { role: { permissions: { some: { permission: { code: "tickets.create" } } } } },
        },
      },
    },
    select: { id: true },
  });
  return Boolean(membership);
}

/** Session-snapshot variant used by read-only admin rendering and previews. */
export function canSessionCreateTicketEventForGroup(
  session: SessionPayload,
  groupId: string,
): boolean {
  if (hasPermission(session, "tickets.manageAll")) return true;
  return (
    hasPermission(session, "tickets.create") &&
    session.groups.some((group) => group.id === groupId && group.role === "LEAD")
  );
}

/**
 * De standaardregel: wie mag scannen zonder dat er een grant voor hem staat.
 *
 * Een deurploeg is zelden precies de post die het event aanmaakte. Iemand die om
 * tien uur komt bijspringen moest vroeger eerst een OWNER vinden die op een
 * adminpagina een grant toevoegde, en dat gebeurt niet; dan scant er gewoon
 * iemand anders met zijn eigen account.
 *
 * Vandaar: **elke praesidiumpost mag elk event scannen.** Een werkgroep is
 * smaller; die mag enkel de events van haar eigen werkgroep, want ze staat los
 * van de dagelijkse werking van de kring. Een post mag wel de events van een
 * werkgroep scannen, en dat volgt al uit de eerste tak.
 *
 * Wat dit geeft is de rol `SCANNER`, dus enkel `SCAN`: de scanner en niets in
 * de admin.
 * Het gevolg dat je hiermee aanvaardt staat in `docs/design-decisions.md`: wie
 * kan scannen, ziet de namen van alle deelnemers, want het offline-manifest
 * draagt die lijst mee naar het toestel. `openScanning` is de uitweg voor een
 * event waar dat niet kan.
 *
 * Puur en zonder prisma, zodat de regel testbaar is en niet in drie vormen uit
 * elkaar groeit; `openScanningWhere` is dezelfde regel voor de SQL-kant.
 */
export function hasOpenScanAccess(
  session: SessionPayload,
  event: { ownerGroupId: string; openScanning: boolean }
): boolean {
  if (!event.openScanning) return false;
  return session.groups.some(
    (group) => group.type === "PRAESIDIUM" || group.id === event.ownerGroupId
  );
}

/**
 * Dezelfde regel als `hasOpenScanAccess`, maar als filter op `TicketEvent`.
 *
 * `null` betekent "deze sessie krijgt langs deze weg niets", en dan hoort er ook
 * geen tak in de `OR` bij te komen: een lege `{}` zou net alles doorlaten.
 */
export function openScanningWhere(session: SessionPayload) {
  if (session.groups.some((group) => group.type === "PRAESIDIUM")) {
    return { openScanning: true };
  }
  const groupIds = session.groups.map((group) => group.id);
  if (groupIds.length === 0) return null;
  return { openScanning: true, ownerGroupId: { in: groupIds } };
}

export async function getTicketEventAccess(eventId: string) {
  const session = await requireSession();
  const event = await prisma.ticketEvent.findUnique({
    where: { id: eventId },
    include: { ownerGroup: true, calendarEvent: true },
  });
  if (!event) return null;

  const capabilities = new Set<TicketCapability>();
  const hasGlobalAccess = hasPermission(session, "tickets.manageAll");

  if (hasGlobalAccess) {
    TICKET_CAPABILITIES.forEach((capability) => capabilities.add(capability));
  } else {
    const preview = await getAuthorizationPreview();
    const membershipByGroup = new Map(session.groups.map((group) => [group.id, group.role]));
    const [userGrant, groupGrants] = await Promise.all([
      preview
        ? Promise.resolve(null)
        : prisma.ticketEventUserGrant.findUnique({
            where: { eventId_userId: { eventId, userId: session.user.id } },
            select: { role: true },
          }),
      prisma.ticketEventGroupGrant.findMany({
        where: { eventId, groupId: { in: [...membershipByGroup.keys()] } },
        select: { groupId: true, role: true, scope: true },
      }),
    ]);

    const roles: TicketRole[] = [];
    // De standaardregel staat naast de grants, niet in de plaats ervan: ze kan
    // enkel SCANNER toevoegen, dus een grant geeft altijd evenveel of meer.
    if (hasOpenScanAccess(session, event)) roles.push("SCANNER");
    if (userGrant) roles.push(userGrant.role as TicketRole);
    for (const grant of groupGrants) {
      const membershipRole = membershipByGroup.get(grant.groupId);
      if (!membershipRole) continue;
      if (grant.scope === "LEADS_ONLY" && membershipRole !== "LEAD") continue;
      roles.push(grant.role as TicketRole);
    }
    capabilitiesForTicketRoles(roles).forEach((capability) => capabilities.add(capability));
  }

  return { session, event, capabilities: [...capabilities] };
}

export async function requireTicketEventCapability(
  eventId: string,
  capability: TicketCapability
) {
  const access = await getTicketEventAccess(eventId);
  if (!access) throw new Error("TICKET_EVENT_NOT_FOUND");
  if (!access.capabilities.includes(capability)) throw new Error("FORBIDDEN");
  return access;
}

/**
 * De events die deze gebruiker mag scannen, voor het keuzescherm op `/scan`.
 *
 * Dat scherm bestaat omdat de scanner op het beginscherm van een telefoon kan
 * staan: dat icoon moet ergens landen dat volgende maand nog klopt, en een
 * scanner-URL van één event is dat niet.
 *
 * Het venster loopt van twaalf uur geleden tot een maand vooruit. Twaalf uur
 * terug, want een cantus die om 3u eindigt scan je nog om 2u; een maand vooruit,
 * zodat de lijst niet volloopt met wat pas in het tweede semester doorgaat.
 */
export async function listScannableTicketEvents() {
  const session = await requireSession();
  const now = new Date();
  const hidden: TicketEventStatus[] = ["DRAFT", "CANCELLED", "ARCHIVED"];
  const window = {
    endsAt: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
    startsAt: { lte: new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000) },
    archivedAt: null,
    status: { notIn: hidden },
  };

  if (hasPermission(session, "tickets.manageAll")) {
    return prisma.ticketEvent.findMany({
      where: window,
      orderBy: { startsAt: "asc" },
      select: { id: true, titleNl: true, titleEn: true, startsAt: true, location: true },
    });
  }

  const preview = await getAuthorizationPreview();
  const allGroupIds = session.groups.map((group) => group.id);
  const leadGroupIds = session.groups
    .filter((group) => group.role === "LEAD")
    .map((group) => group.id);
  // FINANCE en REPORTER dragen geen SCAN, dus die grants horen hier niet bij.
  const scanRoles: TicketGrantRole[] = ["OWNER", "MANAGER", "SCANNER"];
  const openScanning = openScanningWhere(session);

  return prisma.ticketEvent.findMany({
    where: {
      ...window,
      OR: [
        // De standaardregel; `null` betekent niets toevoegen, want een lege
        // voorwaarde zou hier net alles doorlaten.
        ...(openScanning ? [openScanning] : []),
        ...(preview
          ? []
          : [{ userGrants: { some: { userId: session.user.id, role: { in: scanRoles } } } }]),
        {
          groupGrants: {
            some: {
              role: { in: scanRoles },
              OR: [
                { scope: "ALL_MEMBERS" as const, groupId: { in: allGroupIds } },
                { scope: "LEADS_ONLY" as const, groupId: { in: leadGroupIds } },
              ],
            },
          },
        },
      ],
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, titleNl: true, titleEn: true, startsAt: true, location: true },
  });
}

/**
 * Of de **Tickets-tab** in de adminnavigatie mag verschijnen.
 *
 * Kunnen scannen telt hier bewust niet mee. De standaardregel geeft elk
 * praesidiumlid `SCAN` op elk event, en een losse `SCANNER`-grant doet hetzelfde
 * voor wie aan de deur komt helpen; zou dat de tab openzetten, dan zat het halve
 * praesidium plots in het ticketbeheer. Wie enkel scant, hoort enkel `/scan` te
 * zien.
 */
export async function canAccessAnyTicketEvent(): Promise<boolean> {
  const session = await requireSession();
  if (hasPermission(session, "tickets.manageAll")) return true;

  const preview = await getAuthorizationPreview();
  const allGroupIds = session.groups.map((group) => group.id);
  const leadGroupIds = session.groups.filter((group) => group.role === "LEAD").map((group) => group.id);
  const beyondScanning: TicketGrantRole[] = ["OWNER", "MANAGER", "FINANCE", "REPORTER"];

  const count = await prisma.ticketEvent.count({
    where: {
      OR: [
        ...(preview
          ? []
          : [{ userGrants: { some: { userId: session.user.id, role: { in: beyondScanning } } } }]),
        {
          groupGrants: {
            some: {
              role: { in: beyondScanning },
              OR: [
                { scope: "ALL_MEMBERS", groupId: { in: allGroupIds } },
                { scope: "LEADS_ONLY", groupId: { in: leadGroupIds } },
              ],
            },
          },
        },
      ],
    },
  });
  return count > 0;
}
