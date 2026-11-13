import { locationOf, priceOf, type CalcContext } from './calc';
import { normalizeName } from './formula';
import { LOCATION_FIELDS, type BudgetContent, type CostRow } from './types';

/*
 * Vaste prijzen: de huur van een zaal, een vat, licht en geluid. Daar komt
 * geen offerte per activiteit voor en er is geen link naar, dus "waar komt de
 * prijs vandaan?" is er voor elk budget opnieuw dezelfde vraag. Beheer zet ze
 * één keer bij de instellingen; een regel zonder bron met die omschrijving en
 * die prijs heeft daarmee een bron, in elk budget.
 *
 * Herkennen gebeurt bij het tonen en verandert de regel niet: een prijs die
 * Beheer later aanpast, valt in elk budget dat ze nog niet volgt weer op.
 */

export type FixedMatch = { name: string; note: string; price: number; exact: boolean };

function nameMatches(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

/** De vaste prijs waar een regel zonder eigen bron op steunt, of null. */
export function fixedPriceOf(content: BudgetContent, ctx: CalcContext, row: CostRow): FixedMatch | null {
  if (row.source || row.forfait || row.rest || row.service) return null;
  const price = priceOf(content, ctx, row);
  const place = content.info.location.trim().toLowerCase();
  let near: FixedMatch | null = null;
  for (const fixed of ctx.settings.fixedPrices) {
    const where = fixed.location.trim().toLowerCase();
    if (where && where !== place) continue;
    if (!nameMatches(row.name, fixed.name)) continue;
    const exact = Math.abs(fixed.price - price) < 0.005;
    const match = { name: fixed.name, note: fixed.note, price: fixed.price, exact };
    if (exact) return match;
    // Een andere prijs telt enkel als afwijking wanneer de vaste prijs bij deze locatie hoort.
    if (where) near ??= match;
  }
  // De prijzen die al bij de locatie staan (zaal, vaten, licht, stopsel, sangria).
  const location = locationOf(content, ctx);
  if (location) {
    for (const field of LOCATION_FIELDS) {
      const value = location[field];
      if (value != null && Math.abs(value - price) < 0.005)
        return { name: location.name, note: location.note, price: value, exact: true };
    }
  }
  return near;
}
