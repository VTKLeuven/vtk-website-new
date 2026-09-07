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
  /**
   * Waar de koper naartoe gestuurd wordt. Bij een gehoste checkout (Mollie) is
   * dat de pagina van de provider; bij een app-betaling zonder gehoste pagina
   * (Bancontact) is het onze eigen pagina, en staat de sprong naar de app in
   * `deeplinkUrl`.
   */
  url: string;
  /** Deeplink naar de betaalapp, voor providers zonder gehoste checkoutpagina. */
  deeplinkUrl?: string | null;
  /** Door de provider gehoste QR-afbeelding, wanneer die er is. */
  qrCodeUrl?: string | null;
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
  getRefundStatus(input: { refundId: string; paymentId: string }): Promise<RefundStatusResult>;
  isDefinitiveCheckoutError(error: unknown): boolean;
}
