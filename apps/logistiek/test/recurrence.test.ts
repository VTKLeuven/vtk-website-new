import { describe, expect, it } from 'vitest';
import {
  defaultRepeatDraft,
  MAX_SERIES_OCCURRENCES,
  repeatFromDraft,
  seriesOccurrences,
  weekdayOfLocal,
} from '../lib/recurrence';

const dates = (windows: Array<{ startAt: string }>) => windows.map((window) => window.startAt.slice(0, 10));

/** Woensdag 4 november 2026, 18:00 tot 20:00. */
const WEDNESDAY = { startAt: '2026-11-04T18:00', endAt: '2026-11-04T20:00' };

describe('seriesOccurrences: wekelijks', () => {
  it('herhaalt op dezelfde weekdag met een aantal', () => {
    const out = seriesOccurrences(WEDNESDAY, { kind: 'WEEKLY', weekdays: [2], everyWeeks: 1 }, { kind: 'COUNT', count: 4 });
    expect(dates(out)).toEqual(['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']);
  });

  it('houdt het uur van elke herhaling gelijk, ook over de zomertijdwissel', () => {
    // 25 oktober 2026 gaat de klok achteruit. Op een klokstring blijft 18:00 18:00;
    // met "plus zeven keer 24 uur" ligt de volgende een uur verder.
    const out = seriesOccurrences(
      { startAt: '2026-10-21T18:00', endAt: '2026-10-21T20:00' },
      { kind: 'WEEKLY', weekdays: [2], everyWeeks: 1 },
      { kind: 'COUNT', count: 3 }
    );
    expect(out.map((window) => window.startAt)).toEqual([
      '2026-10-21T18:00',
      '2026-10-28T18:00',
      '2026-11-04T18:00',
    ]);
    expect(out.every((window) => window.endAt.endsWith('T20:00'))).toBe(true);
  });

  it('neemt meerdere weekdagen per week', () => {
    const out = seriesOccurrences(
      { startAt: '2026-11-02T09:00', endAt: '2026-11-02T10:00' }, // maandag
      { kind: 'WEEKLY', weekdays: [0, 3], everyWeeks: 1 },
      { kind: 'COUNT', count: 5 }
    );
    expect(dates(out)).toEqual(['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-12', '2026-11-16']);
  });

  it('neemt de eerste rit altijd mee, ook als haar weekdag niet gekozen is', () => {
    const out = seriesOccurrences(WEDNESDAY, { kind: 'WEEKLY', weekdays: [0], everyWeeks: 1 }, { kind: 'COUNT', count: 3 });
    expect(dates(out)).toEqual(['2026-11-04', '2026-11-09', '2026-11-16']);
  });

  it('slaat weken over bij "om de x weken"', () => {
    const out = seriesOccurrences(WEDNESDAY, { kind: 'WEEKLY', weekdays: [2], everyWeeks: 2 }, { kind: 'COUNT', count: 3 });
    expect(dates(out)).toEqual(['2026-11-04', '2026-11-18', '2026-12-02']);
  });

  it('stopt op de einddatum, die zelf nog meetelt', () => {
    const out = seriesOccurrences(WEDNESDAY, { kind: 'WEEKLY', weekdays: [2], everyWeeks: 1 }, { kind: 'UNTIL', date: '2026-11-18' });
    expect(dates(out)).toEqual(['2026-11-04', '2026-11-11', '2026-11-18']);
  });

  it('geeft enkel de eerste rit wanneer de einddatum ervoor ligt', () => {
    const out = seriesOccurrences(WEDNESDAY, { kind: 'WEEKLY', weekdays: [2], everyWeeks: 1 }, { kind: 'UNTIL', date: '2026-10-01' });
    expect(dates(out)).toEqual(['2026-11-04']);
  });

  it('houdt een rit over middernacht over middernacht', () => {
    const out = seriesOccurrences(
      { startAt: '2026-11-06T22:00', endAt: '2026-11-07T03:00' },
      { kind: 'WEEKLY', weekdays: [4], everyWeeks: 1 },
      { kind: 'COUNT', count: 2 }
    );
    expect(out[1]).toEqual({ startAt: '2026-11-13T22:00', endAt: '2026-11-14T03:00' });
  });

  it('stopt bij het maximum, ook zonder einde dat ver weg ligt', () => {
    const out = seriesOccurrences(WEDNESDAY, { kind: 'WEEKLY', weekdays: [2], everyWeeks: 1 }, { kind: 'UNTIL', date: '2030-01-01' });
    expect(out).toHaveLength(MAX_SERIES_OCCURRENCES);
    const counted = seriesOccurrences(WEDNESDAY, { kind: 'WEEKLY', weekdays: [2], everyWeeks: 1 }, { kind: 'COUNT', count: 500 });
    expect(counted).toHaveLength(MAX_SERIES_OCCURRENCES);
  });
});

describe('seriesOccurrences: maandelijks', () => {
  it('herhaalt op dezelfde dag van de maand', () => {
    const out = seriesOccurrences(
      { startAt: '2026-11-15T10:00', endAt: '2026-11-15T12:00' },
      { kind: 'MONTHLY_DATE' },
      { kind: 'COUNT', count: 4 }
    );
    expect(dates(out)).toEqual(['2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15']);
  });

  it('slaat een maand zonder die dag over in plaats van te verspringen', () => {
    // Geen 31 november, geen 31 februari.
    const out = seriesOccurrences(
      { startAt: '2026-10-31T10:00', endAt: '2026-10-31T12:00' },
      { kind: 'MONTHLY_DATE' },
      { kind: 'COUNT', count: 4 }
    );
    expect(dates(out)).toEqual(['2026-10-31', '2026-12-31', '2027-01-31', '2027-03-31']);
  });

  it('herhaalt op de eerste maandag van de maand', () => {
    const out = seriesOccurrences(
      { startAt: '2026-11-02T10:00', endAt: '2026-11-02T12:00' }, // eerste maandag van november
      { kind: 'MONTHLY_WEEKDAY' },
      { kind: 'COUNT', count: 4 }
    );
    expect(dates(out)).toEqual(['2026-11-02', '2026-12-07', '2027-01-04', '2027-02-01']);
  });

  it('herhaalt op de derde donderdag', () => {
    const out = seriesOccurrences(
      { startAt: '2026-11-19T10:00', endAt: '2026-11-19T12:00' }, // derde donderdag van november
      { kind: 'MONTHLY_WEEKDAY' },
      { kind: 'COUNT', count: 3 }
    );
    expect(dates(out)).toEqual(['2026-11-19', '2026-12-17', '2027-01-21']);
  });

  it('herhaalt op de laatste vrijdag wanneer het de vijfde is', () => {
    // 30 oktober 2026 is de vijfde vrijdag van oktober, en de laatste.
    const out = seriesOccurrences(
      { startAt: '2026-10-30T10:00', endAt: '2026-10-30T12:00' },
      { kind: 'MONTHLY_WEEKDAY' },
      { kind: 'COUNT', count: 3 }
    );
    expect(dates(out)).toEqual(['2026-10-30', '2026-11-27', '2026-12-25']);
  });
});

describe('het formulier', () => {
  it('start op de weekdag van de eerste rit', () => {
    // 4 november 2026 is een woensdag (maandag is 0).
    expect(weekdayOfLocal('2026-11-04T18:00')).toBe(2);
    expect(defaultRepeatDraft('2026-11-04T18:00').weekdays).toEqual([2]);
    expect(weekdayOfLocal('')).toBeNull();
  });

  it('geeft niets terug zolang herhalen uit staat', () => {
    expect(repeatFromDraft(defaultRepeatDraft('2026-11-04T18:00'))).toBeNull();
  });

  it('maakt een regel en een einde van de keuzes', () => {
    const draft = { ...defaultRepeatDraft('2026-11-04T18:00'), on: true, everyWeeks: 2 };
    expect(repeatFromDraft(draft)).toEqual({
      rule: { kind: 'WEEKLY', weekdays: [2], everyWeeks: 2 },
      end: { kind: 'COUNT', count: 8 },
    });
    expect(repeatFromDraft({ ...draft, endKind: 'UNTIL', until: '2026-12-31', pattern: 'MONTHLY_DATE' })).toEqual({
      rule: { kind: 'MONTHLY_DATE' },
      end: { kind: 'UNTIL', date: '2026-12-31' },
    });
  });

  it('valt terug op een aantal wanneer "tot" nog geen datum heeft', () => {
    const draft = { ...defaultRepeatDraft('2026-11-04T18:00'), on: true, endKind: 'UNTIL' as const, until: '' };
    expect(repeatFromDraft(draft)?.end).toEqual({ kind: 'COUNT', count: 8 });
  });
});
