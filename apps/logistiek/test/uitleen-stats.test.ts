import { describe, expect, it } from 'vitest';
import {
  resolvePeriod,
  workingYearLabel,
  workingYearRange,
} from '@/lib/uitleen-stats';

describe('werkingsjaar', () => {
  it('loopt van 15 juli tot 15 juli', () => {
    const range = workingYearRange(2026);
    expect(range.from.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2027-07-15T00:00:00.000Z');
  });

  it('heet "26-27"', () => {
    expect(workingYearLabel(2026)).toBe('26-27');
  });
});

describe('resolvePeriod', () => {
  const geen = { from: null, to: null };

  it('valt terug op het lopende werkingsjaar', () => {
    const period = resolvePeriod('jaar', geen, new Date('2026-09-17T12:00:00Z'));
    expect(period.from.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    expect(period.to.toISOString()).toBe('2027-07-15T00:00:00.000Z');
    expect(period.label).toBe('Werkingsjaar 26-27');
  });

  it('gaat nooit voor het eerste getrackte werkingsjaar', () => {
    const period = resolvePeriod('vorigjaar', geen, new Date('2026-09-17T12:00:00Z'));
    expect(period.from.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('telt de gekozen einddag mee bij een aangepaste periode', () => {
    const period = resolvePeriod(
      'aangepast',
      { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-30T00:00:00Z') },
      new Date('2026-10-05T12:00:00Z')
    );
    // Exclusieve bovengrens, dus 1 oktober: anders valt een rit op 30 september
    // buiten de periode die je net koos.
    expect(period.to.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('valt terug op het werkingsjaar wanneer een aangepaste periode niet volledig is', () => {
    const period = resolvePeriod(
      'aangepast',
      { from: new Date('2026-09-01T00:00:00Z'), to: null },
      new Date('2026-09-17T12:00:00Z')
    );
    expect(period.key).toBe('jaar');
  });

  it('neemt dertig dagen terug, tot en met vandaag', () => {
    const now = new Date('2026-09-17T12:00:00Z');
    const period = resolvePeriod('maand', geen, now);
    expect(period.to.getTime() - period.from.getTime()).toBe(30 * 86_400_000);
    expect(period.to.getTime()).toBeGreaterThan(now.getTime());
  });
});
