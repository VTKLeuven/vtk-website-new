import type { CheckableRow, Lookup } from '@/lib/bo/budget/prices';
import type { PriceCheck } from '@/lib/bo/budget/types';

/*
 * De browserkant van `/api/bo/budgets/[id]/prices`. Een gewone `fetch` en geen
 * server action: die wachten in de browser op elkaar, en een ronde langs de
 * winkels mag het bewaren van de editor niet ophouden.
 */

export type RefreshResult =
  { ok: true; at: string | null; checks: Record<string, PriceCheck> } | { ok: false; code: string };
export type RowsResult = { ok: true; results: { rowId: string; lookup: Lookup }[] } | { ok: false; code: string };

async function post<T>(id: string, body: object): Promise<T | { ok: false; code: 'UNSENT' }> {
  try {
    const res = await fetch(`/api/bo/budgets/${encodeURIComponent(id)}/prices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return (await res.json()) as T;
  } catch {
    // Geen verbinding, of een antwoord dat geen JSON is (een deploy die net herstart).
    return { ok: false, code: 'UNSENT' };
  }
}

/** De ronde van het budget: de server beslist of het al tijd is. */
export function refreshPrices(id: string, token: string | null | undefined): Promise<RefreshResult> {
  return post<RefreshResult>(id, { token: token ?? null });
}

/** Enkel deze regels opvragen; `fresh` vraagt de winkel vers op (één regel). */
export function checkRowPrices(
  id: string,
  rows: CheckableRow[],
  token: string | null | undefined,
  fresh = false
): Promise<RowsResult> {
  return post<RowsResult>(id, { token: token ?? null, rows, fresh });
}
