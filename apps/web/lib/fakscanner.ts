/**
 * Zuivere domeinlogica voor de fakscanner: de kaartlezer aan de bar waar een lid
 * één keer per avond incheckt en om de zoveel punten een gratis pint krijgt.
 *
 * Dit bestand bevat GEEN server-only imports (geen prisma, geen env), zodat de
 * admin-UI dezelfde regels kan tonen als de API-route ze toepast. De DB- en
 * env-afhankelijke kant staat in `lib/fakscanner-server.ts`.
 *
 * Zie docs/design-decisions.md ("Fakscanner") voor het waarom achter de bardag en
 * het dubbeltelvenster.
 */

import { brusselsMinutesOfDay, brusselsYMD, shiftYMD, ymdKey } from './brussels';

export type FakscannerConfig = {
  /** Aantal punten per gratis pint. */
  rewardEvery: number;
  /** Staat het dubbeltelvenster aan? */
  doubleEnabled: boolean;
  /** Begin van het dubbeltelvenster, "HH:mm" Brusselse wandklok. */
  doubleStart: string;
  /** Einde van het dubbeltelvenster (exclusief), "HH:mm". Mag over middernacht. */
  doubleEnd: string;
  /**
   * Uur waarop een nieuwe bardag begint (Brussel). Een fakavond loopt over
   * middernacht, dus de kalenderdag deugt niet als "één keer per dag"-grens.
   */
  dayRolloverHour: number;
};

export const DEFAULT_FAKSCANNER_CONFIG: FakscannerConfig = {
  rewardEvery: 10,
  doubleEnabled: true,
  doubleStart: '22:00',
  doubleEnd: '23:00',
  dayRolloverHour: 6,
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function coerceInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function coerceTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && HHMM.test(value) ? value : fallback;
}

/** Leest de opgeslagen JSON uit `Setting`; onbekende of kapotte velden vallen terug. */
export function parseFakscannerConfig(value: unknown): FakscannerConfig {
  const v = (value ?? {}) as Partial<Record<keyof FakscannerConfig, unknown>>;
  return {
    rewardEvery: coerceInt(v.rewardEvery, DEFAULT_FAKSCANNER_CONFIG.rewardEvery, 1, 1000),
    doubleEnabled:
      typeof v.doubleEnabled === 'boolean'
        ? v.doubleEnabled
        : DEFAULT_FAKSCANNER_CONFIG.doubleEnabled,
    doubleStart: coerceTime(v.doubleStart, DEFAULT_FAKSCANNER_CONFIG.doubleStart),
    doubleEnd: coerceTime(v.doubleEnd, DEFAULT_FAKSCANNER_CONFIG.doubleEnd),
    dayRolloverHour: coerceInt(
      v.dayRolloverHour,
      DEFAULT_FAKSCANNER_CONFIG.dayRolloverHour,
      0,
      23,
    ),
  };
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * De **bardag** van een moment: `YYYY-MM-DD` van de avond waartoe de scan hoort.
 * Voor de rollover (standaard 6u) telt een scan nog bij de vorige dag, zodat wie
 * om 23u50 en om 00u10 scant niet twee check-ins heeft.
 */
export function fakDayKey(config: FakscannerConfig, at: Date): string {
  const ymd = brusselsYMD(at);
  const beforeRollover = brusselsMinutesOfDay(at) < config.dayRolloverHour * 60;
  return ymdKey(beforeRollover ? shiftYMD(ymd, -1) : ymd);
}

/**
 * Valt dit moment in het dubbeltelvenster? Het venster mag over middernacht lopen
 * (bv. 23:30-00:30); `doubleStart === doubleEnd` betekent een leeg venster en niet
 * "de klok rond".
 */
export function isDoublePeriod(config: FakscannerConfig, at: Date): boolean {
  if (!config.doubleEnabled) return false;
  const start = minutesOf(config.doubleStart);
  const end = minutesOf(config.doubleEnd);
  if (start === end) return false;
  const now = brusselsMinutesOfDay(at);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** Wat één check-in op dit moment waard is. */
export function pointsForScan(config: FakscannerConfig, at: Date): number {
  return isDoublePeriod(config, at) ? 2 : 1;
}

/**
 * Maakte deze scan een gratis pint vol? We kijken naar het **passeren** van een
 * veelvoud, niet naar `total % rewardEvery === 0`: een dubbeltelling kan van 9
 * naar 11 springen en die pint hoort niet verloren te gaan.
 */
export function earnedReward(
  config: FakscannerConfig,
  previousTotal: number,
  newTotal: number,
): boolean {
  return (
    Math.floor(newTotal / config.rewardEvery) > Math.floor(previousTotal / config.rewardEvery)
  );
}

/** Hoeveel pinten iemand met deze stand verdiend heeft, en hoeveel punten tot de volgende. */
export function rewardProgress(
  config: FakscannerConfig,
  total: number,
): { beers: number; toNext: number } {
  const beers = Math.floor(total / config.rewardEvery);
  return { beers, toNext: (beers + 1) * config.rewardEvery - total };
}
