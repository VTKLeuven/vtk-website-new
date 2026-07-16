import "server-only";

import { prisma } from "@vtk/db";
import { expirePendingOrder, fulfillPaidOrder } from "./orders";
import { paymentGatewayFor, type RefundStatusResult } from "./payments";
import { completeTicketRefund, failTicketRefund } from "./refunds";

export async function reconcileTicketPayments(limit = 50) {
  const payments = await prisma.ticketPayment.findMany({
    where: {
      provider: "mollie",
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
        if (
          status.orderId !== payment.orderId ||
          status.amountCents == null ||
          !status.currency ||
          !status.paymentId
        ) {
          throw new Error("RECONCILIATION_DATA_MISMATCH");
        }
        await fulfillPaidOrder({
          orderId: payment.orderId,
          provider: payment.provider,
          providerPaymentId: status.paymentId,
          providerCheckoutId: status.checkoutId,
          amountCents: status.amountCents,
          currency: status.currency,
        });
        succeeded += 1;
      } else if (status.status === "EXPIRED" || status.status === "FAILED") {
        await expirePendingOrder(payment.orderId);
        expired += 1;
      }
    } catch (error) {
      console.error("Ticket payment reconciliation failed", { paymentId: payment.id, error });
      failed += 1;
    }
  }

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
