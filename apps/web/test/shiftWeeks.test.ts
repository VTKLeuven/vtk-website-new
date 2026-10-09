import { describe, expect, it } from 'vitest';
import type { ShiftResponse } from '@/lib/shift';
import type { MergedShift } from '@/components/shift/shiftData';
import { groupShiftWeeks, weekAnchor } from '@/components/shift/shiftWeeks';

// Vrijdag 9 oktober 2026, 13:05: week 41 loopt van 5 tot 11 oktober.
const NOW = new Date(2026, 9, 9, 13, 5);

function shift(
  id: string,
  start: Date,
  hours = 2,
  { taken = 0, max = 2, registered = false } = {}
): MergedShift {
  const end = new Date(start.getTime() + hours * 3_600_000);
  return {
    registered,
    shift: {
      id,
      name: id,
      startTime: start,
      endTime: end,
      maxParticipants: max,
      takenSpots: taken,
      availableSpots: max - taken,
    } as unknown as ShiftResponse,
  };
}

const day = (d: number, h = 14) => new Date(2026, 9, d, h);

describe('groupShiftWeeks', () => {
  it('begint deze week vandaag en latere weken op maandag', () => {
    const weeks = groupShiftWeeks(
      [shift('a', day(9)), shift('b', day(14)), shift('c', day(20))],
      NOW,
      { keepEmpty: true }
    );

    expect(weeks.map((w) => w.offset)).toEqual([0, 1, 2]);
    expect(weeks[0].days.map((d) => d.date.getDate())).toEqual([9, 10, 11]);
    expect(weeks[0].days[0].isToday).toBe(true);
    expect(weeks[1].days.map((d) => d.date.getDate())).toEqual([12, 13, 14, 15, 16, 17, 18]);
    expect(weeks[1].days[2].items.map((m) => m.shift.id)).toEqual(['b']);
  });

  it('houdt een week zonder shiften enkel met keepEmpty', () => {
    const shifts = [shift('a', day(9)), shift('b', day(21))];

    const all = groupShiftWeeks(shifts, NOW, { keepEmpty: true });
    expect(all.map((w) => w.offset)).toEqual([0, 1, 2]);
    expect(all[1].shifts).toEqual([]);

    const filtered = groupShiftWeeks(shifts, NOW, { keepEmpty: false });
    expect(filtered.map((w) => w.offset)).toEqual([0, 2]);
  });

  it('toont de dag van een shift die gisteren begon en nog loopt', () => {
    const weeks = groupShiftWeeks([shift('tap', day(8, 21), 17)], NOW, { keepEmpty: true });

    expect(weeks[0].days[0].date.getDate()).toBe(8);
    expect(weeks[0].days[0].items).toHaveLength(1);
  });

  it('telt enkel shiften met plaats waar je niet zelf in staat', () => {
    const [week] = groupShiftWeeks(
      [
        shift('open', day(9, 10)),
        shift('vol', day(9, 12), 2, { taken: 2 }),
        shift('mijn', day(9, 14), 2, { taken: 1, registered: true }),
      ],
      NOW,
      { keepEmpty: true }
    );

    expect(week.open).toBe(1);
  });

  it('geeft een leeg resultaat zonder shiften', () => {
    expect(groupShiftWeeks([], NOW, { keepEmpty: true })).toEqual([]);
  });

  it('maakt een anker per maandag', () => {
    const [, next] = groupShiftWeeks([shift('a', day(9)), shift('b', day(13))], NOW, {
      keepEmpty: true,
    });
    expect(weekAnchor(next)).toBe('week-2026-10-12');
  });
});
