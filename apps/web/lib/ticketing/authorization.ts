import "server-only";

import { prisma } from "@vtk/db";
import { currentWorkingYear, hasPermission, type SessionPayload } from "@vtk/auth";
import { getAuthorizationPreview, requireSession } from "@/lib/session";

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
  SCANNER: ["VIEW_EVENT", "SCAN"],
  REPORTER: ["VIEW_EVENT", "VIEW_REPORTS"],
};

export function capabilitiesForTicketRoles(roles: readonly TicketRole[]): TicketCapability[] {
  const capabilities = new Set<TicketCapability>();
  for (const role of roles) {
    ROLE_CAPABILITIES[role].forEach((capability) => capabilities.add(capability));
  }
  return [...capabilities];
}

// Live (uit de DB, niet uit de sessie-snapshot) checken of een gebruiker een
// permissie heeft voor het huidige werkingsjaar. Spiegelt de resolver in
// packages/auth/src/server/session.ts: rechten komen uit rollen, direct
// toegewezen (UserRole) of via een post (GroupRole; DEFAULT voor elk lid,
// LEADER enkel voor de lead).
async function hasLivePermission(userId: string, code: string): Promise<boolean> {
  const year = currentWorkingYear();

  const directRole = await prisma.userRole.findFirst({
    where: {
      userId,
      year,
      role: { permissions: { some: { permission: { code } } } },
    },
    select: { roleId: true },
  });
  if (directRole) return true;

  // Post-granted: DEFAULT telt voor elk lid, LEADER enkel wanneer je de lead bent.
  const memberships = await prisma.groupMembership.findMany({
    where: {
      userId,
      year,
      group: {
        roleGrants: {
          some: { role: { permissions: { some: { permission: { code } } } } },
        },
      },
    },
    select: {
      role: true,
      group: {
        select: {
          roleGrants: {
            where: { role: { permissions: { some: { permission: { code } } } } },
            select: { kind: true },
          },
        },
      },
    },
  });
  return memberships.some((m) =>
    m.group.roleGrants.some((grant) => grant.kind === "DEFAULT" || m.role === "LEAD")
  );
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

export async function canAccessAnyTicketEvent(): Promise<boolean> {
  const session = await requireSession();
  if (hasPermission(session, "tickets.manageAll")) return true;

  const preview = await getAuthorizationPreview();
  const allGroupIds = session.groups.map((group) => group.id);
  const leadGroupIds = session.groups.filter((group) => group.role === "LEAD").map((group) => group.id);

  const count = await prisma.ticketEvent.count({
    where: {
      OR: [
        ...(preview ? [] : [{ userGrants: { some: { userId: session.user.id } } }]),
        {
          groupGrants: {
            some: {
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
