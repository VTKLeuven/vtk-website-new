import { describe, expect, it } from 'vitest';
import { MAX_CUSTOM_DAYS } from '@/lib/calendar-range';
import { isPickable, monthCells, pickRangeDay, rangeDays, shiftMonth } from '@/lib/range-calendar';

describe('de kalender van Aangepast', () => {
  it('toont zes weken vanaf de maandag voor de eerste', () => {
    const cells = monthCells('2026-11');
    expect(cells).toHaveLength(42);
    // 1 november 2026 is een zondag: de rij begint op maandag 26 oktober.
    expect(cells[0]).toBe('2026-10-26');
    expect(cells[6]).toBe('2026-11-01');
    expect(cells[41]).toBe('2026-12-06');
  });

  it('begint op de eerste zelf wanneer die een maandag is', () => {
    expect(monthCells('2026-06')[0]).toBe('2026-06-01');
  });

  it('bladert over de jaargrens', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('telt beide uiteinden mee, ook over de zomertijd', () => {
    expect(rangeDays({ van: '2026-11-23', tot: '2026-11-29' })).toBe(7);
    expect(rangeDays({ van: '2026-10-20', tot: '2026-10-30' })).toBe(11);
  });

  it('een begin voorbij het einde neemt het einde mee, met dezelfde lengte', () => {
    expect(pickRangeDay('van', '2026-12-02', { van: '2026-11-23', tot: '2026-11-29' })).toEqual({
      van: '2026-12-02',
      tot: '2026-12-08',
    });
    expect(pickRangeDay('van', '2026-11-25', { van: '2026-11-23', tot: '2026-11-29' })).toEqual({
      van: '2026-11-25',
      tot: '2026-11-29',
    });
  });

  it('een einde kiest enkel het einde', () => {
    expect(pickRangeDay('tot', '2026-12-04', { van: '2026-11-23', tot: '2026-11-29' })).toEqual({
      van: '2026-11-23',
      tot: '2026-12-04',
    });
  });

  it('een einde vóór het begin of voorbij het maximum is niet te kiezen', () => {
    const range = { van: '2026-11-23', tot: '2026-11-29' };
    expect(isPickable('tot', '2026-11-22', range)).toBe(false);
    expect(isPickable('tot', '2026-11-23', range)).toBe(true);
    const lastAllowed = monthCells('2027-02').find((day) => rangeDays({ van: range.van, tot: day }) === MAX_CUSTOM_DAYS);
    expect(lastAllowed).toBeDefined();
    expect(isPickable('tot', lastAllowed!, range)).toBe(true);
    const tooFar = monthCells('2027-02').find((day) => rangeDays({ van: range.van, tot: day }) === MAX_CUSTOM_DAYS + 1);
    expect(isPickable('tot', tooFar!, range)).toBe(false);
    expect(isPickable('van', '2020-01-01', range)).toBe(true);
  });
});
