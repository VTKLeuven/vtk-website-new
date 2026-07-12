import { redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { ticketingBaseUrl } from "@/lib/ticketing/config";
import { fulfillPaidOrder } from "@/lib/ticketing/orders";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  const returnTo = url.searchParams.get("returnTo");
  if (!orderId || !returnTo) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const destination = new URL(returnTo);
  if (destination.origin !== ticketingBaseUrl()) {
    return Response.json({ error: "INVALID_RETURN_URL" }, { status: 400 });
  }
  destination.searchParams.delete("session_id");

  const order = await prisma.ticketOrder.findUnique({
    where: { id: orderId },
    include: { payments: { where: { provider: "mock" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const payment = order?.payments[0];
  if (!order || !payment) return Response.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
  await fulfillPaidOrder({
    orderId,
    provider: "mock",
    providerPaymentId: payment.providerPaymentId ?? `mock_payment_${orderId}`,
    providerCheckoutId: payment.providerCheckoutId,
    amountCents: order.totalCents,
    currency: order.currency,
  });
  redirect(destination.toString());
}
