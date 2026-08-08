import { prisma } from '@vtk/db';
import { applyPaymentStatus } from '@/lib/payments';

export const runtime = 'nodejs';

/** Dev-only: rond de mock-checkout meteen af als "betaald" en keer terug. */
export async function GET(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return new Response('not found', { status: 404 });
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get('orderId');
  const returnTo = url.searchParams.get('returnTo');
  if (!orderId) return new Response('missing orderId', { status: 400 });

  const payment = await prisma.uitleenPayment.findFirst({
    where: {
      provider: 'mock',
      status: { in: ['CREATED', 'PENDING'] },
      OR: [{ reservationId: orderId }, { transportBookingId: orderId }],
    },
    orderBy: { createdAt: 'desc' },
  });
  if (payment) {
    const targetId = payment.reservationId ?? payment.transportBookingId;
    await applyPaymentStatus(
      payment.id,
      {
        status: 'SUCCEEDED',
        checkoutId: payment.providerCheckoutId ?? `mock_${targetId}`,
        paymentId: payment.providerPaymentId,
        orderId: targetId,
        amountCents: payment.amountCents,
        currency: payment.currency,
      },
      'paid',
    );
  }

  let target = '/reservaties';
  if (returnTo) {
    try {
      const parsed = new URL(returnTo);
      if (parsed.origin === new URL(request.url).origin) target = parsed.toString();
    } catch {
      // Ongeldige of relatieve waarden vallen terug naar de interne lijst.
    }
  }
  return Response.redirect(target, 302);
}
