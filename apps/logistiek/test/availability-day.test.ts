import { describe, expect, it } from 'vitest';
import {
  clipOutsideDay,
  hoursToRanges,
  mergeRanges,
  rangeToHours,
} from '../lib/availability-day';

const at = (iso: string) => new Date(iso);

describe('mergeRanges', () => {
  it('plakt aansluitende bereiken aan elkaar', () => {
    // Twee vensters die op elkaar aansluiten zijn één blok. Als twee losse
    // banden zien ze eruit als een gaatje dat er niet is.
    const out = mergeRanges([
      { startAt: at('2026-09-02T12:00Z'), endAt: at('2026-09-02T14:00Z') },
      { startAt: at('2026-09-02T14:00Z'), endAt: at('2026-09-02T18:00Z') },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].endAt.toISOString()).toBe(at('2026-09-02T18:00Z').toISOString());
  });

  it('laat een echt gat staan', () => {
    const out = mergeRanges([
      { startAt: at('2026-09-02T09:00Z'), endAt: at('2026-09-02T11:00Z') },
      { startAt: at('2026-09-02T13:00Z'), endAt: at('2026-09-02T15:00Z') },
    ]);
    expect(out).toHaveLength(2);
  });

  it('gooit lege en omgekeerde bereiken weg', () => {
    expect(
      mergeRanges([{ startAt: at('2026-09-02T12:00Z'), endAt: at('2026-09-02T12:00Z') }])
    ).toEqual([]);
    expect(
      mergeRanges([{ startAt: at('2026-09-02T14:00Z'), endAt: at('2026-09-02T12:00Z') }])
    ).toEqual([]);
  });
});

describe('clipOutsideDay', () => {
  const dayStart = at('2026-09-05T00:00Z');
  const dayEnd = at('2026-09-06T00:00Z');

  it('houdt de stukken van de dagen ernaast over', () => {
    // Dit is de hele reden dat deze functie bestaat: één dag herschrijven mag de
    // dagen ernaast niet stil wegvegen.
    const out = clipOutsideDay(
      { startAt: at('2026-09-04T20:00Z'), endAt: at('2026-09-06T08:00Z') },
      dayStart,
      dayEnd
    );
    expect(out).toHaveLength(2);
    expect(out[0].endAt.toISOString()).toBe(dayStart.toISOString());
    expect(out[1].startAt.toISOString()).toBe(dayEnd.toISOString());
  });

  it('geeft niets terug voor een venster dat helemaal binnen de dag valt', () => {
    expect(
      clipOutsideDay(
        { startAt: at('2026-09-05T09:00Z'), endAt: at('2026-09-05T17:00Z') },
        dayStart,
        dayEnd
      )
    ).toEqual([]);
  });

  it('laat een venster buiten de dag helemaal staan', () => {
    const out = clipOutsideDay(
      { startAt: at('2026-09-07T09:00Z'), endAt: at('2026-09-07T17:00Z') },
      dayStart,
      dayEnd
    );
    expect(out).toHaveLength(1);
    expect(out[0].startAt.toISOString()).toBe(at('2026-09-07T09:00Z').toISOString());
  });
});

describe('hoursToRanges', () => {
  const dayStart = at('2026-09-02T00:00Z');

  it('maakt van opeenvolgende uren één venster', () => {
    const out = hoursToRanges([9, 10, 11, 12], dayStart);
    expect(out).toHaveLength(1);
    expect(out[0].startAt.toISOString()).toBe(at('2026-09-02T09:00Z').toISOString());
    expect(out[0].endAt.toISOString()).toBe(at('2026-09-02T13:00Z').toISOString());
  });

  it('houdt losse blokken uit elkaar', () => {
    expect(hoursToRanges([9, 10, 14, 15], dayStart)).toHaveLength(2);
  });

  it('trekt zich niets aan van de volgorde of van dubbels', () => {
    expect(hoursToRanges([11, 9, 10, 9], dayStart)).toHaveLength(1);
  });

  it('negeert uren buiten de dag', () => {
    expect(hoursToRanges([-1, 24, 99], dayStart)).toEqual([]);
  });
});

describe('rangeToHours', () => {
  const dayStart = at('2026-09-02T00:00Z');
  const dayEnd = at('2026-09-03T00:00Z');

  it('kleurt elk uur dat het venster raakt', () => {
    // 09:15 tot 12:00 raakt de uren 9, 10 en 11. Uur 12 niet: het venster is
    // dan al gedaan, en een half gekleurd vakje bestaat niet.
    expect(
      rangeToHours(
        { startAt: at('2026-09-02T09:15Z'), endAt: at('2026-09-02T12:00Z') },
        dayStart,
        dayEnd
      )
    ).toEqual([9, 10, 11]);
  });

  it('knipt op de dagranden', () => {
    const hours = rangeToHours(
      { startAt: at('2026-09-01T20:00Z'), endAt: at('2026-09-02T03:00Z') },
      dayStart,
      dayEnd
    );
    expect(hours).toEqual([0, 1, 2]);
  });

  it('geeft niets voor een venster dat deze dag niet raakt', () => {
    expect(
      rangeToHours(
        { startAt: at('2026-09-05T09:00Z'), endAt: at('2026-09-05T17:00Z') },
        dayStart,
        dayEnd
      )
    ).toEqual([]);
  });
});
