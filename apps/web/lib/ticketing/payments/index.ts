import "server-only";

import { configuredPaymentProvider } from "../config";
import { MockPaymentGateway } from "./mock";
import { StripePaymentGateway } from "./stripe";
import type { PaymentGateway } from "./types";

let gateway: PaymentGateway | null = null;

export function paymentGateway(): PaymentGateway {
  if (gateway) return gateway;
  gateway =
    configuredPaymentProvider() === "stripe"
      ? new StripePaymentGateway()
      : new MockPaymentGateway();
  return gateway;
}

export function paymentGatewayFor(provider: string): PaymentGateway {
  if (provider === "stripe") return new StripePaymentGateway();
  if (provider === "mock" && process.env.NODE_ENV !== "production") {
    return new MockPaymentGateway();
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
} from "./types";
