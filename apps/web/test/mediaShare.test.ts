import { describe, expect, it } from "vitest";
import { isLinkPreviewAgent, isShareToken, nextWorkingYearCutover, shareExpiry } from "@/lib/media-share-shared";
import { createShareToken, hashShareToken } from "@/lib/media-share-token";

/**
 * De regels van een privélink naar een album die geen databank nodig hebben:
 * de vorm van het token, tot wanneer een link werkt, en wat niet als geopend
 * telt. Zie docs/immich-gallery.md, "Een album delen met een link".
 */

describe("privélinks: het token", () => {
  it("is altijd 43 tekens base64url, en wordt dan herkend", () => {
    for (let i = 0; i < 20; i += 1) {
      const token = createShareToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(isShareToken(token)).toBe(true);
    }
  });

  it("weigert wat er niet zo uitziet, zodat de databank er niet aan te pas komt", () => {
    expect(isShareToken("")).toBe(false);
    expect(isShareToken("kort")).toBe(false);
    expect(isShareToken(`${"a".repeat(42)}!`)).toBe(false);
    expect(isShareToken("a".repeat(44))).toBe(false);
    expect(isShareToken(`${"a".repeat(42)}/`)).toBe(false);
  });

  it("zoekt op een hash, nooit op het token zelf", () => {
    const token = createShareToken();
    expect(hashShareToken(token)).toBe(hashShareToken(token));
    expect(hashShareToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(token)).not.toContain(token);
    expect(hashShareToken(createShareToken())).not.toBe(hashShareToken(token));
  });
});

describe("privélinks: tot wanneer een link werkt", () => {
  // Zondag 15 november 2026, 12:00 in Brussel.
  const november = new Date("2026-11-15T11:00:00Z");

  it("het werkingsjaar wisselt op 15 juli om middernacht in Brussel", () => {
    expect(nextWorkingYearCutover(november).toISOString()).toBe("2027-07-14T22:00:00.000Z");
    // Op 15 juli zelf is het al het nieuwe jaar, zoals `currentWorkingYear` rekent.
    expect(nextWorkingYearCutover(new Date("2027-07-15T08:00:00Z")).toISOString()).toBe("2028-07-14T22:00:00.000Z");
    // 14 juli om 23:30 in Brussel is nog het oude jaar.
    expect(nextWorkingYearCutover(new Date("2027-07-14T21:30:00Z")).toISOString()).toBe("2027-07-14T22:00:00.000Z");
  });

  it("een week, een maand, drie maanden of tot 15 juli", () => {
    expect(shareExpiry("week", november).toISOString()).toBe("2026-11-22T11:00:00.000Z");
    expect(shareExpiry("month", november).toISOString()).toBe("2026-12-15T11:00:00.000Z");
    expect(shareExpiry("quarter", november).toISOString()).toBe("2027-02-15T11:00:00.000Z");
    expect(shareExpiry("year", november).toISOString()).toBe("2027-07-14T22:00:00.000Z");
  });

  it("loopt nooit voorbij 15 juli, ook niet wie in juni een maand kiest", () => {
    const june = new Date("2027-06-20T10:00:00Z");
    expect(shareExpiry("month", june).toISOString()).toBe("2027-07-14T22:00:00.000Z");
    expect(shareExpiry("quarter", june).toISOString()).toBe("2027-07-14T22:00:00.000Z");
    expect(shareExpiry("week", june).toISOString()).toBe("2027-06-27T10:00:00.000Z");
  });

  it("31 januari plus een maand is de laatste dag van februari, niet 3 maart", () => {
    expect(shareExpiry("month", new Date("2027-01-31T10:00:00Z")).toISOString()).toBe("2027-02-28T10:00:00.000Z");
  });
});

describe("privélinks: wat niet als geopend telt", () => {
  it("een linkvoorbeeld van een chatdienst, en een bezoek zonder user-agent", () => {
    expect(isLinkPreviewAgent("WhatsApp/2.23.20.0 A")).toBe(true);
    expect(isLinkPreviewAgent("Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)")).toBe(true);
    expect(isLinkPreviewAgent("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(isLinkPreviewAgent("TelegramBot (like TwitterBot)")).toBe(true);
    expect(isLinkPreviewAgent(null)).toBe(true);
  });

  it("een gewone browser wel", () => {
    expect(
      isLinkPreviewAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
    expect(
      isLinkPreviewAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });
});
