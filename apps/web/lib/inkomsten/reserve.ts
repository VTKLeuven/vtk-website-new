/**
 * De wijziging van de dynamische reserve van Mollie, berekend. Puur, zonder
 * database, zodat het tegen een kwartaal van Beheer te toetsen is
 * (`test/inkomstenQ3Beheer.test.ts`).
 *
 * Mollie telt in de maand van de betaling, zoals elke bron (Beheer, november
 * 2026). Wat Mollie in de periode overschreef, is iets anders: een overschrijving
 * betaalt de betalingen van de week ervoor uit, min kosten, en Mollie houdt een
 * deel bij of geeft het later vrij. Het verschil tussen die twee is de
 * wijziging van de dynamische reserve:
 *
 *   overgeschreven in de periode - alles van Mollie in de periode
 *
 * Negatief: Mollie hield geld bij (op 30 september nog niet overgeschreven).
 * Positief: Mollie schreef meer over dan er binnenkwam (de betalingen van eind
 * vorige periode). Over twee periodes heen valt het weg. Met die regel erbij is
 * de Mollie-kolom van het overzicht gelijk aan wat Mollie overschreef, op wat
 * niet meetelt na. Voor het derde kwartaal van 2026: overgeschreven € 8.761,60,
 * betalingen € 9.130,50, kosten € -142,01, dus € -226,89, zoals Beheer het zelf
 * uitrekende.
 *
 * "Alles van Mollie" is elke regel: wat meetelt, wat met de hand niet meetelt
 * en de kosten met een aparte factuur. Zo komt een uitgesloten betaling niet
 * als reserve terug. Ook de reserveregels die Mollie zelf noemt ("rolling
 * reserve") tellen mee; de regel in het overzicht is die regels plus het
 * berekende bedrag.
 *
 * Een ontbrekende betaling zou in dit verschil stil verdwijnen. Daarom kent de
 * site de reserve enkel wanneer de betalingenexport en het balansrapport
 * dezelfde betalingen noemen (`MollieCompleteness`). Wordt nooit bewaard: elke
 * weergave rekent ze opnieuw uit.
 */
import type { IncomeKindCode } from "./parse";

/** Een Mollie-regel van de periode, met de rekening van zijn dag. */
export type ReserveRow = {
  kind: IncomeKindCode;
  amountCents: number;
  bankAccount: string | null;
  /** Telt niet mee in het overzicht: met de hand uitgesloten, of kosten met een aparte factuur. */
  notCounted: boolean;
};

/** Een overschrijving van Mollie naar de bank in de periode (`IncomePayout`). */
export type ReserveTransfer = {
  reference: string;
  /** "2026-09-28" */
  paidOn: string;
  /** Positief: wat er op de bank kwam. */
  amountCents: number;
  /** De rekening van Mollie op die dag. */
  bankAccount: string | null;
};

export type CountAndCents = { count: number; cents: number };

/**
 * Of de betalingenexport en het balansrapport dezelfde betalingen noemen, voor
 * de betalingen van de periode. Een ID telt als gevonden wanneer hij aan de
 * andere kant staat, in welke maand ook: de twee bestanden zetten een betaling
 * soms een seconde anders, en rond middernacht is dat een andere maand.
 */
export type MollieCompleteness = {
  /** In de betalingenexport, niet in een balansrapport: dat ontbreekt of stopt te vroeg. */
  missingInBalance: CountAndCents;
  /** In een balansrapport, niet in de betalingenexport: die ontbreekt of stopt te vroeg. */
  missingInExport: CountAndCents;
};

export type ReserveAccount = {
  bankAccount: string | null;
  /** Het berekende bedrag: overgeschreven min alles van Mollie. */
  cents: number;
  /** De regel "Wijziging dynamische reserve" voor deze rekening: Mollies eigen reserveregels plus `cents`. */
  lineCents: number;
  transfersCents: number;
  transferCount: number;
  /** "2026-09-28", of null zonder overschrijving. */
  lastTransferOn: string | null;
  paymentsCents: number;
  refundsCents: number;
  feesCents: number;
  /** De reserveregels die Mollie zelf noemt. */
  storedReserveCents: number;
  /** Wat in de periode niet meetelt: uitgesloten, of kosten met een aparte factuur. */
  notCountedCents: number;
};

export type MollieReserve =
  /** Geen Mollie in deze periode. */
  | { status: "none" }
  /** De bestanden noemen niet dezelfde betalingen: de site rekent niets uit. */
  | { status: "unknown"; completeness: MollieCompleteness }
  | { status: "known"; accounts: ReserveAccount[]; cents: number; transfersCents: number; transferCount: number };

function emptyAccount(bankAccount: string | null): ReserveAccount {
  return {
    bankAccount,
    cents: 0,
    lineCents: 0,
    transfersCents: 0,
    transferCount: 0,
    lastTransferOn: null,
    paymentsCents: 0,
    refundsCents: 0,
    feesCents: 0,
    storedReserveCents: 0,
    notCountedCents: 0,
  };
}

export function computeMollieReserve(input: {
  rows: readonly ReserveRow[];
  transfers: readonly ReserveTransfer[];
  completeness: MollieCompleteness;
}): MollieReserve {
  if (input.rows.length === 0 && input.transfers.length === 0) return { status: "none" };
  const { completeness } = input;
  if (completeness.missingInBalance.count > 0 || completeness.missingInExport.count > 0) {
    return { status: "unknown", completeness };
  }

  const accounts = new Map<string | null, ReserveAccount>();
  const accountOf = (bankAccount: string | null) => {
    let account = accounts.get(bankAccount);
    if (!account) {
      account = emptyAccount(bankAccount);
      accounts.set(bankAccount, account);
    }
    return account;
  };
  const rowsCents = new Map<string | null, number>();
  for (const row of input.rows) {
    const account = accountOf(row.bankAccount);
    rowsCents.set(row.bankAccount, (rowsCents.get(row.bankAccount) ?? 0) + row.amountCents);
    if (row.notCounted) account.notCountedCents += row.amountCents;
    if (row.kind === "PAYMENT") account.paymentsCents += row.amountCents;
    else if (row.kind === "REFUND") account.refundsCents += row.amountCents;
    else if (row.kind === "FEE") account.feesCents += row.amountCents;
    else account.storedReserveCents += row.amountCents;
  }
  for (const transfer of input.transfers) {
    const account = accountOf(transfer.bankAccount);
    account.transfersCents += transfer.amountCents;
    account.transferCount += 1;
    if (!account.lastTransferOn || transfer.paidOn > account.lastTransferOn) account.lastTransferOn = transfer.paidOn;
  }
  const result = [...accounts.values()].map((account) => {
    const cents = account.transfersCents - (rowsCents.get(account.bankAccount) ?? 0);
    return { ...account, cents, lineCents: account.storedReserveCents + cents };
  });
  // Niet ingesteld onderaan, zoals in het overzicht.
  result.sort(
    (a, b) => (a.bankAccount === null ? 1 : 0) - (b.bankAccount === null ? 1 : 0) || (a.bankAccount ?? "").localeCompare(b.bankAccount ?? ""),
  );
  return {
    status: "known",
    accounts: result,
    cents: result.reduce((sum, account) => sum + account.cents, 0),
    transfersCents: result.reduce((sum, account) => sum + account.transfersCents, 0),
    transferCount: result.reduce((sum, account) => sum + account.transferCount, 0),
  };
}
