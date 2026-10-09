import {
  addDays,
  differenceInCalendarWeeks,
  isSameDay,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { freeSpots, type MergedShift } from './shiftData';

export type ShiftDay = {
  date: Date;
  isToday: boolean;
  items: MergedShift[];
};

export type ShiftWeek = {
  /** Maandag van de week, om middernacht. */
  monday: Date;
  /** Weken na de huidige: 0 is deze week, 1 volgende week. */
  offset: number;
  /** De dagen die de lijst toont, in volgorde. */
  days: ShiftDay[];
  shifts: MergedShift[];
  /** Shiften waar de kijker nog bij kan: niet de zijne en niet vol. */
  open: number;
};

const WEEK = { weekStartsOn: 1 } as const;

/**
 * Deelt de shiften op /shift op per week, van deze week tot de week van de
 * laatste shift. Er is geen weekkiezer meer: de lijst loopt door, en elke week
 * opent met een eigen kop.
 *
 * Deze week begint vandaag, want de dagen ervoor zijn voorbij. Een shift die
 * gisteren begon en nog loopt (een tapshift tot na middernacht), haalt haar dag
 * wel terug in beeld.
 *
 * Een week zonder shiften blijft staan met `keepEmpty`, zodat een gat in de
 * planning zichtbaar is in plaats van dat week 43 stil overgeslagen wordt. Met
 * een postfilter valt ze weg: daar zegt een lege week niets.
 */
export function groupShiftWeeks(
  shifts: MergedShift[],
  now: Date,
  { keepEmpty }: { keepEmpty: boolean }
): ShiftWeek[] {
  if (shifts.length === 0) return [];

  const sorted = [...shifts].sort(
    (a, b) => a.shift.startTime.getTime() - b.shift.startTime.getTime()
  );
  const today = startOfDay(now);
  const currentMonday = startOfWeek(now, WEEK);
  const firstStart = sorted[0].shift.startTime;
  const firstMonday = startOfWeek(firstStart < now ? firstStart : now, WEEK);
  const lastMonday = startOfWeek(sorted[sorted.length - 1].shift.startTime, WEEK);

  const weeks: ShiftWeek[] = [];
  for (let monday = firstMonday; monday <= lastMonday; monday = addDays(monday, 7)) {
    const nextMonday = addDays(monday, 7);
    const items = sorted.filter(
      (m) => m.shift.startTime >= monday && m.shift.startTime < nextMonday
    );
    if (items.length === 0 && !keepEmpty) continue;

    let firstDay = monday;
    if (today > monday) {
      const firstItemDay = items.length > 0 ? startOfDay(items[0].shift.startTime) : today;
      firstDay = firstItemDay < today ? firstItemDay : today;
    }

    const days: ShiftDay[] = [];
    for (let date = firstDay; date < nextMonday; date = addDays(date, 1)) {
      days.push({
        date,
        isToday: isSameDay(date, today),
        items: items.filter((m) => isSameDay(m.shift.startTime, date)),
      });
    }

    weeks.push({
      monday,
      offset: differenceInCalendarWeeks(monday, currentMonday, WEEK),
      days,
      shifts: items,
      open: items.filter((m) => !m.registered && freeSpots(m.shift) > 0).length,
    });
  }
  return weeks;
}

/** Het anker van een week, uniek over een jaarwissel heen. */
export function weekAnchor(week: Pick<ShiftWeek, 'monday'>): string {
  const d = week.monday;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `week-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
