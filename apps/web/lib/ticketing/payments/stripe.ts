import "server-only";

import Stripe from "stripe";
import type {
  CheckoutResult,
  CheckoutStatusResult,
  CreateCheckoutInput,
  PaymentGateway,
  RefundInput,
  RefundResult,
  RefundStatusResult,
} from "./types";

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  stripeClient ??= new Stripe(key, { appInfo: { name: "VTK Ticketing" } });
  return stripeClient;
}

export class StripePaymentGateway implements PaymentGateway {
  readonly name = "stripe";

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        locale: "auto",
        client_reference_id: input.orderId,
        customer_email: input.buyerEmail,
        payment_method_types: ["bancontact", "card"],
        line_items: input.lines.map((line) => ({
          quantity: line.quantity,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: line.unitAmountCents,
            product_data: {
              name: line.name,
              description: line.description || undefined,
            },
          },
        })),
        expires_at: Math.floor(input.expiresAt.getTime() / 1000),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: {
          vtk_order_id: input.orderId,
          vtk_order_number: input.orderNumber,
        },
        payment_intent_data: {
          description: `${input.eventName} - ${input.orderNumber}`,
          metadata: {
            vtk_order_id: input.orderId,
            vtk_order_number: input.orderNumber,
          },
        },
      },
      { idempotencyKey: `vtk-ticket-checkout:${input.orderId}:${input.attempt}` }
    );

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return {
      provider: this.name,
      checkoutId: session.id,
      paymentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      url: session.url,
      status: session.payment_status === "paid" ? "SUCCEEDED" : "PENDING",
    };
  }

  async expireCheckout(checkoutId: string): Promise<void> {
    try {
      await stripe().checkout.sessions.expire(checkoutId);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError) return;
      throw error;
    }
  }

  async getCheckoutStatus(checkoutId: string): Promise<CheckoutStatusResult> {
    const session = await stripe().checkout.sessions.retrieve(checkoutId);
    return {
      status:
        session.payment_status === "paid"
          ? "SUCCEEDED"
          : session.status === "expired"
            ? "EXPIRED"
            : "PENDING",
      checkoutId: session.id,
      paymentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
      orderId: session.metadata?.vtk_order_id || session.client_reference_id,
      amountCents: session.amount_total,
      currency: session.currency?.toUpperCase() ?? null,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const refund = await stripe().refunds.create(
      {
        payment_intent: input.paymentId,
        amount: input.amountCents,
        reason: "requested_by_customer",
        metadata: {
          vtk_order_id: input.orderId,
          vtk_refund_id: input.refundId,
        },
      },
      { idempotencyKey: `vtk-ticket-refund:${input.refundId}` }
    );
    return {
      providerRefundId: refund.id,
      status:
        refund.status === "succeeded"
          ? "SUCCEEDED"
          : refund.status === "failed" || refund.status === "canceled"
            ? "FAILED"
            : "PENDING",
    };
  }

  async getRefundStatus(refundId: string): Promise<RefundStatusResult> {
    const refund = await stripe().refunds.retrieve(refundId);
    return {
      providerRefundId: refund.id,
      status:
        refund.status === "succeeded"
          ? "SUCCEEDED"
          : refund.status === "failed" || refund.status === "canceled"
            ? "FAILED"
            : "PENDING",
    };
  }

  isDefinitiveCheckoutError(error: unknown): boolean {
    return (
      error instanceof Stripe.errors.StripeInvalidRequestError ||
      error instanceof Stripe.errors.StripeAuthenticationError ||
      error instanceof Stripe.errors.StripePermissionError ||
      error instanceof Stripe.errors.StripeIdempotencyError ||
      error instanceof Stripe.errors.StripeCardError
    );
  }
}
