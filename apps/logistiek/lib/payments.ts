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
 * Past de providerstatus toe op een payment-rij. Idempotent, met één bewuste
 * uitzondering: een late, provider-bevestigde SUCCEEDED wint altijd van een
 * eerder lokaal vastgelegde mislukte/geannuleerde/verlopen status.
 */
export async function applyPaymentStatus(
  paymentId: string,
  result: CheckoutStatusResult,
  providerStatus?: string | null
): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const payment = await tx.uitleenPayment.findUnique({ where: { id: paymentId } });
    if (!payment) return;
    if (payment.status === 'SUCCEEDED') return;
    // Een provider kan na een lokale cancel/expiry alsnog melden dat het geld
    // ontvangen is. SUCCEEDED moet zo'n lokale eindstatus mogen overschrijven;
    // alle andere eindstatussen blijven idempotent.
    if (
      ['FAILED', 'CANCELLED', 'EXPIRED'].includes(payment.status) &&
      result.status !== 'SUCCEEDED'
    ) return;

    if (payment.providerCheckoutId && result.checkoutId !== payment.providerCheckoutId) {
      throw new Error('PAYMENT_CHECKOUT_MISMATCH');
    }
    if (result.status === 'SUCCEEDED') {
      const targetId = payment.reservationId ?? payment.transportBookingId;
      if (payment.provider === 'mollie') {
        if (result.orderId == null) throw new Error('PAYMENT_ORDER_MISSING');
        if (result.amountCents == null) throw new Error('PAYMENT_AMOUNT_MISSING');
        if (result.currency == null) throw new Error('PAYMENT_CURRENCY_MISSING');
      }
      if (result.orderId != null && result.orderId !== targetId) {
        throw new Error('PAYMENT_ORDER_MISMATCH');
      }
      if (result.amountCents != null && result.amountCents !== payment.amountCents) {
        throw new Error('PAYMENT_AMOUNT_MISMATCH');
      }
      if (result.currency != null && result.currency.toUpperCase() !== payment.currency.toUpperCase()) {
        throw new Error('PAYMENT_CURRENCY_MISMATCH');
      }
    }

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
 * Sluit alle nog levende checkouts voordat de gebruiker het onderliggende
 * object annuleert. Een providerstatus wordt nog één keer authoritative
 * opgehaald: blijkt de betaling al gelukt, dan mag de reservatie niet verdwijnen.
 */
export async function expireOpenPayments(
  payments: UitleenPayment[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const payment of payments) {
    if (!['CREATED', 'PENDING'].includes(payment.status)) continue;
    if (!payment.providerCheckoutId) {
      await prisma.uitleenPayment.updateMany({
        where: { id: payment.id, status: { in: ['CREATED', 'PENDING'] } },
        data: { status: 'CANCELLED', failedAt: new Date() },
      });
      continue;
    }

    try {
      const gateway = paymentGatewayFor(payment.provider);
      await gateway.expireCheckout(payment.providerCheckoutId);
      const result = await gateway.getCheckoutStatus(payment.providerCheckoutId);
      await applyPaymentStatus(payment.id, result, result.status);
      if (result.status === 'SUCCEEDED') {
        return {
          ok: false,
          error: 'Deze aanvraag is intussen betaald; mail logistiek@vtk.be om ze te annuleren.',
        };
      }
      if (result.status === 'PENDING') {
        await prisma.uitleenPayment.updateMany({
          where: { id: payment.id, status: { in: ['CREATED', 'PENDING'] } },
          data: { status: 'CANCELLED', failedAt: new Date() },
        });
      }
    } catch {
      return {
        ok: false,
        error: 'De openstaande betaling kon niet veilig geannuleerd worden. Probeer straks opnieuw.',
      };
    }
  }

  const succeeded = await prisma.uitleenPayment.count({
    where: { id: { in: payments.map((payment) => payment.id) }, status: 'SUCCEEDED' },
  });
  return succeeded > 0
    ? { ok: false, error: 'Deze aanvraag is intussen betaald; mail logistiek@vtk.be om ze te annuleren.' }
    : { ok: true };
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
