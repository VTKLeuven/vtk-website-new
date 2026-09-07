import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadModules(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const config = await import("@/lib/ticketing/config");
  const methods = await import("@/lib/ticketing/paymentMethods");
  return { ...config, ...methods };
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("enabledPaymentMethods", () => {
  it("falls back to the single configured provider", async () => {
    const { enabledPaymentMethods } = await loadModules({
      TICKETING_PAYMENT_METHODS: undefined,
      TICKETING_PAYMENT_PROVIDER: "mollie",
    });
    expect(enabledPaymentMethods()).toEqual(["mollie"]);
  });

  it("reads the configured list in order and drops duplicates", async () => {
    const { enabledPaymentMethods } = await loadModules({
      TICKETING_PAYMENT_METHODS: "bancontact, mollie ,bancontact",
    });
    expect(enabledPaymentMethods()).toEqual(["bancontact", "mollie"]);
  });

  it("rejects an unknown method rather than silently ignoring it", async () => {
    const { enabledPaymentMethods } = await loadModules({
      TICKETING_PAYMENT_METHODS: "bancontact,visa",
    });
    expect(() => enabledPaymentMethods()).toThrow(/unknown method: visa/);
  });
});

describe("paymentMethodChoice", () => {
  it("shows no choice when only one method is configured", async () => {
    const { paymentMethodChoice } = await loadModules({
      TICKETING_PAYMENT_METHODS: "mollie",
    });
    expect(paymentMethodChoice("nl").variant).toBe("single");
    expect(paymentMethodChoice("en").variant).toBe("single");
  });

  it("shows only Bancontact on the Dutch page, with the rest behind a click", async () => {
    const { paymentMethodChoice } = await loadModules({
      TICKETING_PAYMENT_METHODS: "mollie,bancontact",
    });
    const choice = paymentMethodChoice("nl");
    expect(choice.variant).toBe("collapsed");
    // Bancontact staat voorop; Mollie zit er wel bij, maar achter "meer".
    expect(choice.options.map((o) => o.provider)).toEqual(["bancontact", "mollie"]);
  });

  it("shows Mollie and Bancontact together on the English page", async () => {
    const { paymentMethodChoice } = await loadModules({
      TICKETING_PAYMENT_METHODS: "bancontact,mollie",
    });
    const choice = paymentMethodChoice("en");
    // `equal`, dus niets zit verstopt achter een klik: een internationale
    // student mag Mollie niet moeten zoeken.
    expect(choice.variant).toBe("equal");
    expect(choice.options.map((o) => o.provider)).toEqual(["mollie", "bancontact"]);
  });

  it("keeps every method reachable in both languages", async () => {
    const { paymentMethodChoice } = await loadModules({
      TICKETING_PAYMENT_METHODS: "bancontact,mollie",
    });
    for (const locale of ["nl", "en"] as const) {
      expect(paymentMethodChoice(locale).options.map((o) => o.provider).sort()).toEqual([
        "bancontact",
        "mollie",
      ]);
    }
  });
});
