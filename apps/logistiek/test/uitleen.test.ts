import { describe, expect, it } from 'vitest';
import {
  billedHours,
  dayPartLabel,
  describeReservationChanges,
  formatDateOnly,
  formatDateWithPart,
  formatDateRange,
  formatDateTime,
  formatEuro,
  formatEventMoment,
  formatPriceCents,
  isEmailish,
  isLastMinute,
  isNightTrip,
  isOnQuarterHour,
  isoWeekNumber,
  parseDateOnly,
  parseNotifyEmails,
  startOfWeek,
  pricingModeLabel,
  rangesOverlap,
  requesterTypeLabel,
  reservationStatusLabel,
  toDateInputValue,
  toDatetimeLocalValue,
  todayDateOnly,
  transportPriceCents,
  tripHoursLabel,
  tripWindowFor,
  vanStatusLabel,
} from '@/lib/uitleen';

describe('formatEuro', () => {
  it('formats whole and fractional euros', () => {
    expect(formatEuro(0)).toBe('€ 0,00');
    expect(formatEuro(50)).toBe('€ 0,50');
    expect(formatEuro(250)).toBe('€ 2,50');
    expect(formatEuro(199)).toBe('€ 1,99');
    expect(formatEuro(100000)).toBe('€ 1000,00');
  });

  it('pads the cents to two digits', () => {
    expect(formatEuro(305)).toBe('€ 3,05');
    expect(formatEuro(340)).toBe('€ 3,40');
  });

  it('keeps the sign for negative amounts', () => {
    expect(formatEuro(-250)).toBe('-€ 2,50');
  });
});

describe('formatPriceCents', () => {
  it('formats a known amount', () => {
    expect(formatPriceCents(840)).toBe('€ 8,40');
  });

  it('shows a locale-aware placeholder when the price is not yet known', () => {
    expect(formatPriceCents(null)).toBe('Nog te bepalen');
    expect(formatPriceCents(undefined)).toBe('Nog te bepalen');
    expect(formatPriceCents(null, 'en')).toBe('To be determined');
    expect(formatPriceCents(null, 'nl')).toBe('Nog te bepalen');
  });

  it('formats zero as an amount, not as the placeholder', () => {
    expect(formatPriceCents(0)).toBe('€ 0,00');
  });
});

describe('parseDateOnly', () => {
  it('parses a valid YYYY-MM-DD to UTC midnight', () => {
    const d = parseDateOnly('2026-07-20');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });

  it('rejects malformed input', () => {
    expect(parseDateOnly('')).toBeNull();
    expect(parseDateOnly('20-07-2026')).toBeNull();
    expect(parseDateOnly('2026/07/20')).toBeNull();
    expect(parseDateOnly('2026-7-2')).toBeNull();
  });

  it('rejects an impossible calendar date', () => {
    expect(parseDateOnly('2026-02-30')).toBeNull();
    expect(parseDateOnly('2026-13-01')).toBeNull();
  });
});

describe('toDateInputValue / round trip', () => {
  it('round-trips a date-only value', () => {
    const value = '2026-07-20';
    const parsed = parseDateOnly(value)!;
    expect(toDateInputValue(parsed)).toBe(value);
  });
});

describe('toDatetimeLocalValue', () => {
  it('renders Brussels wall-clock time (summer, +2)', () => {
    // 2026-07-20 12:00 UTC is 14:00 in Brussels (CEST).
    const utc = new Date('2026-07-20T12:00:00.000Z');
    expect(toDatetimeLocalValue(utc)).toBe('2026-07-20T14:00');
  });

  it('renders Brussels wall-clock time (winter, +1)', () => {
    // 2026-01-20 12:00 UTC is 13:00 in Brussels (CET).
    const utc = new Date('2026-01-20T12:00:00.000Z');
    expect(toDatetimeLocalValue(utc)).toBe('2026-01-20T13:00');
  });
});

describe('tripWindowFor', () => {
  // De dagkolommen zijn @db.Date en komen als middernacht UTC terug. Omrekenen
  // naar Brusselse tijd zou in de winter een dag terugvallen; deze test bewaakt
  // dat we de dag in UTC lezen en er enkel een lokaal uur aan plakken.
  it('keeps the calendar day in winter', () => {
    const day = new Date('2026-01-20T00:00:00.000Z');
    expect(tripWindowFor(day, 'NAMIDDAG')).toEqual({
      startAt: '2026-01-20T13:00',
      endAt: '2026-01-20T15:00',
    });
  });

  it('keeps the calendar day in summer', () => {
    const day = new Date('2026-07-20T00:00:00.000Z');
    expect(tripWindowFor(day, 'AVOND')).toEqual({
      startAt: '2026-07-20T18:00',
      endAt: '2026-07-20T20:00',
    });
  });

  it('falls back to the morning without a day part', () => {
    const day = new Date('2026-07-20T00:00:00.000Z');
    expect(tripWindowFor(day, null)).toEqual({
      startAt: '2026-07-20T09:00',
      endAt: '2026-07-20T11:00',
    });
  });
});

describe('todayDateOnly', () => {
  it('returns UTC midnight of the Brussels calendar day', () => {
    // Just before midnight UTC on the 19th is already the 20th in Brussels.
    const now = new Date('2026-07-19T23:30:00.000Z');
    expect(todayDateOnly(now).toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });
});

describe('rangesOverlap', () => {
  const d = (s: string) => new Date(s);

  it('detects overlapping ranges', () => {
    expect(
      rangesOverlap(d('2026-07-01'), d('2026-07-10'), d('2026-07-05'), d('2026-07-15'))
    ).toBe(true);
  });

  it('treats touching endpoints as overlapping (closed ranges)', () => {
    expect(
      rangesOverlap(d('2026-07-01'), d('2026-07-10'), d('2026-07-10'), d('2026-07-20'))
    ).toBe(true);
  });

  it('returns false for disjoint ranges', () => {
    expect(
      rangesOverlap(d('2026-07-01'), d('2026-07-05'), d('2026-07-06'), d('2026-07-10'))
    ).toBe(false);
  });

  it('detects a fully-contained range', () => {
    expect(
      rangesOverlap(d('2026-07-01'), d('2026-07-31'), d('2026-07-10'), d('2026-07-12'))
    ).toBe(true);
  });
});

describe('startOfWeek', () => {
  it('gives the Monday of that week', () => {
    // 2026-09-16 is een woensdag.
    expect(startOfWeek(new Date('2026-09-16T12:00:00Z')).toISOString()).toBe(
      '2026-09-14T00:00:00.000Z'
    );
  });

  it('keeps a Monday on itself', () => {
    expect(startOfWeek(new Date('2026-09-14T08:00:00Z')).toISOString()).toBe(
      '2026-09-14T00:00:00.000Z'
    );
  });

  it('counts Sunday as the end of its week, not the start of the next', () => {
    expect(startOfWeek(new Date('2026-09-20T21:00:00Z')).toISOString()).toBe(
      '2026-09-14T00:00:00.000Z'
    );
  });

  it('uses the Brussels day, so late Sunday evening stays in that week', () => {
    // 23:30 UTC op zondag is maandag 01:30 in Brussel (zomertijd).
    expect(startOfWeek(new Date('2026-09-20T23:30:00Z')).toISOString()).toBe(
      '2026-09-21T00:00:00.000Z'
    );
  });
});

describe('isoWeekNumber', () => {
  it('numbers an ordinary week', () => {
    expect(isoWeekNumber(new Date('2026-09-14T00:00:00Z'))).toBe(38);
  });

  it('puts 4 January in week 1', () => {
    expect(isoWeekNumber(new Date('2026-01-04T00:00:00Z'))).toBe(1);
  });

  it('gives the last days of a year the week of the following year when ISO says so', () => {
    // 31 december 2025 is een woensdag en hoort bij week 1 van 2026.
    expect(isoWeekNumber(new Date('2025-12-31T00:00:00Z'))).toBe(1);
    // 1 januari 2027 is een vrijdag en hoort nog bij week 53 van 2026.
    expect(isoWeekNumber(new Date('2027-01-01T00:00:00Z'))).toBe(53);
  });
});

describe('formatDateRange', () => {
  it('mentions the month once when both dates share it', () => {
    expect(
      formatDateRange(new Date('2026-08-01T00:00:00Z'), new Date('2026-08-30T00:00:00Z'))
    ).toBe('1 tot 30 augustus 2026');
  });

  it('names both months within one year', () => {
    expect(
      formatDateRange(new Date('2026-08-01T00:00:00Z'), new Date('2026-09-03T00:00:00Z'))
    ).toBe('1 augustus tot 3 september 2026');
  });

  it('spells out both years when they differ', () => {
    expect(
      formatDateRange(new Date('2026-12-28T00:00:00Z'), new Date('2027-01-03T00:00:00Z'))
    ).toBe('28 december 2026 tot 3 januari 2027');
  });
});

describe('isOnQuarterHour', () => {
  it('accepts the four quarters of an hour', () => {
    expect(isOnQuarterHour(new Date('2026-09-12T14:00:00Z'))).toBe(true);
    expect(isOnQuarterHour(new Date('2026-09-12T14:15:00Z'))).toBe(true);
    expect(isOnQuarterHour(new Date('2026-09-12T14:30:00Z'))).toBe(true);
    expect(isOnQuarterHour(new Date('2026-09-12T14:45:00Z'))).toBe(true);
  });

  it('rejects anything in between', () => {
    expect(isOnQuarterHour(new Date('2026-09-12T14:07:00Z'))).toBe(false);
    expect(isOnQuarterHour(new Date('2026-09-12T14:20:00Z'))).toBe(false);
  });

  it('rejects stray seconds and milliseconds on a whole quarter', () => {
    expect(isOnQuarterHour(new Date('2026-09-12T14:15:30Z'))).toBe(false);
    expect(isOnQuarterHour(new Date('2026-09-12T14:15:00.500Z'))).toBe(false);
  });
});

describe('billedHours', () => {
  it('rounds a partial hour up to a whole hour', () => {
    const start = new Date('2026-07-20T10:00:00Z');
    expect(billedHours(start, new Date('2026-07-20T11:30:00Z'))).toBe(2);
  });

  it('counts an exact hour as one', () => {
    const start = new Date('2026-07-20T10:00:00Z');
    expect(billedHours(start, new Date('2026-07-20T11:00:00Z'))).toBe(1);
  });

  it('never bills fewer than one hour', () => {
    const start = new Date('2026-07-20T10:00:00Z');
    expect(billedHours(start, new Date('2026-07-20T10:05:00Z'))).toBe(1);
    expect(billedHours(start, start)).toBe(1);
  });
});

describe('transportPriceCents', () => {
  const start = new Date('2026-07-20T10:00:00Z');
  const end = new Date('2026-07-20T13:00:00Z'); // 3 hours

  it('is zero for a FREE vehicle', () => {
    expect(transportPriceCents({ pricingMode: 'FREE', rateCents: 999, startAt: start, endAt: end })).toBe(0);
  });

  it('multiplies the rate by billed hours for PER_HOUR', () => {
    expect(transportPriceCents({ pricingMode: 'PER_HOUR', rateCents: 750, startAt: start, endAt: end })).toBe(2250);
  });

  it('is a flat amount for FLAT regardless of duration', () => {
    expect(transportPriceCents({ pricingMode: 'FLAT', rateCents: 1500, startAt: start, endAt: end })).toBe(1500);
  });

  it('is not knowable up front for PER_KM (null)', () => {
    expect(transportPriceCents({ pricingMode: 'PER_KM', rateCents: 35, startAt: start, endAt: end })).toBeNull();
  });
});

describe('isLastMinute', () => {
  const requestedAt = new Date('2026-07-20T10:00:00Z');

  it('flags a pickup within the default 7 days', () => {
    expect(isLastMinute(new Date('2026-07-25T10:00:00Z'), requestedAt)).toBe(true);
  });

  it('does not flag a pickup beyond the default 7 days', () => {
    expect(isLastMinute(new Date('2026-07-28T10:00:00Z'), requestedAt)).toBe(false);
  });

  it('follows the configured term', () => {
    const pickup = new Date('2026-07-28T10:00:00Z'); // acht dagen later
    expect(isLastMinute(pickup, requestedAt, 14)).toBe(true);
    expect(isLastMinute(pickup, requestedAt, 3)).toBe(false);
  });
});

describe('locale-aware labels', () => {
  it('translates reservation statuses', () => {
    expect(reservationStatusLabel('REQUESTED', 'nl')).toBe('Aangevraagd');
    expect(reservationStatusLabel('REQUESTED', 'en')).toBe('Requested');
    expect(reservationStatusLabel('PICKED_UP', 'en')).toBe('Collected');
    expect(reservationStatusLabel('RETURNED', 'nl')).toBe('Teruggebracht');
  });

  it('translates transport statuses', () => {
    expect(vanStatusLabel('COMPLETED', 'nl')).toBe('Uitgevoerd');
    expect(vanStatusLabel('COMPLETED', 'en')).toBe('Completed');
  });

  it('translates pricing modes', () => {
    expect(pricingModeLabel('PER_KM', 'nl')).toBe('Per kilometer');
    expect(pricingModeLabel('PER_KM', 'en')).toBe('Per kilometre');
    expect(pricingModeLabel('FREE', 'en')).toBe('Free');
  });

  it('translates requester types', () => {
    expect(requesterTypeLabel('INTERN', 'nl')).toBe('Interne post');
    expect(requesterTypeLabel('INTERN', 'en')).toBe('Internal post');
    expect(requesterTypeLabel('EXTERN', 'en')).toBe('External');
  });

  it('covers every status/mode/type key in both locales (no missing translations)', () => {
    const resStatuses = ['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PICKED_UP', 'RETURNED'] as const;
    const vanStatuses = ['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'] as const;
    const modes = ['FREE', 'PER_HOUR', 'PER_KM', 'FLAT'] as const;
    const types = ['INTERN', 'WERKGROEP', 'EXTERN'] as const;
    for (const locale of ['nl', 'en'] as const) {
      for (const s of resStatuses) expect(reservationStatusLabel(s, locale)).toBeTruthy();
      for (const s of vanStatuses) expect(vanStatusLabel(s, locale)).toBeTruthy();
      for (const m of modes) expect(pricingModeLabel(m, locale)).toBeTruthy();
      for (const t of types) expect(requesterTypeLabel(t, locale)).toBeTruthy();
    }
  });
});

describe('date formatting locale', () => {
  const date = parseDateOnly('2026-07-20')!; // a Monday

  it('uses Dutch month/day names by default and in nl', () => {
    expect(formatDateOnly(date)).toContain('juli');
    expect(formatDateOnly(date, 'nl')).toContain('juli');
  });

  it('uses English month names in en', () => {
    const en = formatDateOnly(date, 'en');
    expect(en).toContain('July');
    expect(en).not.toContain('juli');
  });

  it('localizes date-time as well', () => {
    const dt = new Date('2026-07-20T12:00:00Z');
    expect(formatDateTime(dt, 'nl')).toContain('juli');
    expect(formatDateTime(dt, 'en')).toContain('July');
  });
});

describe('formatEventMoment', () => {
  it('toont de Belgische dag, niet de UTC-dag', () => {
    // 15 oktober 2026 om 00:00 in Brussel is 14 oktober 22:00 UTC. Een evenement
    // zonder uur mag daar geen dag te vroeg uitkomen.
    const startAt = new Date('2026-10-14T22:00:00.000Z');
    const text = formatEventMoment({ startAt, startTimeKnown: false });
    expect(text).toContain('15');
    expect(text).toContain('oktober');
    expect(text).not.toContain('00:00');
  });

  it('zet het uur erbij zodra het ingevuld is', () => {
    const startAt = new Date('2026-10-15T18:00:00.000Z'); // 20:00 Brussel
    expect(formatEventMoment({ startAt, startTimeKnown: true })).toContain('20:00');
  });

  it('zonder startmoment is er niets te tonen', () => {
    expect(formatEventMoment({ startAt: null, startTimeKnown: false })).toBeNull();
  });
});

describe('tripHoursLabel', () => {
  it('toont enkel de uren binnen dezelfde dag', () => {
    const start = new Date('2026-09-12T08:00:00.000Z'); // 10:00 Brussel
    const end = new Date('2026-09-12T12:00:00.000Z'); // 14:00 Brussel
    expect(tripHoursLabel(start, end)).toBe('10:00-14:00');
  });

  it('zet de einddag erbij wanneer de rit over middernacht gaat', () => {
    const start = new Date('2026-07-27T20:12:00.000Z'); // 22:12 Brussel
    const end = new Date('2026-07-27T22:12:00.000Z'); // 00:12 de volgende dag
    expect(tripHoursLabel(start, end)).toContain('22:12-00:12');
    expect(tripHoursLabel(start, end)).toMatch(/28/);
  });
});

describe('isNightTrip', () => {
  it('een rit over middernacht is er sowieso een', () => {
    expect(
      isNightTrip(new Date('2026-07-27T20:12:00.000Z'), new Date('2026-07-27T22:12:00.000Z'))
    ).toBe(true);
  });

  it('eindigen na 22:00 Belgische tijd telt mee', () => {
    // 20:00 tot 22:30 Brussel.
    expect(
      isNightTrip(new Date('2026-07-27T18:00:00.000Z'), new Date('2026-07-27T20:30:00.000Z'))
    ).toBe(true);
  });

  it('een rit overdag niet', () => {
    expect(
      isNightTrip(new Date('2026-07-27T08:00:00.000Z'), new Date('2026-07-27T12:00:00.000Z'))
    ).toBe(false);
  });
});

describe('parseNotifyEmails', () => {
  it('splitst op komma en puntkomma en trimt', () => {
    expect(parseNotifyEmails('a@vtk.be, b@vtk.be')).toEqual(['a@vtk.be', 'b@vtk.be']);
    expect(parseNotifyEmails(' a@vtk.be ;b@vtk.be ')).toEqual(['a@vtk.be', 'b@vtk.be']);
  });

  it('een leeg veld is geen fout maar een lege lijst', () => {
    expect(parseNotifyEmails('')).toEqual([]);
    expect(parseNotifyEmails('  ,  ')).toEqual([]);
  });

  it('weigert de hele lijst zodra er één adres niet klopt', () => {
    // Half verzenden en de rest stil laten vallen is erger dan een foutmelding:
    // de aanvrager denkt dan dat iedereen meeleest.
    expect(parseNotifyEmails('a@vtk.be, kapot')).toBeNull();
  });

  it('houdt hetzelfde adres maar één keer over', () => {
    expect(parseNotifyEmails('a@vtk.be, A@VTK.BE')).toEqual(['a@vtk.be']);
  });
});

describe('isEmailish', () => {
  it('accepteert gewone adressen', () => {
    expect(isEmailish('logistiek.existenz@vtk.be')).toBe(true);
    expect(isEmailish('  jan@example.com  ')).toBe(true);
  });

  it('weigert wat duidelijk geen adres is', () => {
    expect(isEmailish('logistiek')).toBe(false);
    expect(isEmailish('logistiek@vtk')).toBe(false);
    expect(isEmailish('jan @vtk.be')).toBe(false);
    expect(isEmailish('')).toBe(false);
  });
});

describe('describeReservationChanges', () => {
  const snapshot = (
    pickup: string,
    ret: string,
    lines: Array<[string, number]>
  ) => ({
    pickupDate: parseDateOnly(pickup)!,
    returnDate: parseDateOnly(ret)!,
    lines: lines.map(([itemName, quantity]) => ({ itemName, quantity })),
  });

  it('geeft niets terug wanneer er niets veranderde', () => {
    const before = snapshot('2026-09-12', '2026-09-14', [['Tafel', 5]]);
    const after = snapshot('2026-09-12', '2026-09-14', [['Tafel', 5]]);
    expect(describeReservationChanges(before, after)).toEqual([]);
  });

  it('benoemt een gewijzigd aantal, een toevoeging en een verwijdering', () => {
    const before = snapshot('2026-09-12', '2026-09-14', [['Tafel', 5], ['Frigo', 1]]);
    const after = snapshot('2026-09-12', '2026-09-14', [['Tafel', 3], ['Stoel', 10]]);
    expect(describeReservationChanges(before, after)).toEqual([
      'Tafel: 5 → 3',
      'Stoel: toegevoegd (10)',
      'Frigo: verwijderd',
    ]);
  });

  it('benoemt verschoven datums', () => {
    const before = snapshot('2026-09-12', '2026-09-14', [['Tafel', 5]]);
    const after = snapshot('2026-09-13', '2026-09-14', [['Tafel', 5]]);
    const changes = describeReservationChanges(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toContain('Afhalen');
    expect(changes[0]).toContain('→');
  });

  it('telt dezelfde naam op twee lijnen samen', () => {
    const before = snapshot('2026-09-12', '2026-09-14', [['Tafel', 2], ['Tafel', 3]]);
    const after = snapshot('2026-09-12', '2026-09-14', [['Tafel', 5]]);
    expect(describeReservationChanges(before, after)).toEqual([]);
  });
});

describe('dagdelen', () => {
  const day = parseDateOnly('2026-09-12')!;

  it('vertaalt de dagdelen', () => {
    expect(dayPartLabel('NAMIDDAG')).toBe('namiddag');
    expect(dayPartLabel('NAMIDDAG', 'en')).toBe('afternoon');
    expect(dayPartLabel(null)).toBeNull();
    expect(dayPartLabel('MIDDERNACHT')).toBeNull();
  });

  it('hangt het dagdeel achter de datum, en laat het weg als het er niet is', () => {
    expect(formatDateWithPart(day, 'VOORMIDDAG')).toContain('(voormiddag)');
    expect(formatDateWithPart(day, null)).toBe(formatDateOnly(day));
  });

  it('telt een gewijzigd dagdeel als een wijziging, ook op dezelfde dag', () => {
    const lines = [{ itemName: 'Tafel', quantity: 2 }];
    const changes = describeReservationChanges(
      { pickupDate: day, returnDate: day, pickupPart: 'VOORMIDDAG', lines },
      { pickupDate: day, returnDate: day, pickupPart: 'AVOND', lines }
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toContain('voormiddag');
    expect(changes[0]).toContain('avond');
  });
});
