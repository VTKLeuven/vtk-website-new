import { Prisma } from '@prisma/client';
import { prisma } from '@vtk/db';
import { applyPaymentStatus, newMollieGateway } from '@/lib/payments';
import { readLimitedText, RequestBodyTooLargeError } from '@/lib/http';

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
    const body = await readLimitedText(request, 64 * 1024);
    paymentId = new URLSearchParams(body).get('id');
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return new Response('payload too large', { status: 413 });
    }
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
  let result;
  try {
    result = await gateway.getCheckoutStatus(paymentId);
  } catch {
    return new Response('provider unavailable', { status: 502 });
  }

  const externalEventId = `${paymentId}:${result.status}`;
  let webhook = await prisma.uitleenPaymentWebhook.findUnique({
    where: { provider_externalEventId: { provider: 'mollie', externalEventId } },
  });
  try {
    webhook ??= await prisma.uitleenPaymentWebhook.create({
      data: {
        provider: 'mollie',
        externalEventId,
        paymentId: payment.id,
        signatureValid: true,
        payload: result as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      webhook = await prisma.uitleenPaymentWebhook.findUnique({
        where: { provider_externalEventId: { provider: 'mollie', externalEventId } },
      });
    } else {
      throw error;
    }
  }
  if (!webhook) return new Response('webhook persistence failed', { status: 500 });
  if (webhook.processedAt) return new Response('ok', { status: 200 });

  await prisma.uitleenPaymentWebhook.update({
    where: { id: webhook.id },
    data: { processingAttempts: { increment: 1 }, lastError: null },
  });
  try {
    await applyPaymentStatus(payment.id, result, result.status);
    await prisma.uitleenPaymentWebhook.update({
      where: { id: webhook.id },
      data: { processedAt: new Date(), lastError: null },
    });
  } catch (error) {
    await prisma.uitleenPaymentWebhook.update({
      where: { id: webhook.id },
      data: { lastError: error instanceof Error ? error.message.slice(0, 500) : 'unknown error' },
    });
    return new Response('processing failed', { status: 500 });
  }

  return new Response('ok', { status: 200 });
}
