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

/**
 * De checkouts die `expireCheckout` afsloot. Op moduleniveau en niet op de
 * instantie: de site maakt per aanvraag een nieuwe gateway aan. Een herstart
 * vergeet ze, en dat geeft niet: wie een checkout afsluit, vraagt meteen daarna
 * de status op, zoals `closeLivePayments` doet.
 */
const expiredCheckouts = new Set<string>();

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
      // Het volgnummer hoort er ook hier in: twee pogingen op dezelfde
      // bestelling botsen anders op de unieke index per provider.
      paymentId: `mock_payment_${input.orderId}_${input.attempt}`,
      url: url.toString(),
      status: "PENDING",
    };
  }

  /**
   * Zoals een echte provider: na het afsluiten is de checkout vervallen. Zonder
   * dat bleef een lokale betaling voorgoed "pending", verviel een lokale
   * bestelling nooit en kon je lokaal nooit van betaalwijze wisselen.
   */
  async expireCheckout(checkoutId: string): Promise<void> {
    expiredCheckouts.add(checkoutId);
  }

  async getCheckoutStatus(checkoutId: string): Promise<CheckoutStatusResult> {
    if (process.env.NODE_ENV === "production") throw new Error("Mock payments are disabled");
    return { status: expiredCheckouts.has(checkoutId) ? "EXPIRED" : "PENDING", checkoutId };
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
