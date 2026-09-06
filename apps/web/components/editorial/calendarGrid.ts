/** Monday-first month grid cells (42 days) for editorial calendar. */

export type GridDay = {
  date: Date;
  inMonth: boolean;
};

export function monthGridCells(year: number, monthIndex: number): GridDay[] {
  const first = new Date(year, monthIndex, 1);
  const startPad = mondayFirstWeekdayIndex(first);
  const start = new Date(year, monthIndex, 1 - startPad);
  const cells: GridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      date: d,
      inMonth: d.getMonth() === monthIndex,
    });
  }
  return cells;
}

/**
 * 6-weekse weergave (42 dagen) rond `anchor`: 1 week terug, huidige week, 4 weken vooruit.
 * Alle dagen in dit venster zijn actief (inMonth: true).
 */
export function rollingSixWeeksGridCells(anchor: Date = new Date()): GridDay[] {
  const currentWeekMonday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  currentWeekMonday.setDate(currentWeekMonday.getDate() - mondayFirstWeekdayIndex(currentWeekMonday));
  const start = new Date(currentWeekMonday);
  start.setDate(start.getDate() - 7);
  const cells: GridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      date: d,
      inMonth: true,
    });
  }
  return cells;
}

/** De zeven kalenderdagen van de week rond `anchor`, van maandag tot zondag. */
export function weekGridDays(anchor: Date): Date[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  start.setDate(start.getDate() - mondayFirstWeekdayIndex(start));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function mondayFirstWeekdayIndex(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export type CalendarInterval = { start: string; end: string; allDay: boolean };

/** All-day end dates are inclusive in our CMS; timed events end exclusively. */
export function eventDayRange(event: CalendarInterval): { first: Date; last: Date } {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const lastInstant = !event.allDay && end > start ? new Date(+end - 1) : end;
  return {
    first: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
    last: new Date(lastInstant.getFullYear(), lastInstant.getMonth(), lastInstant.getDate()),
  };
}

export function eventOccursOnDay(event: CalendarInterval, day: Date): boolean {
  const { first, last } = eventDayRange(event);
  return day >= first && day <= last;
}

export function isMultiDayEvent(event: CalendarInterval): boolean {
  const { first, last } = eventDayRange(event);
  return last > first;
}

/** Clip bars to a week and pack overlapping spans into separate rows. */
export function weekEventSpans<T extends CalendarInterval>(events: T[], days: Date[]) {
  const spans = events
    .filter(isMultiDayEvent)
    .flatMap((event) => {
      const columns = days.flatMap((day, index) => (eventOccursOnDay(event, day) ? [index] : []));
      if (!columns.length) return [];
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
  return spans.map((span) => {
    let lane = occupied.findIndex((end) => end < span.start);
    if (lane < 0) lane = occupied.length;
    occupied[lane] = span.end;
    return { ...span, lane };
  });
}
