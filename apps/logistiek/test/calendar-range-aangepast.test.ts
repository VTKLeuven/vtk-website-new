import { describe, expect, it } from 'vitest';
import {
  MAX_CUSTOM_DAYS,
  calendarRange,
  customRangeLength,
  isCurrentPeriod,
  parseCalendarView,
  parseCustomRange,
  shiftAnchor,
} from '@/lib/calendar-range';

/** "Aangepast": een eigen bereik in de planning, `?van=...&tot=...` met `tot` inbegrepen. */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const today = day('2026-11-27');

describe('parseCustomRange', () => {
  it('neemt van en tot over, allebei inbegrepen', () => {
    const range = parseCustomRange('2026-11-12', '2026-12-03', today);
    expect(iso(range.first)).toBe('2026-11-12');
    expect(iso(range.last)).toBe('2026-12-03');
    expect(customRangeLength(range)).toBe(22);
  });

  it('draait een omgekeerd bereik om in plaats van het te weigeren', () => {
    const range = parseCustomRange('2026-12-03', '2026-11-12', today);
    expect(iso(range.first)).toBe('2026-11-12');
    expect(iso(range.last)).toBe('2026-12-03');
  });

  it('kort een te lang bereik in tot het maximum', () => {
    const range = parseCustomRange('2026-01-01', '2026-12-31', today);
    expect(customRangeLength(range)).toBe(MAX_CUSTOM_DAYS);
    expect(iso(range.first)).toBe('2026-01-01');
  });

  it('valt zonder datums terug op twee weken vanaf vandaag', () => {
    const range = parseCustomRange(undefined, undefined, today);
    expect(iso(range.first)).toBe('2026-11-27');
    expect(iso(range.last)).toBe('2026-12-10');
  });

  it('negeert een onleesbare datum', () => {
    const range = parseCustomRange('morgen', '2026-12-10', today);
    expect(iso(range.first)).toBe('2026-11-27');
    expect(iso(range.last)).toBe('2026-12-10');
  });
});

describe('calendarRange bij aangepast', () => {
  it('is een gewone weergave in de URL', () => {
    expect(parseCalendarView('aangepast')).toBe('aangepast');
  });

  it('tekent tot veertien dagen als tijdrooster, precies die dagen', () => {
    const range = calendarRange('aangepast', day('2026-11-25'), 5, day('2026-12-02'));
    expect(range.layout).toBe('time');
    expect(range.days.map(iso)).toEqual([
      '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28',
      '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02',
    ]);
    expect(iso(range.to)).toBe('2026-12-03');
  });

  it('tekent langer als hele weken, met het bereik zelf als focus', () => {
    // Woensdag 12 november tot woensdag 3 december: 22 dagen.
    const range = calendarRange('aangepast', day('2026-11-12'), 5, day('2026-12-03'));
    expect(range.layout).toBe('month');
    expect(iso(range.from)).toBe('2026-11-09'); // de maandag ervoor
    expect(iso(range.to)).toBe('2026-12-07'); // na de zondag van de laatste week
    expect(iso(range.focus!.from)).toBe('2026-11-12');
    expect(iso(range.focus!.to)).toBe('2026-12-04');
    expect(range.days.length % 7).toBe(0);
  });

  it('laat de andere weergaven ongemoeid', () => {
    expect(calendarRange('maand', day('2026-11-12')).layout).toBe('month');
    expect(calendarRange('week', day('2026-11-12')).layout).toBe('time');
    expect(calendarRange('maand', day('2026-11-12')).focus).toBeUndefined();
  });
});

describe('bladeren in een eigen bereik', () => {
  it('schuift het hele bereik op, zodat het volgende aansluit', () => {
    expect(iso(shiftAnchor('aangepast', day('2026-11-12'), 1, 22))).toBe('2026-12-04');
    expect(iso(shiftAnchor('aangepast', day('2026-11-12'), -1, 22))).toBe('2026-10-21');
  });

  it('staat op vandaag zolang vandaag in het bereik ligt', () => {
    const now = new Date('2026-11-27T10:00:00Z');
    expect(isCurrentPeriod('aangepast', day('2026-11-12'), now, day('2026-12-03'))).toBe(true);
    expect(isCurrentPeriod('aangepast', day('2026-12-04'), now, day('2026-12-20'))).toBe(false);
  });
});
