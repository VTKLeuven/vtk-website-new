import type { Locale } from "@vtk/i18n";

/**
 * Pure mapping tussen de JSON van het cursusdienst-platform en de `entries`-vorm
 * die de homepage-kaarten gebruiken. Bewust vrij van prisma/fetch, zodat dit
 * los te testen valt (zie `test/cursusdienstHours.test.ts`).
 */

export type Range = { start: string; end: string };
export type WeekDay = { dayOfWeek: number; ranges: Range[] };
export type HoursEntry = { dayNl: string; dayEn: string; hours: string };

/** Maandag van de getoonde week; in het weekend is dat de volgende maandag. */
export function cursusdienstWeekStartKey(now: Date): string {
  const brusselsKey = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
  const [year, month, day] = brusselsKey.split("-").map(Number);
  const calendarDay = new Date(Date.UTC(year, month - 1, day));
  const weekday = calendarDay.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const weekendAdvance = weekday === 0 || weekday === 6 ? 7 : 0;
  calendarDay.setUTCDate(calendarDay.getUTCDate() + mondayOffset + weekendAdvance);
  return calendarDay.toISOString().slice(0, 10);
}

export function parseWeekStart(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const weekStart = (value as Record<string, unknown>).weekStart;
  return typeof weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)
    ? weekStart
    : null;
}

/** Engelse dagnamen, maandag-eerst, parallel aan `DUTCH_FULL_DAYS`. */
const DUTCH_WEEKDAYS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"] as const;
const ENGLISH_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

/** Maandag-eerste index (0..6) → JS-weekdag (zo=0..za=6), zoals cudi ze bewaart. */
function jsDayForMondayIndex(index: number): number {
  return index === 6 ? 0 : index + 1;
}

function isRange(value: unknown): value is Range {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.start === "string" && typeof r.end === "string";
}

/** Valideer de JSON van het endpoint (of de DB-cache) tot een `WeekDay[]`. */
export function parseWeek(value: unknown): WeekDay[] | null {
  if (typeof value !== "object" || value === null) return null;
  const week = (value as Record<string, unknown>).week;
  if (!Array.isArray(week)) return null;
  const result: WeekDay[] = [];
  for (const day of week) {
    if (typeof day !== "object" || day === null) return null;
    const d = day as Record<string, unknown>;
    if (typeof d.dayOfWeek !== "number" || !Array.isArray(d.ranges)) return null;
    if (!d.ranges.every(isRange)) return null;
    result.push({ dayOfWeek: d.dayOfWeek, ranges: d.ranges as Range[] });
  }
  return result;
}

/** Vijf entries (maandag → vrijdag); dagen zonder uren worden "Gesloten"/"Closed". */
export function weekToEntries(week: WeekDay[], locale: Locale): HoursEntry[] {
  const closed = locale === "nl" ? "Gesloten" : "Closed";
  return DUTCH_WEEKDAYS.map((dayNl, index) => {
    const jsDay = jsDayForMondayIndex(index);
    const ranges = week.find((d) => d.dayOfWeek === jsDay)?.ranges ?? [];
    const hours = ranges.length
      ? ranges.map((r) => `${r.start} – ${r.end}`).join(", ")
      : closed;
    return { dayNl, dayEn: ENGLISH_WEEKDAYS[index], hours };
  });
}
