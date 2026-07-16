import "server-only";

import { prisma } from "@vtk/db";
import { requireSession } from "@/lib/session";

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

async function hasLiveGlobalPermission(userId: string, code: string): Promise<boolean> {
  const membership = await prisma.groupMembership.findFirst({
    where: {
      userId,
      group: {
        permissions: { some: { permission: { code } } },
      },
    },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function hasLiveTicketManageAll(
  userId: string,
  isSuperAdmin = false
): Promise<boolean> {
  return isSuperAdmin || hasLiveGlobalPermission(userId, "tickets.manageAll");
}

export async function canCreateTicketEventForGroup(
  userId: string,
  groupId: string,
  isSuperAdmin = false
): Promise<boolean> {
  if (isSuperAdmin) return true;
  const membership = await prisma.groupMembership.findFirst({
    where: {
      userId,
      groupId,
      role: "LEAD",
      group: {
        permissions: { some: { permission: { code: "tickets.create" } } },
      },
    },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function getTicketEventAccess(eventId: string) {
  const session = await requireSession();
  const event = await prisma.ticketEvent.findUnique({
    where: { id: eventId },
    include: { ownerGroup: true, calendarEvent: true },
  });
  if (!event) return null;

  const capabilities = new Set<TicketCapability>();
  const hasGlobalAccess = await hasLiveTicketManageAll(
    session.user.id,
    session.user.isSuperAdmin
  );

  if (hasGlobalAccess) {
    TICKET_CAPABILITIES.forEach((capability) => capabilities.add(capability));
  } else {
    const memberships = await prisma.groupMembership.findMany({
      where: { userId: session.user.id },
      select: { groupId: true, role: true },
    });
    const membershipByGroup = new Map(memberships.map((row) => [row.groupId, row.role]));
    const [userGrant, groupGrants] = await Promise.all([
      prisma.ticketEventUserGrant.findUnique({
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
  if (session.user.isSuperAdmin) return true;
  if (await hasLiveGlobalPermission(session.user.id, "tickets.manageAll")) return true;

  const memberships = await prisma.groupMembership.findMany({
    where: { userId: session.user.id },
    select: { groupId: true, role: true },
  });
  const allGroupIds = memberships.map((row) => row.groupId);
  const leadGroupIds = memberships.filter((row) => row.role === "LEAD").map((row) => row.groupId);

  const count = await prisma.ticketEvent.count({
    where: {
      OR: [
        { userGrants: { some: { userId: session.user.id } } },
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
