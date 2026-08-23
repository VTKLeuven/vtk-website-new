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
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
