import "server-only";

import type {
  CheckoutResult,
  CheckoutStatusResult,
  CreateCheckoutInput,
  PaymentGateway,
  RefundInput,
  RefundResult,
  RefundStatusResult,
} from "./types";

export type MockGatewayConfig = {
  /** App-pad van de dev-only complete-route, bv. "/api/tickets/mock/complete". */
  completePath: string;
};

export class MockPaymentGateway implements PaymentGateway {
  readonly name = "mock";
  private readonly config: MockGatewayConfig;

  constructor(config: MockGatewayConfig) {
    this.config = config;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    if (process.env.NODE_ENV === "production") throw new Error("Mock payments are disabled");
    const url = new URL(this.config.completePath, input.successUrl);
    url.searchParams.set("orderId", input.orderId);
    url.searchParams.set("returnTo", input.successUrl);
    return {
      provider: this.name,
      checkoutId: `mock_${input.orderId}_${input.attempt}`,
      paymentId: `mock_payment_${input.orderId}`,
      url: url.toString(),
      status: "PENDING",
    };
  }

  async expireCheckout(): Promise<void> {}

  async getCheckoutStatus(checkoutId: string): Promise<CheckoutStatusResult> {
    if (process.env.NODE_ENV === "production") throw new Error("Mock payments are disabled");
    return { status: "PENDING", checkoutId };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (process.env.NODE_ENV === "production") throw new Error("Mock payments are disabled");
    return { providerRefundId: `mock_refund_${input.refundId}`, status: "SUCCEEDED" };
  }

  async getRefundStatus(input: { refundId: string; paymentId: string }): Promise<RefundStatusResult> {
    return { providerRefundId: input.refundId, status: "SUCCEEDED" };
  }

  isDefinitiveCheckoutError(): boolean {
    return true;
  }
}
