import { prisma } from "@vtk/db";
import { readLimitedText, RequestBodyTooLargeError } from "@/lib/ticketing/http";
import { fetchMolliePayment, mapPaymentStatus } from "@/lib/ticketing/payments/mollie";
import { applyMembershipPaymentStatus } from "@/lib/membership/payments";
import { handleMembershipWebhookEvent } from "@/lib/membership/webhooks";

export const runtime = "nodejs";

const PROVIDER = "mollie";

/**
 * Mollie meldt dat er iets veranderde aan een lidmaatschapsbetaling.
 *
 * De melding zelf wordt niet geloofd: we halen de betaling opnieuw op bij
 * Mollie en werken met dat antwoord. Refunds komen hier niet voor; een
 * lidmaatschap wordt niet via de site terugbetaald.
 */
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

  const notifiedId = new URLSearchParams(body).get("id");
  if (!notifiedId) return Response.json({ error: "MISSING_ID" }, { status: 400 });

  let payment;
  try {
    payment = await fetchMolliePayment(notifiedId);
  } catch (error) {
    console.error("Mollie membership webhook payment fetch failed", { id: notifiedId, error });
    return Response.json({ error: "PAYMENT_FETCH_FAILED" }, { status: 502 });
  }

  const amountCents = Math.round(Number.parseFloat(payment.amount.value) * 100);

  return handleMembershipWebhookEvent({
    provider: PROVIDER,
    externalEventId: `${payment.id}:${payment.status}`,
    payload: {
      id: payment.id,
      status: payment.status,
      amount: payment.amount?.value ?? null,
      currency: payment.amount?.currency ?? null,
    },
    process: async () => {
      const local = await prisma.membershipPayment.findFirst({
        where: {
          provider: PROVIDER,
          OR: [{ providerCheckoutId: payment.id }, { providerPaymentId: payment.id }],
        },
        select: { id: true, providerCheckoutId: true },
      });
      if (!local) throw new Error("MOLLIE_MEMBERSHIP_PAYMENT_UNKNOWN");

      await applyMembershipPaymentStatus(
        local.id,
        {
          status: mapPaymentStatus(payment.status),
          checkoutId: local.providerCheckoutId ?? payment.id,
          paymentId: payment.id,
          orderId: payment.metadata?.vtk_order_id ?? null,
          amountCents,
          currency: payment.amount.currency.toUpperCase(),
        },
        payment.status,
      );
    },
  });
}
