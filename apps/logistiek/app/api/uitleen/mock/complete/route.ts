import { prisma } from '@vtk/db';

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
      OR: [{ reservationId: orderId }, { vanBookingId: orderId }],
    },
    orderBy: { createdAt: 'desc' },
  });
  if (payment) {
    await prisma.uitleenPayment.update({
      where: { id: payment.id },
      data: { status: 'SUCCEEDED', succeededAt: new Date(), providerStatus: 'paid' },
    });
  }

  const target = returnTo && returnTo.startsWith('http') ? returnTo : '/reservaties';
  return Response.redirect(target, 302);
}
