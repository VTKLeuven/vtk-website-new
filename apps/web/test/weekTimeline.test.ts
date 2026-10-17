import { describe, expect, it } from 'vitest';
import { weekGridDays } from '@/components/editorial/calendarGrid';
import { hourOfDay, TIMELINE_FROM, TIMELINE_TO, weekTimeline } from '@/lib/calendar/weekTimeline';

// Maandag 12 tot en met zondag 18 oktober 2026.
const days = weekGridDays(new Date(2026, 9, 14));
// Zaterdag 17 oktober, kwart voor vijf.
const now = new Date(2026, 9, 17, 16, 45);

function event(id: string, start: string, end: string, extra: Record<string, unknown> = {}) {
  return { id, start, end, allDay: false, moments: [], ...extra };
}

describe('the hour of a moment on its day', () => {
  it('counts from midnight, and keeps counting past it into the night', () => {
    expect(hourOfDay(new Date(2026, 9, 13, 20, 30), days[1]!)).toBe(20.5);
    expect(hourOfDay(new Date(2026, 9, 14, 1, 15), days[1]!)).toBe(25.25);
  });
});

describe('the week as a timeline', () => {
  it('opens from 12:00 to 02:00 when everything falls inside', () => {
    const timeline = weekTimeline([event('a', '2026-10-13T18:30:00', '2026-10-13T22:00:00')], days, now);
    expect([timeline.from, timeline.to]).toEqual([TIMELINE_FROM, TIMELINE_TO]);
    expect(timeline.days[1]).toMatchObject([{ from: 18.5, to: 22, lane: 0, runsOn: false }]);
  });

  it('puts an event that lasts all day or several days in one bar, not in every column', () => {
    const elixirWeek = event('week', '2026-10-09T00:00:00', '2026-10-16T00:00:00', { allDay: true });
    const course = event('course', '2026-10-14T09:00:00', '2026-10-16T17:00:00');
    const timeline = weekTimeline([elixirWeek, course], days, now);
    expect(timeline.days.flat()).toEqual([]);
    expect(timeline.bars).toMatchObject([
      { event: { id: 'week' }, start: 0, end: 4, lane: 0, continuesBefore: true, continuesAfter: false },
      { event: { id: 'course' }, start: 2, end: 4, lane: 1, continuesBefore: false, continuesAfter: false },
    ]);
    expect(timeline.barLanes).toBe(2);
  });

  it('gives a series of moments a block on each of its days, at the hour of that day', () => {
    const run = event('run', '2026-10-12T20:30:00', '2026-10-15T21:30:00', {
      moments: ['12', '13', '14', '15'].map((day) => ({
        start: `2026-10-${day}T20:30:00`,
        end: `2026-10-${day}T21:30:00`,
        label: null,
      })),
    });
    const timeline = weekTimeline([run], days, now);
    expect(timeline.bars).toEqual([]);
    expect(timeline.days.map((blocks) => blocks.length)).toEqual([1, 1, 1, 1, 0, 0, 0]);
  });

  it('puts overlapping events side by side instead of drawing one over the other', () => {
    const timeline = weekTimeline(
      [
        event('bowling', '2026-10-14T19:00:00', '2026-10-14T22:00:00'),
        event('launch', '2026-10-14T19:00:00', '2026-10-14T21:00:00'),
        event('run', '2026-10-14T20:30:00', '2026-10-14T21:30:00'),
        event('lunch', '2026-10-14T12:00:00', '2026-10-14T14:00:00'),
      ],
      days,
      now
    );
    const lanes = Object.fromEntries(timeline.days[2]!.map((block) => [block.event.id, [block.lane, block.lanes]]));
    expect(lanes).toEqual({ lunch: [0, 1], bowling: [0, 3], launch: [1, 3], run: [2, 3] });
  });

  it('keeps a party that starts after midnight on the evening everyone left', () => {
    const timeline = weekTimeline([event('night', '2026-10-14T01:00:00', '2026-10-14T04:00:00')], days, now);
    expect(timeline.days[1]).toMatchObject([{ from: 25, to: 28 }]);
    expect(timeline.days[2]).toEqual([]);
    expect(timeline.to).toBe(28);
  });

  it('stretches the window for a morning event, and lets a very long night run out of it', () => {
    const timeline = weekTimeline(
      [
        event('morning', '2026-10-12T09:30:00', '2026-10-12T11:00:00'),
        event('td', '2026-10-15T22:00:00', '2026-10-16T07:00:00'),
      ],
      days,
      now
    );
    expect(timeline.from).toBe(9);
    expect(timeline.to).toBe(30);
    expect(timeline.days[3]).toMatchObject([{ from: 22, to: 31, runsOn: true }]);
  });

  it('shows the now line on today, and not in another week', () => {
    expect(weekTimeline([], days, now).now).toEqual({ day: 5, hour: 16.75 });
    expect(weekTimeline([], weekGridDays(new Date(2026, 9, 21)), now).now).toBeNull();
  });

  it('draws the small hours on the evening before', () => {
    expect(weekTimeline([], days, new Date(2026, 9, 14, 0, 30)).now).toEqual({ day: 1, hour: 24.5 });
  });

  it('leaves out the now line in the morning, before the window opens', () => {
    expect(weekTimeline([], days, new Date(2026, 9, 14, 9, 0)).now).toBeNull();
  });
});
