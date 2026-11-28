import { MAX_CUSTOM_DAYS } from './calendar-range';

/**
 * De rekening achter de kalender van "Aangepast" (`range-picker.tsx`).
 *
 * Alles als `YYYY-MM-DD` en `YYYY-MM`, in UTC: zo vergelijk je twee dagen als
 * tekst, en schuift een dag niet op wanneer de klok een uur verspringt.
 */

export type DayRange = { van: string; tot: string };
export type RangeEnd = 'van' | 'tot';

const DAY_MS = 24 * 60 * 60 * 1000;

function utc(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

export function addIsoDays(value: string, days: number): string {
  return new Date(utc(value) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Het aantal dagen van een bereik, beide uiteinden inbegrepen. */
export function rangeDays(range: DayRange): number {
  return Math.round((utc(range.tot) - utc(range.van)) / DAY_MS) + 1;
}

export function monthOf(value: string): string {
  return value.slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + by, 1)).toISOString().slice(0, 7);
}

/**
 * Zes weken van maandag tot zondag rond een maand: altijd 42 dagen, zodat de
 * kalender niet in hoogte verspringt wanneer je naar een maand met vijf weken
 * bladert.
 */
export function monthCells(month: string): string[] {
  const first = `${month}-01`;
  const weekday = (new Date(utc(first)).getUTCDay() + 6) % 7; // maandag = 0
  const start = addIsoDays(first, -weekday);
  return Array.from({ length: 42 }, (_, index) => addIsoDays(start, index));
}

/**
 * Of je die dag als `end` kan kiezen. Het begin kan altijd: valt het voorbij het
 * einde, dan schuift het einde mee. Het einde kan niet vóór het begin, en niet
 * verder dan `MAX_CUSTOM_DAYS`: de server zou het daar toch afknippen.
 */
export function isPickable(end: RangeEnd, day: string, range: DayRange): boolean {
  if (end === 'van') return true;
  return day >= range.van && rangeDays({ van: range.van, tot: day }) <= MAX_CUSTOM_DAYS;
}

/**
 * Het bereik na een klik op `day` voor uiteinde `end`.
 *
 * Schuift het begin voorbij het einde, dan schuift het einde mee en blijft de
 * lengte; anders draaide de server het om en werd een week vooruit plots een
 * bereik van achteren naar voren. Een einde vóór het begin neemt het begin mee.
 */
export function pickRangeDay(end: RangeEnd, day: string, range: DayRange): DayRange {
  if (end === 'van') {
    if (day <= range.tot) return { van: day, tot: range.tot };
    return { van: day, tot: addIsoDays(day, rangeDays(range) - 1) };
  }
  if (day < range.van) return { van: day, tot: day };
  return { van: range.van, tot: day };
}
