import { parseCollectGoUrl } from '@/lib/collectgo/product';
import { costSections } from './calc';
import type { BudgetContent, CostRow, PriceCheck } from './types';

/*
 * Prijzen van Collect&Go nakijken: welke regels in aanmerking komen, en wat
 * het antwoord van de site betekent voor een regel. Puur; het ophalen gebeurt
 * op de server (`checkCollectGoPricesAction`).
 */

export type CheckableRow = { rowId: string; url: string };

/** De regels met een Collect&Go-link die naar één product wijst. */
export function collectGoRows(content: BudgetContent): CheckableRow[] {
  return costSections(content).flatMap((section) =>
    section.rows
      .filter(
        (row) =>
          row.source?.type === 'collectgo' &&
          !row.forfait &&
          !row.rest &&
          row.source.url &&
          parseCollectGoUrl(row.source.url)
      )
      .map((row) => ({ rowId: row.id, url: row.source!.url! }))
  );
}

/** Een regel met een Collect&Go-link die niet naar één product wijst (een gewone zoekpagina). */
export function isUncheckableCollectGo(row: CostRow): boolean {
  return row.source?.type === 'collectgo' && !!row.source.url?.trim() && !parseCollectGoUrl(row.source.url);
}

/** De winkelprijs (incl. BTW) die de regel nu gebruikt, om met de site te vergelijken. */
export function shopPriceOf(row: CostRow): number {
  const price = row.price ?? 0;
  return row.basis === 'excl' ? price * (1 + (row.productVat ?? 0.21)) : price;
}

export type Lookup =
  | { status: 'found'; product: { name: string; price: number; available: boolean } }
  | { status: 'notfound' }
  | { status: 'failed'; reason: string };

export function checkFromLookup(row: CostRow, lookup: Lookup, at: string): PriceCheck {
  if (lookup.status === 'notfound') return { at, status: 'notfound' };
  if (lookup.status === 'failed') return { at, status: 'failed', reason: lookup.reason };
  const same = Math.abs(lookup.product.price - shopPriceOf(row)) < 0.005;
  return { at, status: same ? 'ok' : 'changed', price: lookup.product.price, name: lookup.product.name };
}

/** De prijs van de site overnemen: een winkelprijs is incl. BTW. */
export function acceptCheckedPrice(row: CostRow, today: string): void {
  if (row.lastCheck?.price == null) return;
  row.price = row.lastCheck.price;
  row.basis = 'incl';
  row.checkedAt = today;
  row.lastCheck = { ...row.lastCheck, status: 'ok' };
}

/** Is de laatste controle nog niet beantwoord door iemand die de prijs bevestigde? */
export function openCheck(row: CostRow): PriceCheck | null {
  const check = row.lastCheck;
  if (!check || check.status === 'ok') return null;
  if (row.checkedAt && row.checkedAt >= check.at.slice(0, 10)) return null;
  return check;
}
