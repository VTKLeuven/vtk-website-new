import "server-only";

import { prisma } from "@vtk/db";
import { expirePendingOrder, fulfillPaidOrder } from "./orders";
import { paymentGatewayFor, type RefundStatusResult } from "./payments";
import { completeTicketRefund, failTicketRefund } from "./refunds";

/**
 * De providers waarvan een lopende betaling opnieuw opgevraagd kan worden.
 *
 * Expliciet en niet uit `enabledPaymentMethods()`: een betaling die vorige week
 * gestart is, moet ook verzoend worden wanneer die betaalwijze intussen uit de
 * configuratie is gehaald. `free` en `mock` staan er niet in; die hebben geen
 * provider om iets aan te vragen.
 *
 * Dit stond op enkel `"mollie"`, en daarmee had een Bancontact-betaling geen
 * vangnet: bleef de callback weg (een mislukte aflevering, of een callback-URL
 * die de provider niet aanvaardt), dan bleef een betaalde bestelling voorgoed op
 * `PENDING_PAYMENT` staan en kreeg de koper nooit tickets.
 */
const RECONCILABLE_PROVIDERS = ["mollie", "bancontact"];

export async function reconcileTicketPayments(limit = 50) {
  const payments = await prisma.ticketPayment.findMany({
    where: {
      provider: { in: RECONCILABLE_PROVIDERS },
      status: { in: ["CREATED", "PENDING"] },
      providerCheckoutId: { not: null },
    },
    orderBy: { updatedAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  let succeeded = 0;
  let expired = 0;
  let failed = 0;

  for (const payment of payments) {
    try {
      const status = await paymentGatewayFor(payment.provider).getCheckoutStatus(
        payment.providerCheckoutId!
      );
      if (status.status === "SUCCEEDED") {
        // Niet elke provider draagt onze order-id mee: Bancontact geeft enkel
        // een referentie terug. We controleren dus wat er wél terugkomt tegen
        // onze eigen payment-rij, die per provider uniek is op
        // `providerCheckoutId`. Bedrag en munt horen daar altijd bij, ook als de
        // order-id ontbreekt; anders zou een betaling van het verkeerde bedrag
        // hier tickets uitgeven.
        if (
          (status.orderId != null && status.orderId !== payment.orderId) ||
          status.amountCents == null ||
          status.amountCents !== payment.amountCents ||
          !status.currency ||
          status.currency.toUpperCase() !== payment.currency.toUpperCase() ||
          !status.paymentId
        ) {
          throw new Error("RECONCILIATION_DATA_MISMATCH");
        }
        await fulfillPaidOrder({
          orderId: payment.orderId,
          provider: payment.provider,
          providerPaymentId: status.paymentId,
          providerCheckoutId: status.checkoutId,
          amountCents: payment.amountCents,
          currency: payment.currency,
        });
        succeeded += 1;
      } else if (status.status === "EXPIRED" || status.status === "FAILED") {
        // Dezelfde voorzichtigheid als in de Bancontact-webhook: deze poging
        // valt af, maar de bestelling enkel wanneer er geen andere betaling meer
        // openstaat. Sinds een koper tussen twee betaalwijzen kan kiezen, is een
        // mislukte poging niet meer hetzelfde als een mislukte bestelling, en
        // `expirePendingOrder` sluit élke openstaande betaling van de bestelling.
        await prisma.ticketPayment.updateMany({
          where: { id: payment.id, status: { in: ["CREATED", "PENDING"] } },
          data: {
            status: status.status === "EXPIRED" ? "EXPIRED" : "FAILED",
            failedAt: new Date(),
          },
        });
        const stillOpen = await prisma.ticketPayment.findFirst({
          where: {
            orderId: payment.orderId,
            status: { in: ["CREATED", "PENDING"] },
            NOT: { id: payment.id },
          },
          select: { id: true },
        });
        if (!stillOpen) await expirePendingOrder(payment.orderId);
        expired += 1;
      }
    } catch (error) {
      console.error("Ticket payment reconciliation failed", { paymentId: payment.id, error });
      failed += 1;
    }
  }

  // Enkel Mollie, en niet `RECONCILABLE_PROVIDERS`: een Bancontact-terugbetaling
  // gaat standaard met de hand via overschrijving en `refund()` weigert dan
  // meteen (`BancontactRefundUnsupportedError`). Die hier laten meedraaien
  // betekent bij elke ronde dezelfde fout in de logs voor iets wat buiten de
  // site afgehandeld wordt. Dekt je contract terugbetalingen wel, zet dan
  // BANCONTACT_REFUNDS_ENABLED aan en voeg de provider hier toe.
  const refunds = await prisma.ticketRefund.findMany({
    where: { provider: "mollie", status: "PENDING" },
    include: { payment: { select: { providerPaymentId: true } } },
    orderBy: { updatedAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  for (const refund of refunds) {
    try {
      const gateway = paymentGatewayFor(refund.provider);
      let status: RefundStatusResult;
      if (!refund.payment.providerPaymentId) {
        throw new Error("REFUND_PAYMENT_REFERENCE_MISSING");
      }
      if (refund.providerRefundId) {
        status = await gateway.getRefundStatus({
          refundId: refund.providerRefundId,
          paymentId: refund.payment.providerPaymentId,
        });
      } else {
        status = await gateway.refund({
          paymentId: refund.payment.providerPaymentId,
          amountCents: refund.amountCents,
          currency: refund.currency,
          orderId: refund.orderId,
          refundId: refund.id,
          reason: refund.reason,
        });
      }
      if (!refund.providerRefundId) {
        await prisma.ticketRefund.updateMany({
          where: { id: refund.id, status: "PENDING", completedAt: null },
          data: {
            providerRefundId: status.providerRefundId,
            ...(status.status === "SUCCEEDED" ? {} : { status: status.status }),
          },
        });
      }
      if (status.status === "SUCCEEDED") {
        await completeTicketRefund(refund.id, status.providerRefundId);
      } else if (status.status === "FAILED") {
        await failTicketRefund(refund.id, status.providerRefundId);
      }
    } catch (error) {
      console.error("Ticket refund reconciliation failed", { refundId: refund.id, error });
      failed += 1;
    }
  }
  return { checked: payments.length, succeeded, expired, failed, refunds: refunds.length };
}
