import "server-only";

import { prisma } from "@vtk/db";
import { computeTheokotStats, type StatsOrderStatus, type TheokotStats } from "./theokot-stats";

/**
 * Leest de verkoopdagen van een periode met hun aanbod en bestellingen, en
 * rekent de statistieken uit (`computeTheokotStats`). Enkel dagen die open
 * waren en al begonnen zijn: een dag van volgende week zou elk gemiddelde naar
 * beneden trekken.
 */
export async function loadTheokotStats(range: { from: Date | null; to: Date }): Promise<TheokotStats> {
  const sessions = await prisma.theokotSession.findMany({
    where: {
      isOpen: true,
      pickupStart: { lte: range.to },
      ...(range.from ? { date: { gte: range.from } } : {}),
    },
    select: {
      id: true,
      date: true,
      orderOpenAt: true,
      orderCloseAt: true,
      pickupStart: true,
      items: {
        select: {
          id: true,
          productId: true,
          nameNl: true,
          nameEn: true,
          priceCents: true,
          quantity: true,
          isWeeklySpecial: true,
          _count: { select: { meetingReservations: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });

  const orders = await prisma.theokotOrder.findMany({
    where: { sessionId: { in: sessions.map((session) => session.id) } },
    select: {
      id: true,
      sessionId: true,
      userId: true,
      status: true,
      createdAt: true,
      pickedUpAt: true,
      totalCents: true,
      grocomeetId: true,
      voucherRedemption: { select: { id: true } },
      lines: { select: { sessionItemId: true, quantity: true, unitPriceCents: true } },
      releaseNoShowAt: true,
      releases: { select: { sessionItemId: true, quantity: true } },
    },
  });

  return computeTheokotStats(
    sessions.map((session) => ({
      ...session,
      items: session.items.map(({ _count, ...item }) => ({
        ...item,
        meetingCount: _count.meetingReservations,
      })),
    })),
    orders.map(({ voucherRedemption, grocomeetId, releaseNoShowAt, releases, ...order }) => ({
      ...order,
      // Enkel bij een opgehaalde bestelling: bij een `NO_SHOW` staat wat bleef
      // liggen al op de lijnen (`settleLeftoverReleases`).
      leftover: order.status === "PICKED_UP" && releaseNoShowAt ? releases : [],
      status: order.status as StatsOrderStatus,
      voucher: voucherRedemption !== null,
      grocomeet: grocomeetId !== null,
    })),
  );
}
