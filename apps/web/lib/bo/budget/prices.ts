import { parseShopUrl, shopOfUrl, SHOPS, type ShopId } from '@/lib/priceCheck/shops';
import { costSections } from './calc';
import type { BudgetContent, CostRow, PriceCheck, VatBasis } from './types';

/*
 * Prijzen bij een webshop nakijken: welke regels in aanmerking komen, en wat
 * het antwoord van de winkel betekent voor een regel. Puur; het ophalen
 * gebeurt op de server (`checkPricesAction`). Welke winkels, staat in
 * `lib/priceCheck/shops.ts`.
 */

export type CheckableRow = { rowId: string; url: string };

function hasShopSource(row: CostRow): boolean {
  return (row.source?.type === 'collectgo' || row.source?.type === 'webshop') && !row.forfait && !row.rest;
}

/** De regels met een link naar één product bij een winkel die de site kan nakijken. */
export function checkableRows(content: BudgetContent): CheckableRow[] {
  return costSections(content).flatMap((section) =>
    section.rows
      .filter((row) => hasShopSource(row) && row.source?.url && parseShopUrl(row.source.url))
      .map((row) => ({ rowId: row.id, url: row.source!.url! }))
  );
}

/** De regels met een webshop of Collect&Go als bron, nakijkbaar of niet. */
export function shopRows(content: BudgetContent): CostRow[] {
  return costSections(content).flatMap((section) => section.rows.filter(hasShopSource));
}

/** De winkel van een regel, als de site die kent. */
export function shopOfRow(row: CostRow): ShopId | null {
  return hasShopSource(row) ? shopOfUrl(row.source?.url) : null;
}

export function shopName(id: string | null | undefined): string {
  return id && id in SHOPS ? SHOPS[id as ShopId].name : 'de webshop';
}

/**
 * Een link naar een gekende winkel die niet naar één product wijst (een
 * zoekpagina, een categorie): daar kan de site niets nakijken, en de post
 * meestal wel een betere link plakken.
 */
export function isUncheckableShopLink(row: CostRow): boolean {
  if (!hasShopSource(row) || !row.source?.url?.trim()) return false;
  const shop = shopOfUrl(row.source.url);
  if (!shop) return row.source.type === 'collectgo';
  return SHOPS[shop].live && !parseShopUrl(row.source.url);
}

/** De prijs die de regel nu gebruikt, incl. of excl. BTW, om met de winkel te vergelijken. */
export function rowPriceIn(row: CostRow, basis: VatBasis): number {
  const price = row.price ?? 0;
  const vat = 1 + (row.productVat ?? 0.21);
  const own = row.basis === 'excl' ? 'excl' : 'incl';
  if (own === basis) return price;
  return basis === 'incl' ? price * vat : price / vat;
}

/** De winkelprijs (incl. BTW) die de regel nu gebruikt. */
export function shopPriceOf(row: CostRow): number {
  return rowPriceIn(row, 'incl');
}

export type Lookup =
  | { status: 'found'; product: { name: string; price: number; available: boolean }; basis?: VatBasis; shop?: string }
  | { status: 'notfound'; shop?: string }
  | { status: 'failed'; reason: string; shop?: string };

export function checkFromLookup(row: CostRow, lookup: Lookup, at: string): PriceCheck {
  const shop = lookup.shop ? { shop: lookup.shop } : {};
  if (lookup.status === 'notfound') return { at, status: 'notfound', ...shop };
  if (lookup.status === 'failed') return { at, status: 'failed', reason: lookup.reason, ...shop };
  const basis = lookup.basis ?? 'incl';
  const same = Math.abs(lookup.product.price - rowPriceIn(row, basis)) < 0.005;
  return {
    at,
    status: same ? 'ok' : 'changed',
    price: lookup.product.price,
    name: lookup.product.name,
    ...(basis === 'excl' ? { basis } : {}),
    ...shop,
  };
}

/** De prijs van de winkel overnemen, met haar eigen incl. of excl. */
export function acceptCheckedPrice(row: CostRow, today: string): void {
  if (row.lastCheck?.price == null) return;
  row.price = row.lastCheck.price;
  row.basis = row.lastCheck.basis ?? 'incl';
  if (row.fx?.price) {
    delete row.fx.price;
    if (Object.keys(row.fx).length === 0) delete row.fx;
  }
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
