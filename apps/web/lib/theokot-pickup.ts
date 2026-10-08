import "server-only";

import { prisma } from "@vtk/db";
import type { TheokotOrderStatus } from "@prisma/client";

import { brusselsTimeOnDay, sandwichVoucherCost } from "@/lib/theokot";
import { getTheokotConfig } from "@/lib/theokot-server";
import { voucherBalance } from "@/lib/app-api/vouchers";
import { normalizeRNumber, pickupSearchTerms } from "@/lib/theokotPickupQuery";
import { publicUrl } from "@/lib/storage";

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
  badgeImageUrl: string | null;
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
   * Wat medewerkersbonnetjes van deze bestelling dekken: de prijs van het
   * duurste broodje erin. Bonnetjes betalen exact één broodje, dus de balie
   * hoeft niets meer zelf af te trekken.
   */
  voucherCoversCents: number;
  /**
   * Wat dat broodje kost in bonnetjes (`sandwichVoucherCost`), per half. Na een
   * afboeking staat de werkelijk betaalde prijs in `voucherRedemption.amount`.
   */
  voucherCost: number;
  /**
   * De afhaal van deze dag is voorbij en de bestelling stond als niet-opgehaald
   * geboekt. Ze mag nog altijd uitgedeeld worden; de balie hoort enkel te weten
   * dat het laattijdig is.
   */
  isLate: boolean;
  /**
   * Deze bestelling zit in de doos van de grocomeet (`grocomeetId`): ze ligt
   * niet aan de balie en wordt daar ook niet betaald. De balie toont ze enkel,
   * zodat een groco die toch langskomt, weet waar zijn broodje is.
   */
  grocomeet: boolean;
  /**
   * Zoveel broodjes van deze bestelling staan na een late annulatie nog vrij
   * voor overname (`releaseOrder`). Staat de student toch aan de balie, dan mag
   * het gewoon mee: wie afhaalt, beëindigt de vrijgave. 0 bij een gewone
   * bestelling.
   */
  released: number;
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
export type PickupCandidate = {
  userId: string;
  name: string;
  rNumber: string | null;
  /** De status van de bestelling van vandaag, zodat een suggestie al zegt "al opgehaald". */
  status: TheokotOrderStatus | null;
};

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

/** Hoeveel suggesties er onder het veld verschijnen terwijl de shifter tikt. */
const MAX_SUGGESTIONS = 8;

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

  const [orders, outstandingBonnetjes, config] = await Promise.all([
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
          include: { sessionItem: { select: { nameNl: true, nameEn: true, badgeImageKey: true } } },
          orderBy: { sessionItem: { order: "asc" } },
        },
      },
    }),
    // Hetzelfde saldo als in de app: zonder de shiften uit een praesidiumjaar.
    voucherBalance(user.id, now),
    getTheokotConfig(),
  ]);

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
    orders: orders.map((order) => {
      const voucherCoversCents = mostExpensiveSandwichCents(order.lines);
      return {
        orderId: order.id,
        status: order.status,
        totalCents: order.totalCents,
        pickupStart: fmt(order.session.pickupStart),
        pickupEnd: fmt(order.session.pickupEnd),
        voucherRedemption: order.voucherRedemption,
        voucherCoversCents,
        voucherCost: sandwichVoucherCost(voucherCoversCents, config.voucherHalfCents),
        isLate: order.status === "NO_SHOW" || order.session.pickupEnd < now,
        grocomeet: order.grocomeetId !== null,
        released:
          order.status === "RESERVED" && order.releasedAt
            ? order.lines.reduce((sum, line) => sum + line.releasedQuantity, 0)
            : 0,
        lines: order.lines.map((line) => ({
          nameNl: line.sessionItem.nameNl,
          nameEn: line.sessionItem.nameEn,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          badgeImageUrl: line.sessionItem.badgeImageKey ? publicUrl(line.sessionItem.badgeImageKey) : null,
        })),
      };
    }),
  };
}

/**
 * Het broodje dat bonnetjes betalen: het duurste uit de bestelling. De balie
 * (`pickupForUser`) en de afboeking (`redeemEmployeeVouchersAction`) rekenen
 * allebei hiermee, zodat wat de shifter zegt en wat er afgaat hetzelfde is.
 */
export function mostExpensiveSandwichCents(lines: Array<{ unitPriceCents: number }>): number {
  return lines.reduce((highest, line) => Math.max(highest, line.unitPriceCents), 0);
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

  const users = await findPickupCandidates(query, now, MAX_CANDIDATES + 1);

  if (users.length === 0) {
    return { ok: false, error: `Niemand met een bestelling voor vandaag past op "${query}".` };
  }
  if (users.length === 1) return pickupForUser(users[0].userId, now);

  const candidates = users.slice(0, MAX_CANDIDATES);
  return {
    ok: false,
    error:
      users.length > MAX_CANDIDATES
        ? `Meer dan ${MAX_CANDIDATES} mensen met een bestelling passen op "${query}". Kies hieronder, of typ meer van de naam.`
        : `${users.length} mensen met een bestelling passen op "${query}". Kies de juiste persoon.`,
    candidates,
  };
}

/**
 * Wie er vandaag iets besteld heeft en op de zoekopdracht past, op naam of
 * (een stuk van een) r-nummer. Dezelfde grens als de naamzoekopdracht: enkel
 * wie vandaag een bestelling heeft, zodat een shifter niet door het ledenbestand
 * kan bladeren.
 */
async function findPickupCandidates(
  query: string,
  now: Date,
  limit: number,
): Promise<PickupCandidate[]> {
  const day = pickupDay(now);
  const terms = pickupSearchTerms(query);
  if (terms.length === 0) return [];
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      theokotOrders: { some: { status: { in: PICKUP_STATUSES }, session: { date: day } } },
      AND: terms.map((term) => ({
        OR: [
          { name: { contains: term, mode: "insensitive" as const } },
          { firstName: { contains: term, mode: "insensitive" as const } },
          { lastName: { contains: term, mode: "insensitive" as const } },
          { rNumber: { contains: term, mode: "insensitive" as const } },
        ],
      })),
    },
    select: {
      id: true,
      name: true,
      rNumber: true,
      theokotOrders: {
        where: { status: { in: PICKUP_STATUSES }, session: { date: day } },
        select: { status: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
    take: limit,
  });
  return users.map((user) => ({
    userId: user.id,
    name: user.name,
    rNumber: user.rNumber,
    status: user.theokotOrders[0]?.status ?? null,
  }));
}

/**
 * Suggesties onder het veld van de afhaalbalie terwijl de shifter tikt. Pas
 * vanaf twee tekens, en niet voor wat de kaartlezer of de app-pas tikt: die
 * eindigen op een Enter en zoeken dan zelf.
 */
export async function pickupSuggestions(
  raw: string,
  now: Date = new Date(),
): Promise<PickupCandidate[]> {
  const query = raw.trim();
  if (query.length < 2 || query.includes(";") || query.startsWith("vtkpas")) return [];
  return findPickupCandidates(query, now, MAX_SUGGESTIONS);
}
