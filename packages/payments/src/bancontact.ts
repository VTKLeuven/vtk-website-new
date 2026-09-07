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

/**
 * Bancontact Pro: rechtstreeks betalen, zonder PSP ertussen.
 *
 * Namen, want die zijn in 2026 veranderd en de oude staan nog overal: wat
 * vroeger **Payconiq by Bancontact** heette, is nu **Bancontact Pay** (de app
 * van de koper) en **Bancontact Pro** (de betaaloplossing voor handelaars, wat
 * wij hier aanspreken). Het bedrijf heet sinds het voorjaar van 2026
 * Bancontact Company. De merknaam Payconiq verdwijnt in de loop van 2026, maar
 * de API draait nog op de payconiq-host; verwar de merknaam dus niet met het
 * endpoint hieronder.
 *
 * Dit is bewust een **andere** betaalwijze dan Bancontact-via-Mollie, en niet
 * dezelfde betaling langs een andere weg. Bancontact Company is een scheme en
 * geen acquirer: de kaartbetaling (kaartnummer intikken) kan enkel via een PSP,
 * maar de app-betaling kan rechtstreeks met een eigen merchantcontract en een
 * API-sleutel. Wat de koper hier krijgt is dus een QR of een sprong naar de
 * Bancontact-app, nooit een kaartformulier.
 *
 * Twee gevolgen die de rest van de code voelt:
 *
 * 1. Er is **geen gehoste checkoutpagina**. De provider geeft een deeplink en
 *    een QR terug; de pagina eromheen is van ons. `createCheckout` geeft daarom
 *    de deeplink terug in `deeplinkUrl` en laat de aanroeper bepalen welke
 *    lokale URL de koper te zien krijgt.
 * 2. Bedragen zijn hier gehele centen, niet Mollie's decimale string.
 *
 * VERIFIEER VOOR PRODUCTIE: endpoint-versie, veldnamen en de exacte
 * statuswaarden hangen aan het producttype in je merchantcontract, en de
 * merkwissel van 2026 kan ze verschoven hebben. Alles wat provider-specifiek
 * is, staat bewust in dit ene bestand; klopt er iets niet, dan is dit de enige
 * plaats die verandert.
 */

const DEFAULT_API_BASE = "https://api.payconiq.com";

export class BancontactApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  constructor(status: number, detail: unknown) {
    const message =
      detail && typeof detail === "object" && "message" in detail
        ? String((detail as { message: unknown }).message)
        : `HTTP ${status}`;
    super(`Bancontact API error (${status}): ${message}`);
    this.name = "BancontactApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Gegooid wanneer een terugbetaling niet via de API kan; zie `refund`. */
export class BancontactRefundUnsupportedError extends Error {
  constructor() {
    super(
      "Bancontact refunds are not enabled for this merchant contract; refund this order manually"
    );
    this.name = "BancontactRefundUnsupportedError";
  }
}

type BancontactLink = { href: string } | null | undefined;

export type BancontactPayment = {
  paymentId: string;
  status: string;
  amount?: number;
  currency?: string;
  reference?: string | null;
  description?: string | null;
  expireAt?: string | null;
  _links?: {
    deeplink?: BancontactLink;
    qrcode?: BancontactLink;
    checkout?: BancontactLink;
    cancel?: BancontactLink;
  } | null;
};

export type BancontactGatewayConfig = {
  /** Publieke callback-URL, of null om ze weg te laten (localhost). */
  callbackUrl: () => string | null;
  /**
   * Lokale pagina die de QR en de deeplink toont. Wij hosten die zelf, want de
   * provider levert geen checkoutpagina.
   */
  hostedPageUrl: (input: CreateCheckoutInput) => string;
  /** API-sleutel; default leest BANCONTACT_API_KEY uit de env. */
  apiKey?: () => string;
  /** Basis-URL; default productie, de sandbox draait op een andere host. */
  apiBase?: () => string;
  /**
   * Of terugbetalingen via de API mogen. Staat default uit: niet elk
   * merchantcontract bevat het refund-product, en stil falen op een
   * terugbetaling is het laatste wat je wil.
   */
  refundsEnabled?: () => boolean;
};

function defaultApiKey(): string {
  const key = process.env.BANCONTACT_API_KEY?.trim();
  if (!key) throw new Error("BANCONTACT_API_KEY is not configured");
  return key;
}

function defaultApiBase(): string {
  return process.env.BANCONTACT_API_BASE?.trim() || DEFAULT_API_BASE;
}

function defaultRefundsEnabled(): boolean {
  return process.env.BANCONTACT_REFUNDS_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * De provider knipt `description` en `reference` hard af op 35 tekens. Zelf
 * inkorten is beter dan een 400 op een veld dat de koper toch niet leest.
 */
function truncate(value: string, max = 35): string {
  return value.length <= max ? value : value.slice(0, max);
}

export function mapBancontactStatus(status: string): CheckoutStatusResult["status"] {
  switch (status.toUpperCase()) {
    case "SUCCEEDED":
      return "SUCCEEDED";
    case "EXPIRED":
      return "EXPIRED";
    case "FAILED":
    case "CANCELLED":
    case "AUTHORIZATION_FAILED":
      return "FAILED";
    default:
      // PENDING, IDENTIFIED, AUTHORIZED: de koper is bezig.
      return "PENDING";
  }
}

export class BancontactPaymentGateway implements PaymentGateway {
  readonly name = "bancontact";
  private readonly config: BancontactGatewayConfig;

  constructor(config: BancontactGatewayConfig) {
    this.config = config;
  }

  private async request<T>(
    path: string,
    init: { method: string; body?: unknown } = { method: "GET" }
  ): Promise<T> {
    const base = (this.config.apiBase ?? defaultApiBase)();
    const response = await fetch(`${base}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${(this.config.apiKey ?? defaultApiKey)()}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Externe dienst: een blijven hangen socket mag nooit een request vastzetten.
      signal: AbortSignal.timeout(15_000),
    });

    const text = await response.text();
    const payload: unknown = text ? JSON.parse(text) : {};
    if (!response.ok) throw new BancontactApiError(response.status, payload);
    return payload as T;
  }

  async fetchPayment(id: string): Promise<BancontactPayment> {
    return this.request<BancontactPayment>(`/v3/payments/${encodeURIComponent(id)}`);
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const totalCents = input.lines.reduce(
      (sum, line) => sum + line.unitAmountCents * line.quantity,
      0
    );
    const callbackUrl = this.config.callbackUrl();

    const payment = await this.request<BancontactPayment>("/v3/payments", {
      method: "POST",
      body: {
        amount: totalCents,
        currency: input.currency.toUpperCase(),
        description: truncate(input.eventName),
        reference: truncate(input.orderNumber),
        returnUrl: input.successUrl,
        ...(callbackUrl ? { callbackUrl } : {}),
      },
    });

    const deeplinkUrl = payment._links?.deeplink?.href ?? payment._links?.checkout?.href ?? null;
    if (!deeplinkUrl) throw new Error("Bancontact did not return a deeplink");

    return {
      provider: this.name,
      checkoutId: payment.paymentId,
      paymentId: payment.paymentId,
      // De koper gaat naar onze eigen pagina; die toont de QR en de deeplink.
      url: this.config.hostedPageUrl(input),
      deeplinkUrl,
      qrCodeUrl: payment._links?.qrcode?.href ?? null,
      // Een net aangemaakte betaling staat open of is al rond; alles daartussen
      // bestaat hier nog niet.
      status: mapBancontactStatus(payment.status) === "SUCCEEDED" ? "SUCCEEDED" : "PENDING",
    };
  }

  async expireCheckout(checkoutId: string): Promise<void> {
    try {
      await this.request(`/v3/payments/${encodeURIComponent(checkoutId)}`, { method: "DELETE" });
    } catch (error) {
      // Al betaald, al verlopen of niet meer annuleerbaar: de provider antwoordt
      // 4xx, en dat is hier hetzelfde als niets te doen hebben.
      if (error instanceof BancontactApiError && error.status >= 400 && error.status < 500) return;
      throw error;
    }
  }

  async getCheckoutStatus(checkoutId: string): Promise<CheckoutStatusResult> {
    const payment = await this.fetchPayment(checkoutId);
    return {
      status: mapBancontactStatus(payment.status),
      checkoutId: payment.paymentId,
      paymentId: payment.paymentId,
      // De provider draagt onze eigen order-id niet; `reference` is het
      // ordernummer. De aanroeper matcht op het bedrag en op de payment-rij.
      orderId: null,
      amountCents: payment.amount ?? null,
      currency: payment.currency?.toUpperCase() ?? null,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (!(this.config.refundsEnabled ?? defaultRefundsEnabled)()) {
      throw new BancontactRefundUnsupportedError();
    }
    const refund = await this.request<{ refundId?: string; id?: string; status: string }>(
      `/v3/payments/${encodeURIComponent(input.paymentId)}/refunds`,
      {
        method: "POST",
        body: {
          amount: input.amountCents,
          currency: input.currency.toUpperCase(),
          description: truncate(input.reason || `VTK refund ${input.refundId}`),
        },
      }
    );
    const providerRefundId = refund.refundId ?? refund.id;
    if (!providerRefundId) throw new Error("Bancontact did not return a refund id");
    return { providerRefundId, status: mapBancontactStatus(refund.status) === "SUCCEEDED" ? "SUCCEEDED" : "PENDING" };
  }

  async getRefundStatus(input: {
    refundId: string;
    paymentId: string;
  }): Promise<RefundStatusResult> {
    if (!(this.config.refundsEnabled ?? defaultRefundsEnabled)()) {
      throw new BancontactRefundUnsupportedError();
    }
    const refund = await this.request<{ refundId?: string; id?: string; status: string }>(
      `/v3/payments/${encodeURIComponent(input.paymentId)}/refunds/${encodeURIComponent(input.refundId)}`
    );
    const status = mapBancontactStatus(refund.status);
    return {
      providerRefundId: refund.refundId ?? refund.id ?? input.refundId,
      status: status === "SUCCEEDED" ? "SUCCEEDED" : status === "FAILED" ? "FAILED" : "PENDING",
    };
  }

  isDefinitiveCheckoutError(error: unknown): boolean {
    return (
      error instanceof BancontactApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 429
    );
  }
}
