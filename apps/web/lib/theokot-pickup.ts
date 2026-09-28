import "server-only";

import { prisma } from "@vtk/db";
import type { TheokotOrderStatus } from "@prisma/client";

import { brusselsTimeOnDay } from "@/lib/theokot";
import { outstandingShiftReward } from "@/lib/shift/rewards";
import { normalizeRNumber, pickupSearchTerms } from "@/lib/theokotPickupQuery";

/**
 * De afhaalbalie, los van de weg waarlangs iemand herkend werd.
 *
 * Er zijn er intussen vier: een r-nummer intikken, een naam intikken, een
 * studentenkaart scannen, en sinds de app een pas scannen. Alle vier eindigen ze op dezelfde vraag ("wat
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

/** Een persoon die op een naamzoekopdracht past en vandaag iets besteld heeft. */
export type PickupCandidate = { userId: string; name: string; rNumber: string | null };

/**
 * Het antwoord op een ingetikte zoekopdracht: dezelfde opzoeking, of een keuze
 * wanneer er meerdere mensen op de naam passen.
 */
export type PickupSearchResult =
  | PickupLookupResult
  | { ok: false; error: string; candidates: PickupCandidate[] };

/** De bestellingen die aan de balie nog iets betekenen. */
const PICKUP_STATUSES: TheokotOrderStatus[] = ["RESERVED", "PICKED_UP", "NO_SHOW"];

/** Hoeveel namen de balie hoogstens toont om uit te kiezen. */
const MAX_CANDIDATES = 12;

/** Vandaag, van middernacht tot middernacht in Brussel. */
function pickupDay(now: Date): { gte: Date; lt: Date } {
  const today = brusselsTimeOnDay(now, "00:00");
  return { gte: today, lt: new Date(today.getTime() + 86400000) };
}

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

  const [orders, shiftBalances] = await Promise.all([
    prisma.theokotOrder.findMany({
      where: {
        userId: user.id,
        status: { in: PICKUP_STATUSES },
        session: { date: pickupDay(now) },
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

/**
 * Dezelfde opzoeking, vertrekkend van een r-nummer. `cardName` is de naam die KU
 * Leuven bij een gescande kaart meegaf: heeft die student geen account, dan
 * zegt de balie wie er staat in plaats van enkel een nummer.
 */
export async function pickupByRNumber(
  rNumberRaw: string,
  { now = new Date(), cardName = null }: { now?: Date; cardName?: string | null } = {},
): Promise<PickupLookupResult> {
  const rNumber = normalizeRNumber(rNumberRaw) ?? rNumberRaw.trim().toLowerCase();
  if (!rNumber) return { ok: false, error: "Geef een r-nummer in." };

  // Niet op hoofdletters vergelijken: in het gebruikersbeheer kan een r-nummer
  // als "R0123456" opgeslagen zijn, en die student bestaat wel.
  const user = await prisma.user.findFirst({
    where: { rNumber: { equals: rNumber, mode: "insensitive" }, deletedAt: null },
    select: { id: true },
  });
  if (!user) {
    return {
      ok: false,
      error: cardName
        ? `${cardName} (${rNumber}) heeft geen account op vtk.be.`
        : `Geen gebruiker gevonden met r-nummer ${rNumber}.`,
    };
  }

  return pickupForUser(user.id, now);
}

/**
 * Wat de shifter intikte: een r-nummer, of anders een naam.
 *
 * Op naam zoeken we enkel onder wie vandaag een bestelling heeft. Aan de balie
 * is dat de enige vraag, het houdt de lijst kort bij een veelvoorkomende naam,
 * en een shifter met enkel `theokot.pickup` kan zo niet door het hele
 * ledenbestand bladeren. Past er precies één persoon, dan volgt meteen de
 * bestelling; bij meerdere kiest de shifter.
 */
export async function pickupByQuery(
  raw: string,
  now: Date = new Date(),
): Promise<PickupSearchResult> {
  const query = raw.trim();
  if (!query) return { ok: false, error: "Geef een naam of r-nummer in." };

  const rNumber = normalizeRNumber(query);
  if (rNumber) return pickupByRNumber(rNumber, { now });

  const terms = pickupSearchTerms(query);
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      theokotOrders: { some: { status: { in: PICKUP_STATUSES }, session: { date: pickupDay(now) } } },
      AND: terms.map((term) => ({
        OR: [
          { name: { contains: term, mode: "insensitive" as const } },
          { firstName: { contains: term, mode: "insensitive" as const } },
          { lastName: { contains: term, mode: "insensitive" as const } },
          { rNumber: { contains: term, mode: "insensitive" as const } },
        ],
      })),
    },
    select: { id: true, name: true, rNumber: true },
    orderBy: { name: "asc" },
    take: MAX_CANDIDATES + 1,
  });

  if (users.length === 0) {
    return { ok: false, error: `Niemand met een bestelling voor vandaag past op "${query}".` };
  }
  if (users.length === 1) return pickupForUser(users[0].id, now);

  const candidates = users
    .slice(0, MAX_CANDIDATES)
    .map((user) => ({ userId: user.id, name: user.name, rNumber: user.rNumber }));
  return {
    ok: false,
    error:
      users.length > MAX_CANDIDATES
        ? `Meer dan ${MAX_CANDIDATES} mensen met een bestelling passen op "${query}". Kies hieronder, of typ meer van de naam.`
        : `${users.length} mensen met een bestelling passen op "${query}". Kies de juiste persoon.`,
    candidates,
  };
}
