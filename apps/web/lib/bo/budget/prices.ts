import { parseShopUrl, shopOfUrl, SHOPS, type ShopId } from '@/lib/priceCheck/shops';
import { costSections } from './calc';
import type { BudgetContent, CostRow, PriceCheck, VatBasis } from './types';

/** Hoe lang een prijs van een winkel geldt voor de site ze opnieuw vraagt. */
export const PRICE_TTL_MS = 4 * 60 * 60 * 1000;

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

/** Een link naar een winkel die de site niet kent: daar kijkt een mens de prijs na, en zegt dat. */
export function needsHandCheck(row: CostRow): boolean {
  if (!hasShopSource(row) || row.checkedAt) return false;
  const url = row.source?.url?.trim();
  return !!url && !shopOfUrl(url) && row.source?.type !== 'collectgo';
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

/**
 * Het antwoord van de winkel in de regel zetten. Geeft de winkel hetzelfde
 * antwoord als de vorige keer, dan blijft `since` staan: wat iemand intussen
 * met de hand bevestigde, blijft bevestigd. Een winkel die even niet
 * antwoordt, wist een prijs van de voorbije week niet uit.
 */
export function applyCheck(row: CostRow, check: PriceCheck): void {
  const prev = row.lastCheck;
  if (check.status === 'failed' && prev?.price != null && Date.parse(check.at) - Date.parse(prev.at) < 7 * 86_400_000)
    return;
  const kind = (c: PriceCheck) => (c.price != null ? 'price' : c.status);
  const same = !!prev && kind(prev) === kind(check) && prev.price === check.price;
  row.lastCheck = { ...check, since: same ? (prev.since ?? prev.at) : check.at };
}

/** De prijs van de winkel overnemen, met haar eigen incl. of excl. */
export function acceptCheckedPrice(row: CostRow): void {
  if (row.lastCheck?.price == null) return;
  row.price = row.lastCheck.price;
  row.basis = row.lastCheck.basis ?? 'incl';
  if (row.fx?.price) {
    delete row.fx.price;
    if (Object.keys(row.fx).length === 0) delete row.fx;
  }
  clearConfirmation(row);
}

/**
 * De laatste controle, met de uitkomst opnieuw berekend tegen de prijs die nu
 * in de regel staat: wie de prijs aanpast naar die van de winkel, ziet meteen
 * "klopt", zonder nieuwe aanvraag.
 */
export function liveCheck(row: CostRow): PriceCheck | null {
  const check = row.lastCheck;
  if (!check) return null;
  if (check.price == null || check.status === 'notfound' || check.status === 'failed') return check;
  const same = Math.abs(check.price - rowPriceIn(row, check.basis ?? 'incl')) < 0.005;
  return { ...check, status: same ? 'ok' : 'changed' };
}

/** Bevestigde iemand de prijs met de hand, nadat de winkel dit antwoord begon te geven? */
function confirmedSince(row: CostRow, check: PriceCheck): boolean {
  if (!row.checkedAt) return false;
  const since = check.since ?? check.at;
  return row.checkedAt >= (row.checkedAt.length > 10 ? since : since.slice(0, 10));
}

/** Zegt de laatste controle iets anders dan de regel, en bevestigde nog niemand de prijs? */
export function openCheck(row: CostRow): PriceCheck | null {
  const check = liveCheck(row);
  if (!check || check.status === 'ok') return null;
  return confirmedSince(row, check) ? null : check;
}

/** Iemand keek de prijs zelf na. De naam is voorlopig: de server zet de echte bij het bewaren. */
export function confirmRow(row: CostRow, by: string, at = new Date().toISOString()): void {
  row.checkedAt = at;
  row.checkedBy = by;
}

export function clearConfirmation(row: CostRow): void {
  delete row.checkedAt;
  delete row.checkedBy;
}

/**
 * Wie bevestigde, komt van de server en niet van de browser: een bevestiging
 * die er al stond, houdt haar naam; een nieuwe krijgt die van wie nu bewaart.
 */
export function stampConfirmations(prev: BudgetContent | null, next: BudgetContent, who: string): void {
  const before = new Map((prev ? costSections(prev) : []).flatMap((s) => s.rows).map((r) => [r.id, r]));
  for (const section of costSections(next)) {
    for (const row of section.rows) {
      if (!row.checkedAt) {
        delete row.checkedBy;
        continue;
      }
      const was = before.get(row.id);
      if (was?.checkedAt === row.checkedAt) {
        if (was.checkedBy) row.checkedBy = was.checkedBy;
        else delete row.checkedBy;
      } else row.checkedBy = who.slice(0, 120);
    }
  }
}

/**
 * Loopt dit budget nog? Na het BO waarvoor het was (of eens ingediend) ligt het
 * vast: dan vraagt de site de prijzen niet meer opnieuw op.
 */
export function pricesStillChecked(budget: { status: string; targetDate: string | null }, today: string): boolean {
  return budget.status === 'DRAFT' && (!budget.targetDate || budget.targetDate >= today);
}

/**
 * De regels die de site nu moet nakijken: alle nakijkbare als de laatste ronde
 * meer dan vier uur oud is, anders enkel die nog nooit een antwoord kregen
 * (een nieuwe regel, een andere link).
 */
export function rowsToCheck(content: BudgetContent, now: number): CheckableRow[] {
  const rows = checkableRows(content);
  const last = content.pricesAt ? Date.parse(content.pricesAt) : NaN;
  if (!Number.isFinite(last) || now - last >= PRICE_TTL_MS) return rows;
  const byId = new Map(
    costSections(content)
      .flatMap((s) => s.rows)
      .map((r) => [r.id, r])
  );
  return rows.filter((r) => !byId.get(r.rowId)?.lastCheck);
}
