import { afterEach, describe, expect, it, vi } from "vitest";
import {
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

    expect(result.url).toBe("https://vtk.be/tickets/bestelling/order-1/bancontact");
    expect(result.deeplinkUrl).toBe("https://payconiq.com/pay/2/abc");
    expect(result.checkoutId).toBe("pay_1");
    expect(result.status).toBe("PENDING");
  });

  it("truncates the description to what the provider accepts", async () => {
    const spy = mockFetch(201, {
      paymentId: "pay_2",
      status: "PENDING",
      _links: { deeplink: { href: "https://payconiq.com/pay/2/def" } },
    });

    await gateway().createCheckout({
      ...CHECKOUT_INPUT,
      eventName: "Een evenement met een bijzonder lange naam die niet past",
    });

    const body = JSON.parse(String(spy.mock.calls[0]?.[1]?.body));
    expect(body.description).toHaveLength(35);
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
