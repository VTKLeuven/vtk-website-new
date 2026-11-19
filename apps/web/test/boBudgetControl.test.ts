import { describe, expect, it } from 'vitest';
import type { CalcContext } from '@/lib/bo/budget/calc';
import { controlOf, priceSummary } from '@/lib/bo/budget/control';
import { DEFAULT_SETTINGS, type BudgetContent, type CostRow } from '@/lib/bo/budget/types';

/*
 * De kolom Controle en de telling erboven ("Prijzen bij de webshops") zeggen
 * hetzelfde: elke regel met een webshop als bron telt één keer, in de stand
 * die haar icoon in de tabel heeft.
 */

const CG = 'https://www.collectandgo.be/nl/product/wijn-wit-12345';

function budget(rows: CostRow[], pricesAt: string | null = '2026-11-14T11:16:00Z'): BudgetContent {
  return {
    version: 1,
    params: { persons: 50 },
    info: { date: '2026-11-23', location: '', concept: '' },
    begroting: -1500,
    vat: null,
    allocation: [{ org: 'VTK', share: 1 }],
    pricesAt,
    sections: [{ id: 's1', name: 'Drank', type: 'fixed', rows }],
  };
}

const ctx: CalcContext = { postKey: 'g:act', settings: DEFAULT_SETTINGS, pot: null };
const shopRow = (id: string, extra: Partial<CostRow> = {}): CostRow => ({
  id,
  name: id,
  qty: 1,
  price: 6.99,
  source: { type: 'collectgo', url: CG },
  ...extra,
});

describe('prijzen bij de webshops', () => {
  it('telt elke regel met een winkel in de stand van haar icoon', () => {
    const content = budget([
      shopRow('klopt', { lastCheck: { at: '2026-11-14T11:16:00Z', status: 'ok', price: 6.99 } }),
      shopRow('anders', { lastCheck: { at: '2026-11-14T11:16:00Z', status: 'changed', price: 7.29 } }),
      shopRow('weg', { lastCheck: { at: '2026-11-14T11:16:00Z', status: 'notfound' } }),
      shopRow('stil', { lastCheck: { at: '2026-11-14T11:16:00Z', status: 'failed', reason: 'HTTP 456' } }),
      shopRow('nieuw'),
      shopRow('frituur', { source: { type: 'webshop', url: 'https://frituur.example/menu' } }),
      shopRow('zelf', {
        source: { type: 'webshop', url: 'https://frituur.example/menu' },
        checkedAt: '2026-11-13T20:40:00Z',
        checkedBy: 'Lotte',
      }),
      shopRow('leeg', { source: { type: 'webshop' } }),
      // Geen winkel: telt niet mee in het blok, wel in de kolom.
      { id: 'zaal', name: 'Pipe and Drape', qty: 1, price: 130, source: null },
    ]);
    const summary = priceSummary(content, ctx);
    expect(summary.rows).toBe(8);
    expect(summary.lastRound).toBe('2026-11-14T11:16:00Z');
    expect(summary.counts).toEqual({
      ok: 1,
      confirmed: 1,
      changed: 1,
      notfound: 1,
      failed: 1,
      waiting: 1,
      byhand: 1,
      nolink: 1,
    });
  });

  it('een gewijzigde prijs biedt de prijs van de winkel aan, een regel zonder bron niet', () => {
    const content = budget([
      shopRow('anders', { lastCheck: { at: '2026-11-14T11:16:00Z', status: 'changed', price: 7.29 } }),
      { id: 'zaal', name: 'Pipe and Drape', qty: 1, price: 130, source: null },
    ]);
    const [changed, none] = content.sections[0].rows as CostRow[];
    expect(controlOf(content, ctx, changed, true)).toMatchObject({ state: 'changed', shopPrice: 7.29, offer: true });
    expect(controlOf(content, ctx, none, true)).toMatchObject({ state: 'nosource', offer: true });
    expect(controlOf(content, ctx, none, true)?.shopPrice).toBeUndefined();
  });

  it('wie de prijs naar die van de winkel zet, ziet meteen dat ze klopt', () => {
    const row = shopRow('anders', {
      price: 7.29,
      lastCheck: { at: '2026-11-14T11:16:00Z', status: 'changed', price: 7.29 },
    });
    expect(controlOf(budget([row]), ctx, row, true)?.state).toBe('ok');
  });
});
