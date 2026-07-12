export type CheckoutLine = {
  name: string;
  description?: string | null;
  quantity: number;
  unitAmountCents: number;
};

export type CreateCheckoutInput = {
  orderId: string;
  orderNumber: string;
  buyerEmail: string;
  eventName: string;
  currency: string;
  lines: CheckoutLine[];
  expiresAt: Date;
  successUrl: string;
  cancelUrl: string;
  attempt: number;
};

export type CheckoutResult = {
  provider: string;
  checkoutId: string;
  paymentId?: string | null;
  url: string;
  status: "PENDING" | "SUCCEEDED";
};

export type RefundInput = {
  paymentId: string;
  amountCents: number;
  currency: string;
  orderId: string;
  refundId: string;
  reason?: string | null;
};

export type RefundResult = {
  providerRefundId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
};

export type CheckoutStatusResult = {
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  checkoutId: string;
  paymentId?: string | null;
  orderId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
};

export type RefundStatusResult = RefundResult;

export interface PaymentGateway {
  readonly name: string;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  getCheckoutStatus(checkoutId: string): Promise<CheckoutStatusResult>;
  expireCheckout(checkoutId: string): Promise<void>;
  refund(input: RefundInput): Promise<RefundResult>;
  getRefundStatus(refundId: string): Promise<RefundStatusResult>;
  isDefinitiveCheckoutError(error: unknown): boolean;
}
