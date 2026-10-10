import "server-only";

import { prisma } from "@vtk/db";
import { BancontactApiError } from "@vtk/payments";
import { newBancontactGateway } from "./payments";

/**
 * De rekening om een Bancontact-betaling met de hand op terug te storten.
 *
 * Bancontact Pro betaalt voor ons contract niet terug via de API; Mollie wel.
 * Een Bancontact-terugbetaling is dus een overschrijving door de penning, en
 * daarvoor geeft de provider de volle IBAN van de koper prijs
 * (`GET /v3/payments/{id}/debtor/refundIban`). We bewaren die op de betaling,
 * samen met de naam van de rekeninghouder uit de betaaldetails, zodat ze in het
 * beheer bij de bestelling staat.
 */

export type RefundAccountResult =
  | { status: "ok"; iban: string; name: string | null }
  | { status: "error"; code: "REFUND_IBAN_ACCESS_DENIED" | "REFUND_IBAN_UNAVAILABLE" };

/**
 * Haalt de rekening op bij Bancontact en zet ze op de betaling. Gooit enkel bij
 * een onverwachte fout (de provider onbereikbaar, een 5xx); wat het beheer zelf
 * kan uitleggen, komt terug als code.
 */
export async function fetchBancontactRefundAccount(paymentRowId: string): Promise<RefundAccountResult> {
  const payment = await prisma.ticketPayment.findUnique({
    where: { id: paymentRowId },
    select: { id: true, provider: true, status: true, providerPaymentId: true },
  });
  if (
    !payment ||
    payment.provider !== "bancontact" ||
    payment.status !== "SUCCEEDED" ||
    !payment.providerPaymentId
  ) {
    return { status: "error", code: "REFUND_IBAN_UNAVAILABLE" };
  }

  const gateway = newBancontactGateway();
  let iban: string;
  try {
    iban = await gateway.fetchRefundIban(payment.providerPaymentId);
  } catch (error) {
    // Zonder de authority MERCHANT_REFUND op de sleutel weigert de provider
    // met 401/403. Dat is configuratie en geen kapotte betaling.
    if (error instanceof BancontactApiError && (error.status === 401 || error.status === 403)) {
      console.error(
        "Bancontact refuses the refund IBAN lookup; the API key needs the MERCHANT_REFUND authority",
        { paymentId: payment.providerPaymentId, status: error.status, code: error.code }
      );
      return { status: "error", code: "REFUND_IBAN_ACCESS_DENIED" };
    }
    if (error instanceof BancontactApiError && error.status >= 400 && error.status < 500) {
      return { status: "error", code: "REFUND_IBAN_UNAVAILABLE" };
    }
    throw error;
  }

  // De naam is mooi meegenomen maar niet nodig: een overschrijving lukt op de
  // IBAN alleen. Faalt dit, dan bewaren we de rekening toch.
  let name: string | null = null;
  try {
    const details = await gateway.fetchPayment(payment.providerPaymentId);
    name = details.debtor?.name?.trim() || null;
  } catch (error) {
    console.warn("Bancontact payment details for the refund account failed", {
      paymentId: payment.providerPaymentId,
      error,
    });
  }

  await prisma.ticketPayment.update({
    where: { id: payment.id },
    data: { refundIban: iban, refundAccountName: name },
  });
  return { status: "ok", iban, name };
}

/**
 * Na een geslaagde Bancontact-betaling: de rekening meteen bewaren, zodat ze er
 * staat wanneer iemand later terugbetaald moet worden. Mag nooit de verwerking
 * van de betaling doen falen; lukt het niet, dan haalt het beheer ze op wanneer
 * het ze nodig heeft.
 */
export async function rememberBancontactRefundAccount(providerPaymentId: string): Promise<void> {
  try {
    const payment = await prisma.ticketPayment.findUnique({
      where: { provider_providerPaymentId: { provider: "bancontact", providerPaymentId } },
      select: { id: true, refundIban: true },
    });
    if (!payment || payment.refundIban) return;
    await fetchBancontactRefundAccount(payment.id);
  } catch (error) {
    console.warn("Could not store the Bancontact refund account", { providerPaymentId, error });
  }
}
