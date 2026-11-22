/**
 * De kolommen die de site in elk bestand leest: de exports (`EXPORT_COLUMNS`)
 * en het bankafschrift van KBC (`BANK_COLUMNS`). Een eigen bestand zonder
 * afhankelijkheden: de "i" bij Uploaden toont ze in de browser, en `parse.ts`
 * en `bank.ts` gebruiken `node:crypto`, dat daar niet bestaat.
 */
import type { IncomeFormat } from "./parse";

/**
 * Een kolom zoals de export ze noemt. Meer dan één naam: Engelse en
 * Nederlandse koppen, of de oude en de nieuwe opmaak. De site leest op naam:
 * hoofdletters en de volgorde van de kolommen maken niet uit.
 */
export type ExportColumn = { names: readonly string[]; required: boolean };

export const need = (...names: string[]): ExportColumn => ({ names, required: true });
export const may = (...names: string[]): ExportColumn => ({ names, required: false });

/**
 * De kolommen die de site leest, per formaat. Een bestand is van een formaat
 * wanneer het elke verplichte kolom heeft; de andere leest ze als ze er zijn.
 * Wat hier niet staat (namen en rekeningnummers van wie betaalde,
 * kaartnummers, autorisatiecodes), leest de site niet. De volgorde is die
 * waarin `parseIncomeExport` herkent: het balansrapport van Mollie vóór de
 * betalingenexport.
 */
export const EXPORT_COLUMNS = {
  // Twee exports van hetzelfde portaal: de gewone (`shop_name`, `bulk_id`) en
  // een tweede (`shopName`, `bulkId`) die ook de uitbetaling noemt
  // (`payoutId`). Enkel die laatste laat een uitbetaling op het afschrift
  // terugvinden.
  payconiq: {
    id: need("id"),
    date: need("date"),
    time: need("time"),
    amount: need("amount"),
    status: need("status"),
    shop: need("shop_name", "shopName"),
    type: may("type"),
    description: may("description"),
    reference: may("reference"),
    bulkId: may("bulk_id", "bulkId"),
    payout: may("payoutId", "payout_id"),
  },
  "mollie-balance": {
    date: need("Date"),
    type: need("Transaction type"),
    reference: need("Transaction reference"),
    amount: need("Settlement amount"),
    description: may("Description"),
  },
  mollie: {
    id: need("ID"),
    date: need("Date", "Datum"),
    status: need("Status"),
    amount: need("Amount", "Bedrag"),
    settlementReference: need("Settlement reference", "Uitbetalingsreferentie"),
    settlementAmount: may("Settlement amount", "Uitbetalingsbedrag"),
    method: may("Payment method", "Betaalmethode"),
    description: may("Description", "Omschrijving"),
    refunded: may("Amount refunded", "Teruggestort bedrag"),
  },
  sumup: {
    date: need("Datum"),
    id: need("Transactie-ID"),
    type: need("Transactietype"),
    status: need("Status"),
    amount: need("Totaal bedrag"),
    account: may("email", "E-mail", "E-mailadres", "Account"),
    fee: may("Transactiekosten"),
    payout: may("Uitbetalingsnummer"),
    payoutDate: may("Uitbetaling datum"),
    description: may("Beschrijving"),
    reference: may("Kenmerk"),
  },
  europabank: {
    date: need("Datum"),
    time: need("Tijd"),
    terminal: need("Terminal"),
    result: need("Resultaat"),
    amount: need("Origineel bedrag (EUR)", "Bedrag"),
    type: may("Transactietype"),
    commission: may("Commissie (EUR)"),
    authorisation: may("Autorisatie nr", "Authorisatie nr"),
    reference: may("Uw ref", "Ticket/Uw ref"),
    payout: may("OV-ref"),
    payoutDate: may("Boekingsdatum"),
  },
} as const satisfies Record<IncomeFormat, Record<string, ExportColumn>>;

/** De kolommen van een CSV-afschrift van KBC die de site leest. */
export const BANK_COLUMNS = {
  account: need("Rekeningnummer"),
  date: need("Datum"),
  amount: need("Bedrag"),
  counterparty: need("Naam tegenpartij"),
  message: need("vrije mededeling"),
  statement: may("Afschriftnummer"),
  bic: may("BIC code tegenpartij"),
} as const satisfies Record<string, ExportColumn>;
