import { describe, expect, it } from 'vitest';
import { cashBookTotals, cashEffectCents, isCashBookKind, needsInvoice } from '@/lib/kassas/cashBook';

describe('kasboek van Beheer', () => {
  it('telt een afhaling bij het cash en haalt een storting en een aankoop eraf', () => {
    expect(cashEffectCents({ kind: 'WITHDRAWAL', amountCents: 50_000 })).toBe(50_000);
    expect(cashEffectCents({ kind: 'DEPOSIT', amountCents: 20_000 })).toBe(-20_000);
    expect(cashEffectCents({ kind: 'PURCHASE', amountCents: 1_250 })).toBe(-1_250);
  });

  it('maakt de totalen per soort en het netto', () => {
    expect(
      cashBookTotals([
        { kind: 'WITHDRAWAL', amountCents: 50_000 },
        { kind: 'DEPOSIT', amountCents: 20_000 },
        { kind: 'PURCHASE', amountCents: 1_250 },
        { kind: 'PURCHASE', amountCents: 750 },
      ]),
    ).toEqual({ WITHDRAWAL: 50_000, DEPOSIT: 20_000, PURCHASE: 2_000, netCents: 28_000 });
  });

  it('vraagt enkel bij een aankoop een factuur', () => {
    expect(needsInvoice('PURCHASE')).toBe(true);
    expect(needsInvoice('DEPOSIT')).toBe(false);
    expect(needsInvoice('WITHDRAWAL')).toBe(false);
  });

  it('kent enkel de drie soorten', () => {
    expect(isCashBookKind('PURCHASE')).toBe(true);
    expect(isCashBookKind('COUNT')).toBe(false);
  });
});
