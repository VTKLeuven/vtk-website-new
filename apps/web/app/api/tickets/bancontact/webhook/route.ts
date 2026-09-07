import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { readLimitedText, RequestBodyTooLargeError } from "@/lib/ticketing/http";
import { expirePendingOrder, fulfillPaidOrder } from "@/lib/ticketing/orders";
import {
  fetchBancontactPayment,
  mapBancontactStatus,
  type BancontactPayment,
} from "@/lib/ticketing/payments/bancontact";

export const runtime = "nodejs";

const PROVIDER = "bancontact";

function webhookSummary(payment: BancontactPayment): Prisma.InputJsonObject {
  return {
    id: payment.paymentId,
    status: payment.status,
    amount: payment.amount ?? null,
    currency: payment.currency ?? null,
    reference: payment.reference ?? null,
  };
}

/**
 * Callback van Bancontact.
 *
 * Twee dingen verschillen van de Mollie-webhook, en beide maken deze kant
 * strenger in plaats van losser:
 *
 * 1. **De melding wordt niet geloofd.** Net als bij Mollie halen we de betaling
 *    opnieuw op bij de provider en werken we met dat antwoord. De handtekening
 *    op de callback is dus extra beveiliging en niet de beveiliging zelf; komt
 *    er ooit een ondertekende variant bij, dan verandert er aan deze redenering
 *    niets.
 * 2. **De provider draagt onze order-id niet.** Er is enkel een referentie, en
 *    die is van ons maar niet uniek afdwingbaar aan hun kant. We zoeken de
 *    bestelling daarom op via onze eigen payment-rij (`providerCheckoutId`), en
 *    controleren bedrag en munt tegen die rij voor we ook maar iets uitgeven.
 */
export async function POST(request: Request) {
  if (!process.env.BANCONTACT_API_KEY?.trim()) {
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

  let notifiedId: string | null = null;
  try {
    const parsed = JSON.parse(body) as { paymentId?: unknown };
    if (typeof parsed.paymentId === "string") notifiedId = parsed.paymentId;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (!notifiedId) return Response.json({ error: "MISSING_ID" }, { status: 400 });

  let payment: BancontactPayment;
  try {
    payment = await fetchBancontactPayment(notifiedId);
  } catch (error) {
    console.error("Bancontact webhook payment fetch failed", { paymentId: notifiedId, error });
    return Response.json({ error: "PAYMENT_FETCH_FAILED" }, { status: 502 });
  }

  // Geen event-id bij de provider: net als bij Mollie leiden we een stabiele
  // sleutel af uit de waargenomen toestand, zodat dezelfde overgang één keer
  // verwerkt wordt en een echte statuswijziging wel opnieuw langskomt.
  const externalEventId = `${payment.paymentId}:${payment.status}`;

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
      if (existing.processedAt) return Response.json({ received: true, duplicate: true });
      webhookId = existing.id;
      retryingStoredEvent = true;
    } else {
      throw error;
    }
  }

  try {
    const local = await prisma.ticketPayment.findFirst({
      where: { provider: PROVIDER, providerCheckoutId: payment.paymentId },
      select: { orderId: true, amountCents: true, currency: true },
    });
    if (!local) throw new Error("BANCONTACT_PAYMENT_UNKNOWN");

    const status = mapBancontactStatus(payment.status);
    if (status === "SUCCEEDED") {
      if (payment.amount != null && payment.amount !== local.amountCents) {
        throw new Error("BANCONTACT_AMOUNT_MISMATCH");
      }
      if (
        payment.currency != null &&
        payment.currency.toUpperCase() !== local.currency.toUpperCase()
      ) {
        throw new Error("BANCONTACT_CURRENCY_MISMATCH");
      }
      await fulfillPaidOrder({
        orderId: local.orderId,
        provider: PROVIDER,
        providerPaymentId: payment.paymentId,
        providerCheckoutId: payment.paymentId,
        amountCents: local.amountCents,
        currency: local.currency,
      });
    } else if (status === "EXPIRED" || status === "FAILED") {
      // De bestelling blijft niet hangen, maar ze valt ook niet weg zolang de
      // reservatie loopt: `expirePendingOrder` raakt enkel een bestelling die
      // nog op betaling wacht, en de koper kan intussen de andere betaalwijze
      // gekozen hebben.
      const stillOpen = await prisma.ticketPayment.findFirst({
        where: {
          orderId: local.orderId,
          status: { in: ["CREATED", "PENDING"] },
          NOT: { provider: PROVIDER, providerCheckoutId: payment.paymentId },
        },
        select: { id: true },
      });
      await prisma.ticketPayment.updateMany({
        where: {
          provider: PROVIDER,
          providerCheckoutId: payment.paymentId,
          status: { in: ["CREATED", "PENDING"] },
        },
        data: { status: status === "EXPIRED" ? "EXPIRED" : "FAILED", failedAt: new Date() },
      });
      if (!stillOpen) await expirePendingOrder(local.orderId);
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
    console.error("Bancontact ticket webhook processing failed", {
      paymentId: payment.paymentId,
      error,
    });
    return Response.json({ error: "WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
  }
}
