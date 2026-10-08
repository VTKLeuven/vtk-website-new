/**
 * `TicketPayment.providerStatus` van een betaling die binnenkwam zonder dat er
 * een ticket tegenover kon staan, en van zo'n betaling nadat iemand ze met de
 * hand terugbetaalde. Een eigen waarde in een bestaand vrij tekstveld, geen
 * nieuwe kolom: het is een markering voor het beheer, geen toestand van de
 * betaling bij de provider.
 *
 * Een eigen bestand en niet in `orders.ts`, zodat de terugbetalingen en het
 * beheer deze markering kunnen lezen zonder de hele checkout mee te laden.
 */
export const PAYMENT_NEEDS_REFUND = "needs_refund";
export const PAYMENT_REFUNDED_MANUALLY = "refunded_manually";

const SET_ASIDE = [PAYMENT_NEEDS_REFUND, PAYMENT_REFUNDED_MANUALLY];

/**
 * Een geslaagde betaling die apart staat: het geld kwam binnen, maar er hoort
 * geen ticket bij. Ze wacht op een terugbetaling of is al met de hand
 * terugbetaald; in beide gevallen levert ze nooit meer tickets op.
 */
export function isPaymentSetAside(payment: { status: string; providerStatus: string | null }) {
  return payment.status === "SUCCEEDED" && SET_ASIDE.includes(payment.providerStatus ?? "");
}

/** Prisma-filter op de betalingen die nog met de hand terugbetaald moeten worden. */
export const awaitingManualRefund = {
  status: "SUCCEEDED",
  providerStatus: PAYMENT_NEEDS_REFUND,
} as const;

/**
 * Prisma-filter op de betalingen die géén aparte markering dragen. `notIn`
 * alleen volstaat niet: in SQL is `NULL NOT IN (...)` onbekend, en dan viel
 * net de gewone betaling (zonder `providerStatus`) uit de selectie.
 */
export const notSetAside = {
  OR: [{ providerStatus: null }, { providerStatus: { notIn: SET_ASIDE } }],
};
