import { redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { ticketingBaseUrl } from "@/lib/ticketing/config";
import { applyMembershipPaymentStatus } from "@/lib/membership/payments";

export const runtime = "nodejs";

/**
 * De dev-only "betaal nu"-knop: zonder Mollie-sleutel kan een lidmaatschap
 * lokaal anders nooit geactiveerd worden, en dan is het hele scherm erna niet
 * te zien. Bestaat niet in productie.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const url = new URL(request.url);
  const membershipId = url.searchParams.get("orderId");
  const returnTo = url.searchParams.get("returnTo");
  if (!membershipId || !returnTo) {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const destination = new URL(returnTo);
  if (destination.origin !== ticketingBaseUrl()) {
    return Response.json({ error: "INVALID_RETURN_URL" }, { status: 400 });
  }

  const payment = await prisma.membershipPayment.findFirst({
    where: { membershipId, provider: "mock" },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) return Response.json({ error: "PAYMENT_NOT_FOUND" }, { status: 404 });

  await applyMembershipPaymentStatus(payment.id, {
    status: "SUCCEEDED",
    checkoutId: payment.providerCheckoutId ?? `mock_${membershipId}`,
    paymentId: payment.providerPaymentId,
    orderId: membershipId,
    amountCents: payment.amountCents,
    currency: payment.currency,
  });

  redirect(destination.toString());
}
