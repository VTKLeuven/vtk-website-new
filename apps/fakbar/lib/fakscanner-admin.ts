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
 * een werkingsjaar, de log van mislukte scans en de periodes.
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

// ── Periodes ─────────────────────────────────────────────────────────────────
//
// Een periode (`FakPeriod`) is een groot evenement waarin de scanner elk uur
// telt in plaats van één keer per bardag, in een eigen teller. Het tellen zelf
// gebeurt op vtk.be (`registerCheckin` in apps/web/lib/fakscanner-server.ts);
// dit scherm maakt ze aan en toont hun stand. Zie docs/design-decisions.md
// ("Periodes voor een groot evenement").

export type FakPeriodStatus = 'upcoming' | 'active' | 'ended';

export function fakPeriodStatus(
  period: { startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): FakPeriodStatus {
  if (now < period.startsAt) return 'upcoming';
  if (now < period.endsAt) return 'active';
  return 'ended';
}

export const FAK_PERIOD_STATUS_LABEL: Record<FakPeriodStatus, string> = {
  upcoming: 'Gepland',
  active: 'Loopt nu',
  ended: 'Afgelopen',
};

const periodFields = {
  id: true,
  name: true,
  startsAt: true,
  endsAt: true,
  windowStart: true,
  windowEnd: true,
  intervalMinutes: true,
  rewardEnabled: true,
  rewardEvery: true,
} as const;

export type FakPeriodRow = {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  windowStart: string | null;
  windowEnd: string | null;
  intervalMinutes: number;
  rewardEnabled: boolean;
  rewardEvery: number;
};

export type FakPeriodListRow = FakPeriodRow & {
  /** Aantal mensen dat in deze periode minstens één keer telde. */
  people: number;
  /** Alle check-ins van deze periode samen. */
  checkins: number;
};

/** Alle periodes, de laatste bovenaan, met hoeveel mensen en check-ins erin zitten. */
export async function getFakPeriods(): Promise<FakPeriodListRow[]> {
  const [periods, sums] = await Promise.all([
    prisma.fakPeriod.findMany({ select: periodFields, orderBy: { startsAt: 'desc' } }),
    prisma.fakPeriodTally.groupBy({ by: ['periodId'], _count: { _all: true }, _sum: { checkins: true } }),
  ]);
  const byPeriod = new Map(sums.map((row) => [row.periodId, row]));
  return periods.map((period) => ({
    ...period,
    people: byPeriod.get(period.id)?._count._all ?? 0,
    checkins: byPeriod.get(period.id)?._sum.checkins ?? 0,
  }));
}

export async function getFakPeriod(id: string): Promise<FakPeriodRow | null> {
  return prisma.fakPeriod.findUnique({ where: { id }, select: periodFields });
}

/** De periode die nu loopt of als eerste begint, voor de melding op de jaarstand. */
export async function getCurrentOrNextFakPeriod(now: Date = new Date()): Promise<FakPeriodRow | null> {
  return prisma.fakPeriod.findFirst({
    where: { endsAt: { gt: now } },
    orderBy: { startsAt: 'asc' },
    select: periodFields,
  });
}

export type FakPeriodRankingRow = {
  rNumber: string;
  name: string | null;
  checkins: number;
  lastCheckinAt: Date;
};

/**
 * Een pagina uit de ranglijst van een periode, van veel naar weinig check-ins.
 * Per persoon één rij met de stand en de laatste scan, net als de jaarstand:
 * welke uren iemand er was, bewaren we niet.
 */
export async function getFakPeriodRanking(
  periodId: string,
  skip = 0,
  take = RANK_PAGE_SIZE,
): Promise<{ rows: FakPeriodRankingRow[]; total: number }> {
  const [total, tallies] = await Promise.all([
    prisma.fakPeriodTally.count({ where: { periodId } }),
    prisma.fakPeriodTally.findMany({
      where: { periodId },
      orderBy: [{ checkins: 'desc' }, { lastCheckinAt: 'asc' }, { rNumber: 'asc' }],
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
      checkins: tally.checkins,
      lastCheckinAt: tally.lastCheckinAt,
    })),
  };
}

const periodMomentFmt = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "di 20 okt. 2026 18:00": begin of einde van een periode. */
export function formatPeriodMoment(date: Date): string {
  return periodMomentFmt.format(date);
}

/** "Elk uur", "Elke 2 uur", "Elke 30 min". */
export function describePeriodInterval(minutes: number): string {
  if (minutes === 60) return 'Elk uur';
  if (minutes % 60 === 0) return `Elke ${minutes / 60} uur`;
  return `Elke ${minutes} min`;
}

/** "22:00 tot 10:00", of "de klok rond" zonder venster. */
export function describePeriodWindow(period: Pick<FakPeriodRow, 'windowStart' | 'windowEnd'>): string {
  return period.windowStart && period.windowEnd
    ? `${period.windowStart} tot ${period.windowEnd}`
    : 'De klok rond';
}

/** "Per 10 check-ins", of "Geen" wanneer de periode geen pinten geeft. */
export function describePeriodReward(period: Pick<FakPeriodRow, 'rewardEnabled' | 'rewardEvery'>): string {
  return period.rewardEnabled ? `Per ${period.rewardEvery} check-ins` : 'Geen';
}
