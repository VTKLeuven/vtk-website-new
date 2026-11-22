/**
 * Het kasboek van Beheer: wat er met het cash van de kring gebeurt buiten de
 * kassa's om. Cash naar de bank (storting), van de bank (afhaling), of iets
 * met cash betaald (aankoop, altijd met een factuur). Zie
 * docs/design-decisions.md, "Het kasboek van Beheer".
 *
 * Puur, zodat het scherm en de tests dezelfde regels lezen.
 */

export type CashBookKind = "DEPOSIT" | "WITHDRAWAL" | "PURCHASE";

export const CASH_BOOK_KINDS: readonly CashBookKind[] = ["WITHDRAWAL", "DEPOSIT", "PURCHASE"];

export function isCashBookKind(value: unknown): value is CashBookKind {
  return value === "DEPOSIT" || value === "WITHDRAWAL" || value === "PURCHASE";
}

export function cashBookKindLabel(kind: CashBookKind, nl: boolean): string {
  return {
    DEPOSIT: nl ? "Storting" : "Deposit",
    WITHDRAWAL: nl ? "Afhaling" : "Withdrawal",
    PURCHASE: nl ? "Aankoop" : "Purchase",
  }[kind];
}

/** Een aankoop heeft altijd een factuur; een storting of afhaling niet. */
export function needsInvoice(kind: CashBookKind): boolean {
  return kind === "PURCHASE";
}

/**
 * Wat de regel met het cash doet: een afhaling komt erbij, een storting en een
 * aankoop gaan eraf. Het bedrag zelf staat altijd positief in de database.
 */
export function cashEffectCents(entry: { kind: CashBookKind; amountCents: number }): number {
  return entry.kind === "WITHDRAWAL" ? entry.amountCents : -entry.amountCents;
}

export type CashBookTotals = Record<CashBookKind, number> & {
  /** Afhalingen min stortingen en aankopen: hoeveel cash er netto bijkwam. */
  netCents: number;
};

export function cashBookTotals(entries: ReadonlyArray<{ kind: CashBookKind; amountCents: number }>): CashBookTotals {
  const totals: CashBookTotals = { DEPOSIT: 0, WITHDRAWAL: 0, PURCHASE: 0, netCents: 0 };
  for (const entry of entries) {
    totals[entry.kind] += entry.amountCents;
    totals.netCents += cashEffectCents(entry);
  }
  return totals;
}
