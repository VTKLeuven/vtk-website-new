import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { readLimitedText, RequestBodyTooLargeError } from "@/lib/ticketing/http";
import { expirePendingOrder, fulfillPaidOrder } from "@/lib/ticketing/orders";
import {
  fetchMolliePayment,
  mapPaymentStatus,
  mapRefundStatus,
  type MolliePayment,
  type MollieRefund,
} from "@/lib/ticketing/payments/mollie";
import { completeTicketRefund, failTicketRefund } from "@/lib/ticketing/refunds";

export const runtime = "nodejs";

const PROVIDER = "mollie";

function amountToCents(value: string): number {
  return Math.round(Number.parseFloat(value) * 100);
}

function webhookSummary(payment: MolliePayment): Prisma.InputJsonObject {
  return {
    id: payment.id,
    status: payment.status,
    amount: payment.amount?.value ?? null,
    currency: payment.amount?.currency ?? null,
    amountRefunded: payment.amountRefunded?.value ?? null,
  };
}

async function processRefunds(payment: MolliePayment): Promise<void> {
  const refunds: MollieRefund[] = payment._embedded?.refunds ?? [];
  for (const refund of refunds) {
    const localRefundId = refund.metadata?.vtk_refund_id;
    if (!localRefundId) continue;
    const localRefund = await prisma.ticketRefund.findUnique({
      where: { id: localRefundId },
      include: { payment: { select: { provider: true, providerPaymentId: true } } },
    });
    if (
      !localRefund ||
      localRefund.provider !== PROVIDER ||
      localRefund.payment.provider !== PROVIDER ||
      localRefund.amountCents !== amountToCents(refund.amount.value) ||
      localRefund.currency !== refund.amount.currency.toUpperCase() ||
      localRefund.payment.providerPaymentId !== payment.id ||
      (refund.metadata?.vtk_order_id && refund.metadata.vtk_order_id !== localRefund.orderId) ||
      (localRefund.providerRefundId && localRefund.providerRefundId !== refund.id)
    ) {
      throw new Error("MOLLIE_REFUND_DATA_MISMATCH");
    }
    const status = mapRefundStatus(refund.status);
    if (status === "SUCCEEDED") {
      await completeTicketRefund(localRefundId, refund.id);
    } else if (status === "FAILED") {
      await failTicketRefund(localRefundId, refund.id);
    } else {
      await prisma.ticketRefund.updateMany({
        where: { id: localRefundId, status: "PENDING", completedAt: null },
        data: { status: "PENDING", providerRefundId: refund.id },
      });
    }
  }
}

export async function POST(request: Request) {
  if (!process.env.MOLLIE_API_KEY?.trim()) {
    return Response.json({ error: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  }

  let body: string;
  try {
    body = await readLimitedText(request, 64 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  // Mollie posts application/x-www-form-urlencoded with a single `id` field.
  const paymentId = new URLSearchParams(body).get("id");
  if (!paymentId) return Response.json({ error: "MISSING_ID" }, { status: 400 });

  // Never trust the notification body: re-fetch the authoritative payment state
  // from Mollie (embedding refunds so we can settle those in the same pass).
  let payment: MolliePayment;
  try {
    payment = await fetchMolliePayment(paymentId, { embedRefunds: true });
  } catch (error) {
    console.error("Mollie webhook payment fetch failed", { paymentId, error });
    return Response.json({ error: "PAYMENT_FETCH_FAILED" }, { status: 502 });
  }

  // Mollie has no event id; derive a stable key from the observed state so the
  // same transition is only applied once while genuine changes (payment status,
  // refunded amount) still get their own row.
  const externalEventId = `${payment.id}:${payment.status}:${payment.amountRefunded?.value ?? "0.00"}`;

  let webhookId: string;
  let retryingStoredEvent = false;
  try {
    const row = await prisma.ticketPaymentWebhook.create({
      data: {
        provider: PROVIDER,
        externalEventId,
        signatureValid: true,
        payload: webhookSummary(payment),
      },
    });
    webhookId = row.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.ticketPaymentWebhook.findUnique({
        where: { provider_externalEventId: { provider: PROVIDER, externalEventId } },
        select: { id: true, processedAt: true },
      });
      if (!existing) throw error;
      if (existing.processedAt) {
        return Response.json({ received: true, duplicate: true });
      }
      webhookId = existing.id;
      retryingStoredEvent = true;
    } else {
      throw error;
    }
  }

  try {
    const status = mapPaymentStatus(payment.status);
    if (status === "SUCCEEDED") {
      const orderId = payment.metadata?.vtk_order_id;
      if (!orderId) throw new Error("MOLLIE_ORDER_ID_MISSING");
      await fulfillPaidOrder({
        orderId,
        provider: PROVIDER,
        providerPaymentId: payment.id,
        providerCheckoutId: payment.id,
        amountCents: amountToCents(payment.amount.value),
        currency: payment.amount.currency.toUpperCase(),
      });
    } else if (status === "EXPIRED" || status === "FAILED") {
      const orderId = payment.metadata?.vtk_order_id;
      if (orderId) {
        const matchingPayment = await prisma.ticketPayment.findFirst({
          where: { orderId, provider: PROVIDER, providerCheckoutId: payment.id },
          select: { id: true },
        });
        if (!matchingPayment) throw new Error("MOLLIE_CHECKOUT_ORDER_MISMATCH");
        await expirePendingOrder(orderId);
      }
    }

    // A paid payment can also carry refund updates; settle them regardless of
    // the payment-level status.
    await processRefunds(payment);

    await prisma.ticketPaymentWebhook.update({
      where: { id: webhookId },
      data: { processedAt: new Date(), processingAttempts: { increment: 1 }, lastError: null },
    });
    return Response.json({ received: true, retried: retryingStoredEvent });
  } catch (error) {
    await prisma.ticketPaymentWebhook.update({
      where: { id: webhookId },
      data: {
        processingAttempts: { increment: 1 },
        lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown error",
      },
    });
    console.error("Mollie ticket webhook processing failed", { paymentId: payment.id, error });
    return Response.json({ error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
  }
}
