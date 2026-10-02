import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractRNumber, getKulCardRelayConfig, verifyStudentCard } from "@/lib/kul-card";

/**
 * De kaartcontrole kan rechtstreeks of via de relay van de cursusdienst. Die
 * relay kent één vast protocol (zijn secret in `Authorization`, onze KU
 * Leuven-credentials in `X-Kul-Authorization`); wijkt dit bestand daarvan af,
 * dan faalt elke scan op productie en nergens anders.
 */

const ENV_KEYS = [
  "KUL_CARD_CLIENT_ID",
  "KUL_CARD_CLIENT_SECRET",
  "KUL_CARD_RELAY_URL",
  "KUL_CARD_RELAY_SECRET",
  "KUL_CARD_AUTH_ENDPOINT",
  "KUL_CARD_ID_ENDPOINT",
] as const;

const saved: Record<string, string | undefined> = {};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.KUL_CARD_CLIENT_ID = "client";
  process.env.KUL_CARD_CLIENT_SECRET = "geheim";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("extractRNumber", () => {
  it("leest userName en normaliseert naar kleine letters", () => {
    expect(extractRNumber({ userName: "R0123456" })).toBe("r0123456");
  });

  it("valt terug op een ander veld en neemt geen onzin over", () => {
    expect(extractRNumber({ userName: "jan", uid: "r0123456" })).toBe("r0123456");
    expect(extractRNumber({ userName: "jan" })).toBe("");
  });
});

describe("getKulCardRelayConfig", () => {
  it("staat uit tenzij URL en secret allebei ingevuld zijn", () => {
    expect(getKulCardRelayConfig()).toBeNull();
    process.env.KUL_CARD_RELAY_URL = "https://relay.example/";
    expect(getKulCardRelayConfig()).toBeNull();
    process.env.KUL_CARD_RELAY_SECRET = "relaygeheim";
    expect(getKulCardRelayConfig()).toEqual({ origin: "https://relay.example", secret: "relaygeheim" });
  });
});

describe("verifyStudentCard", () => {
  it("gaat rechtstreeks naar KU Leuven zonder relay", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok" }))
      .mockResolvedValueOnce(jsonResponse({ userName: "r0123456", firstName: "Jan", lastName: "Peeters" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyStudentCard("04622A02371D90;3000296783\n");

    expect(result).toEqual({ ok: true, rNumber: "r0123456", firstName: "Jan", lastName: "Peeters" });
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://idp.kuleuven.be/auth/realms/kuleuven/protocol/openid-connect/token");
    expect(tokenInit.headers.Authorization).toBe(`Basic ${Buffer.from("client:geheim").toString("base64")}`);
    const [idUrl, idInit] = fetchMock.mock.calls[1];
    expect(idUrl).toBe("https://account.kuleuven.be/api/v1/idverification");
    expect(idInit.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(idInit.body)).toEqual({ cardAppId: "3000296783", serialNr: "04622A02371D90" });
  });

  it("stuurt beide stappen via de relay met diens secret en onze credentials apart", async () => {
    process.env.KUL_CARD_RELAY_URL = "https://relay.example";
    process.env.KUL_CARD_RELAY_SECRET = "relaygeheim";
    const upstream = { "X-Kul-Relay-Upstream": "1" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok" }, { headers: upstream }))
      .mockResolvedValueOnce(jsonResponse({ userName: "r0123456" }, { headers: upstream }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyStudentCard("04622A02371D90;3000296783");

    expect(result.ok).toBe(true);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://relay.example/student-card/token");
    expect(tokenInit.headers.Authorization).toBe("Bearer relaygeheim");
    expect(tokenInit.headers["X-Kul-Authorization"]).toBe(
      `Basic ${Buffer.from("client:geheim").toString("base64")}`,
    );
    const [idUrl, idInit] = fetchMock.mock.calls[1];
    expect(idUrl).toBe("https://relay.example/student-card/idverification");
    expect(idInit.headers.Authorization).toBe("Bearer relaygeheim");
    expect(idInit.headers["X-Kul-Authorization"]).toBe("Bearer tok");
  });

  it("zegt het wanneer de relay zelf weigert, los van KU Leuven", async () => {
    process.env.KUL_CARD_RELAY_URL = "https://relay.example";
    process.env.KUL_CARD_RELAY_SECRET = "fout";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nee" }, { status: 401 })));

    expect(await verifyStudentCard("04622A02371D90;3000296783")).toEqual({
      ok: false,
      error: "KU Leuven-relay weigerde de kaartcontrole (401).",
    });
  });

  it("maakt van een netwerkfout een foutmelding in plaats van een exception", async () => {
    process.env.KUL_CARD_RELAY_URL = "https://relay.example";
    process.env.KUL_CARD_RELAY_SECRET = "relaygeheim";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    expect(await verifyStudentCard("04622A02371D90;3000296783")).toEqual({
      ok: false,
      error: "KU Leuven-relay niet bereikbaar voor de kaartcontrole.",
    });
  });
});
