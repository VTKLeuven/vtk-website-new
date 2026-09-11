import { describe, expect, it } from "vitest";
import {
  interpolateName,
  pickInitialSloganIndex,
  readSlogansSetting,
  resolveDisplaySlogans,
  DEFAULT_SLOGANS_CONFIG,
  DEFAULT_PERSONAL_SLOGAN,
  type SlogansConfig,
} from "@/lib/slogans";

describe("slogans", () => {
  describe("interpolateName", () => {
    it("replaces {firstName} and {name} correctly", () => {
      expect(
        interpolateName("Welkom terug, {firstName}!", "Jan Peeters", "Jan"),
      ).toBe("Welkom terug, Jan!");
      expect(
        interpolateName("Hallo {name}, jij bent top", "Jan Peeters", "Jan"),
      ).toBe("Hallo Jan Peeters, jij bent top");
      expect(
        interpolateName("{firstName} ({name})", "Marie Dupont", "Marie"),
      ).toBe("Marie (Marie Dupont)");
    });

    it("handles null or empty templates", () => {
      expect(interpolateName("", "Jan", "Jan")).toBe("");
      expect(interpolateName(null, "Jan", "Jan")).toBe("");
      expect(interpolateName(undefined, "Jan", "Jan")).toBe("");
    });

    it("falls back gracefully when user name is missing", () => {
      expect(interpolateName("Welkom, {firstName}!", null, null)).toBe(
        "Welkom, {firstName}!",
      );
      expect(interpolateName("Welkom, {name}!", null, "Jan")).toBe(
        "Welkom, Jan!",
      );
    });
  });

  describe("readSlogansSetting", () => {
    it("falls back to default config on null or non-object", () => {
      expect(readSlogansSetting(null)).toEqual(DEFAULT_SLOGANS_CONFIG);
      expect(readSlogansSetting(undefined)).toEqual(DEFAULT_SLOGANS_CONFIG);
      expect(readSlogansSetting("invalid")).toEqual(DEFAULT_SLOGANS_CONFIG);
      expect(readSlogansSetting([])).toEqual(DEFAULT_SLOGANS_CONFIG);
    });

    it("parses valid config correctly", () => {
      const input = {
        items: [
          {
            id: "s1",
            titleNl: "Ingenieurs zijn",
            accentNl: "superieur.",
            tailNl: "Altijd.",
            titleEn: "Engineers are",
            accentEn: "superior.",
            tailEn: "Always.",
          },
        ],
        personal: {
          enabled: true,
          titleNl: "Dag,",
          accentNl: "{firstName}!",
        },
        intervalSeconds: 12,
        randomizeOnReload: false,
      };

      const result = readSlogansSetting(input);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("s1");
      expect(result.items[0].titleNl).toBe("Ingenieurs zijn");
      expect(result.items[0].accentNl).toBe("superieur.");
      expect(result.items[0].tailNl).toBe("Altijd.");
      expect(result.personal?.enabled).toBe(true);
      expect(result.personal?.accentNl).toBe("{firstName}!");
      expect(result.intervalSeconds).toBe(12);
      expect(result.randomizeOnReload).toBe(false);
    });

    it("clamps intervalSeconds between 0 and 60", () => {
      expect(readSlogansSetting({ intervalSeconds: 999 }).intervalSeconds).toBe(
        60,
      );
      expect(readSlogansSetting({ intervalSeconds: -5 }).intervalSeconds).toBe(
        0,
      );
    });

    it("filters out completely empty slogan items", () => {
      const input = {
        items: [
          { id: "empty", titleNl: "   ", accentNl: "" },
          { id: "valid", titleNl: "Geldig", accentNl: "accent" },
        ],
      };
      const result = readSlogansSetting(input);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("valid");
    });
  });

  describe("resolveDisplaySlogans", () => {
    const sampleConfig: SlogansConfig = {
      items: [
        {
          id: "item-1",
          titleNl: "Titel NL",
          accentNl: "Accent NL",
          tailNl: "Tail NL",
          titleEn: "Title EN",
          accentEn: "Accent EN",
          tailEn: "Tail EN",
        },
        {
          id: "item-2",
          titleNl: "Alleen NL",
          accentNl: "Accent 2",
        },
      ],
      personal: {
        enabled: true,
        titleNl: "Hey,",
        accentNl: "{firstName}!",
        tailNl: "welkom",
        titleEn: "Hey,",
        accentEn: "{firstName}!",
        tailEn: "welcome",
      },
      intervalSeconds: 8,
      randomizeOnReload: true,
    };

    it("resolves slogans for anonymous visitors (no personal slogan)", () => {
      const slogans = resolveDisplaySlogans({
        config: sampleConfig,
        locale: "nl",
        user: null,
      });

      expect(slogans).toHaveLength(2);
      expect(slogans.some((s) => s.isPersonal)).toBe(false);
      expect(slogans[0]).toEqual({
        id: "item-1",
        title: "Titel NL",
        accent: "Accent NL",
        tail: "Tail NL",
      });
    });

    it("prepends personal slogan for logged-in users when enabled", () => {
      const slogans = resolveDisplaySlogans({
        config: sampleConfig,
        locale: "nl",
        user: { name: "Maxime Van Insberghe", firstName: "Maxime" },
      });

      expect(slogans).toHaveLength(3);
      expect(slogans[0].isPersonal).toBe(true);
      expect(slogans[0]).toEqual({
        id: "personal",
        title: "Hey,",
        accent: "Maxime!",
        tail: "welkom",
        isPersonal: true,
      });
    });

    it("does not include personal slogan if personal.enabled is false", () => {
      const disabledConfig: SlogansConfig = {
        ...sampleConfig,
        personal: { ...sampleConfig.personal!, enabled: false },
      };

      const slogans = resolveDisplaySlogans({
        config: disabledConfig,
        locale: "nl",
        user: { name: "Maxime Van Insberghe", firstName: "Maxime" },
      });

      expect(slogans).toHaveLength(2);
      expect(slogans.some((s) => s.isPersonal)).toBe(false);
    });

    it("falls back to Dutch if English fields are omitted", () => {
      const slogans = resolveDisplaySlogans({
        config: sampleConfig,
        locale: "en",
        user: null,
      });

      expect(slogans[0]).toEqual({
        id: "item-1",
        title: "Title EN",
        accent: "Accent EN",
        tail: "Tail EN",
      });
      // item-2 has no English fields, so falls back to Dutch
      expect(slogans[1]).toEqual({
        id: "item-2",
        title: "Alleen NL",
        accent: "Accent 2",
        tail: "",
      });
    });

    it("uses fallback when config has empty items", () => {
      const emptyConfig: SlogansConfig = {
        items: [],
        personal: null,
        intervalSeconds: 8,
        randomizeOnReload: false,
      };

      const slogans = resolveDisplaySlogans({
        config: emptyConfig,
        locale: "nl",
        user: null,
        fallback: {
          title: "Aangepaste titel",
          accent: "Aangepast accent",
          tail: "Aangepaste tail",
        },
      });

      expect(slogans).toHaveLength(1);
      expect(slogans[0]).toEqual({
        id: "fallback",
        title: "Aangepaste titel",
        accent: "Aangepast accent",
        tail: "Aangepaste tail",
      });
    });
  });

  describe("pickInitialSloganIndex", () => {
    const slogansWithPersonal = [
      { id: "personal", title: "Hey", accent: "Jan!", tail: "", isPersonal: true },
      { id: "s1", title: "Ingenieurs zijn", accent: "superieur.", tail: "" },
      { id: "s2", title: "Al 100 jaar", accent: "thuis", tail: "in Leuven" },
    ];

    it("always returns 0 when there is only 1 slogan", () => {
      const index = pickInitialSloganIndex({
        displaySlogans: [slogansWithPersonal[0]],
        slogansConfig: DEFAULT_SLOGANS_CONFIG,
        now: new Date(),
      });
      expect(index).toBe(0);
    });

    it("always returns 0 when personal chance is 100%", () => {
      const cfg: SlogansConfig = {
        ...DEFAULT_SLOGANS_CONFIG,
        personal: { ...DEFAULT_PERSONAL_SLOGAN, chancePercent: 100 },
      };
      for (let s = 0; s < 10; s++) {
        const now = new Date(2026, 8, 12, 12, 0, s, s * 50);
        expect(
          pickInitialSloganIndex({
            displaySlogans: slogansWithPersonal,
            slogansConfig: cfg,
            now,
          }),
        ).toBe(0);
      }
    });

    it("always returns a rolling slogan (> 0) when personal chance is 0%", () => {
      const cfg: SlogansConfig = {
        ...DEFAULT_SLOGANS_CONFIG,
        personal: { ...DEFAULT_PERSONAL_SLOGAN, chancePercent: 0 },
      };
      for (let s = 0; s < 10; s++) {
        const now = new Date(2026, 8, 12, 12, 0, s, s * 50);
        const index = pickInitialSloganIndex({
          displaySlogans: slogansWithPersonal,
          slogansConfig: cfg,
          now,
        });
        expect(index).toBeGreaterThan(0);
        expect(index).toBeLessThan(slogansWithPersonal.length);
      }
    });

    it("distributes between personal and rolling slogans with 50% chance", () => {
      const cfg: SlogansConfig = {
        ...DEFAULT_SLOGANS_CONFIG,
        personal: { ...DEFAULT_PERSONAL_SLOGAN, chancePercent: 50 },
      };

      const results = new Set<number>();
      for (let ms = 0; ms < 100; ms++) {
        const now = new Date(2026, 8, 12, 12, 0, 0, ms);
        results.add(
          pickInitialSloganIndex({
            displaySlogans: slogansWithPersonal,
            slogansConfig: cfg,
            now,
          }),
        );
      }

      // Moet zowel index 0 (persoonlijk) als minstens één rolling index (> 0) opleveren
      expect(results.has(0)).toBe(true);
      expect(Array.from(results).some((idx) => idx > 0)).toBe(true);
    });
  });
});
