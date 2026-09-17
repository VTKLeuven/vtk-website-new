import "server-only";

import { prisma } from "@vtk/db";
// Rechtstreeks uit @prisma/client, niet via @vtk/db (zie AGENTS.md).
import type { MembershipPaymentStatus } from "@prisma/client";
import {
  MockPaymentGateway,
  MolliePaymentGateway,
  publicWebhookUrl,
  type CheckoutResult,
  type CheckoutStatusResult,
  type PaymentGateway,
} from "@vtk/payments";
import { ticketingBaseUrl } from "@/lib/ticketing/config";
import { formatWorkingYear } from "@/lib/workingYear";
import { activateMembership } from ".";

/**
 * Het betaalspoor van een niet-facultair lidmaatschap.
 *
 * Dezelfde Mollie-rekening en dezelfde sleutel als de ticketverkoop: het is
 * dezelfde kring, en een tweede sleutel zou enkel een tweede manier zijn om de
 * productie verkeerd te zetten. Eigen zijn de webhook-URL en de
 * idempotency-namespace, want dit zijn andere rijen in een andere tabel.
 *
 * **Bewust enkel Mollie**, terwijl ticketing ook een rechtstreekse
 * Bancontact-koppeling kent. Bancontact host zelf geen betaalpagina; die moeten
 * wij dan hosten, en bij ticketing is dat een heel scherm rond één bestelling.
 * Dat is het hier niet waard: in de gehoste checkout van Mollie staat
 * Bancontact gewoon tussen de betaalwijzen, dus het lid betaalt precies zoals
 * gevraagd, zonder een tweede scherm dat we moeten onderhouden.
 */

export const MEMBERSHIP_WEBHOOK_PATH = "/api/lidmaatschap/mollie/webhook";
const MEMBERSHIP_MOCK_PATH = "/api/lidmaatschap/mock/complete";

export function membershipPaymentProvider(): "mollie" | "mock" {
  if (process.env.MOLLIE_API_KEY?.trim()) return "mollie";
  if (process.env.NODE_ENV !== "production") return "mock";
  throw new Error("MOLLIE_API_KEY must be set to sell memberships");
}

export function membershipGatewayFor(provider: string): PaymentGateway {
  if (provider === "mollie") {
    return new MolliePaymentGateway({
      webhookUrl: () => publicWebhookUrl(ticketingBaseUrl(), MEMBERSHIP_WEBHOOK_PATH),
      idempotencyNamespace: "vtk-lid",
    });
  }
  if (provider === "mock" && process.env.NODE_ENV !== "production") {
    return new MockPaymentGateway({ completePath: MEMBERSHIP_MOCK_PATH });
  }
  throw new Error(`Unsupported payment provider: ${provider}`);
}

export class MembershipCheckoutError extends Error {
  constructor(readonly definitive: boolean, cause?: unknown) {
    super("MEMBERSHIP_CHECKOUT_FAILED");
    this.cause = cause;
  }
}

/** Hoe lang een betaalpoging leeft voor we ze als verlopen beschouwen. */
const CHECKOUT_MINUTES = 30;

/**
 * Start (of hervat) de betaling van een lidmaatschap en geeft de URL terug waar
 * het lid naartoe moet.
 *
 * Een nog levende, betaalbare poging wordt hergebruikt in plaats van een tweede
 * te maken: wie tweemaal op de knop duwt, hoort niet twee keer te betalen.
 */
export async function startMembershipCheckout(input: {
  membershipId: string;
  userEmail: string;
  locale: "nl" | "en";
}): Promise<string> {
  const membership = await prisma.membership.findUnique({
    where: { id: input.membershipId },
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!membership) throw new Error("MEMBERSHIP_NOT_FOUND");
  if (membership.activatedAt) throw new Error("MEMBERSHIP_ALREADY_ACTIVE");
  if (membership.priceCents <= 0) throw new Error("MEMBERSHIP_NOT_PAYABLE");

  const now = new Date();
  const live = membership.payments.find(
    (payment) =>
      payment.status === "PENDING" &&
      payment.checkoutUrl &&
      (!payment.expiresAt || payment.expiresAt > now),
  );
  if (live?.checkoutUrl) return live.checkoutUrl;

  const provider = membershipPaymentProvider();
  const attempt = membership.payments.length + 1;
  const expiresAt = new Date(now.getTime() + CHECKOUT_MINUTES * 60 * 1000);
  const payment = await prisma.membershipPayment.create({
    data: {
      membershipId: membership.id,
      provider,
      idempotencyKey: `${membership.id}:${attempt}`,
      status: "CREATED",
      amountCents: membership.priceCents,
      currency: "EUR",
      expiresAt,
    },
  });

  const base = ticketingBaseUrl();
  const prefix = input.locale === "en" ? "/en" : "";
  const returnUrl = `${base}${prefix}/lidmaatschap`;
  const gateway = membershipGatewayFor(provider);
  const label =
    input.locale === "en"
      ? `VTK membership ${formatWorkingYear(membership.year)}`
      : `VTK-lidmaatschap ${formatWorkingYear(membership.year)}`;

  let checkout: CheckoutResult;
  try {
    checkout = await gateway.createCheckout({
      orderId: membership.id,
      orderNumber: membership.id.slice(-8).toUpperCase(),
      buyerEmail: input.userEmail,
      eventName: label,
      currency: "EUR",
      lines: [{ name: label, quantity: 1, unitAmountCents: membership.priceCents }],
      expiresAt,
      successUrl: `${returnUrl}?betaling=terug`,
      cancelUrl: `${returnUrl}?betaling=geannuleerd`,
      attempt,
    });
  } catch (error) {
    await prisma.membershipPayment.updateMany({
      where: { id: payment.id, status: "CREATED" },
      data: { providerStatus: "checkout_creation_failed" },
    });
    console.error("Membership checkout refused by the payment provider", {
      membershipId: membership.id,
      provider,
      error,
    });
    throw new MembershipCheckoutError(gateway.isDefinitiveCheckoutError(error), error);
  }

  try {
    await prisma.membershipPayment.update({
      where: { id: payment.id },
      data: {
        status: "PENDING",
        providerCheckoutId: checkout.checkoutId,
        providerPaymentId: checkout.paymentId,
        checkoutUrl: checkout.url,
        ...(checkout.expiresAt ? { expiresAt: checkout.expiresAt } : {}),
      },
    });
  } catch (error) {
    // Nooit een provider-URL tonen die we lokaal niet kunnen terugvinden: dan
    // betaalt iemand en vindt de webhook zijn rij niet.
    await gateway.expireCheckout(checkout.checkoutId).catch(() => null);
    console.error("Membership checkout created but local payment update failed", {
      membershipId: membership.id,
      error,
    });
    throw new MembershipCheckoutError(false, error);
  }

  return checkout.url;
}

/**
 * Past de providerstatus toe op een betaalrij, en activeert het lidmaatschap
 * zodra het geld er is. Idempotent, met dezelfde uitzondering als bij uitleen:
 * een late, provider-bevestigde SUCCEEDED wint van een lokale eindstatus.
 */
export async function applyMembershipPaymentStatus(
  paymentId: string,
  result: CheckoutStatusResult,
  providerStatus?: string | null,
): Promise<void> {
  const now = new Date();
  const activate = await prisma.$transaction(async (tx) => {
    const payment = await tx.membershipPayment.findUnique({ where: { id: paymentId } });
    if (!payment) return null;
    if (payment.status === "SUCCEEDED") return null;
    if (
      ["FAILED", "CANCELLED", "EXPIRED"].includes(payment.status) &&
      result.status !== "SUCCEEDED"
    ) {
      return null;
    }
    if (payment.providerCheckoutId && result.checkoutId !== payment.providerCheckoutId) {
      throw new Error("PAYMENT_CHECKOUT_MISMATCH");
    }
    if (result.status === "SUCCEEDED") {
      if (result.orderId != null && result.orderId !== payment.membershipId) {
        throw new Error("PAYMENT_ORDER_MISMATCH");
      }
      if (result.amountCents != null && result.amountCents !== payment.amountCents) {
        throw new Error("PAYMENT_AMOUNT_MISMATCH");
      }
      if (
        result.currency != null &&
        result.currency.toUpperCase() !== payment.currency.toUpperCase()
      ) {
        throw new Error("PAYMENT_CURRENCY_MISMATCH");
      }
    }

    const status: MembershipPaymentStatus =
      result.status === "SUCCEEDED"
        ? "SUCCEEDED"
        : result.status === "EXPIRED"
          ? "EXPIRED"
          : result.status === "FAILED"
            ? "FAILED"
            : "PENDING";

    await tx.membershipPayment.update({
      where: { id: payment.id },
      data: {
        status,
        providerPaymentId: result.paymentId ?? payment.providerPaymentId,
        providerStatus: providerStatus ?? undefined,
        succeededAt: status === "SUCCEEDED" ? now : payment.succeededAt,
        failedAt: status === "FAILED" || status === "EXPIRED" ? now : payment.failedAt,
      },
    });
    return status === "SUCCEEDED" ? payment.membershipId : null;
  });

  if (activate) await activateMembership(activate);
}
