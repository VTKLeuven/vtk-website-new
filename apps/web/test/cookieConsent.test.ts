import { describe, expect, it } from "vitest";
import { hidesCookieBanner, parseCookieConsent } from "@/lib/cookie-consent";

describe("Cookiekeuze", () => {
  it("aanvaardt enkel de twee bekende keuzes", () => {
    expect(parseCookieConsent("analytics")).toBe("analytics");
    expect(parseCookieConsent("essential")).toBe("essential");
    expect(parseCookieConsent("ja")).toBeNull();
    expect(parseCookieConsent(undefined)).toBeNull();
  });
});

describe("Paden zonder cookiebanner", () => {
  it("verbergt de banner op de linkpagina", () => {
    expect(hidesCookieBanner("/links")).toBe(true);
    expect(hidesCookieBanner("/links/")).toBe(true);
    expect(hidesCookieBanner("/links?utm_source=instagram")).toBe(true);
    // Verdediging tegen later: mocht de pagina ooit onder een taalvoorvoegsel
    // komen te staan, dan blijft de banner ook daar weg.
    expect(hidesCookieBanner("/en/links")).toBe(true);
  });

  it("toont de banner overal anders, ook op paden die ermee beginnen", () => {
    expect(hidesCookieBanner("/")).toBe(false);
    expect(hidesCookieBanner("/tickets")).toBe(false);
    expect(hidesCookieBanner("/admin/links")).toBe(false);
    expect(hidesCookieBanner("/links-en-meer")).toBe(false);
    expect(hidesCookieBanner(null)).toBe(false);
  });
});
