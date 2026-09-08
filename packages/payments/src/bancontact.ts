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
 * Bancontact Company.
 *
 * **De API is mee verhuisd, en dat is een val.** De oude payconiq-host leeft
 * nog en antwoordt netjes, maar hij kent de sleutels van een Bancontact
 * Pro-contract niet: je krijgt er `401 UNAUTHORIZED` op, met exact dezelfde
 * body als wanneer je helemaal geen sleutel meestuurt. Dat leest als een
 * ongeldige sleutel terwijl er niets mis is met de sleutel. De documentatie op
 * developer.payconiq.com beschrijft nog die oude host; docs.bancontactpro.com
 * is de huidige. Wij stonden hier een tijd op `https://api.payconiq.com`, en
 * daar is een avond in gekropen.
 *
 * Dit is bewust een **andere** betaalwijze dan Bancontact-via-Mollie, en niet
 * dezelfde betaling langs een andere weg. Bancontact Company is een scheme en
 * geen acquirer: de kaartbetaling (kaartnummer intikken) kan enkel via een PSP,
 * maar de app-betaling kan rechtstreeks met een eigen merchantcontract en een
 * API-sleutel. Wat de koper hier krijgt is dus een QR of een sprong naar de
 * Bancontact-app, nooit een kaartformulier.
 *
 * Drie gevolgen die de rest van de code voelt:
 *
 * 1. Er is **geen gehoste checkoutpagina**. De provider geeft een deeplink en
 *    een QR terug; de pagina eromheen is van ons. `createCheckout` geeft daarom
 *    de deeplink terug in `deeplinkUrl` en laat de aanroeper bepalen welke
 *    lokale URL de koper te zien krijgt.
 * 2. Bedragen zijn hier gehele centen, niet Mollie's decimale string.
 * 3. `returnUrl` bestaat, maar is niet de weg terug waarop we rekenen. Hij
 *    geldt voor de betaalpagina van de provider zelf (`_links.checkout`), en
 *    wij tonen onze eigen pagina met de QR. Wie in zijn app betaalt, komt daar
 *    sowieso niet langs, dus de pagina pollt de bestelstatus. We sturen hem wel
 *    mee: wie via de checkout-link binnenkomt, hoort na het betalen bij zijn
 *    bestelling uit te komen en niet nergens.
 *
 * De grenzen hieronder staan in dat contract en worden hier lokaal afgedwongen.
 * Een verzoek dat de provider toch zou weigeren, weigeren we liever zelf met
 * een leesbare fout: aan hun kant wordt het een 400 die bij de koper als een
 * algemene "betaalpagina niet bereikbaar" eindigt. Alles wat provider-specifiek
 * is, staat bewust in dit ene bestand; klopt er iets niet aan je eigen
 * merchantcontract, dan is dit de enige plaats die verandert.
 */

/**
 * Productie. De preprod-omgeving draait op
 * `https://merchant.api.preprod.bancontact.net` en zet je via
 * `BANCONTACT_API_BASE`. Niet te verwarren met `api.payconiq.com`: zie de kop.
 */
const DEFAULT_API_BASE = "https://merchant.api.bancontact.net";

/**
 * De grenzen van het aanmaakverzoek, nagemeten tegen de echte API.
 *
 * `description` mag 140 tekens; enkel de eerste 35 daarvan belanden in de
 * mededeling op het rekeninguittreksel. `reference` is wel hard 35. Die twee
 * stonden hier ooit allebei op 35, waardoor de omschrijving die de koper in
 * zijn app ziet nodeloos afgekapt werd.
 *
 * Er staat bewust **geen bovengrens op het bedrag**. De oude payconiq-spec
 * noemde 999999 cent, maar deze API aanvaardt meer (nagegaan met een betaling
 * van 10.000 euro, daarna geannuleerd). Zo'n grens hier hardcoderen zou een
 * grote bestelling tegenhouden die de provider wel aanvaardt, en dat is erger
 * dan een 400 die nu netjes gelogd wordt.
 */
const MAX_DESCRIPTION = 140;
const MAX_REFERENCE = 35;
const MIN_AMOUNT_CENTS = 1;

export class BancontactApiError extends Error {
  readonly status: number;
  readonly detail: unknown;
  /** Foutcode van de provider (`FIELD_IS_INVALID`, `ACCESS_DENIED`, ...), of null. */
  readonly code: string | null;
  /** Het spoor dat de support van de provider vraagt, of null. */
  readonly traceId: string | null;

  constructor(status: number, detail: unknown) {
    const body =
      detail && typeof detail === "object" ? (detail as Record<string, unknown>) : {};
    const code = typeof body.code === "string" ? body.code : null;
    const traceId = typeof body.traceId === "string" ? body.traceId : null;
    const message =
      typeof body.message === "string"
        ? body.message
        : typeof detail === "string" && detail.trim()
          ? detail.trim().slice(0, 300)
          : `HTTP ${status}`;
    // Alles wat de provider zegt in één regel. Enkel `message` overnemen liet
    // net de twee dingen vallen waarmee je verder kan: de code zegt wát er mis
    // is, en de traceId is wat hun support als eerste vraagt.
    super(
      [
        `Bancontact API error (${status})`,
        code ? `[${code}]` : null,
        message,
        traceId ? `(traceId ${traceId})` : null,
      ]
        .filter(Boolean)
        .join(" ")
    );
    this.name = "BancontactApiError";
    this.status = status;
    this.detail = detail;
    this.code = code;
    this.traceId = traceId;
  }
}

/**
 * Een verzoek dat wij zelf al afkeuren, voor het vertrekt.
 *
 * Apart van `BancontactApiError`, want dit is geen antwoord van de provider maar
 * onze eigen vaststelling dat het er geen zin heeft heen te sturen. Het telt wel
 * als definitief: dezelfde gegevens nog twee keer sturen verandert niets.
 */
export class BancontactRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BancontactRequestError";
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
  expiresAt?: string | null;
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

/**
 * De basis-URL zoals de paden hieronder ze verwachten: enkel het adres, zonder
 * afsluitende slash en zonder versie.
 *
 * `BANCONTACT_API_BASE` wordt met de hand ingevuld, en wat er in de
 * documentatie staat is de volledige URL van het endpoint
 * (`https://api.ext.payconiq.com/v3/payments`). Wie die plakt, krijgt
 * `/v3/v3/payments` of een dubbele slash, en de gateway antwoordt daarop met een
 * 401 voordat er ooit naar de betaling gekeken wordt. Dat leest als een
 * verkeerde sleutel terwijl er niets mis is met de sleutel.
 */
function normalizeApiBase(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  const normalized = trimmed.replace(/\/v3(\/payments)?$/, "");
  if (normalized !== base.trim()) {
    console.warn("Bancontact API base was normalised", { configured: base, used: normalized });
  }
  return normalized;
}

function defaultRefundsEnabled(): boolean {
  return process.env.BANCONTACT_REFUNDS_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Zelf inkorten is beter dan een 400 op een veld dat de koper toch niet leest.
 * De grenzen staan bij `MAX_DESCRIPTION` en `MAX_REFERENCE`.
 */
function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * Wat er van een tekst overblijft binnen de SEPA-tekenset.
 *
 * Een eventnaam wordt door een lid ingetikt en kan alles bevatten. Een emoji of
 * een ampersand in de omschrijving laat de provider de hele betaling weigeren
 * (`FIELD_IS_INVALID`), en dan kan er voor dat evenement niets meer betaald
 * worden. Liever een mededeling zonder dat teken dan geen verkoop.
 */
function sepaSafe(value: string): string {
  return value
    .replace(/[^A-Za-z0-9\u00C0-\u00FF /?:().,'+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * De mededeling die de koper in zijn betaalapp ziet, en die daarna op zijn
 * rekeninguittreksel belandt.
 *
 * De app zet er zelf al een betaalcode en onze bestelreferentie voor
 * (`PQ DqWk7u VTK-26-327079785D ...`), dus wat hier staat moet zeggen **wat** er
 * gekocht wordt. Enkel de eerste 35 tekens halen de mededeling op het
 * uittreksel, en daarom staat het aantal vooraan: "2 tickets Galabal van de
 * Ingenieur" past daar nog net volledig in en zegt maanden later nog iets, waar
 * de kale eventnaam dat niet doet.
 *
 * Het woord "tickets" werkt in beide talen, dus deze tekst heeft de taal van de
 * koper niet nodig; de eventnaam is al vertaald door de aanroeper.
 */
function paymentDescription(eventName: string, ticketCount: number): string {
  const count = ticketCount === 1 ? "1 ticket" : `${ticketCount} tickets`;
  return truncate(sepaSafe(`${count} ${eventName}`), MAX_DESCRIPTION);
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
    const base = normalizeApiBase((this.config.apiBase ?? defaultApiBase)());
    const response = await fetch(`${base}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${(this.config.apiKey ?? defaultApiKey)()}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Externe dienst: een blijven hangen socket mag nooit een request vastzetten.
      signal: AbortSignal.timeout(15_000),
    });

    // Niet elk antwoord is JSON: een proxy, een WAF of een verkeerde
    // BANCONTACT_API_BASE geeft HTML of niets terug. Blind parsen gooide dan een
    // `SyntaxError`, en de routes hierboven lezen die als een stukke JSON-body
    // van de koper (`INVALID_JSON`, 400). Een providerfout mag nooit als een
    // fout van de koper eindigen, dus parsen we pas na de statuscontrole.
    const text = await response.text();
    let payload: unknown = {};
    let parsed = true;
    try {
      if (text) payload = JSON.parse(text);
    } catch {
      parsed = false;
      payload = text;
    }
    if (!response.ok) throw new BancontactApiError(response.status, payload);
    if (!parsed) {
      throw new Error(
        `Bancontact returned a non-JSON body for ${init.method} ${path}: ${text.slice(0, 300)}`
      );
    }
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
    const ticketCount = input.lines.reduce((count, line) => count + line.quantity, 0);
    if (!Number.isInteger(totalCents) || totalCents < MIN_AMOUNT_CENTS) {
      throw new BancontactRequestError(
        `Bancontact needs a whole amount of at least ${MIN_AMOUNT_CENTS} cent, not ${totalCents}`
      );
    }
    const currency = input.currency.toUpperCase();
    if (currency !== "EUR") {
      throw new BancontactRequestError(`Bancontact only settles in EUR, not ${currency}`);
    }

    // Adressen moeten https zijn, en de provider weigert de hele betaling als
    // er een http-adres in staat ("FIELD_IS_INVALID: Field returnUrl is
    // invalid"). Dat is geen half werkende terugkeer maar geen betaling, dus
    // laten we ze liever weg. Op een laptop draait alles op http://localhost,
    // en zonder deze regel is Bancontact daar dus helemaal niet uit te
    // proberen. De verzoening (`lib/ticketing/reconciliation.ts`) is het
    // vangnet voor de callback die dan ontbreekt.
    const httpsOnly = (url: string | null): string | null =>
      url && url.startsWith("https://") ? url : null;

    const configuredCallbackUrl = this.config.callbackUrl();
    const callbackUrl = httpsOnly(configuredCallbackUrl);
    if (configuredCallbackUrl && !callbackUrl) {
      console.warn("Bancontact callback URL is not https and was left out", {
        callbackUrl: configuredCallbackUrl,
      });
    }
    const returnUrl = httpsOnly(input.successUrl);

    let payment: BancontactPayment;
    try {
      payment = await this.request<BancontactPayment>("/v3/payments", {
        method: "POST",
        body: {
          amount: totalCents,
          currency,
          description: paymentDescription(input.eventName, ticketCount),
          reference: truncate(input.orderNumber, MAX_REFERENCE),
          ...(returnUrl ? { returnUrl } : {}),
          ...(callbackUrl ? { callbackUrl } : {}),
        },
      });
    } catch (error) {
      // Een 401 of 403 is niet één mislukte betaling maar een stuk configuratie:
      // elke koper loopt erop vast, en aan de bestelling is niets mis. Dat hoort
      // in de logs te staan als zoiets, want de melding bij de koper ("de
      // betaalpagina is tijdelijk niet bereikbaar") suggereert het tegendeel.
      if (error instanceof BancontactApiError && (error.status === 401 || error.status === 403)) {
        console.error(
          "Bancontact refuses the API key. This is configuration, not a failing payment. " +
            "Check the host first: a Bancontact Pro key authenticates on " +
            "https://merchant.api.bancontact.net (preprod: " +
            "https://merchant.api.preprod.bancontact.net) and NOT on the older " +
            "api.payconiq.com, which answers 401 for these keys. Then check that the key " +
            "carries the MERCHANT_PAYMENT authority for this payment profile.",
          {
            status: error.status,
            code: error.code,
            apiBase: normalizeApiBase((this.config.apiBase ?? defaultApiBase)()),
          }
        );
      }
      throw error;
    }

    const deeplinkUrl = payment._links?.deeplink?.href ?? payment._links?.checkout?.href ?? null;
    if (!deeplinkUrl) throw new Error("Bancontact did not return a deeplink");

    // Wanneer deze betaling vervalt, zegt de provider zelf; dat is korter dan
    // onze reservatie en het hangt aan het merchantcontract, dus we nemen het
    // over in plaats van een eigen getal te kiezen. Zie de betaalpagina, die
    // erop terugvalt om geen dode QR te blijven tonen.
    const providerExpiresAt = payment.expiresAt ? new Date(payment.expiresAt) : null;

    return {
      provider: this.name,
      checkoutId: payment.paymentId,
      paymentId: payment.paymentId,
      // De koper gaat naar onze eigen pagina; die toont de QR en de deeplink.
      url: this.config.hostedPageUrl(input),
      deeplinkUrl,
      qrCodeUrl: payment._links?.qrcode?.href ?? null,
      expiresAt:
        providerExpiresAt && !Number.isNaN(providerExpiresAt.getTime()) ? providerExpiresAt : null,
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
          description: truncate(input.reason || `VTK refund ${input.refundId}`, MAX_DESCRIPTION),
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
    // Wat wij zelf afkeuren, wordt niet beter van een tweede poging.
    if (error instanceof BancontactRequestError) return true;
    return (
      error instanceof BancontactApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 429
    );
  }
}
