import { describe, expect, it } from 'vitest';
import {
  eventOccursOnDay,
  weekEventSpans,
  rollingSixWeeksGridCells,
  weekGridDays,
} from '@/components/editorial/calendarGrid';

describe('calendar week grid', () => {
  it('returns the Monday-to-Sunday week around the selected day', () => {
    const days = weekGridDays(new Date(2026, 7, 23));
    expect(days.map((day) => day.getDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(days[0]).toEqual(new Date(2026, 7, 17));
    expect(days[6]).toEqual(new Date(2026, 7, 23));
  });

  it('crosses month and year boundaries', () => {
    const days = weekGridDays(new Date(2027, 0, 1));
    expect(days[0]).toEqual(new Date(2026, 11, 28));
    expect(days[6]).toEqual(new Date(2027, 0, 3));
  });
});

describe('rolling six weeks grid', () => {
  it('generates 42 days covering 1 week back, current week, and 4 weeks ahead', () => {
    // Wednesday 26 August 2026
    const anchor = new Date(2026, 7, 26);
    const cells = rollingSixWeeksGridCells(anchor);

    expect(cells).toHaveLength(42);
    expect(cells.every((c) => c.inMonth)).toBe(true);

    // Week 1 (previous week): Monday 17 Aug - Sunday 23 Aug
    expect(cells[0].date).toEqual(new Date(2026, 7, 17));
    expect(cells[6].date).toEqual(new Date(2026, 7, 23));

    // Week 2 (current week containing anchor): Monday 24 Aug - Sunday 30 Aug
    expect(cells[7].date).toEqual(new Date(2026, 7, 24));
    expect(cells[13].date).toEqual(new Date(2026, 7, 30));

    // Week 6 (4th upcoming week): Monday 21 Sep - Sunday 27 Sep
    expect(cells[35].date).toEqual(new Date(2026, 8, 21));
    expect(cells[41].date).toEqual(new Date(2026, 8, 27));
  });

  it('works across year transitions', () => {
    // Friday 1 January 2027
    const anchor = new Date(2027, 0, 1);
    const cells = rollingSixWeeksGridCells(anchor);

    expect(cells).toHaveLength(42);
    // Week 1 (previous week): Mon 21 Dec 2026
    expect(cells[0].date).toEqual(new Date(2026, 11, 21));
    // Week 2 (current week): Mon 28 Dec 2026
    expect(cells[7].date).toEqual(new Date(2026, 11, 28));
    // Week 6 (+4 weeks): Sun 31 Jan 2027
    expect(cells[41].date).toEqual(new Date(2027, 0, 31));
  });
});

describe('multi-day calendar events', () => {
  const event = (start: string, end: string, allDay = true) => ({ start, end, allDay });
  const days = weekGridDays(new Date(2026, 8, 9));

  it('includes the CMS end date for all-day events', () => {
    const orientation = event('2026-09-07T00:00:00', '2026-09-09T00:00:00');
    expect(days.map((day) => eventOccursOnDay(orientation, day))).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('does not add an extra day when a timed event ends at midnight', () => {
    const trip = event('2026-09-07T09:00:00', '2026-09-09T00:00:00', false);
    expect(eventOccursOnDay(trip, days[1]!)).toBe(true);
    expect(eventOccursOnDay(trip, days[2]!)).toBe(false);
  });

  it('includes the final day of a timed event and keeps zero-duration events visible', () => {
    expect(eventOccursOnDay(event('2026-09-07T09:00:00', '2026-09-09T12:00:00', false), days[2]!)).toBe(true);
    expect(eventOccursOnDay(event('2026-09-07T00:00:00', '2026-09-07T00:00:00', false), days[0]!)).toBe(true);
  });

  it('continues bars across week and month boundaries', () => {
    const week = weekGridDays(new Date(2026, 8, 1));
    const trip = event('2026-08-29T10:00:00', '2026-09-08T18:00:00', false);
    expect(weekEventSpans([trip], week)).toMatchObject([
      { start: 0, end: 6, lane: 0, continuesBefore: true, continuesAfter: true },
    ]);
  });

  it('separates overlapping bars and reuses a free lane', () => {
    const spans = weekEventSpans(
      [
        event('2026-09-07T00:00:00', '2026-09-09T00:00:00'),
        event('2026-09-08T00:00:00', '2026-09-10T00:00:00'),
        event('2026-09-10T00:00:00', '2026-09-11T00:00:00'),
        event('2026-09-12T12:00:00', '2026-09-12T18:00:00', false),
      ],
      days
    );
    expect(spans.map(({ start, end, lane }) => ({ start, end, lane }))).toEqual([
      { start: 0, end: 2, lane: 0 },
      { start: 1, end: 3, lane: 1 },
      { start: 3, end: 4, lane: 0 },
    ]);
  });
});
