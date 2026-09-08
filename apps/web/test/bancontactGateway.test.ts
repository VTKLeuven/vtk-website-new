import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BancontactApiError,
  BancontactPaymentGateway,
  BancontactRefundUnsupportedError,
  mapBancontactStatus,
} from "@vtk/payments";

function gateway(overrides: { refundsEnabled?: boolean } = {}) {
  return new BancontactPaymentGateway({
    callbackUrl: () => "https://vtk.be/api/tickets/bancontact/webhook",
    hostedPageUrl: (input) => `https://vtk.be/tickets/bestelling/${input.orderId}/bancontact`,
    apiKey: () => "test-key",
    apiBase: () => "https://api.test.local",
    refundsEnabled: () => overrides.refundsEnabled ?? false,
  });
}

const CHECKOUT_INPUT = {
  orderId: "order-1",
  orderNumber: "VTK-0001",
  buyerEmail: "student@vtk.be",
  eventName: "Galabal",
  currency: "eur",
  lines: [
    { name: "Standaard", quantity: 2, unitAmountCents: 1500 },
    { name: "Steun", quantity: 1, unitAmountCents: 500 },
  ],
  expiresAt: new Date("2026-09-07T20:00:00Z"),
  successUrl: "https://vtk.be/tickets/bestelling/order-1?payment=return",
  cancelUrl: "https://vtk.be/tickets/bestelling/order-1?payment=cancelled",
  attempt: 1,
};

function mockFetch(status: number, payload: unknown) {
  // Getypeerd zodat `spy.mock.calls[0][1].body` bestaat, zonder de argumenten
  // hier te moeten benoemen en dan ongebruikt te laten.
  const spy = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      })
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapBancontactStatus", () => {
  it("treats the in-progress states as pending", () => {
    for (const status of ["PENDING", "IDENTIFIED", "AUTHORIZED"]) {
      expect(mapBancontactStatus(status)).toBe("PENDING");
    }
  });

  it("separates a failed authorisation from an expiry", () => {
    expect(mapBancontactStatus("AUTHORIZATION_FAILED")).toBe("FAILED");
    expect(mapBancontactStatus("CANCELLED")).toBe("FAILED");
    expect(mapBancontactStatus("EXPIRED")).toBe("EXPIRED");
    expect(mapBancontactStatus("SUCCEEDED")).toBe("SUCCEEDED");
  });
});

describe("BancontactPaymentGateway.createCheckout", () => {
  it("sends the order total in whole cents and returns our own hosted page", async () => {
    const spy = mockFetch(201, {
      paymentId: "pay_1",
      status: "PENDING",
      _links: {
        deeplink: { href: "https://payconiq.com/pay/2/abc" },
        qrcode: { href: "https://portal.payconiq.com/qrcode?c=abc" },
      },
    });

    const result = await gateway().createCheckout(CHECKOUT_INPUT);

    const body = JSON.parse(String(spy.mock.calls[0]?.[1]?.body));
    // 2x 1500 + 1x 500, als geheel getal en niet als decimale string.
    expect(body.amount).toBe(3500);
    expect(body.currency).toBe("EUR");
    expect(body.reference).toBe("VTK-0001");
    // Het aanmaakverzoek kent geen returnUrl; zie de kop van bancontact.ts.
    expect(body).not.toHaveProperty("returnUrl");
    expect(body.callbackUrl).toBe("https://vtk.be/api/tickets/bancontact/webhook");

    expect(result.url).toBe("https://vtk.be/tickets/bestelling/order-1/bancontact");
    expect(result.deeplinkUrl).toBe("https://payconiq.com/pay/2/abc");
    expect(result.checkoutId).toBe("pay_1");
    expect(result.status).toBe("PENDING");
  });

  it("truncates the description and the reference to their own limits", async () => {
    const spy = mockFetch(201, {
      paymentId: "pay_2",
      status: "PENDING",
      _links: { deeplink: { href: "https://payconiq.com/pay/2/def" } },
    });

    await gateway().createCheckout({
      ...CHECKOUT_INPUT,
      eventName: "E".repeat(200),
      orderNumber: "R".repeat(50),
    });

    const body = JSON.parse(String(spy.mock.calls[0]?.[1]?.body));
    // Twee verschillende grenzen: de omschrijving mag 140, de referentie 35.
    expect(body.description).toHaveLength(140);
    expect(body.reference).toHaveLength(35);
  });

  it("leaves out a callback URL that is not https, instead of failing the payment", async () => {
    const spy = mockFetch(201, {
      paymentId: "pay_4",
      status: "PENDING",
      _links: { deeplink: { href: "https://payconiq.com/pay/2/ghi" } },
    });

    const bancontact = new BancontactPaymentGateway({
      callbackUrl: () => "http://dev.vtk.be/api/tickets/bancontact/webhook",
      hostedPageUrl: (input) => `https://vtk.be/tickets/bestelling/${input.orderId}/bancontact`,
      apiKey: () => "test-key",
      apiBase: () => "https://api.test.local",
    });
    await bancontact.createCheckout(CHECKOUT_INPUT);

    const body = JSON.parse(String(spy.mock.calls[0]?.[1]?.body));
    expect(body).not.toHaveProperty("callbackUrl");
  });

  it("refuses an amount outside the contract before sending anything", async () => {
    const bancontact = gateway();
    const spy = mockFetch(201, {});
    const error = await bancontact
      .createCheckout({
        ...CHECKOUT_INPUT,
        lines: [{ name: "Weekendpas", quantity: 1, unitAmountCents: 1_000_000 }],
      })
      .catch((thrown) => thrown);

    expect(spy).not.toHaveBeenCalled();
    // Definitief: dezelfde bestelling nog twee keer sturen verandert niets.
    expect(bancontact.isDefinitiveCheckoutError(error)).toBe(true);
  });

  it("takes the expiry from the provider, because it is shorter than our reservation", async () => {
    mockFetch(201, {
      paymentId: "pay_5",
      status: "PENDING",
      // Twee minuten, terwijl de reservatie in CHECKOUT_INPUT tot 20:00 loopt.
      expiresAt: "2026-09-07T19:32:00.000Z",
      _links: { deeplink: { href: "https://payconiq.com/pay/2/jkl" } },
    });

    const result = await gateway().createCheckout(CHECKOUT_INPUT);

    expect(result.expiresAt?.toISOString()).toBe("2026-09-07T19:32:00.000Z");
  });

  it("leaves the expiry empty when the provider does not give one", async () => {
    mockFetch(201, {
      paymentId: "pay_6",
      status: "PENDING",
      _links: { deeplink: { href: "https://payconiq.com/pay/2/mno" } },
    });

    const result = await gateway().createCheckout(CHECKOUT_INPUT);

    expect(result.expiresAt).toBeNull();
  });

  it("strips a pasted endpoint path from the API base", async () => {
    const spy = mockFetch(201, {
      paymentId: "pay_7",
      status: "PENDING",
      _links: { deeplink: { href: "https://payconiq.com/pay/2/pqr" } },
    });

    const bancontact = new BancontactPaymentGateway({
      callbackUrl: () => null,
      hostedPageUrl: (input) => `https://vtk.be/tickets/bestelling/${input.orderId}/bancontact`,
      apiKey: () => "test-key",
      // Wat iemand uit de documentatie plakt. Zonder normaliseren wordt dit
      // /v3/v3/payments, en dat antwoordt de gateway met een 401.
      apiBase: () => "https://api.ext.payconiq.com/v3/payments/",
    });
    await bancontact.createCheckout(CHECKOUT_INPUT);

    expect(spy.mock.calls[0]?.[0]).toBe("https://api.ext.payconiq.com/v3/payments");
  });

  it("refuses a response without a deeplink instead of returning a dead page", async () => {
    mockFetch(201, { paymentId: "pay_3", status: "PENDING", _links: {} });
    await expect(gateway().createCheckout(CHECKOUT_INPUT)).rejects.toThrow(/deeplink/);
  });
});

describe("BancontactPaymentGateway error handling", () => {
  it("treats a 4xx as definitive but a 429 as retryable", async () => {
    const bancontact = gateway();
    mockFetch(422, { message: "Invalid amount" });
    const definitive = await bancontact.createCheckout(CHECKOUT_INPUT).catch((error) => error);
    expect(bancontact.isDefinitiveCheckoutError(definitive)).toBe(true);

    mockFetch(429, { message: "Too many requests" });
    const throttled = await bancontact.createCheckout(CHECKOUT_INPUT).catch((error) => error);
    expect(bancontact.isDefinitiveCheckoutError(throttled)).toBe(false);
  });

  it("keeps the provider's code and traceId in the error, not just its message", async () => {
    mockFetch(400, {
      traceId: "b2586833395d4750",
      spanId: "c235e54376fab4b9",
      code: "FIELD_IS_INVALID",
      message: "Field 'callbackUrl' is invalid",
    });

    const error = await gateway().createCheckout(CHECKOUT_INPUT).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(BancontactApiError);
    expect(error.code).toBe("FIELD_IS_INVALID");
    expect(error.traceId).toBe("b2586833395d4750");
    // De logregel moet op zichzelf bruikbaar zijn voor hun support.
    expect(error.message).toContain("FIELD_IS_INVALID");
    expect(error.message).toContain("b2586833395d4750");
    expect(error.message).toContain("callbackUrl");
  });

  it("reports a non-JSON error body as a provider error, not as broken JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html><body>404 Not Found</body></html>", {
            status: 404,
            headers: { "Content-Type": "text/html" },
          })
      )
    );

    const error = await gateway().createCheckout(CHECKOUT_INPUT).catch((thrown) => thrown);

    // Blind parsen gaf hier een SyntaxError, en die leest de checkout-route als
    // een stukke JSON-body van de koper (INVALID_JSON, 400).
    expect(error).toBeInstanceOf(BancontactApiError);
    expect(error).not.toBeInstanceOf(SyntaxError);
    expect(error.status).toBe(404);
  });

  it("swallows a 4xx on expiry, because an already-settled payment is a no-op", async () => {
    mockFetch(409, { message: "Payment is not cancelable" });
    await expect(gateway().expireCheckout("pay_1")).resolves.toBeUndefined();
  });

  it("refuses to refund when the contract does not include refunds", async () => {
    const spy = mockFetch(200, {});
    await expect(
      gateway().refund({
        paymentId: "pay_1",
        amountCents: 1000,
        currency: "EUR",
        orderId: "order-1",
        refundId: "refund-1",
      })
    ).rejects.toBeInstanceOf(BancontactRefundUnsupportedError);
    // Belangrijk: er vertrekt dan ook geen request die stil zou kunnen slagen.
    expect(spy).not.toHaveBeenCalled();
  });
});
