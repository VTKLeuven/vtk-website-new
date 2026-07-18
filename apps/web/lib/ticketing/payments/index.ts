import "server-only";

import {
  MockPaymentGateway,
  MolliePaymentGateway,
  publicWebhookUrl,
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

function newMockGateway(): MockPaymentGateway {
  return new MockPaymentGateway({ completePath: "/api/tickets/mock/complete" });
}

let gateway: PaymentGateway | null = null;

export function paymentGateway(): PaymentGateway {
  if (gateway) return gateway;
  gateway = configuredPaymentProvider() === "mollie" ? newMollieGateway() : newMockGateway();
  return gateway;
}

export function paymentGatewayFor(provider: string): PaymentGateway {
  if (provider === "mollie") return newMollieGateway();
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
