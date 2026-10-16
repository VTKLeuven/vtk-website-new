import { describe, expect, it } from 'vitest';
import { groupByWeek, weekTitle } from '@/lib/commu/weeks';

type Item = { id: string; date: string | null };

describe('aanvragen per week', () => {
  it('noemt deze en volgende week bij naam en de rest bij nummer', () => {
    // Vrijdag 16 oktober 2026 valt in week 42.
    const items: Item[] = [
      { id: 'a', date: '2026-10-18' },
      { id: 'b', date: '2026-10-19' },
      { id: 'c', date: '2026-10-28' },
    ];
    const { weeks } = groupByWeek(items, (item) => item.date, '2026-10-16');
    expect(weeks.map((week) => [week.key, weekTitle(week, true)])).toEqual([
      ['2026-W42', 'Deze week'],
      ['2026-W43', 'Volgende week'],
      ['2026-W44', 'Week 44'],
    ]);
    expect(weeks[0]).toMatchObject({ monday: '2026-10-12', sunday: '2026-10-18' });
  });

  it('telt de weken correct over een jaarwissel', () => {
    // Maandag 28 december 2026 begint week 53; maandag 4 januari 2027 is week 1.
    const items: Item[] = [
      { id: 'a', date: '2026-12-31' },
      { id: 'b', date: '2027-01-05' },
    ];
    const { weeks } = groupByWeek(items, (item) => item.date, '2026-12-29');
    expect(weeks.map((week) => [week.key, week.offset])).toEqual([
      ['2026-W53', 0],
      ['2027-W01', 1],
    ]);
  });

  it('zet een aanvraag zonder datum apart', () => {
    const { weeks, undated } = groupByWeek(
      [{ id: 'a', date: null }, { id: 'b', date: 'geen datum' }],
      (item: Item) => item.date,
      '2026-10-16'
    );
    expect(weeks).toEqual([]);
    expect(undated.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('noemt de week ervoor "Vorige week"', () => {
    const { weeks } = groupByWeek([{ id: 'a', date: '2026-10-07' }], (item: Item) => item.date, '2026-10-16');
    expect(weekTitle(weeks[0], true)).toBe('Vorige week');
  });
});
