import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { completeTicketRefund, failTicketRefund } from "@/lib/ticketing/refunds";
import { readLimitedText, RequestBodyTooLargeError } from "@/lib/ticketing/http";
import { expirePendingOrder, fulfillPaidOrder } from "@/lib/ticketing/orders";
import { stripe } from "@/lib/ticketing/payments/stripe";

export const runtime = "nodejs";

function webhookSummary(event: Stripe.Event): Prisma.InputJsonObject {
  return {
    id: event.id,
    type: event.type,
    created: event.created,
    livemode: event.livemode,
    objectId: "id" in event.data.object ? String(event.data.object.id) : null,
  };
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!signature || !secret) return Response.json({ error: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });

  let body: string;
  try {
    body = await readLimitedText(request, 1024 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return Response.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  let webhookId: string;
  let retryingStoredEvent = false;
  try {
    const row = await prisma.ticketPaymentWebhook.create({
      data: {
        provider: "stripe",
        externalEventId: event.id,
        signatureValid: true,
        payload: webhookSummary(event),
      },
    });
    webhookId = row.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.ticketPaymentWebhook.findUnique({
        where: { provider_externalEventId: { provider: "stripe", externalEventId: event.id } },
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
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        const orderId = session.metadata?.vtk_order_id || session.client_reference_id;
        if (!orderId) throw new Error("STRIPE_ORDER_ID_MISSING");
        const paymentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;
        if (!paymentId) throw new Error("STRIPE_PAYMENT_ID_MISSING");
        await fulfillPaidOrder({
          orderId,
          provider: "stripe",
          providerPaymentId: paymentId,
          providerCheckoutId: session.id,
          amountCents: session.amount_total ?? 0,
          currency: (session.currency ?? "").toUpperCase(),
        });
      }
    } else if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.vtk_order_id || session.client_reference_id;
      if (orderId) {
        const matchingPayment = await prisma.ticketPayment.findFirst({
          where: { orderId, provider: "stripe", providerCheckoutId: session.id },
          select: { id: true },
        });
        if (!matchingPayment) throw new Error("STRIPE_CHECKOUT_ORDER_MISMATCH");
        await expirePendingOrder(orderId);
      }
    } else if (
      event.type === "refund.created" ||
      event.type === "refund.updated" ||
      event.type === "refund.failed"
    ) {
      const refund = event.data.object as Stripe.Refund;
      const localRefundId = refund.metadata?.vtk_refund_id;
      if (localRefundId) {
        const localRefund = await prisma.ticketRefund.findUnique({
          where: { id: localRefundId },
          include: { payment: { select: { provider: true, providerPaymentId: true } } },
        });
        const paymentIntentId =
          typeof refund.payment_intent === "string"
            ? refund.payment_intent
            : refund.payment_intent?.id ?? null;
        if (
          !localRefund ||
          localRefund.provider !== "stripe" ||
          localRefund.payment.provider !== "stripe" ||
          localRefund.amountCents !== refund.amount ||
          localRefund.currency !== refund.currency.toUpperCase() ||
          !paymentIntentId ||
          localRefund.payment.providerPaymentId !== paymentIntentId ||
          (refund.metadata?.vtk_order_id && refund.metadata.vtk_order_id !== localRefund.orderId) ||
          (localRefund.providerRefundId && localRefund.providerRefundId !== refund.id)
        ) {
          throw new Error("STRIPE_REFUND_DATA_MISMATCH");
        }
        if (refund.status === "succeeded") {
          await completeTicketRefund(localRefundId, refund.id);
        } else if (refund.status === "failed" || refund.status === "canceled") {
          await failTicketRefund(localRefundId, refund.id);
        } else {
          await prisma.ticketRefund.updateMany({
            where: { id: localRefundId, status: "PENDING", completedAt: null },
            data: { status: "PENDING", providerRefundId: refund.id },
          });
        }
      }
    }

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
    console.error("Stripe ticket webhook processing failed", { eventId: event.id, error });
    return Response.json({ error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
  }
}
