import { describe, expect, it } from 'vitest';
import {
  defaultDutyBlock,
  dutyCellKey,
  dutyDate,
  dutyDateKey,
  dutyStatus,
  dutyTotals,
  isDefaultDutyBlock,
  proposeDuty,
  type DutyCell,
  type DutySlotKey,
} from '@/lib/theokotDuty';

const monday = { year: 2026, month: 11, day: 23 };
const friday = { year: 2026, month: 11, day: 27 };

function cell(
  date: string,
  slot: DutySlotKey,
  available: string[],
  assigned: string[] = [],
  capacity = 1,
  open = true
): DutyCell {
  return { key: dutyCellKey(date, slot), date, slot, capacity, open, note: null, available, assigned };
}

describe('defaultDutyBlock', () => {
  it('heeft een avond van maandag tot donderdag, niet op vrijdag', () => {
    expect(defaultDutyBlock(monday, 'avond')).toEqual({ capacity: 1, open: true, note: null });
    expect(defaultDutyBlock(friday, 'avond').open).toBe(false);
    expect(defaultDutyBlock(friday, 'ochtend').open).toBe(true);
  });

  it('herkent een blok dat de standaard volgt, zodat het geen rij nodig heeft', () => {
    expect(isDefaultDutyBlock(monday, 'ochtend', { capacity: 1, open: true, note: null })).toBe(true);
    expect(isDefaultDutyBlock(monday, 'ochtend', { capacity: 2, open: true, note: null })).toBe(false);
    expect(isDefaultDutyBlock(monday, 'middag', { capacity: 1, open: true, note: 'Bureau' })).toBe(false);
    expect(isDefaultDutyBlock(friday, 'avond', { capacity: 1, open: false, note: null })).toBe(true);
  });
});

describe('dutyDate', () => {
  it('bewaart de kalenderdag en leest hem terug', () => {
    expect(dutyDateKey(dutyDate(monday))).toBe('2026-11-23');
  });
});

describe('dutyStatus', () => {
  it('onderscheidt rond, nog te kiezen, niemand en geen blok', () => {
    expect(dutyStatus(cell('2026-11-23', 'ochtend', ['a'], ['a']))).toBe('done');
    expect(dutyStatus(cell('2026-11-23', 'ochtend', ['a', 'b']))).toBe('open');
    expect(dutyStatus(cell('2026-11-23', 'ochtend', []))).toBe('none');
    // Twee plaatsen, één ingedeeld en verder kan niemand: er ontbreekt iemand.
    expect(dutyStatus(cell('2026-11-23', 'ochtend', ['a'], ['a'], 2))).toBe('none');
    expect(dutyStatus(cell('2026-11-27', 'avond', ['a'], [], 1, false))).toBe('closed');
  });

  it('telt een blok dat er niet is niet mee', () => {
    const totals = dutyTotals([
      cell('2026-11-23', 'ochtend', ['a'], ['a'], 2),
      cell('2026-11-23', 'middag', []),
      cell('2026-11-27', 'avond', ['a'], [], 1, false),
    ]);
    expect(totals).toEqual({ places: 3, filled: 1, toPick: 0, nobody: 2 });
  });
});

describe('proposeDuty', () => {
  it('kiest wie het minst openhield, en laat wie al ingedeeld is staan', () => {
    const cells = [
      cell('2026-11-23', 'ochtend', ['eva', 'kenny'], ['eva']),
      cell('2026-11-23', 'middag', ['eva', 'kenny', 'bas']),
    ];
    expect(proposeDuty(cells, { eva: 21, kenny: 19, bas: 20 })).toEqual([
      { date: '2026-11-23', slot: 'middag', userId: 'kenny' },
    ]);
  });

  it('vult eerst het blok met de minste kandidaten', () => {
    // Bas heeft de laagste telling, maar is de enige die op dinsdag kan: die
    // plaats gaat eerst, en daarna is hij niet meer de laagste.
    const cells = [cell('2026-11-23', 'ochtend', ['bas', 'jinne']), cell('2026-11-24', 'ochtend', ['bas'])];
    expect(proposeDuty(cells, { bas: 10, jinne: 10.5 })).toEqual([
      { date: '2026-11-24', slot: 'ochtend', userId: 'bas' },
      { date: '2026-11-23', slot: 'ochtend', userId: 'jinne' },
    ]);
  });

  it('geeft liever niet twee blokken op dezelfde dag aan dezelfde persoon', () => {
    const cells = [
      cell('2026-11-23', 'ochtend', ['lien', 'rosalie']),
      cell('2026-11-23', 'middag', ['lien', 'rosalie']),
    ];
    const picks = proposeDuty(cells, { lien: 5, rosalie: 5 }).map((p) => p.userId);
    expect(new Set(picks).size).toBe(2);
  });

  it('vult een blok voor twee met twee verschillende mensen en slaat een dicht blok over', () => {
    const cells = [
      cell('2026-11-27', 'namiddag', ['jinne', 'kenny', 'bas'], [], 2),
      cell('2026-11-27', 'avond', ['jinne'], [], 1, false),
    ];
    const picks = proposeDuty(cells, { jinne: 1, kenny: 2, bas: 3 });
    expect(picks.map((p) => p.userId)).toEqual(['jinne', 'kenny']);
  });

  it('stelt niets voor wanneer niemand kan', () => {
    expect(proposeDuty([cell('2026-11-24', 'ochtend', [])], { bas: 0 })).toEqual([]);
  });
});
