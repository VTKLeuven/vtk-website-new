import { Prisma } from '@prisma/client';
import { prisma } from '@vtk/db';
import { mapPaymentStatus } from '@vtk/payments';
import { applyPaymentStatus, newMollieGateway } from '@/lib/payments';

export const runtime = 'nodejs';

/**
 * Mollie post enkel `id=tr_...` (form-encoded), zonder handtekening. We
 * her-fetchen de betaling bij Mollie en passen die authoritative status toe;
 * de payload uit de webhook zelf vertrouwen we nooit. Dedup gebeurt op
 * `id:status` omdat Mollie geen event-id meestuurt (zelfde patroon als de
 * ticketing-webhook in apps/web).
 */
export async function POST(request: Request): Promise<Response> {
  let paymentId: string | null = null;
  try {
    const body = await request.text();
    paymentId = new URLSearchParams(body).get('id');
  } catch {
    return new Response('bad request', { status: 400 });
  }
  if (!paymentId || !paymentId.startsWith('tr_')) {
    // Mollie verwacht een 200 bij "ken ik niet", anders blijft ze retryen.
    return new Response('ignored', { status: 200 });
  }

  const payment = await prisma.uitleenPayment.findFirst({
    where: { provider: 'mollie', providerCheckoutId: paymentId },
  });
  if (!payment) return new Response('unknown payment', { status: 200 });

  const gateway = newMollieGateway();
  const molliePayment = await gateway.fetchPayment(paymentId);
  const status = mapPaymentStatus(molliePayment.status);

  const externalEventId = `${paymentId}:${molliePayment.status}`;
  try {
    await prisma.uitleenPaymentWebhook.create({
      data: {
        provider: 'mollie',
        externalEventId,
        paymentId: payment.id,
        signatureValid: true,
        payload: molliePayment as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Al verwerkt; Mollie retryt soms.
      return new Response('ok', { status: 200 });
    }
    throw error;
  }

  await applyPaymentStatus(
    payment.id,
    { status, paymentId: molliePayment.id },
    molliePayment.status
  );
  await prisma.uitleenPaymentWebhook.updateMany({
    where: { provider: 'mollie', externalEventId },
    data: { processedAt: new Date() },
  });

  return new Response('ok', { status: 200 });
}
