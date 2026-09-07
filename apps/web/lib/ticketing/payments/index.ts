import "server-only";

import {
  BancontactPaymentGateway,
  MockPaymentGateway,
  MolliePaymentGateway,
  publicWebhookUrl,
  type CreateCheckoutInput,
  type PaymentGateway,
} from "@vtk/payments";
import { configuredPaymentProvider, ticketingBaseUrl } from "../config";

// De gedeelde gateways in @vtk/payments zijn app-agnostisch; hier krijgen ze
// hun ticketing-configuratie (webhook-URL, idempotency-namespace, mock-route).
export function newMollieGateway(): MolliePaymentGateway {
  return new MolliePaymentGateway({
    webhookUrl: () => publicWebhookUrl(ticketingBaseUrl(), "/api/tickets/mollie/webhook"),
    idempotencyNamespace: "vtk-ticket",
  });
}

/**
 * Bancontact levert geen gehoste checkoutpagina, dus hosten we ze zelf. De
 * taalprefix zit al in `successUrl` (die wijst naar de bestelpagina van deze
 * bestelling), en daar hangen we het betaalpad aan. Zo hoeft de gateway, die
 * één keer aangemaakt wordt en dus geen request kent, de taal niet te weten.
 */
function bancontactHostedPageUrl(input: CreateCheckoutInput): string {
  const url = new URL(input.successUrl);
  url.search = "";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/bancontact`;
  return url.toString();
}

export function newBancontactGateway(): BancontactPaymentGateway {
  return new BancontactPaymentGateway({
    callbackUrl: () => publicWebhookUrl(ticketingBaseUrl(), "/api/tickets/bancontact/webhook"),
    hostedPageUrl: bancontactHostedPageUrl,
  });
}

function newMockGateway(): MockPaymentGateway {
  return new MockPaymentGateway({ completePath: "/api/tickets/mock/complete" });
}

let gateway: PaymentGateway | null = null;

export function paymentGateway(): PaymentGateway {
  if (gateway) return gateway;
  gateway = paymentGatewayFor(configuredPaymentProvider());
  return gateway;
}

export function paymentGatewayFor(provider: string): PaymentGateway {
  if (provider === "mollie") return newMollieGateway();
  if (provider === "bancontact") return newBancontactGateway();
  if (provider === "mock" && process.env.NODE_ENV !== "production") {
    return newMockGateway();
  }
  throw new Error(`Unsupported payment provider: ${provider}`);
}

export type {
  CheckoutLine,
  CheckoutResult,
  CheckoutStatusResult,
  CreateCheckoutInput,
  PaymentGateway,
  RefundInput,
  RefundResult,
  RefundStatusResult,
} from "@vtk/payments";
