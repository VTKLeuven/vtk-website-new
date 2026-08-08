/**
 * Zuivere domeinlogica voor de pianoreservaties: configuratie, het uitrekenen van
 * de tijdsloten uit de vensters, en de weeklimiet.
 *
 * De slots staan bewust niet in de database. Ze volgen uit een handvol
 * terugkerende vensters ("elke ma/di/do 19u-22u") min de sluitingsdagen, dus
 * genereren we ze per keer voor het venster dat op het scherm staat. Enkel een
 * geboekt slot bestaat als rij.
 *
 * Bevat GEEN server-only imports, zodat server- en clientcomponenten dezelfde
 * berekening delen. De DB-kant staat in `lib/piano-server.ts`.
 */

import {
  brusselsWallClockMinutes,
  brusselsYMD,
  isoWeekday,
  isoWeekKey,
  shiftYMD,
  ymdKey,
  type YMD,
} from './brussels';

// -----------------------------------------------------------------------------
// Configuratie
// -----------------------------------------------------------------------------

export type PianoConfig = {
  /** Lengte van één tijdslot in minuten. */
  slotMinutes: number;
  /** Hoeveel slots één lid per kalenderweek (ma-zo) mag hebben. */
  maxPerWeek: number;
  /** Hoeveel dagen vooruit er gereserveerd kan worden. */
  horizonDays: number;
};

export const DEFAULT_PIANO_CONFIG: PianoConfig = {
  slotMinutes: 60,
  maxPerWeek: 1,
  horizonDays: 28,
};

function coerceInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** Leest een (mogelijk gedeeltelijke of ongeldige) Setting-waarde uit, met defaults. */
export function parsePianoConfig(value: unknown): PianoConfig {
  const src = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_PIANO_CONFIG;
  return {
    slotMinutes: coerceInt(src.slotMinutes, d.slotMinutes, 15, 24 * 60),
    maxPerWeek: coerceInt(src.maxPerWeek, d.maxPerWeek, 1, 50),
    horizonDays: coerceInt(src.horizonDays, d.horizonDays, 1, 365),
  };
}

// -----------------------------------------------------------------------------
// Vensters en slots
// -----------------------------------------------------------------------------

/** Eén `PianoWindow`-rij, gereduceerd tot wat de slotgenerator nodig heeft. */
export type PianoWindowRule = {
  /** ISO-weekdagen: 1 = maandag ... 7 = zondag. */
  weekdays: number[];
  /** Minuten sinds middernacht (Brussel-wandklok). */
  startMinute: number;
  endMinute: number;
  /** `yyyy-mm-dd`, beide grenzen inclusief; null = onbegrensd. */
  startDate: string | null;
  endDate: string | null;
};

/** Eén `PianoClosure`-rij: `yyyy-mm-dd`, beide grenzen inclusief. */
export type PianoClosureRange = { startDate: string; endDate: string };

export type PianoSlot = { startsAt: Date; endsAt: Date };

/** Alle slots van één dag, met het dagetiket dat de UI toont. */
export type PianoDay = {
  /** `yyyy-mm-dd`, meteen de React-key van de dag. */
  date: string;
  slots: PianoSlot[];
};

const MINUTES_PER_DAY = 24 * 60;

/** "19:00" uit minuten sinds middernacht. */
export function formatMinutes(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "19:00" → minuten sinds middernacht, of null wanneer het geen tijd is. */
export function parseMinutes(value: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function windowCoversDay(rule: PianoWindowRule, key: string, weekday: number): boolean {
  if (!rule.weekdays.includes(weekday)) return false;
  if (rule.startDate && key < rule.startDate) return false;
  if (rule.endDate && key > rule.endDate) return false;
  return true;
}

function isClosed(closures: PianoClosureRange[], key: string): boolean {
  return closures.some((c) => key >= c.startDate && key <= c.endDate);
}

/**
 * De tijdsloten per dag tussen `from` en `to` (beide inclusief, Brussel-kalender).
 *
 * Overlappende vensters leveren geen dubbele slots op: een slot is uniek op zijn
 * starttijd, net zoals in de database. Een venster dat niet netjes deelbaar is
 * door de slotlengte laat de rest liggen (19u-22u met slots van 45 min geeft drie
 * slots en 15 verloren minuten) in plaats van over het einde heen te lopen.
 */
export function generatePianoDays(
  windows: PianoWindowRule[],
  closures: PianoClosureRange[],
  options: { from: YMD; to: YMD; slotMinutes: number },
): PianoDay[] {
  const { from, to, slotMinutes } = options;
  if (slotMinutes <= 0) return [];

  const days: PianoDay[] = [];
  const lastKey = ymdKey(to);

  for (let ymd = from; ymdKey(ymd) <= lastKey; ymd = shiftYMD(ymd, 1)) {
    const key = ymdKey(ymd);
    if (isClosed(closures, key)) continue;

    const weekday = isoWeekday(ymd);
    const starts = new Set<number>();
    for (const rule of windows) {
      if (!windowCoversDay(rule, key, weekday)) continue;
      for (let m = rule.startMinute; m + slotMinutes <= rule.endMinute; m += slotMinutes) {
        starts.add(m);
      }
    }
    if (starts.size === 0) continue;

    days.push({
      date: key,
      slots: [...starts]
        .sort((a, b) => a - b)
        .map((m) => ({
          startsAt: brusselsWallClockMinutes(ymd, m),
          endsAt: brusselsWallClockMinutes(ymd, m + slotMinutes),
        })),
    });
  }

  return days;
}

/**
 * Bestaat dit exacte slot in de vensters? De reserveer-actie vertrouwt de
 * starttijd uit het formulier niet: die moet terugkomen uit dezelfde berekening
 * als degene die het scherm getekend heeft.
 */
export function findPianoSlot(
  windows: PianoWindowRule[],
  closures: PianoClosureRange[],
  startsAt: Date,
  slotMinutes: number,
): PianoSlot | null {
  const ymd = brusselsYMD(startsAt);
  const [day] = generatePianoDays(windows, closures, { from: ymd, to: ymd, slotMinutes });
  return day?.slots.find((s) => s.startsAt.getTime() === startsAt.getTime()) ?? null;
}

// -----------------------------------------------------------------------------
// Limieten
// -----------------------------------------------------------------------------

/** De weeksleutel ("2026-W31") waarin een slot valt; waarop de weeklimiet telt. */
export function pianoWeekKey(startsAt: Date): string {
  return isoWeekKey(brusselsYMD(startsAt));
}

/**
 * De week (maandag 00:00 tot de volgende maandag 00:00, Brussel) waarin een slot
 * valt. `to` is exclusief, zodat een query erop `lt` gebruikt.
 */
export function pianoWeekRange(startsAt: Date): { from: Date; to: Date } {
  const ymd = brusselsYMD(startsAt);
  const monday = shiftYMD(ymd, 1 - isoWeekday(ymd));
  return {
    from: brusselsWallClockMinutes(monday, 0),
    to: brusselsWallClockMinutes(shiftYMD(monday, 7), 0),
  };
}

/** De laatste dag die nog gereserveerd mag worden. */
export function pianoHorizonEnd(now: Date, config: PianoConfig): YMD {
  return shiftYMD(brusselsYMD(now), config.horizonDays);
}

/**
 * Mag dit slot nu nog geboekt worden? Een slot dat al begonnen is niet, en een
 * slot voorbij de horizon evenmin: anders reserveert één iemand het hele jaar.
 */
export function isPianoSlotBookable(startsAt: Date, now: Date, config: PianoConfig): boolean {
  if (startsAt.getTime() <= now.getTime()) return false;
  return ymdKey(brusselsYMD(startsAt)) <= ymdKey(pianoHorizonEnd(now, config));
}
