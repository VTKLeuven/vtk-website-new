import "server-only";
import { timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { FakScanResult } from "@prisma/client";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import {
  DEFAULT_FAKSCANNER_CONFIG,
  earnedReward,
  fakDayKey,
  isDoublePeriod,
  parseFakscannerConfig,
  pointsForScan,
  type FakscannerConfig,
} from "./fakscanner";

/**
 * Server-only kant van de fakscanner: de instellingen uit `Setting`, het
 * device-token uit de omgeving, het wegschrijven van een check-in en de
 * ranglijst voor /admin/fakscanner. De rekenregels zelf (bardag,
 * dubbeltelvenster, gratis pint) staan in {@link ./fakscanner}.
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

/** Schrijft één scan-gebeurtenis naar de log (ook de mislukte). */
export async function logFakScan(entry: {
  result: FakScanResult;
  userId?: string | null;
  rNumber?: string | null;
  cardName?: string | null;
  points?: number | null;
  total?: number | null;
  reward?: boolean;
  reason?: string | null;
}): Promise<void> {
  // De lezer aan de bar mag niet blijven hangen omdat de log niet weggeschreven
  // raakt; het antwoord is belangrijker dan de historiek.
  await prisma.fakScanLog
    .create({
      data: {
        result: entry.result,
        userId: entry.userId ?? null,
        rNumber: entry.rNumber ?? null,
        cardName: entry.cardName ?? null,
        points: entry.points ?? null,
        total: entry.total ?? null,
        reward: entry.reward ?? false,
        reason: entry.reason ?? null,
      },
    })
    .catch(() => null);
}

/** Puntentotaal van een lid in een werkingsjaar. */
export async function totalPoints(userId: string, year: number): Promise<number> {
  const agg = await prisma.fakCheckin.aggregate({
    where: { userId, year },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
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
 * Registreert één check-in voor een lid, of stelt vast dat het er vandaag al één
 * had. De unieke index op (userId, day) is wat "één keer per dag" afdwingt: twee
 * scans vlak na elkaar laten de tweede op een P2002 stuklopen in plaats van
 * dubbel te tellen, dus dat is hier een gewone uitkomst en geen fout.
 */
export async function registerCheckin(userId: string, at: Date = new Date()): Promise<CheckinOutcome> {
  const config = await getFakscannerConfig();
  const day = fakDayKey(config, at);
  const double = isDoublePeriod(config, at);
  const points = pointsForScan(config, at);
  // Het werkingsjaar hoort bij de bardag: een avond die over de 15-julicutover
  // loopt, telt in zijn geheel bij het jaar waarin ze begon.
  const year = currentWorkingYear(new Date(`${day}T12:00:00Z`));

  let checkinId: string;
  try {
    const created = await prisma.fakCheckin.create({
      data: { userId, year, day, at, points, double },
      select: { id: true },
    });
    checkinId = created.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { counted: false, points: 0, double, total: await totalPoints(userId, year), reward: false, config };
    }
    throw err;
  }

  const total = await totalPoints(userId, year);
  const reward = earnedReward(config, total - points, total);
  if (reward) {
    await prisma.fakCheckin.update({ where: { id: checkinId }, data: { reward: true } });
  }
  return { counted: true, points, double, total, reward, config };
}

export type FakRankingRow = {
  userId: string;
  name: string;
  rNumber: string | null;
  total: number;
  checkins: number;
  beers: number;
  lastAt: Date;
};

/**
 * De ranglijst van een werkingsjaar: iedereen met minstens één check-in, van veel
 * naar weinig punten. Bewust een groepering op de check-ins en geen scan over alle
 * gebruikers: enkel wie effectief aan de bar geweest is hoort in de lijst.
 */
export async function getFakRanking(
  year: number = currentWorkingYear(),
  rewardEvery: number = DEFAULT_FAKSCANNER_CONFIG.rewardEvery,
): Promise<FakRankingRow[]> {
  const grouped = await prisma.fakCheckin.groupBy({
    by: ["userId"],
    where: { year },
    _sum: { points: true },
    _count: { _all: true },
    _max: { at: true },
    orderBy: { _sum: { points: "desc" } },
  });
  if (grouped.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, name: true, rNumber: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return grouped.map((g) => {
    const total = g._sum.points ?? 0;
    return {
      userId: g.userId,
      name: byId.get(g.userId)?.name ?? g.userId,
      rNumber: byId.get(g.userId)?.rNumber ?? null,
      total,
      checkins: g._count._all,
      beers: Math.floor(total / rewardEvery),
      lastAt: g._max.at ?? new Date(0),
    };
  });
}
