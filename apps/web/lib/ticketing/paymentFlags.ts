import type { TicketPaymentSetAside } from "@prisma/client";

/**
 * Een betaling die binnenkwam zonder dat er een ticket tegenover kon staan, en
 * zo'n betaling nadat iemand ze met de hand terugbetaalde:
 * `TicketPayment.setAside`. Een eigen kolom en niet `providerStatus`: dat veld
 * zegt wat de provider meldde, en een betaling die apart staat, mag nooit
 * tickets opleveren omdat iemand dat veld overschreef.
 *
 * Een eigen bestand en niet in `orders.ts`, zodat de terugbetalingen, de export
 * en het beheer deze markering kunnen lezen zonder de hele checkout mee te laden.
 */

/**
 * Een geslaagde betaling die apart staat: het geld kwam binnen, maar er hoort
 * geen ticket bij. Ze wacht op een terugbetaling of is al met de hand
 * terugbetaald; in beide gevallen levert ze nooit meer tickets op.
 */
export function isPaymentSetAside<T extends { setAside: TicketPaymentSetAside | null }>(
  payment: T
): payment is T & { setAside: TicketPaymentSetAside } {
  return payment.setAside != null;
}

/** Prisma-filter op de betalingen die nog met de hand terugbetaald moeten worden. */
export const awaitingManualRefund = {
  status: "SUCCEEDED",
  setAside: "NEEDS_REFUND",
} as const;

/** Prisma-filter op de betalingen die géén aparte markering dragen. */
export const notSetAside = { setAside: null };
