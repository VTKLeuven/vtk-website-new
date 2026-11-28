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

import { parseDateOnly, startOfWeek, todayDateOnly } from './uitleen';

const DAY_MS = 24 * 60 * 60 * 1000;

export const CALENDAR_VIEWS = ['dag', 'week', 'dagen', 'maand', 'aangepast'] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  dag: 'Dag',
  week: 'Week',
  dagen: 'Komende dagen',
  maand: 'Maand',
  aangepast: 'Aangepast',
};

/**
 * "Komende x dagen" (F6.3): de eerste dag is waar je op staat (standaard
 * vandaag), en daarnaast komen de `x - 1` volgende. Geen weekgrens: het is een
 * kijkvenster vooruit, en een week die op woensdag begint, is wat je wil als het
 * woensdag is.
 */
export const DEFAULT_DAYS_COUNT = 5;
export const MIN_DAYS_COUNT = 2;
/** Meer dan veertien kolommen is een tabel die niemand nog leest. */
export const MAX_DAYS_COUNT = 14;

/** Het aantal dagen uit de URL, binnen de grenzen; anders de standaard. */
export function parseDaysCount(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS_COUNT;
  return Math.min(MAX_DAYS_COUNT, Math.max(MIN_DAYS_COUNT, parsed));
}

/** De weergave uit de URL; alles wat geen geldige weergave is, wordt week. */
export function parseCalendarView(value: string | undefined): CalendarView {
  return (CALENDAR_VIEWS as readonly string[]).includes(value ?? '')
    ? (value as CalendarView)
    : 'week';
}

/**
 * Een eigen bereik ("Aangepast"): `?weergave=aangepast&van=...&tot=...`, met
 * `tot` inbegrepen, zoals de aangepaste periode op de statistieken.
 *
 * Hoogstens drie maanden: daarboven wordt het een muur van weken waarin je
 * niets meer terugvindt, en een query over een heel jaar ritten voor een scherm
 * dat er dertien weken van toont. Tot veertien dagen tekent de planning het als
 * tijdrooster, zoals "Komende dagen"; langer als raster van weken, zoals de
 * maand (`CalendarRange.layout`).
 */
export const MAX_CUSTOM_DAYS = 92;
/** Zonder of met een onleesbaar bereik: twee weken vanaf de eerste dag. */
export const DEFAULT_CUSTOM_DAYS = 14;

export type CustomRange = {
  /** De eerste en de laatste dag, allebei inbegrepen, als date-only. */
  first: Date;
  last: Date;
};

/** Het aantal dagen van een bereik, de laatste dag inbegrepen. */
export function customRangeLength(range: CustomRange): number {
  return Math.round((range.last.getTime() - range.first.getTime()) / DAY_MS) + 1;
}

/**
 * Het bereik uit de URL, altijd bruikbaar.
 *
 * Omgekeerd ingegeven (tot voor van) wordt omgedraaid in plaats van geweigerd:
 * wie twee datums kiest, bedoelt de dagen ertussen. Te lang wordt ingekort tot
 * `MAX_CUSTOM_DAYS` vanaf de eerste dag. Een ontbrekende of onleesbare datum
 * valt terug op twee weken vanaf de andere, of vanaf vandaag.
 */
export function parseCustomRange(
  van: string | undefined,
  tot: string | undefined,
  today: Date = todayDateOnly()
): CustomRange {
  const a = van ? parseDateOnly(van) : null;
  const b = tot ? parseDateOnly(tot) : null;
  let first = a ?? (b ? addDays(b, -(DEFAULT_CUSTOM_DAYS - 1)) : today);
  let last = b ?? addDays(first, DEFAULT_CUSTOM_DAYS - 1);
  if (last < first) [first, last] = [last, first];
  if (customRangeLength({ first, last }) > MAX_CUSTOM_DAYS) last = addDays(first, MAX_CUSTOM_DAYS - 1);
  return { first, last };
}

export type CalendarRange = {
  days: Date[];
  /** Eerste dag, en de dag ná de laatste: het venster voor de query. */
  from: Date;
  to: Date;
  /**
   * Tijdrooster (dagen als kolommen met uren) of raster van weken (zoals de
   * maand). Enkel de maand en een lang eigen bereik zijn een raster.
   */
  layout: 'time' | 'month';
  /**
   * Bij een raster: de dagen waar je echt naar kijkt. Wat erbuiten valt (de
   * rest van de eerste en laatste week) vervaagt, zoals de dagen van een andere
   * maand in de maandweergave. `to` is de dag ná de laatste.
   */
  focus?: { from: Date; to: Date };
};

function addDays(day: Date, count: number): Date {
  return new Date(day.getTime() + count * DAY_MS);
}

function startOfMonth(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

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
export function calendarRange(
  view: CalendarView,
  anchor: Date,
  count: number = DEFAULT_DAYS_COUNT,
  /** Enkel bij `aangepast`: de laatste dag van het bereik, inbegrepen. */
  customLast?: Date
): CalendarRange {
  if (view === 'dag') {
    return { days: [anchor], from: anchor, to: addDays(anchor, 1), layout: 'time' };
  }
  if (view === 'dagen') {
    const length = Math.min(MAX_DAYS_COUNT, Math.max(MIN_DAYS_COUNT, Math.trunc(count)));
    return {
      days: Array.from({ length }, (_, index) => addDays(anchor, index)),
      from: anchor,
      to: addDays(anchor, length),
      layout: 'time',
    };
  }
  if (view === 'aangepast') {
    const last =
      customLast && customLast >= anchor ? customLast : addDays(anchor, DEFAULT_CUSTOM_DAYS - 1);
    const length = Math.min(MAX_CUSTOM_DAYS, customRangeLength({ first: anchor, last }));
    const end = addDays(anchor, length);
    // Kort genoeg voor kolommen: precies de gekozen dagen, zoals "Komende dagen".
    if (length <= MAX_DAYS_COUNT) {
      return {
        days: Array.from({ length }, (_, index) => addDays(anchor, index)),
        from: anchor,
        to: end,
        layout: 'time',
      };
    }
    // Langer: hele weken, met de dagen buiten het bereik vervaagd. Een raster dat
    // op een woensdag begint, zou de maandag van die week laten verdwijnen
    // terwijl er wel ritten op staan.
    const gridStart = startOfWeek(anchor);
    const gridEnd = addDays(startOfWeek(addDays(end, -1)), 7);
    const total = Math.round((gridEnd.getTime() - gridStart.getTime()) / DAY_MS);
    return {
      days: Array.from({ length: total }, (_, index) => addDays(gridStart, index)),
      from: gridStart,
      to: gridEnd,
      layout: 'month',
      focus: { from: anchor, to: end },
    };
  }
  if (view === 'week') {
    const monday = startOfWeek(anchor);
    return {
      days: Array.from({ length: 7 }, (_, index) => addDays(monday, index)),
      from: monday,
      to: addDays(monday, 7),
      layout: 'time',
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
    layout: 'month',
  };
}

/**
 * Waar "vorige" en "volgende" op uitkomen. Een maand verspringt per
 * kalendermaand en niet per vier weken; anders zou je na twaalf keer klikken in
 * een andere maand zitten dan je verwacht.
 */
export function shiftAnchor(
  view: CalendarView,
  anchor: Date,
  direction: -1 | 1,
  count: number = DEFAULT_DAYS_COUNT
): Date {
  if (view === 'dag') return addDays(anchor, direction);
  // Een hele reeks tegelijk: zo sluit het volgende venster aan op dit en blader je
  // niet over dagen die je net zag. Bij een eigen bereik is `count` zijn lengte.
  if (view === 'dagen' || view === 'aangepast') return addDays(anchor, direction * count);
  if (view === 'week') return addDays(startOfWeek(anchor), direction * 7);
  const first = startOfMonth(anchor);
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + direction, 1));
}

/**
 * Staat deze weergave op vandaag? Voor de "vandaag"-knop, die dan als actief
 * getoond wordt in plaats van als iets waar je nog heen kan.
 */
export function isCurrentPeriod(
  view: CalendarView,
  anchor: Date,
  now: Date = new Date(),
  /** Enkel bij `aangepast`: de laatste dag. Vandaag ligt dan ergens in het bereik. */
  customLast?: Date
): boolean {
  const today = todayDateOnly(now);
  if (view === 'aangepast') {
    return anchor.getTime() <= today.getTime() && today.getTime() <= (customLast ?? anchor).getTime();
  }
  // Bij "komende dagen" staat vandaag links, dus pas dan is dit "nu".
  if (view === 'dag' || view === 'dagen') return anchor.getTime() === today.getTime();
  if (view === 'week') return startOfWeek(anchor).getTime() === startOfWeek(today).getTime();
  return (
    anchor.getUTCFullYear() === today.getUTCFullYear() &&
    anchor.getUTCMonth() === today.getUTCMonth()
  );
}

/** Een date-only dag als `YYYY-MM-DD`, voor in de URL. */
export function dateParam(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/** Hoort deze dag bij de maand van het anker? Buiten de maand vervaagt de cel. */
export function isInMonth(day: Date, anchor: Date): boolean {
  return (
    day.getUTCFullYear() === anchor.getUTCFullYear() && day.getUTCMonth() === anchor.getUTCMonth()
  );
}
