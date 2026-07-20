import { describe, expect, it } from 'vitest';
import {
  billedHours,
  formatDateOnly,
  formatDateTime,
  formatEuro,
  formatPriceCents,
  isLastMinute,
  parseDateOnly,
  pricingModeLabel,
  rangesOverlap,
  requesterTypeLabel,
  reservationStatusLabel,
  toDateInputValue,
  toDatetimeLocalValue,
  todayDateOnly,
  transportPriceCents,
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
    // JS Date rolls 2026-02-30 over; the regex passes but getTime stays valid,
    // so guard only structurally. Month 13 is caught by Date -> NaN.
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

  it('flags a pickup within 14 days', () => {
    expect(isLastMinute(new Date('2026-07-25T10:00:00Z'), requestedAt)).toBe(true);
  });

  it('does not flag a pickup 14+ days out', () => {
    expect(isLastMinute(new Date('2026-08-10T10:00:00Z'), requestedAt)).toBe(false);
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
