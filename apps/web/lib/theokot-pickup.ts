import "server-only";

import { prisma } from "@vtk/db";
import type { TheokotOrderStatus } from "@prisma/client";

import { brusselsTimeOnDay } from "@/lib/theokot";
import { outstandingShiftReward } from "@/lib/shift/rewards";

/**
 * De afhaalbalie, los van de weg waarlangs iemand herkend werd.
 *
 * Er zijn er intussen drie: een r-nummer intikken, een studentenkaart scannen, en
 * sinds de app een pas scannen. Alle drie eindigen ze op dezelfde vraag ("wat
 * heeft deze persoon vandaag besteld en hoeveel bonnetjes staan er open"), en die
 * hoort dus één keer beantwoord te worden. Dit bestand is dat antwoord; de
 * actions en de app-API zijn enkel de deuren ernaartoe.
 */

export type PickupLine = {
  nameNl: string;
  nameEn: string | null;
  quantity: number;
  unitPriceCents: number;
};

export type PickupOrder = {
  orderId: string;
  status: TheokotOrderStatus;
  totalCents: number;
  lines: PickupLine[];
  pickupStart: string;
  pickupEnd: string;
  voucherRedemption: { amount: number } | null;
};

export type PickupLookupResult =
  | {
      ok: true;
      userId: string;
      userName: string;
      rNumber: string;
      outstandingBonnetjes: number;
      orders: PickupOrder[];
    }
  | { ok: false; error: string };

/** Bestelling(en) van vandaag plus het bonnetjessaldo, voor één gebruiker. */
export async function pickupForUser(
  userId: string,
  now: Date = new Date(),
): Promise<PickupLookupResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, rNumber: true },
  });
  if (!user) return { ok: false, error: "Deze gebruiker bestaat niet meer." };

  const today = brusselsTimeOnDay(now, "00:00");
  const tomorrow = new Date(today.getTime() + 86400000);

  const [orders, shiftBalances] = await Promise.all([
    prisma.theokotOrder.findMany({
      where: {
        userId: user.id,
        status: { in: ["RESERVED", "PICKED_UP"] },
        session: { date: { gte: today, lt: tomorrow } },
      },
      include: {
        session: { select: { pickupStart: true, pickupEnd: true } },
        voucherRedemption: { select: { amount: true } },
        lines: {
          include: { sessionItem: { select: { nameNl: true, nameEn: true } } },
          orderBy: { sessionItem: { order: "asc" } },
        },
      },
    }),
    prisma.shiftParticipant.findMany({
      where: { userId: user.id, shift: { endTime: { lt: now } } },
      select: { rewardPaid: true, shift: { select: { reward: true } } },
    }),
  ]);

  const outstandingBonnetjes = shiftBalances.reduce(
    (total, balance) =>
      total + outstandingShiftReward({ reward: balance.shift.reward, rewardPaid: balance.rewardPaid }),
    0,
  );

  if (orders.length === 0) {
    return { ok: false, error: `${user.name} heeft geen bestelling voor vandaag.` };
  }

  const fmt = (date: Date) =>
    new Intl.DateTimeFormat("nl-BE", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);

  return {
    ok: true,
    userId: user.id,
    userName: user.name,
    rNumber: user.rNumber ?? "",
    outstandingBonnetjes,
    orders: orders.map((order) => ({
      orderId: order.id,
      status: order.status,
      totalCents: order.totalCents,
      pickupStart: fmt(order.session.pickupStart),
      pickupEnd: fmt(order.session.pickupEnd),
      voucherRedemption: order.voucherRedemption,
      lines: order.lines.map((line) => ({
        nameNl: line.sessionItem.nameNl,
        nameEn: line.sessionItem.nameEn,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      })),
    })),
  };
}

/** Dezelfde opzoeking, vertrekkend van een r-nummer. */
export async function pickupByRNumber(
  rNumberRaw: string,
  now: Date = new Date(),
): Promise<PickupLookupResult> {
  const rNumber = rNumberRaw.trim().toLowerCase();
  if (!rNumber) return { ok: false, error: "Geef een r-nummer in." };

  const user = await prisma.user.findUnique({ where: { rNumber }, select: { id: true } });
  if (!user) return { ok: false, error: `Geen gebruiker gevonden met r-nummer ${rNumber}.` };

  return pickupForUser(user.id, now);
}
