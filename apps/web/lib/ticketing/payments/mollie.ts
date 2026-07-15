import "server-only";

import { ticketingBaseUrl } from "../config";
import type {
  CheckoutResult,
  CheckoutStatusResult,
  CreateCheckoutInput,
  PaymentGateway,
  RefundInput,
  RefundResult,
  RefundStatusResult,
} from "./types";

const MOLLIE_API_BASE = "https://api.mollie.com/v2";

export class MollieApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  constructor(status: number, detail: unknown) {
    const title =
      detail && typeof detail === "object" && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : `HTTP ${status}`;
    super(`Mollie API error (${status}): ${title}`);
    this.name = "MollieApiError";
    this.status = status;
    this.detail = detail;
  }
}

type MollieAmount = { currency: string; value: string };

export type MolliePayment = {
  id: string;
  status: string;
  amount: MollieAmount;
  amountRefunded?: MollieAmount | null;
  metadata?: Record<string, string> | null;
  isCancelable?: boolean;
  _embedded?: { refunds?: MollieRefund[] } | null;
  _links?: { checkout?: { href: string } | null } | null;
};

export type MollieRefund = {
  id: string;
  status: string;
  amount: MollieAmount;
  paymentId?: string;
  metadata?: Record<string, string> | null;
};

function mollieApiKey(): string {
  const key = process.env.MOLLIE_API_KEY?.trim();
  if (!key) throw new Error("MOLLIE_API_KEY is not configured");
  return key;
}

async function mollieRequest<T>(
  path: string,
  init: { method: string; body?: unknown; idempotencyKey?: string } = { method: "GET" }
): Promise<T> {
  const response = await fetch(`${MOLLIE_API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${mollieApiKey()}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    // Mollie is an external service; never let a hung socket wedge a request.
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new MollieApiError(response.status, payload);
  }
  return payload as T;
}

// The ticketing domain stores integer minor units (cents) and operates in EUR,
// a two-decimal currency. Mollie expects a decimal string like "10.00".
function toMollieValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

function fromMollieValue(value: string): number {
  return Math.round(Number.parseFloat(value) * 100);
}

function mollieWebhookUrl(): string | undefined {
  const base = ticketingBaseUrl();
  const host = new URL(base).hostname;
  // Mollie rejects webhook URLs that are not publicly reachable. In local dev
  // (localhost) we skip it and rely on return-page + reconciliation polling.
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local");
  if (isLocal) return undefined;
  return new URL("/api/tickets/mollie/webhook", base).toString();
}

export function mapPaymentStatus(status: string): CheckoutStatusResult["status"] {
  switch (status) {
    case "paid":
      return "SUCCEEDED";
    case "expired":
      return "EXPIRED";
    case "canceled":
    case "failed":
      return "FAILED";
    default:
      // open, pending, authorized
      return "PENDING";
  }
}

export function mapRefundStatus(status: string): RefundResult["status"] {
  switch (status) {
    case "refunded":
      return "SUCCEEDED";
    case "failed":
    case "canceled":
      return "FAILED";
    default:
      // queued, pending, processing
      return "PENDING";
  }
}

export async function fetchMolliePayment(
  id: string,
  opts: { embedRefunds?: boolean } = {}
): Promise<MolliePayment> {
  const query = opts.embedRefunds ? "?embed=refunds" : "";
  return mollieRequest<MolliePayment>(`/payments/${encodeURIComponent(id)}${query}`);
}

export class MolliePaymentGateway implements PaymentGateway {
  readonly name = "mollie";

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const totalCents = input.lines.reduce(
      (sum, line) => sum + line.unitAmountCents * line.quantity,
      0
    );
    const description = `${input.eventName} - ${input.orderNumber}`.slice(0, 255);
    const webhookUrl = mollieWebhookUrl();

    const payment = await mollieRequest<MolliePayment>("/payments", {
      method: "POST",
      idempotencyKey: `vtk-ticket-checkout:${input.orderId}:${input.attempt}`,
      body: {
        amount: { currency: input.currency.toUpperCase(), value: toMollieValue(totalCents) },
        description,
        redirectUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        ...(webhookUrl ? { webhookUrl } : {}),
        billingEmail: input.buyerEmail,
        metadata: {
          vtk_order_id: input.orderId,
          vtk_order_number: input.orderNumber,
        },
      },
    });

    const url = payment._links?.checkout?.href;
    if (!url) throw new Error("Mollie did not return a checkout URL");
    // Mollie has a single payment resource: its id is both the checkout handle
    // and the payment reference.
    return {
      provider: this.name,
      checkoutId: payment.id,
      paymentId: payment.id,
      url,
      status: payment.status === "paid" ? "SUCCEEDED" : "PENDING",
    };
  }

  async expireCheckout(checkoutId: string): Promise<void> {
    try {
      await mollieRequest(`/payments/${encodeURIComponent(checkoutId)}`, { method: "DELETE" });
    } catch (error) {
      // The payment may already be paid/expired/uncancelable — Mollie answers
      // 4xx, which for our purposes is a no-op.
      if (error instanceof MollieApiError && error.status >= 400 && error.status < 500) return;
      throw error;
    }
  }

  async getCheckoutStatus(checkoutId: string): Promise<CheckoutStatusResult> {
    const payment = await fetchMolliePayment(checkoutId);
    return {
      status: mapPaymentStatus(payment.status),
      checkoutId: payment.id,
      paymentId: payment.id,
      orderId: payment.metadata?.vtk_order_id ?? null,
      amountCents: fromMollieValue(payment.amount.value),
      currency: payment.amount.currency.toUpperCase(),
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const refund = await mollieRequest<MollieRefund>(
      `/payments/${encodeURIComponent(input.paymentId)}/refunds`,
      {
        method: "POST",
        idempotencyKey: `vtk-ticket-refund:${input.refundId}`,
        body: {
          amount: { currency: input.currency.toUpperCase(), value: toMollieValue(input.amountCents) },
          description: (input.reason || `VTK refund ${input.refundId}`).slice(0, 140),
          metadata: {
            vtk_order_id: input.orderId,
            vtk_refund_id: input.refundId,
          },
        },
      }
    );
    return { providerRefundId: refund.id, status: mapRefundStatus(refund.status) };
  }

  async getRefundStatus(input: { refundId: string; paymentId: string }): Promise<RefundStatusResult> {
    const refund = await mollieRequest<MollieRefund>(
      `/payments/${encodeURIComponent(input.paymentId)}/refunds/${encodeURIComponent(input.refundId)}`
    );
    return { providerRefundId: refund.id, status: mapRefundStatus(refund.status) };
  }

  isDefinitiveCheckoutError(error: unknown): boolean {
    // Any 4xx other than rate limiting is a client-side error that retrying
    // with the same request will not fix.
    return (
      error instanceof MollieApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 429
    );
  }
}
