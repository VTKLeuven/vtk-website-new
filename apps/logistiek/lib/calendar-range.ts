/**
 * Welke dagen de transportplanning toont, en hoe je ertussen navigeert.
 *
 * Apart van de weergave en zonder afhankelijkheden, want dit is het enige stuk
 * waar iets aan te rekenen valt: welke dagen horen bij "week 36", waar begint het
 * maandraster, en waar kom je uit na een klik op "volgende". De kalender zelf
 * tekent enkel wat hier uitkomt.
 *
 * **Alle datums zijn date-only**: UTC-middernacht van een Belgische
 * kalenderdatum, precies zoals `todayDateOnly` en `startOfWeek` in
 * `lib/uitleen.ts` ze maken. Dat is bewust dezelfde vorm: `placeForDay`
 * (lib/week-lanes.ts) rekent de Belgische dagrand daaruit terug, en twee soorten
 * "dag" door elkaar gebruiken heeft daar ooit een rit van 23:00 tot 01:00 een
 * negatieve hoogte gegeven.
 */

import { startOfWeek, todayDateOnly } from './uitleen';

const DAY_MS = 24 * 60 * 60 * 1000;

export const CALENDAR_VIEWS = ['dag', 'week', 'maand'] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  dag: 'Dag',
  week: 'Week',
  maand: 'Maand',
};

/** De weergave uit de URL; alles wat geen geldige weergave is, wordt week. */
export function parseCalendarView(value: string | undefined): CalendarView {
  return (CALENDAR_VIEWS as readonly string[]).includes(value ?? '')
    ? (value as CalendarView)
    : 'week';
}

export type CalendarRange = {
  /** De dagen die getekend worden, in volgorde. */
  days: Date[];
  /** Eerste dag, en de dag ná de laatste: het venster voor de query. */
  from: Date;
  to: Date;
};

/** Dagen tellen vanaf een date-only datum. */
function addDays(day: Date, count: number): Date {
  return new Date(day.getTime() + count * DAY_MS);
}

/** De eerste van de maand waarin deze dag valt. */
function startOfMonth(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

/** De eerste van de volgende maand. */
function startOfNextMonth(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1));
}

/**
 * De dagen van deze weergave.
 *
 * De maandweergave is een raster van hele weken en niet van de kalendermaand
 * alleen: een maand die op een donderdag begint, zou anders een half lege eerste
 * rij geven waarin de ritten van die maandag onzichtbaar zijn, terwijl het team
 * juist rond de maandgrens plant. Vijf of zes rijen, naargelang de maand.
 */
export function calendarRange(view: CalendarView, anchor: Date): CalendarRange {
  if (view === 'dag') {
    return { days: [anchor], from: anchor, to: addDays(anchor, 1) };
  }
  if (view === 'week') {
    const monday = startOfWeek(anchor);
    return {
      days: Array.from({ length: 7 }, (_, index) => addDays(monday, index)),
      from: monday,
      to: addDays(monday, 7),
    };
  }
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  // Tot en met de week waarin de laatste dag van de maand valt.
  const lastDay = addDays(startOfNextMonth(anchor), -1);
  const gridEnd = addDays(startOfWeek(lastDay), 7);
  const length = Math.round((gridEnd.getTime() - gridStart.getTime()) / DAY_MS);
  return {
    days: Array.from({ length }, (_, index) => addDays(gridStart, index)),
    from: gridStart,
    to: gridEnd,
  };
}

/**
 * Waar "vorige" en "volgende" op uitkomen. Een maand verspringt per
 * kalendermaand en niet per vier weken; anders zou je na twaalf keer klikken in
 * een andere maand zitten dan je verwacht.
 */
export function shiftAnchor(view: CalendarView, anchor: Date, direction: -1 | 1): Date {
  if (view === 'dag') return addDays(anchor, direction);
  if (view === 'week') return addDays(startOfWeek(anchor), direction * 7);
  const first = startOfMonth(anchor);
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + direction, 1));
}

/**
 * Staat deze weergave op vandaag? Voor de "vandaag"-knop, die dan als actief
 * getoond wordt in plaats van als iets waar je nog heen kan.
 */
export function isCurrentPeriod(view: CalendarView, anchor: Date, now: Date = new Date()): boolean {
  const today = todayDateOnly(now);
  if (view === 'dag') return anchor.getTime() === today.getTime();
  if (view === 'week') return startOfWeek(anchor).getTime() === startOfWeek(today).getTime();
  return (
    anchor.getUTCFullYear() === today.getUTCFullYear() &&
    anchor.getUTCMonth() === today.getUTCMonth()
  );
}

/** Hoort deze dag bij de maand van het anker? Buiten de maand vervaagt de cel. */
export function isInMonth(day: Date, anchor: Date): boolean {
  return (
    day.getUTCFullYear() === anchor.getUTCFullYear() && day.getUTCMonth() === anchor.getUTCMonth()
  );
}
