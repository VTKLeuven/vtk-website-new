import "server-only";

import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { getAuthorizationPreview, requireSession } from "@/lib/session";
import { capabilitiesForTicketRoles } from "./authorization";
import { presaleStart } from "./presale";
import {
  computeTicketStats,
  type StatsEventInput,
  type StatsTicketInput,
  type TicketStats,
} from "./statsCompute";

/**
 * Wie mag welke statistieken zien?
 *
 * Dezelfde regel als het eventoverzicht in de admin: `VIEW_REPORTS` op het
 * event (OWNER, MANAGER, FINANCE of REPORTER), en de omzet enkel waar ook
 * `VIEW_FINANCE` geldt. Een SCANNER-grant of de standaard scantoegang telt
 * hier niet, net zoals die de Tickets-tab niet openzet.
 *
 * `all` = `tickets.manageAll`: alles, met omzet.
 */
export type TicketReportAccess =
  | { all: true }
  | { all: false; events: Map<string, { finance: boolean }> };

export async function ticketReportAccess(): Promise<TicketReportAccess> {
  const session = await requireSession();
  if (hasPermission(session, "tickets.manageAll")) return { all: true };

  const preview = await getAuthorizationPreview();
  const membershipByGroup = new Map(session.groups.map((group) => [group.id, group.role]));
  const [userGrants, groupGrants] = await Promise.all([
    preview
      ? Promise.resolve([])
      : prisma.ticketEventUserGrant.findMany({
          where: { userId: session.user.id },
          select: { eventId: true, role: true },
        }),
    prisma.ticketEventGroupGrant.findMany({
      where: { groupId: { in: [...membershipByGroup.keys()] } },
      select: { eventId: true, groupId: true, role: true, scope: true },
    }),
  ]);

  const roles = new Map<string, (typeof userGrants)[number]["role"][]>();
  const add = (eventId: string, role: (typeof userGrants)[number]["role"]) =>
    roles.set(eventId, [...(roles.get(eventId) ?? []), role]);
  for (const grant of userGrants) add(grant.eventId, grant.role);
  for (const grant of groupGrants) {
    const membershipRole = membershipByGroup.get(grant.groupId);
    if (!membershipRole) continue;
    if (grant.scope === "LEADS_ONLY" && membershipRole !== "LEAD") continue;
    add(grant.eventId, grant.role);
  }

  const events = new Map<string, { finance: boolean }>();
  for (const [eventId, eventRoles] of roles) {
    const capabilities = capabilitiesForTicketRoles(eventRoles);
    if (!capabilities.includes("VIEW_REPORTS")) continue;
    events.set(eventId, { finance: capabilities.includes("VIEW_FINANCE") });
  }
  return { all: false, events };
}

/** De events waar deze toegang statistieken voor geeft, nieuwste eerst. */
export async function listReportableTicketEvents(access: TicketReportAccess) {
  return prisma.ticketEvent.findMany({
    where: access.all ? undefined : { id: { in: [...access.events.keys()] } },
    select: {
      id: true,
      slug: true,
      titleNl: true,
      titleEn: true,
      startsAt: true,
      endsAt: true,
      status: true,
      ownerGroup: { select: { id: true, nameNl: true, nameEn: true } },
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
  });
}

export type ReportableTicketEvent = Awaited<ReturnType<typeof listReportableTicketEvents>>[number];

/**
 * Alle cijfers voor een set events. De beller heeft de lijst al beperkt tot
 * wat deze toegang mag zien; hier wordt enkel nog per event beslist of de
 * omzet meetelt.
 */
export async function loadTicketStats(
  eventIds: string[],
  access: TicketReportAccess,
  locale: "nl" | "en",
): Promise<TicketStats> {
  const [events, tickets, orders, types] = await Promise.all([
    prisma.ticketEvent.findMany({
      where: { id: { in: eventIds } },
      select: {
        id: true,
        slug: true,
        titleNl: true,
        titleEn: true,
        startsAt: true,
        salesStartAt: true,
        presaleLeadMinutes: true,
        currency: true,
        createdAt: true,
        ownerGroup: { select: { id: true, nameNl: true, nameEn: true } },
        inventoryPools: { where: { active: true }, select: { capacity: true } },
      },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.ticket.findMany({
      where: { eventId: { in: eventIds } },
      select: {
        eventId: true,
        status: true,
        issuedAt: true,
        checkedInAt: true,
        orderItem: {
          select: {
            ticketTypeId: true,
            ticketTypeName: true,
            totalCents: true,
            memberPrice: true,
            refundItems: { select: { amountCents: true, refund: { select: { status: true } } } },
            order: {
              select: {
                id: true,
                paidAt: true,
                buyerUserId: true,
                buyerEmail: true,
                source: true,
                sourceCampaign: true,
              },
            },
          },
        },
      },
    }),
    prisma.ticketOrder.groupBy({
      by: ["eventId", "status", "source"],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    }),
    prisma.ticketType.findMany({
      where: { eventId: { in: eventIds } },
      select: { id: true, eventId: true, nameNl: true, nameEn: true, audience: true, sortOrder: true },
    }),
  ]);

  const pick = (nl: string, en: string | null) => (locale === "en" && en ? en : nl);
  const eventInputs: StatsEventInput[] = events.map((event) => ({
    id: event.id,
    title: pick(event.titleNl, event.titleEn),
    slug: event.slug,
    groupId: event.ownerGroup.id,
    groupName: pick(event.ownerGroup.nameNl, event.ownerGroup.nameEn),
    startsAt: event.startsAt,
    salesOpenAt: presaleStart(event) ?? event.salesStartAt,
    capacity: event.inventoryPools.reduce((sum, pool) => sum + pool.capacity, 0),
    currency: event.currency,
    finance: access.all || (access.events.get(event.id)?.finance ?? false),
  }));

  const ticketInputs: StatsTicketInput[] = tickets.map((ticket) => {
    const item = ticket.orderItem;
    return {
      eventId: ticket.eventId,
      typeId: item.ticketTypeId,
      typeName: item.ticketTypeName,
      status: ticket.status,
      soldAt: item.order.paidAt ?? ticket.issuedAt,
      checkedInAt: ticket.checkedInAt,
      totalCents: item.totalCents,
      // Enkel wat echt teruggestort is; een terugbetaling die nog loopt of
      // mislukte, is geld dat de kring nog heeft.
      refundedCents: item.refundItems
        .filter((refundItem) => refundItem.refund.status === "SUCCEEDED")
        .reduce((sum, refundItem) => sum + refundItem.amountCents, 0),
      memberPrice: item.memberPrice,
      orderId: item.order.id,
      buyerKey: item.order.buyerUserId ?? item.order.buyerEmail.toLowerCase(),
      signedIn: item.order.buyerUserId !== null,
      source: item.order.source,
      campaign: item.order.sourceCampaign,
    };
  });

  return computeTicketStats(
    eventInputs,
    ticketInputs,
    orders.map((order) => ({
      eventId: order.eventId,
      status: order.status,
      source: order.source,
      count: order._count._all,
    })),
    types.map((type) => ({
      id: type.id,
      eventId: type.eventId,
      name: pick(type.nameNl, type.nameEn),
      audience: type.audience,
      sortOrder: type.sortOrder,
    })),
    { otherLabel: locale === "nl" ? "Andere" : "Other" },
  );
}
