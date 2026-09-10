import 'server-only';

import { prisma } from '@vtk/db';
import {
  DEFAULT_FAKSCANNER_CONFIG,
  FAKSCANNER_SETTING_KEY,
  parseFakscannerConfig,
  type FakscannerConfig,
} from '@vtk/db/fakscanner';
import { currentWorkingYear, FIRST_WORKING_YEAR } from '@vtk/auth';

/**
 * Wat het beheerscherm van de fakscanner leest: de instellingen, de ranglijst van
 * een werkingsjaar en de log van mislukte scans.
 *
 * De kaartlezer zelf blijft op vtk.be: de Pi post naar `/api/fakscanner/scan`
 * daar, en `apps/web/lib/fakscanner-server.ts` telt de check-in bij. Deze app
 * kijkt naar dezelfde tabellen en dezelfde `Setting`-rij, en schrijft enkel de
 * instellingen. Zie docs/design-decisions.md ("Fakscanner").
 */

export const RANK_PAGE_SIZE = 30;
export const LOG_PAGE_SIZE = 50;

/** Live instellingen; ontbreken ze, dan gelden de defaults. */
export async function getFakscannerConfig(): Promise<FakscannerConfig> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: FAKSCANNER_SETTING_KEY } });
    return parseFakscannerConfig(row?.value);
  } catch {
    return DEFAULT_FAKSCANNER_CONFIG;
  }
}

// ── Werkingsjaar ─────────────────────────────────────────────────────────────
//
// De cutover (15 juli) leeft in @vtk/auth; de hoofdsite heeft daarnaast wat
// hulpjes in `apps/web/lib/workingYear.ts` staan. Die staan in geen gedeeld
// pakket, dus staan de vier regels die dit scherm nodig heeft hier, met dezelfde
// uitkomst. Lopen ze ooit uiteen, dan horen ze naar @vtk/auth te verhuizen.

/** Een werkingsjaar als "26-27". */
export function formatWorkingYear(year: number): string {
  const from = String(year % 100).padStart(2, '0');
  const to = String((year + 1) % 100).padStart(2, '0');
  return `${from}-${to}`;
}

/** Startmoment van een werkingsjaar: 15 juli van dat jaar. */
export function workingYearStart(year: number): Date {
  return new Date(Date.UTC(year, 6, 15));
}

/** Een `?jaar=`-waarde naar een geldig werkingsjaar, of het huidige. */
export function parseWorkingYear(raw: string | undefined, now: Date = new Date()): number {
  const year = Number(raw);
  if (Number.isInteger(year) && year >= FIRST_WORKING_YEAR && year <= currentWorkingYear(now) + 5) {
    return year;
  }
  return currentWorkingYear(now);
}

/** De jaren om als tabjes te tonen: elk jaar sinds het eerste, plus wat er data heeft. */
export function workingYearTabs(yearsWithData: number[] = [], now: Date = new Date()): number[] {
  const current = currentWorkingYear(now);
  const years = new Set<number>();
  for (let year = FIRST_WORKING_YEAR; year <= current; year += 1) years.add(year);
  for (const year of yearsWithData) if (year >= FIRST_WORKING_YEAR) years.add(year);
  return [...years].sort((a, b) => b - a);
}

/** De werkingsjaren waarin al iemand gescand heeft, nieuwste eerst. */
export async function getFakYearsWithData(): Promise<number[]> {
  const rows = await prisma.fakTally.findMany({
    distinct: ['year'],
    select: { year: true },
    orderBy: { year: 'desc' },
  });
  return rows.map((row) => row.year);
}

// ── Ranglijst ────────────────────────────────────────────────────────────────

export type FakRankingRow = {
  rNumber: string;
  /** De naam uit het ledenbestand, of null voor wie geen VTK-account heeft. */
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
 * zonder account meespaart, blijft hier gewoon zijn r-nummer.
 */
export async function getFakRanking(
  year: number = currentWorkingYear(),
  rewardEvery: number = DEFAULT_FAKSCANNER_CONFIG.rewardEvery,
  skip = 0,
  take = RANK_PAGE_SIZE,
): Promise<FakRanking> {
  const [total, tallies] = await Promise.all([
    prisma.fakTally.count({ where: { year } }),
    prisma.fakTally.findMany({
      where: { year },
      // Gelijke standen krijgen een vaste volgorde, anders verspringt de lijst
      // tussen twee pagina's door.
      orderBy: [{ points: 'desc' }, { lastCheckinAt: 'asc' }, { rNumber: 'asc' }],
      skip,
      take,
    }),
  ]);
  if (tallies.length === 0) return { rows: [], total };

  const users = await prisma.user.findMany({
    where: { rNumber: { in: tallies.map((tally) => tally.rNumber) } },
    select: { rNumber: true, name: true },
  });
  const nameByRNumber = new Map(users.map((user) => [user.rNumber, user.name]));

  return {
    total,
    rows: tallies.map((tally) => ({
      rNumber: tally.rNumber,
      name: nameByRNumber.get(tally.rNumber) ?? null,
      points: tally.points,
      checkins: tally.checkins,
      beers: Math.floor(tally.points / rewardEvery),
      lastCheckinAt: tally.lastCheckinAt,
    })),
  };
}

// ── Log van mislukte scans ───────────────────────────────────────────────────

export type FakScanLogPage = {
  rows: Array<{
    id: string;
    at: Date;
    result: 'CARD_ERROR' | 'SERVER_ERROR';
    rNumber: string | null;
    reason: string | null;
  }>;
  total: number;
};

/**
 * De mislukte scans van een werkingsjaar. De log heeft geen jaarkolom; het
 * werkingsjaarvenster snijdt hem op dezelfde 15-juligrens als de standen zelf.
 *
 * Er staat bewust geen lijst van geslaagde check-ins tegenover: we bewaren per
 * persoon één stand en geen historiek, dus die lijst bestaat niet.
 */
export async function getFakScanLog(year: number, skip = 0, take = LOG_PAGE_SIZE): Promise<FakScanLogPage> {
  const where = { at: { gte: workingYearStart(year), lt: workingYearStart(year + 1) } };
  const [total, rows] = await Promise.all([
    prisma.fakScanLog.count({ where }),
    prisma.fakScanLog.findMany({ where, orderBy: { at: 'desc' }, skip, take }),
  ]);
  return { total, rows };
}
