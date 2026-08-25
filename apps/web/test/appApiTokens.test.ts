import { beforeEach, describe, expect, it } from "vitest";

import {
  createFakCheckinToken,
  createPassToken,
  DEFAULT_FAK_SPOT,
  verifyFakCheckinToken,
  verifyPassToken,
} from "@/lib/app-api/tokens";

/**
 * De twee codes die de app in een QR zet.
 *
 * Wat hier vastligt is niet dat het rondje werkt, maar dat de randen kloppen: een
 * verlopen pas leest anders dan een vervalste, een pas kan geen fakbar-code zijn,
 * en één bit verschil in de handtekening is genoeg om afgewezen te worden.
 */

const NOW = new Date("2026-09-15T20:00:00.000Z");

describe("de pas van een student", () => {
  beforeEach(() => {
    process.env.APP_TOKEN_SECRET = "test-secret-lang-genoeg-voor-de-productiecheck";
  });

  it("geeft de gebruiker terug binnen de geldigheid", () => {
    const token = createPassToken("user-1", new Date(NOW.getTime() + 60_000));
    expect(verifyPassToken(token, NOW)).toEqual({ ok: true, userId: "user-1" });
  });

  /**
   * Verlopen en vervalst zijn twee verschillende antwoorden. Aan een toog is dat
   * het verschil tussen "laat nog eens zien" en "dit klopt niet", en een balie
   * die beide hetzelfde ziet, stelt de verkeerde vraag.
   */
  it("scheidt verlopen van vervalst", () => {
    const expired = createPassToken("user-1", new Date(NOW.getTime() - 1_000));
    expect(verifyPassToken(expired, NOW)).toEqual({ ok: false, reason: "PASS_EXPIRED" });

    const token = createPassToken("user-1", new Date(NOW.getTime() + 60_000));
    const tampered = `${token.slice(0, -2)}xy`;
    expect(verifyPassToken(tampered, NOW)).toEqual({ ok: false, reason: "PASS_INVALID" });
  });

  it("weigert een pas die met een ander geheim getekend is", () => {
    const token = createPassToken("user-1", new Date(NOW.getTime() + 60_000));
    process.env.APP_TOKEN_SECRET = "een-heel-ander-geheim-maar-even-lang-hoor";
    expect(verifyPassToken(token, NOW)).toEqual({ ok: false, reason: "PASS_INVALID" });
  });

  /** Een geldige fakbar-code mag nooit als pas doorgaan, en omgekeerd. */
  it("wisselt niet met de fakbar-code", () => {
    expect(verifyPassToken(createFakCheckinToken(), NOW).ok).toBe(false);
    const pass = createPassToken("user-1", new Date(NOW.getTime() + 60_000));
    expect(verifyFakCheckinToken(pass)).toBeNull();
  });

  it("neemt geen gebruiker aan uit een lege of rommelige code", () => {
    for (const value of ["", "  ", "vtkpas1", "vtkpas1..", "niets", "a.b.c.d.e"]) {
      expect(verifyPassToken(value, NOW).ok).toBe(false);
    }
  });
});

describe("de code naast de kaartlezer", () => {
  beforeEach(() => {
    process.env.APP_TOKEN_SECRET = "test-secret-lang-genoeg-voor-de-productiecheck";
  });

  it("geeft de plek terug", () => {
    expect(verifyFakCheckinToken(createFakCheckinToken())).toBe(DEFAULT_FAK_SPOT);
    expect(verifyFakCheckinToken(createFakCheckinToken("terras"))).toBe("terras");
  });

  /**
   * Deze code hangt maanden aan een muur en verloopt bewust niet. Dat is geen
   * vergetelheid: wat een gestolen foto onbruikbaar maakt, is de check-in zelf,
   * die enkel telt wanneer 't ElixIr open gemeten wordt. Zie de route.
   */
  it("verloopt niet", () => {
    const token = createFakCheckinToken();
    expect(verifyFakCheckinToken(token)).toBe(DEFAULT_FAK_SPOT);
    expect(token.split(".")).toHaveLength(3);
  });

  it("weigert een vervalste code", () => {
    const token = createFakCheckinToken();
    expect(verifyFakCheckinToken(`${token.slice(0, -1)}Z`)).toBeNull();
    expect(verifyFakCheckinToken("vtkfak1.toog.nep")).toBeNull();
  });
});
