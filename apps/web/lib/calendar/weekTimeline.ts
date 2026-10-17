/**
 * De week op /kalender als tijdlijn: zeven kolommen met een uuras, de
 * evenementen als blokken op hun uur, en wat de hele dag duurt of over dagen
 * doorloopt als één balk bovenaan.
 *
 * De vorige weekweergave zette elk evenement als kaart onder zijn dag, en een
 * evenement van vijf dagen stond er dus vijf keer. Hier staat het één keer, en
 * zie je bovendien wanneer op de dag iets valt en wat met elkaar botst. Dezelfde
 * taal als de openingsuren op de homepage: een uuras met een gele nu-lijn.
 *
 * Dit bestand rekent alleen; `KalenderEditorialView` tekent. Zie ook
 * docs/design-decisions.md.
 */

import {
  eventDayRange,
  eventOccursOnDay,
  isMultiDayEvent,
  isSameCalendarDay,
  momentOnDay,
  type CalendarInterval,
} from '@/components/editorial/calendarGrid';
import { layoutDayEvents } from '@/lib/calendarLayout';

/**
 * Het venster van een gewone week: 12:00 tot 02:00. Bijna alles van de kring
 * valt 's middags of 's avonds; een ochtend die standaard leeg in beeld staat,
 * duwt de avonden onder de vouw. Een vroeger evenement trekt het venster naar
 * boven, een later naar onder, tot hoogstens `LATEST_HOUR`.
 */
export const TIMELINE_FROM = 12;
export const TIMELINE_TO = 26;

/** Verder dan 06:00 de volgende ochtend rekt het venster niet; wat langer duurt, loopt eruit. */
const LATEST_HOUR = 30;

/**
 * Wat vóór dit uur begint, hoort bij de avond ervoor: een feestje dat om 01:00
 * begint, staat in de kolom van de dag waarop iedereen vertrok, en niet bovenaan
 * de volgende dag, waar het het venster een hele nacht zou laten rekken.
 */
const NIGHT_UNTIL = 6;

/** Ruimte die een blok minstens inneemt, zodat een kort evenement leesbaar blijft. */
const MIN_BLOCK_MINUTES = 45;

/** Een evenement als balk boven de uren, over de kolommen `start` tot en met `end`. */
export type TimelineBar<T> = {
  event: T;
  start: number;
  end: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Een evenement als blok in de kolom van een dag. `from` en `to` zijn uren
 * vanaf middernacht van die dag (na middernacht dus boven 24); `lane` is hoeveel
 * trappen het opschuift omdat het overlapt met een blok dat eerder begon.
 */
export type TimelineBlock<T> = {
  event: T;
  start: Date;
  end: Date;
  from: number;
  to: number;
  lane: number;
  /** Het blok loopt verder dan het venster van de tijdlijn. */
  runsOn: boolean;
};

export type WeekTimeline<T> = {
  bars: Array<TimelineBar<T>>;
  barLanes: number;
  /** Per dag van de week de blokken, in tekenvolgorde. */
  days: Array<Array<TimelineBlock<T>>>;
  from: number;
  to: number;
  /** Waar de nu-lijn staat, enkel wanneer die in deze week en in het venster valt. */
  now: { day: number; hour: number } | null;
};

/** Het uur van `date` gezien vanaf middernacht van `day`; de nacht erna telt door boven 24. */
export function hourOfDay(date: Date, day: Date): number {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Afgerond, want een dag met een uurwissel duurt 23 of 25 uur.
  const offset = Math.round((+dateStart - +dayStart) / 86_400_000);
  return offset * 24 + date.getHours() + date.getMinutes() / 60;
}

/**
 * Staat dit evenement als balk bovenaan in plaats van als blok in de uren? Dat
 * is wat de hele dag duurt of over meerdere dagen doorloopt. Een reeks losse
 * momenten nooit: die heeft op elke dag een eigen uur.
 */
export function isTimelineBar(event: CalendarInterval): boolean {
  if (event.moments?.length) return false;
  return event.allDay || isMultiDayEvent(event);
}

function timelineBars<T extends CalendarInterval>(events: T[], days: Date[]) {
  const bars = events
    .filter(isTimelineBar)
    .flatMap((event) => {
      const columns = days.flatMap((day, index) => (eventOccursOnDay(event, day) ? [index] : []));
      if (columns.length === 0) return [];
      const { first, last } = eventDayRange(event);
      return [
        {
          event,
          start: columns[0]!,
          end: columns.at(-1)!,
          continuesBefore: first < days[0]!,
          continuesAfter: last > days.at(-1)!,
        },
      ];
    })
    .sort((a, b) => a.start - b.start || b.end - a.end || +new Date(a.event.start) - +new Date(b.event.start));
  const occupied: number[] = [];
  return bars.map((bar) => {
    let lane = occupied.findIndex((end) => end < bar.start);
    if (lane < 0) lane = occupied.length;
    occupied[lane] = bar.end;
    return { ...bar, lane };
  });
}

/** Elk moment van elk evenement dat op deze dag in de uren hoort. */
function occurrencesOn<T extends CalendarInterval>(events: T[], day: Date) {
  return events.flatMap((event) => {
    if (isTimelineBar(event)) return [];
    if (event.moments?.length) {
      const moment = momentOnDay(event, day);
      return moment ? [{ event, start: moment.start, end: moment.end }] : [];
    }
    return eventOccursOnDay(event, day) ? [{ event, start: new Date(event.start), end: new Date(event.end) }] : [];
  });
}

export function weekTimeline<T extends CalendarInterval>(events: T[], days: Date[], now: Date): WeekTimeline<T> {
  const bars = timelineBars(events, days);

  const raw: Array<Array<Omit<TimelineBlock<T>, 'lane' | 'runsOn'>>> = days.map(() => []);
  days.forEach((day, index) => {
    for (const occurrence of occurrencesOn(events, day)) {
      let column = index;
      let from = hourOfDay(occurrence.start, day);
      let to = hourOfDay(occurrence.end, day);
      if (from < NIGHT_UNTIL && index > 0) {
        column = index - 1;
        from += 24;
        to += 24;
      }
      raw[column]!.push({ ...occurrence, from, to });
    }
  });

  const all = raw.flat();
  const from = Math.max(0, Math.min(TIMELINE_FROM, ...all.map((block) => Math.floor(block.from))));
  const to = Math.min(
    LATEST_HOUR,
    Math.max(TIMELINE_TO, ...all.map((block) => Math.ceil(Math.max(block.to, block.from + 1))))
  );

  const placed = raw.map((blocks) =>
    layoutDayEvents(
      blocks.map((block) => ({ ...block, minutes: block.from * 60, endMinutes: block.to * 60 })),
      MIN_BLOCK_MINUTES
    ).map((block) => ({
      event: block.event,
      start: block.start,
      end: block.end,
      from: block.from,
      to: block.to,
      lane: block.lane,
      runsOn: block.to > to,
    }))
  );

  let nowAt: WeekTimeline<T>['now'] = null;
  const today = days.findIndex((day) => isSameCalendarDay(day, now));
  if (today >= 0) {
    let day = today;
    let hour = now.getHours() + now.getMinutes() / 60;
    if (hour < NIGHT_UNTIL && today > 0) {
      day = today - 1;
      hour += 24;
    }
    if (hour >= from && hour <= to) nowAt = { day, hour };
  }

  return {
    bars,
    barLanes: Math.max(0, ...bars.map((bar) => bar.lane + 1)),
    days: placed,
    from,
    to,
    now: nowAt,
  };
}
