/**
 * Zuivere domeinlogica voor de fakscanner: de kaartlezer aan de bar waar een lid
 * één keer per avond incheckt en om de zoveel punten een gratis pint krijgt.
 *
 * Dit bestand bevat GEEN server-only imports (geen prisma, geen env), zodat de
 * scan-API en haar tests dezelfde regels lezen. De DB- en env-afhankelijke kant
 * staat in `lib/fakscanner-server.ts`.
 *
 * De **instellingen** zelf (type, defaults, parser, sleutel in `Setting`) staan in
 * `@vtk/db/fakscanner`: het beheerscherm zit in de fakbar-app en leest dezelfde
 * rij. Wat hieronder staat, heeft een klok nodig en hoort dus bij de scan.
 *
 * Zie docs/design-decisions.md ("Fakscanner") voor het waarom achter de bardag en
 * het dubbeltelvenster.
 */

import {
  DEFAULT_FAKSCANNER_CONFIG,
  parseFakscannerConfig,
  type FakPeriodRules,
  type FakscannerConfig,
} from '@vtk/db/fakscanner';
import {
  brusselsMinutesOfDay,
  brusselsWallClockMinutes,
  brusselsYMD,
  shiftYMD,
} from './brussels';

export { DEFAULT_FAKSCANNER_CONFIG, parseFakscannerConfig };
export type { FakscannerConfig };

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Het moment waarop de **bardag** van `at` begon. Voor de rollover (standaard
 * 06:00) hoort een scan nog bij de avond ervoor, zodat wie om 23u50 en om 00u10
 * scant niet twee check-ins heeft.
 *
 * Dit is de grens waartegen `lastCheckinAt` vergeleken wordt, en dus wat "één
 * keer per dag" betekent. Alles gaat via de Brusselse wandklok en niet via een
 * vast aantal uren, zodat de nacht van de zomer-/wintertijdwissel klopt: die
 * nacht duurt 23 of 25 uur, maar de bardag begint even goed om 6u op de klok.
 *
 * Randgeval: zet de rollover niet tussen 02:00 en 03:00. Bij de overgang naar
 * zomertijd bestaat dat uur niet en schuift het begin dan mee op. Met de
 * standaard 06:00 speelt dat nooit.
 */
export function fakDayStart(config: FakscannerConfig, at: Date): Date {
  const rollover = minutesOf(config.dayRolloverTime);
  const ymd = brusselsYMD(at);
  const beforeRollover = brusselsMinutesOfDay(at) < rollover;
  const day = beforeRollover ? shiftYMD(ymd, -1) : ymd;
  return brusselsWallClockMinutes(day, rollover);
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
  config: Pick<FakscannerConfig, 'rewardEvery'>,
  previousTotal: number,
  newTotal: number,
): boolean {
  return (
    Math.floor(newTotal / config.rewardEvery) > Math.floor(previousTotal / config.rewardEvery)
  );
}

/** Hoeveel pinten iemand met deze stand verdiend heeft, en hoeveel punten tot de volgende. */
export function rewardProgress(
  config: Pick<FakscannerConfig, 'rewardEvery'>,
  total: number,
): { beers: number; toNext: number } {
  const beers = Math.floor(total / config.rewardEvery);
  return { beers, toNext: (beers + 1) * config.rewardEvery - total };
}

// ── Periodes ────────────────────────────────────────────────────────────────

/**
 * Waar een scan valt tijdens een periode (`FakPeriod`).
 *
 * - `open`: binnen het dagelijkse venster. `slotStart` is het begin van het
 *   tijdvak waarin de scan valt; een rij waarvan `lastCheckinAt` daarvoor ligt,
 *   mag nog een check-in bij krijgen.
 * - niet `open`: buiten het venster, dus telt er niets.
 *
 * `nextAt` is het moment waarop een scan weer iets oplevert (het volgende tijdvak,
 * of de volgende opening van het venster), of null wanneer dat pas na het einde
 * van de periode is.
 */
export type FakPeriodSlot =
  | { open: true; slotStart: Date; nextAt: Date | null }
  | { open: false; nextAt: Date | null };

type PeriodWindow = { start: number; end: number };

function periodWindow(rules: FakPeriodRules): PeriodWindow | null {
  if (!rules.windowStart || !rules.windowEnd || rules.windowStart === rules.windowEnd) return null;
  return { start: minutesOf(rules.windowStart), end: minutesOf(rules.windowEnd) };
}

/**
 * De opening van het venster waarin `at` valt, of null wanneer `at` erbuiten
 * valt. Een venster over middernacht (22:00-10:00) dat om 03:00 nog loopt, ging
 * gisteren open.
 */
function windowOpening(daily: PeriodWindow, at: Date): Date | null {
  const now = brusselsMinutesOfDay(at);
  const ymd = brusselsYMD(at);
  if (daily.start < daily.end) {
    return now >= daily.start && now < daily.end ? brusselsWallClockMinutes(ymd, daily.start) : null;
  }
  if (now >= daily.start) return brusselsWallClockMinutes(ymd, daily.start);
  if (now < daily.end) return brusselsWallClockMinutes(shiftYMD(ymd, -1), daily.start);
  return null;
}

/** De eerste opening van het venster strikt na `after`. */
function nextWindowOpening(daily: PeriodWindow, after: Date): Date {
  const ymd = brusselsYMD(after);
  const today = brusselsWallClockMinutes(ymd, daily.start);
  return today > after ? today : brusselsWallClockMinutes(shiftYMD(ymd, 1), daily.start);
}

/**
 * Het tijdvak van een scan op `at`, binnen een periode die op dat moment loopt.
 *
 * De tijdvakken liggen vast op de klok en niet op je vorige scan: met een venster
 * vanaf 22:00 en een uur per tijdvak zijn dat 22:00, 23:00, 00:00 ... Zo kan de
 * lezer zeggen vanaf wanneer je terug mag ("Terug om 23:00"), en schuift niemand
 * elk uur een paar minuten op. Ze tellen in echte minuten vanaf de opening, zodat
 * de nacht van de uurwissel er een tijdvak bij krijgt of verliest, net zoals die
 * nacht een uur langer of korter duurt. Zonder venster begint het eerste tijdvak
 * bij het begin van de periode.
 */
export function fakPeriodSlot(rules: FakPeriodRules, at: Date): FakPeriodSlot {
  const daily = periodWindow(rules);
  const inPeriod = (moment: Date) => (moment < rules.endsAt ? moment : null);

  let anchor = rules.startsAt;
  if (daily) {
    const opening = windowOpening(daily, at);
    if (!opening) return { open: false, nextAt: inPeriod(nextWindowOpening(daily, at)) };
    anchor = opening;
  }

  const interval = rules.intervalMinutes * 60_000;
  const elapsed = Math.max(0, at.getTime() - anchor.getTime());
  const slotStart = new Date(anchor.getTime() + Math.floor(elapsed / interval) * interval);
  const following = new Date(slotStart.getTime() + interval);

  // Valt het volgende tijdvak niet meer in dit venster, dan telt de volgende scan
  // pas bij de volgende opening (een scan om 09:30 bij een venster tot 10:00).
  const nextAt =
    !daily || windowOpening(daily, following)?.getTime() === anchor.getTime()
      ? following
      : nextWindowOpening(daily, anchor);

  return { open: true, slotStart, nextAt: inPeriod(nextAt) };
}

/** "HH:mm" op de Brusselse klok, voor de lezer en de app. */
export function brusselsClockTime(at: Date): string {
  const minutes = brusselsMinutesOfDay(at);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
