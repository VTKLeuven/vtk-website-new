import 'server-only';

import { prisma } from '@vtk/db';
import type { UitleenPayment, UitleenPaymentStatus } from '@prisma/client';
import {
  MockPaymentGateway,
  MolliePaymentGateway,
  publicWebhookUrl,
  type CheckoutStatusResult,
  type PaymentGateway,
} from '@vtk/payments';

export function logistiekBaseUrl(): string {
  const raw = process.env.LOGISTIEK_PUBLIC_URL ?? 'http://localhost:3100';
  return new URL(raw).origin;
}

export type PaymentProviderName = 'mollie' | 'mock';

export function configuredPaymentProvider(): PaymentProviderName {
  const configured = process.env.LOGISTIEK_PAYMENT_PROVIDER?.trim().toLowerCase();
  if (configured === 'mollie') return 'mollie';
  if (configured === 'mock' && process.env.NODE_ENV !== 'production') return 'mock';
  if (!configured && process.env.NODE_ENV !== 'production') return 'mock';
  throw new Error('LOGISTIEK_PAYMENT_PROVIDER must be set to mollie in production');
}

export function newMollieGateway(): MolliePaymentGateway {
  return new MolliePaymentGateway({
    webhookUrl: () => publicWebhookUrl(logistiekBaseUrl(), '/api/uitleen/mollie/webhook'),
    idempotencyNamespace: 'vtk-uitleen',
  });
}

function newMockGateway(): MockPaymentGateway {
  return new MockPaymentGateway({ completePath: '/api/uitleen/mock/complete' });
}

export function paymentGateway(): PaymentGateway {
  return configuredPaymentProvider() === 'mollie' ? newMollieGateway() : newMockGateway();
}

export function paymentGatewayFor(provider: string): PaymentGateway {
  if (provider === 'mollie') return newMollieGateway();
  if (provider === 'mock' && process.env.NODE_ENV !== 'production') return newMockGateway();
  throw new Error(`Unsupported payment provider: ${provider}`);
}

export function maintenanceSecret(): string | null {
  return process.env.LOGISTIEK_MAINTENANCE_SECRET?.trim() || null;
}

/**
 * Past de providerstatus toe op een payment-rij. Idempotent: een eindstatus
 * (SUCCEEDED/FAILED/CANCELLED/EXPIRED) wordt nooit meer overschreven.
 */
export async function applyPaymentStatus(
  paymentId: string,
  result: Pick<CheckoutStatusResult, 'status' | 'paymentId'>,
  providerStatus?: string | null
): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const payment = await tx.uitleenPayment.findUnique({ where: { id: paymentId } });
    if (!payment) return;
    if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(payment.status)) return;

    const status: UitleenPaymentStatus =
      result.status === 'SUCCEEDED'
        ? 'SUCCEEDED'
        : result.status === 'EXPIRED'
          ? 'EXPIRED'
          : result.status === 'FAILED'
            ? 'FAILED'
            : 'PENDING';

    await tx.uitleenPayment.update({
      where: { id: payment.id },
      data: {
        status,
        providerPaymentId: result.paymentId ?? payment.providerPaymentId,
        providerStatus: providerStatus ?? undefined,
        succeededAt: status === 'SUCCEEDED' ? now : payment.succeededAt,
        failedAt: status === 'FAILED' || status === 'EXPIRED' ? now : payment.failedAt,
      },
    });
  });
}

/**
 * Poll de provider voor payments die nog niet in een eindstatus zitten. Wordt
 * gebruikt door de returnpagina (webhooks bereiken localhost niet) en door de
 * maintenance-route als vangnet.
 */
export async function reconcilePayments(payments: UitleenPayment[]): Promise<number> {
  let changed = 0;
  for (const payment of payments) {
    if (!['CREATED', 'PENDING'].includes(payment.status)) continue;
    if (!payment.providerCheckoutId) continue;
    try {
      const gateway = paymentGatewayFor(payment.provider);
      const result = await gateway.getCheckoutStatus(payment.providerCheckoutId);
      if (result.status !== 'PENDING') {
        await applyPaymentStatus(payment.id, result);
        changed += 1;
      }
    } catch {
      // Reconciliatie is best effort; de maintenance-route probeert later opnieuw.
    }
  }
  return changed;
}
