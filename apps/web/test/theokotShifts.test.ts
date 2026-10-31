import { describe, expect, it } from 'vitest';
import { brusselsWallClock } from '@/lib/brussels';
import {
  buildTheokotTimeline,
  defaultSelectedShift,
  defaultTheokotWeek,
  mondayOf,
  type TheokotShiftInput,
} from '@/lib/theokotShifts';

const at = (day: number, hhmm: string) => brusselsWallClock(2026, 11, day, hhmm);

function shift(
  id: string,
  day: number,
  start: string,
  end: string,
  max: number,
  participants: string[] = [],
): TheokotShiftInput {
  return { id, name: id, startTime: at(day, start), endTime: at(day, end), maxParticipants: max, participants };
}

// Het vaste rooster: smeren, middag, namiddag.
const SLOTS = [
  { startMinutes: 10 * 60 + 30, endMinutes: 12 * 60 + 30 },
  { startMinutes: 12 * 60 + 30, endMinutes: 14 * 60 },
  { startMinutes: 14 * 60, endMinutes: 16 * 60 },
];

const MONDAY = { year: 2026, month: 11, day: 2 };
const BEFORE_THE_WEEK = brusselsWallClock(2026, 10, 30, '12:00');

describe('Theokot shift week', () => {
  it('opens on the current week, and on the next one during the weekend', () => {
    expect(defaultTheokotWeek(brusselsWallClock(2026, 11, 4, '09:00'))).toEqual(MONDAY);
    expect(defaultTheokotWeek(brusselsWallClock(2026, 11, 6, '23:30'))).toEqual(MONDAY);
    expect(defaultTheokotWeek(brusselsWallClock(2026, 10, 31, '10:00'))).toEqual(MONDAY);
    expect(defaultTheokotWeek(brusselsWallClock(2026, 11, 1, '22:00'))).toEqual(MONDAY);
  });

  it('snaps any day to its Monday, across a month boundary', () => {
    expect(mondayOf({ year: 2026, month: 11, day: 1 })).toEqual({ year: 2026, month: 10, day: 26 });
    expect(mondayOf({ year: 2026, month: 11, day: 6 })).toEqual(MONDAY);
  });
});

describe('Theokot shift timeline', () => {
  it('has five weekdays and leaves weekend shifts out', () => {
    const timeline = buildTheokotTimeline({
      monday: MONDAY,
      shifts: [shift('ma', 2, '10:30', '12:30', 4), shift('za', 7, '10:30', '12:30', 4)],
      slots: SLOTS,
      now: BEFORE_THE_WEEK,
    });
    expect(timeline.days.map((day) => day.key)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ]);
    expect(timeline.totalShifts).toBe(1);
  });

  it('spans whole hours around the template and any extra shift', () => {
    const timeline = buildTheokotTimeline({
      monday: MONDAY,
      shifts: [shift('extra', 4, '16:00', '17:00', 2)],
      slots: SLOTS,
      now: BEFORE_THE_WEEK,
    });
    expect(timeline.fromMinutes).toBe(10 * 60);
    expect(timeline.toMinutes).toBe(17 * 60);
    expect(timeline.hours.map((hour) => hour.label)).toEqual([
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
    ]);
  });

  it('marks how full a shift is', () => {
    const timeline = buildTheokotTimeline({
      monday: MONDAY,
      shifts: [
        shift('vol', 2, '10:30', '12:30', 2, ['a', 'b']),
        shift('half', 2, '12:30', '14:00', 4, ['a']),
        shift('leeg', 2, '14:00', '16:00', 2),
      ],
      slots: SLOTS,
      now: BEFORE_THE_WEEK,
    });
    const [vol, half, leeg] = timeline.days[0].bars;
    expect([vol.fill, half.fill, leeg.fill]).toEqual(['full', 'partial', 'empty']);
    expect([vol.open, half.open, leeg.open]).toEqual([0, 3, 2]);
    expect(timeline.days[0].open).toBe(5);
    expect(timeline.days[0].hasEmpty).toBe(true);
    expect(timeline.upcomingOpen).toBe(5);
    expect(timeline.upcomingOpenShifts).toBe(2);
  });

  it('shows a missing template shift, but not on a day without any shift', () => {
    const timeline = buildTheokotTimeline({
      monday: MONDAY,
      shifts: [shift('smeren', 6, '10:30', '12:30', 4), shift('middag', 6, '12:30', '14:00', 4)],
      slots: SLOTS,
      now: BEFORE_THE_WEEK,
    });
    const friday = timeline.days[4];
    expect(friday.ghosts.map((ghost) => `${ghost.start}-${ghost.end}`)).toEqual(['14:00-16:00']);
    expect(timeline.days[0].ghosts).toEqual([]);
  });

  it('does not call a shift missing when the day simply starts later', () => {
    const timeline = buildTheokotTimeline({
      monday: MONDAY,
      shifts: [
        shift('smeren', 3, '11:00', '13:00', 4),
        shift('middag', 3, '13:00', '14:30', 4),
        shift('namiddag', 3, '14:30', '16:30', 2),
      ],
      slots: SLOTS,
      now: BEFORE_THE_WEEK,
    });
    expect(timeline.days[1].ghosts).toEqual([]);
  });

  it('puts overlapping shifts in separate lanes', () => {
    const timeline = buildTheokotTimeline({
      monday: MONDAY,
      shifts: [
        shift('smeren', 2, '10:30', '12:30', 4),
        shift('extra smeren', 2, '11:00', '12:00', 2),
        shift('middag', 2, '12:30', '14:00', 4),
      ],
      slots: SLOTS,
      now: BEFORE_THE_WEEK,
    });
    const monday = timeline.days[0];
    expect(monday.bars.map((bar) => bar.lane)).toEqual([0, 1, 0]);
    expect(monday.lanes).toBe(2);
  });

  it('leaves past shifts out of what is still needed, and draws the now-line today', () => {
    const now = brusselsWallClock(2026, 11, 2, '13:00');
    const timeline = buildTheokotTimeline({
      monday: MONDAY,
      shifts: [shift('voorbij', 2, '10:30', '12:30', 4), shift('straks', 2, '14:00', '16:00', 2, ['a'])],
      slots: SLOTS,
      now,
    });
    const [voorbij, straks] = timeline.days[0].bars;
    expect(voorbij.past).toBe(true);
    expect(straks.past).toBe(false);
    expect(timeline.upcomingOpen).toBe(1);
    expect(timeline.days[0].nowLeft).toBeCloseTo(50);
    expect(timeline.days[1].nowLeft).toBeNull();
    expect(defaultSelectedShift(timeline)).toBe('straks');
  });
});
