/** Map weekday (Mon = 0 … Sun = 6) to Dutch day name prefix for matching CMS rows. */
export const DUTCH_FULL_DAYS = [
  "Maandag",
  "Dinsdag",
  "Woensdag",
  "Donderdag",
  "Vrijdag",
  "Zaterdag",
  "Zondag",
] as const;
const DUTCH_DAYS = DUTCH_FULL_DAYS;
const ENGLISH_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function mondayFirstWeekdayIndex(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

export function dutchDayNameForDate(d: Date): string {
  return DUTCH_DAYS[mondayFirstWeekdayIndex(d)] ?? "Maandag";
}

export function findEntryForFullDay<T extends { dayNl: string }>(
  entries: T[],
  fullDay: string
): T | undefined {
  return entries.find((e) => e.dayNl === fullDay);
}

export function entryForDate<T extends { dayNl: string; dayEn: string }>(
  entries: T[],
  d: Date,
  locale: "nl" | "en"
): T | undefined {
  const nl = dutchDayNameForDate(d);
  const en = ENGLISH_DAYS[mondayFirstWeekdayIndex(d)];
  return entries.find((e) =>
    locale === "nl"
      ? e.dayNl.toLowerCase().includes(nl.slice(0, 3).toLowerCase()) || e.dayNl === nl
      : e.dayEn.toLowerCase().includes(en.slice(0, 3).toLowerCase()) || e.dayEn === en
  );
}

export function parseHoursRange(hours: string): { startMin: number; endMin: number } | null {
  if (/gesloten|closed/i.test(hours)) return null;
  const cleaned = hours.replace(/\s+/g, " ").trim();
  const m = cleaned.match(/(\d{1,2})[:.](\d{2})\s*[\u2013\u2014–-]\s*(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const sh = Number(m[1]);
  const sm = Number(m[2]);
  const eh = Number(m[3]);
  const em = Number(m[4]);
  return { startMin: sh * 60 + sm, endMin: eh * 60 + em };
}

const TRACK_START = 6 * 60;
const TRACK_END = 22 * 60;
const TRACK_LEN = TRACK_END - TRACK_START;

export function barPercentForHours(hours: string): { left: string; width: string } | null {
  const r = parseHoursRange(hours);
  if (!r) return null;
  const left = ((r.startMin - TRACK_START) / TRACK_LEN) * 100;
  const w = ((r.endMin - r.startMin) / TRACK_LEN) * 100;
  return {
    left: `${Math.max(0, Math.min(92, left))}%`,
    width: `${Math.max(2, Math.min(100 - left, w))}%`,
  };
}

export function isClosedHours(hours: string): boolean {
  return /gesloten|closed/i.test(hours);
}

export function isOpenAt(hours: string, d: Date): boolean {
  if (isClosedHours(hours)) return false;
  const r = parseHoursRange(hours);
  if (!r) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= r.startMin && m <= r.endMin;
}

export function shortWeekdayNl(d: Date): string {
  const abb = ["MA", "DI", "WO", "DO", "VR", "ZA", "ZO"];
  return abb[mondayFirstWeekdayIndex(d)] ?? "—";
}
