/**
 * Hoeveel er via de ticketverkoop onder een boekhoudcode binnenkwam. Puur, zodat
 * de optelling zonder database te testen is.
 *
 * Een bestelling draagt een kopie van de code die gold toen ze betaald werd
 * (`TicketOrder.accountingCode`). Een code hernoemen of verplaatsen verschuift dus
 * niets: wat onder de oude code betaald is, blijft onder de oude code staan en
 * komt hier als "niet in de lijst" terug in plaats van stil te verdwijnen.
 */

/** Eén groep bestellingen met dezelfde code en naam, zoals de database ze optelt. */
export type TicketCodeSum = {
  accountingCode: string | null;
  accountingCodeName: string | null;
  totalCents: number;
  refundedCents: number;
};

export type UnlistedTicketTotal = {
  /** `null`: bestellingen zonder code, van voor de boekhoudcodes of van een event zonder. */
  code: string | null;
  name: string | null;
  netCents: number;
};

export function ticketTotalsPerCode(
  codes: ReadonlyArray<{ id: string; code: string }>,
  sums: readonly TicketCodeSum[],
): { byId: Map<string, number>; unlisted: UnlistedTicketTotal[] } {
  const idByCode = new Map(codes.map((code) => [code.code, code.id]));
  const byId = new Map<string, number>();
  const unlisted = new Map<string, UnlistedTicketTotal>();

  for (const sum of sums) {
    const netCents = sum.totalCents - sum.refundedCents;
    const key = sum.accountingCode ?? "";
    const id = idByCode.get(key);
    if (id) {
      byId.set(id, (byId.get(id) ?? 0) + netCents);
      continue;
    }
    const row = unlisted.get(key) ?? { code: sum.accountingCode, name: null, netCents: 0 };
    row.netCents += netCents;
    row.name ??= sum.accountingCodeName;
    unlisted.set(key, row);
  }

  return {
    byId,
    // Op code, zoals de lijst erboven; zonder code onderaan.
    unlisted: [...unlisted.values()].sort((a, b) =>
      a.code === null ? 1 : b.code === null ? -1 : a.code.localeCompare(b.code),
    ),
  };
}

/** Een hoofdrekening telt haar subcodes mee. `null`: er is nog niets onder verkocht. */
export function groupTicketCents(amounts: ReadonlyArray<number | null>): number | null {
  const sold = amounts.filter((amount): amount is number => amount !== null);
  return sold.length > 0 ? sold.reduce((sum, amount) => sum + amount, 0) : null;
}
