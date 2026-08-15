import "server-only";
import { timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { FakScanResult } from "@prisma/client";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import {
  DEFAULT_FAKSCANNER_CONFIG,
  earnedReward,
  fakDayStart,
  isDoublePeriod,
  parseFakscannerConfig,
  pointsForScan,
  type FakscannerConfig,
} from "./fakscanner";

/**
 * Server-only kant van de fakscanner: de instellingen uit `Setting`, het
 * device-token uit de omgeving, het bijwerken van de stand en de ranglijst voor
 * /admin/fakscanner. De rekenregels zelf (bardag, dubbeltelvenster, gratis pint)
 * staan in {@link ./fakscanner}.
 */

export const FAKSCANNER_SETTING_KEY = "fakscanner.config";

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
  /** False wanneer dit lid vandaag al gescand had; de stand blijft dan staan. */
  counted: boolean;
  /** Punten die deze scan opleverde (0 wanneer er niets geteld werd). */
  points: number;
  double: boolean;
  total: number;
  /** Maakte deze scan een gratis pint vol? */
  reward: boolean;
  config: FakscannerConfig;
};

/**
 * Telt één check-in bij de stand van een r-nummer, of stelt vast dat er vandaag al
 * één was.
 *
 * Er is geen rij per dag om de dubbele scan tegen te houden, dus doet de
 * voorwaarde in de `UPDATE` dat werk: enkel een rij waarvan `lastCheckinAt` vóór
 * het begin van deze bardag ligt, wordt opgehoogd. Postgres voert die update
 * atomair uit, dus van twee gelijktijdige scans raakt er precies één binnen en
 * krijgt de andere `count: 0`. Bestaat de rij nog niet, dan is dit de eerste scan
 * van het jaar en maken we ze aan; botst dat op de primaire sleutel, dan was een
 * gelijktijdige scan ons net voor en is het dus ook "al gescand".
 */
export async function registerCheckin(
  rNumber: string,
  at: Date = new Date(),
): Promise<CheckinOutcome> {
  const config = await getFakscannerConfig();
  const dayStart = fakDayStart(config, at);
  // Het werkingsjaar hoort bij de bardag: een avond die over de 15-julicutover
  // loopt, telt in haar geheel bij het jaar waarin ze begon.
  const year = currentWorkingYear(dayStart);
  const double = isDoublePeriod(config, at);
  const points = pointsForScan(config, at);

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
    return { counted: true, points, double, total, reward: earnedReward(config, total - points, total), config };
  }

  try {
    const created = await prisma.fakTally.create({
      data: { rNumber, year, points, checkins: 1, lastCheckinAt: at },
      select: { points: true },
    });
    return {
      counted: true,
      points,
      double,
      total: created.points,
      reward: earnedReward(config, 0, created.points),
      config,
    };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }

  const existing = await prisma.fakTally.findUnique({
    where: { rNumber_year: { rNumber, year } },
    select: { points: true },
  });
  return { counted: false, points: 0, double, total: existing?.points ?? 0, reward: false, config };
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
