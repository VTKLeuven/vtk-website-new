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
  /**
   * Wat twee medewerkersbonnetjes van deze bestelling dekken: de prijs van het
   * duurste broodje erin. Twee bonnetjes zijn exact één broodje, dus geen opleg
   * wanneer dat broodje duurder is en geen geld terug wanneer het goedkoper is.
   * De balie hoeft daardoor niets meer zelf af te trekken.
   */
  voucherCoversCents: number;
  /**
   * De afhaal van deze dag is voorbij en de bestelling stond als niet-opgehaald
   * geboekt. Ze mag nog altijd uitgedeeld worden; de balie hoort enkel te weten
   * dat het laattijdig is.
   */
  isLate: boolean;
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

/**
 * Bestelling(en) van vandaag plus het bonnetjessaldo, voor één gebruiker.
 *
 * Ook een bestelling die als niet-opgehaald geboekt staat komt mee. De verkoop is
 * dan gedaan, maar het broodje mag nog uitgedeeld worden, en "deze persoon heeft
 * niets besteld" zeggen terwijl de bestelling er staat, is gewoon onwaar.
 */
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
        status: { in: ["RESERVED", "PICKED_UP", "NO_SHOW"] },
        session: { date: { gte: today, lt: tomorrow } },
      },
      include: {
        session: { select: { pickupStart: true, pickupEnd: true } },
        // volgorde hieronder hangt hieraan: de duurste lijn bepaalt wat de
        // bonnetjes dekken.
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
      voucherCoversCents: order.lines.reduce(
        (highest, line) => Math.max(highest, line.unitPriceCents),
        0,
      ),
      isLate: order.status === "NO_SHOW" || order.session.pickupEnd < now,
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
