import "server-only";
import { timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { FakPeriod, FakScanResult } from "@prisma/client";
import { prisma } from "@vtk/db";
import { FAKSCANNER_SETTING_KEY } from "@vtk/db/fakscanner";
import { currentWorkingYear } from "@vtk/auth";
import {
  brusselsClockTime,
  DEFAULT_FAKSCANNER_CONFIG,
  earnedReward,
  fakDayStart,
  fakPeriodSlot,
  isDoublePeriod,
  parseFakscannerConfig,
  pointsForScan,
  rewardProgress,
  type FakscannerConfig,
} from "./fakscanner";

/**
 * Server-only kant van de fakscanner: de instellingen uit `Setting`, het
 * device-token uit de omgeving, het bijwerken van de stand en de ranglijst. De
 * rekenregels zelf (bardag, dubbeltelvenster, gratis pint) staan in
 * {@link ./fakscanner}.
 *
 * Het beheerscherm staat niet meer hier maar in de fakbar-app
 * (`apps/fakbar/app/admin/fakscanner`); die leest dezelfde `Setting`-rij en
 * dezelfde tabellen.
 */

/** Live instellingen; ontbreken ze, dan gelden de defaults. */
export async function getFakscannerConfig(): Promise<FakscannerConfig> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: FAKSCANNER_SETTING_KEY } });
    return parseFakscannerConfig(row?.value);
  } catch {
    return DEFAULT_FAKSCANNER_CONFIG;
  }
}

/**
 * Het gedeelde token van de scanner-Pi. Bewust **enkel** uit de omgeving en niet
 * uit de DB: dit is het enige dat tussen "iemand aan de bar" en "iedereen met een
 * browser" staat, dus het hoort niet ergens beheerbaar te zijn waar een
 * gecompromitteerd adminaccount het kan uitlezen of vervangen.
 */
export function fakscannerToken(): string {
  return process.env.FAKSCANNER_TOKEN ?? "";
}

/**
 * Authenticeert een request van de Pi op `Authorization: Bearer <token>`. Zonder
 * geconfigureerd token is er geen toegang (fail closed), zodat een lege env-var de
 * check-ins niet voor iedereen openzet.
 */
export function isFakscannerRequest(request: Request): boolean {
  const token = fakscannerToken();
  if (!token) return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Schrijft één **mislukte** scan naar de log. Geslaagde check-ins loggen we niet:
 * dat zou de aanwezigheidslijst zijn die we net niet willen bijhouden.
 */
export async function logFakScan(entry: {
  result: FakScanResult;
  rNumber?: string | null;
  reason?: string | null;
}): Promise<void> {
  // De lezer aan de bar mag niet blijven hangen omdat de log niet weggeschreven
  // raakt; het antwoord is belangrijker dan de historiek.
  await prisma.fakScanLog
    .create({
      data: {
        result: entry.result,
        rNumber: entry.rNumber ?? null,
        reason: entry.reason ?? null,
      },
    })
    .catch(() => null);
}

export type CheckinOutcome = {
  /** False wanneer deze scan niets opleverde; de stand blijft dan staan. */
  counted: boolean;
  /** Punten die deze scan opleverde (0 wanneer er niets geteld werd). */
  points: number;
  double: boolean;
  /** De stand na deze scan: de jaarstand, of tijdens een periode die van de periode. */
  total: number;
  /** Maakte deze scan een gratis pint vol? */
  reward: boolean;
  /** Punten tot de volgende gratis pint; null wanneer de lopende periode geen pinten geeft. */
  toNextBeer: number | null;
  /**
   * Waarom er niets geteld werd: `day` al gescand deze bardag (gewone werking),
   * `slot` al gescand in dit tijdvak, `window` buiten het dagelijkse venster van
   * de periode. Null wanneer de scan telde.
   */
  skipped: "day" | "slot" | "window" | null;
  /** "HH:mm" (Brussel) waarop een scan weer telt, zolang dat binnen de periode valt. */
  nextAt: string | null;
  /** De periode die nu loopt, of null bij de gewone werking. */
  period: { id: string; name: string } | null;
};

/**
 * De periode die op `at` loopt, of null. Periodes overlappen niet (de actie die
 * ze opslaat weigert dat), dus er is er hoogstens één.
 */
export async function getActiveFakPeriod(at: Date = new Date()): Promise<FakPeriod | null> {
  return prisma.fakPeriod.findFirst({
    where: { startsAt: { lte: at }, endsAt: { gt: at } },
    orderBy: { startsAt: "desc" },
  });
}

/**
 * Telt één check-in bij de stand van een r-nummer, of stelt vast dat er niets bij
 * komt.
 *
 * Loopt er een periode (`FakPeriod`), dan telt de scan **enkel** daar, volgens de
 * regels van die periode; de jaarstand blijft dan staan. Anders is het de gewone
 * check-in per bardag. De lezer en de app roepen allebei deze functie, zodat ze
 * niet uit elkaar kunnen lopen.
 */
export async function registerCheckin(
  rNumber: string,
  at: Date = new Date(),
): Promise<CheckinOutcome> {
  const period = await getActiveFakPeriod(at);
  if (period) return registerPeriodCheckin(period, rNumber, at);
  return registerDailyCheckin(rNumber, at);
}

/**
 * De gewone werking: één check-in per bardag in `FakTally`.
 *
 * Er is geen rij per dag om de dubbele scan tegen te houden, dus doet de
 * voorwaarde in de `UPDATE` dat werk: enkel een rij waarvan `lastCheckinAt` vóór
 * het begin van deze bardag ligt, wordt opgehoogd. Postgres voert die update
 * atomair uit, dus van twee gelijktijdige scans raakt er precies één binnen en
 * krijgt de andere `count: 0`. Bestaat de rij nog niet, dan is dit de eerste scan
 * van het jaar en maken we ze aan; botst dat op de primaire sleutel, dan was een
 * gelijktijdige scan ons net voor en is het dus ook "al gescand".
 */
async function registerDailyCheckin(rNumber: string, at: Date): Promise<CheckinOutcome> {
  const config = await getFakscannerConfig();
  const dayStart = fakDayStart(config, at);
  // Het werkingsjaar hoort bij de bardag: een avond die over de 15-julicutover
  // loopt, telt in haar geheel bij het jaar waarin ze begon.
  const year = currentWorkingYear(dayStart);
  const double = isDoublePeriod(config, at);
  const points = pointsForScan(config, at);
  const result = (counted: boolean, total: number, previous: number): CheckinOutcome => ({
    counted,
    points: counted ? points : 0,
    double,
    total,
    reward: counted && earnedReward(config, previous, total),
    toNextBeer: rewardProgress(config, total).toNext,
    skipped: counted ? null : "day",
    nextAt: null,
    period: null,
  });

  const updated = await prisma.fakTally.updateMany({
    where: { rNumber, year, lastCheckinAt: { lt: dayStart } },
    data: {
      points: { increment: points },
      checkins: { increment: 1 },
      lastCheckinAt: at,
    },
  });

  if (updated.count === 1) {
    const row = await prisma.fakTally.findUnique({
      where: { rNumber_year: { rNumber, year } },
      select: { points: true },
    });
    const total = row?.points ?? points;
    return result(true, total, total - points);
  }

  try {
    const created = await prisma.fakTally.create({
      data: { rNumber, year, points, checkins: 1, lastCheckinAt: at },
      select: { points: true },
    });
    return result(true, created.points, 0);
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }

  const existing = await prisma.fakTally.findUnique({
    where: { rNumber_year: { rNumber, year } },
    select: { points: true },
  });
  const total = existing?.points ?? 0;
  return result(false, total, total);
}

/**
 * Een check-in tijdens een periode: één per tijdvak, enkel binnen het venster, in
 * `FakPeriodTally`. Zelfde racevrije aanpak als de bardag hierboven, met het
 * begin van het tijdvak als grens in plaats van het begin van de bardag. Een
 * scan telt hier altijd voor één; het dubbeltelvenster hoort bij de gewone
 * werking.
 */
async function registerPeriodCheckin(
  period: FakPeriod,
  rNumber: string,
  at: Date,
): Promise<CheckinOutcome> {
  const slot = fakPeriodSlot(period, at);
  const key = { periodId_rNumber: { periodId: period.id, rNumber } };
  const result = (
    counted: boolean,
    total: number,
    skipped: CheckinOutcome["skipped"] = null,
  ): CheckinOutcome => ({
    counted,
    points: counted ? 1 : 0,
    double: false,
    total,
    reward: counted && period.rewardEnabled && earnedReward(period, total - 1, total),
    toNextBeer: period.rewardEnabled ? rewardProgress(period, total).toNext : null,
    skipped,
    nextAt: slot.nextAt ? brusselsClockTime(slot.nextAt) : null,
    period: { id: period.id, name: period.name },
  });
  const currentTotal = async () =>
    (await prisma.fakPeriodTally.findUnique({ where: key, select: { checkins: true } }))?.checkins ?? 0;

  if (!slot.open) return result(false, await currentTotal(), "window");

  const updated = await prisma.fakPeriodTally.updateMany({
    where: { periodId: period.id, rNumber, lastCheckinAt: { lt: slot.slotStart } },
    data: { checkins: { increment: 1 }, lastCheckinAt: at },
  });
  if (updated.count === 1) return result(true, await currentTotal());

  try {
    const created = await prisma.fakPeriodTally.create({
      data: { periodId: period.id, rNumber, checkins: 1, lastCheckinAt: at },
      select: { checkins: true },
    });
    return result(true, created.checkins);
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }

  return result(false, await currentTotal(), "slot");
}

export type FakRankingRow = {
  rNumber: string;
  /** De naam uit ons ledenbestand, of null voor wie geen VTK-account heeft. */
  name: string | null;
  points: number;
  checkins: number;
  beers: number;
  lastCheckinAt: Date;
};

export type FakRanking = {
  rows: FakRankingRow[];
  /** Aantal mensen met een stand dit werkingsjaar (voor de paginering). */
  total: number;
};

/**
 * Een pagina uit de ranglijst van een werkingsjaar, van veel naar weinig punten.
 * De naam komt uit `User` wanneer er een account bij het r-nummer hoort; wie
 * zonder account meespaart, blijft in het beheerscherm gewoon zijn r-nummer.
 */
export async function getFakRanking(
  year: number = currentWorkingYear(),
  rewardEvery: number = DEFAULT_FAKSCANNER_CONFIG.rewardEvery,
  skip = 0,
  take = 30,
): Promise<FakRanking> {
  const [total, tallies] = await Promise.all([
    prisma.fakTally.count({ where: { year } }),
    prisma.fakTally.findMany({
      where: { year },
      // Gelijke standen krijgen een vaste volgorde, anders verspringt de lijst
      // tussen twee pagina's door.
      orderBy: [{ points: "desc" }, { lastCheckinAt: "asc" }, { rNumber: "asc" }],
      skip,
      take,
    }),
  ]);
  if (tallies.length === 0) return { rows: [], total };

  const users = await prisma.user.findMany({
    where: { rNumber: { in: tallies.map((t) => t.rNumber) } },
    select: { rNumber: true, name: true },
  });
  const nameByRNumber = new Map(users.map((u) => [u.rNumber, u.name]));

  return {
    total,
    rows: tallies.map((t) => ({
      rNumber: t.rNumber,
      name: nameByRNumber.get(t.rNumber) ?? null,
      points: t.points,
      checkins: t.checkins,
      beers: Math.floor(t.points / rewardEvery),
      lastCheckinAt: t.lastCheckinAt,
    })),
  };
}
