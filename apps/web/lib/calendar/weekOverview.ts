import type { CalendarAudience } from "@prisma/client";
import { localDateTimeToUtc } from "@/lib/ticketing/time";

/**
 * Wanneer de weekmail van de kalender vertrekt, over welke week ze gaat, en wat
 * erin komt.
 *
 * Puur, zonder database en zonder mail, zodat de regels te testen zijn. Het
 * versturen staat in `weekOverviewMailer.ts`, het bericht in
 * `weekOverviewMail.ts`, de kringkeuze in docs/design-decisions.md
 * ("Weekmail van de kalender").
 *
 * - **Zaterdag vanaf 19u**, Brusselse tijd, over de week van maandag tot en met
 *   zondag die komt. Lag de worker plat, dan vertrekt ze nog op zondag, maar
 *   nooit meer zodra de week begonnen is: een overzicht van maandag dat op
 *   dinsdag binnenkomt, klopt al niet meer.
 * - **Wat in die week begint.** Een evenement met momenten telt wanneer er een
 *   moment in die week begint, en staat één keer, op het eerste ervan. Wat al
 *   vóór maandag begon, staat er niet in.
 */

export const WEEK_OVERVIEW_TIME_ZONE = "Europe/Brussels";

/** Het uur (Brussel) waarop de mail zaterdag vertrekt. */
export const WEEK_OVERVIEW_SEND_HOUR = 19;

/** "2026-11-21": de kalenderdag van dit moment in Brussel. */
function brusselsDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WEEK_OVERVIEW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0 = maandag, 6 = zondag. */
function weekdayIndex(day: string): number {
  return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export type WeekOverviewWeek = {
  /** De maandag als Brusselse datum, de sleutel van `CalendarWeekMail.week`. */
  week: string;
  /** Maandag 00:00 in Brussel. */
  start: Date;
  /** De maandag erna, 00:00 in Brussel (exclusief). */
  end: Date;
};

/** De grenzen van de week die op deze maandag begint. */
export function weekOverviewRange(week: string): WeekOverviewWeek {
  return {
    week,
    start: localDateTimeToUtc(`${week}T00:00`, WEEK_OVERVIEW_TIME_ZONE),
    end: localDateTimeToUtc(`${addDays(week, 7)}T00:00`, WEEK_OVERVIEW_TIME_ZONE),
  };
}

/** Wanneer de mail over de week van deze maandag vertrekt: de zaterdag ervoor. */
export function weekOverviewSendAt(week: string): Date {
  const hour = String(WEEK_OVERVIEW_SEND_HOUR).padStart(2, "0");
  return localDateTimeToUtc(`${addDays(week, -2)}T${hour}:00`, WEEK_OVERVIEW_TIME_ZONE);
}

/** Over welke week er nu een mail hoort te vertrekken, of `null` buiten het venster. */
export function dueWeekOverview(now: Date): WeekOverviewWeek | null {
  const today = brusselsDay(now);
  const weekday = weekdayIndex(today);
  if (weekday < 5) return null;
  const week = addDays(today, 7 - weekday);
  if (now.getTime() < weekOverviewSendAt(week).getTime()) return null;
  return weekOverviewRange(week);
}

type Span = { start: Date; end: Date };

/**
 * Wanneer dit evenement in de week doorgaat: het eerste moment dat erin begint
 * (of `null` voor het evenement zelf) en hoe vaak nog meer. `null` wanneer er
 * niets van in deze week begint.
 */
export function occurrenceInWeek<M extends Span>(
  event: Span & { moments: readonly M[] },
  range: Span,
): { moment: M | null; start: Date; end: Date; more: number } | null {
  const inside = (date: Date) => date >= range.start && date < range.end;
  if (event.moments.length === 0) {
    return inside(event.start) ? { moment: null, start: event.start, end: event.end, more: 0 } : null;
  }
  const moments = event.moments
    .filter((moment) => inside(moment.start))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const first = moments[0];
  if (!first) return null;
  return { moment: first, start: first.start, end: first.end, more: moments.length - 1 };
}

/**
 * Welk evenement bovenaan staat, met de affiche over de hele breedte. De lijst
 * staat al in de volgorde van de week.
 *
 * 1. Wat in /admin/kalender uitgelicht is (de ster van de hero), het vroegste
 *    eerst.
 * 2. Anders het eerste met tickets of een inschrijving: dat heeft een knop
 *    waar iets mee te doen valt.
 * 3. Anders het eerste van de week.
 */
export function pickWeekFeatured<T extends { featured: boolean; hasSignup: boolean }>(
  events: readonly T[],
): T | null {
  return events.find((event) => event.featured) ?? events.find((event) => event.hasSignup) ?? events[0] ?? null;
}

/**
 * Dezelfde regel als `audienceFilter` in `audience.ts`, op rijen die al geladen
 * zijn. `viewer` is `null` voor wie de doelgroepfilter op /account niet aanzette:
 * die ziet alles, net als op de kalender.
 */
export function visibleForAudiences(
  eventAudiences: readonly (CalendarAudience | null)[],
  viewer: readonly CalendarAudience[] | null,
): boolean {
  if (!viewer) return true;
  const labelled = eventAudiences.filter((audience): audience is CalendarAudience => audience !== null);
  if (labelled.length === 0) return true;
  return labelled.some((audience) => audience === "CUSTOM" || viewer.includes(audience));
}

/** Een tekst voor onder de titel: hoogstens `max` tekens, afgebroken op een woord. */
export function excerpt(text: string, max = 240): string | null {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, "")}…`;
}
