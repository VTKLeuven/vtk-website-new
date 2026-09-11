import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLOGANS_CONFIG,
  interpolateName,
  nextSloganIndex,
  parseSlogan,
  readSlogansSetting,
  resolveSlogans,
  sloganPlainText,
  sloganWindowAt,
  type SlogansConfig,
} from "@/lib/slogans";

const member = { name: "Jan Peeters", firstName: "Jan" };

/** Een instant op de Brusselse wandklok, zodat de dagdelen testbaar zijn. */
function at(hour: number): Date {
  // Januari: winteruur, dus Brussel = UTC+1.
  return new Date(Date.UTC(2026, 0, 15, hour - 1, 30));
}

function config(items: SlogansConfig["items"], intervalSeconds = 8): SlogansConfig {
  return { items, intervalSeconds };
}

const plain = (nl: string, overrides: Partial<SlogansConfig["items"][number]> = {}) => ({
  id: nl.slice(0, 12),
  nl,
  audience: "all" as const,
  opener: false,
  window: "any" as const,
  ...overrides,
});

describe("slogans", () => {
  describe("parseSlogan", () => {
    it("maakt van sterretjes een accent", () => {
      expect(parseSlogan("Ingenieurs zijn *superieur*.")).toEqual([
        [
          { text: "Ingenieurs zijn ", accent: false },
          { text: "superieur", accent: true },
          { text: ".", accent: false },
        ],
      ]);
    });

    it("laat het accent vooraan, achteraan en twee keer toe", () => {
      expect(parseSlogan("*Glory*, glory, *wij zijn VTK!*")).toEqual([
        [
          { text: "Glory", accent: true },
          { text: ", glory, ", accent: false },
          { text: "wij zijn VTK!", accent: true },
        ],
      ]);
    });

    it("maakt van een enter een tweede regel", () => {
      expect(parseSlogan("Waar is de beste sfeer?\n*V-T-K!*")).toHaveLength(2);
    });

    it("laat een los sterretje staan in plaats van stuk te gaan", () => {
      expect(parseSlogan("Halve *slogan")).toEqual([[{ text: "Halve *slogan", accent: false }]]);
    });

    it("negeert lege regels", () => {
      expect(parseSlogan("\n\nVTK\n\n")).toEqual([[{ text: "VTK", accent: false }]]);
    });

    it("sloganPlainText geeft de zin zonder opmaak terug", () => {
      expect(sloganPlainText(parseSlogan("Ingenieurs zijn *superieur*."))).toBe(
        "Ingenieurs zijn superieur.",
      );
    });
  });

  describe("interpolateName", () => {
    it("vervangt {firstName} en {name}", () => {
      expect(interpolateName("Welkom terug, {firstName}!", "Jan Peeters", "Jan")).toBe(
        "Welkom terug, Jan!",
      );
      expect(interpolateName("Hallo {name}", "Jan Peeters", "Jan")).toBe("Hallo Jan Peeters");
    });

    it("valt terug op de andere naam als er maar één is", () => {
      expect(interpolateName("{firstName}", "Jan Peeters", null)).toBe("Jan Peeters");
      expect(interpolateName("{name}", null, "Jan")).toBe("Jan");
    });

    it("geeft een lege tekst terug voor een leeg sjabloon", () => {
      expect(interpolateName(null, "Jan", "Jan")).toBe("");
      expect(interpolateName(undefined, "Jan", "Jan")).toBe("");
    });
  });

  describe("sloganWindowAt", () => {
    it("verdeelt de dag in vier", () => {
      expect(sloganWindowAt(at(3))).toBe("night");
      expect(sloganWindowAt(at(9))).toBe("morning");
      expect(sloganWindowAt(at(14))).toBe("afternoon");
      expect(sloganWindowAt(at(21))).toBe("evening");
    });
  });

  describe("readSlogansSetting", () => {
    it("valt terug op de zaailijst zonder instelling", () => {
      expect(readSlogansSetting(null)).toEqual(DEFAULT_SLOGANS_CONFIG);
      expect(readSlogansSetting("nope")).toEqual(DEFAULT_SLOGANS_CONFIG);
      expect(readSlogansSetting({ items: [] }).items).toEqual(DEFAULT_SLOGANS_CONFIG.items);
    });

    it("leest de nieuwe vorm en vult ontbrekende keuzes aan", () => {
      const cfg = readSlogansSetting({
        items: [{ id: "a", nl: "VTK", audience: "wat?", window: "nooit" }],
        intervalSeconds: 12,
      });
      expect(cfg.items).toEqual([
        { id: "a", nl: "VTK", en: undefined, audience: "all", opener: false, window: "any" },
      ]);
      expect(cfg.intervalSeconds).toBe(12);
    });

    it("houdt de wisseltijd binnen de grenzen", () => {
      expect(readSlogansSetting({ items: [{ nl: "x" }], intervalSeconds: -5 }).intervalSeconds).toBe(0);
      expect(readSlogansSetting({ items: [{ nl: "x" }], intervalSeconds: 999 }).intervalSeconds).toBe(60);
      expect(readSlogansSetting({ items: [{ nl: "x" }] }).intervalSeconds).toBe(8);
    });

    it("migreert de oude titel/accent/staart naar één zin", () => {
      const cfg = readSlogansSetting({
        items: [
          { id: "a", titleNl: "Ingenieurs zijn", accentNl: "superieur.", tailNl: "" },
          {
            id: "b",
            titleNl: "Al meer dan 100 jaar",
            accentNl: "thuis",
            tailNl: "in Leuven.",
            titleEn: "For over 100 years",
            accentEn: "at home",
            tailEn: "in Leuven.",
          },
        ],
        intervalSeconds: 8,
      });
      // Zonder staart brak de oude component af tussen titel en accent.
      expect(cfg.items[0]!.nl).toBe("Ingenieurs zijn\n*superieur.*");
      // Met staart brak ze af na het accent.
      expect(cfg.items[1]!.nl).toBe("Al meer dan 100 jaar *thuis*\nin Leuven.");
      expect(cfg.items[1]!.en).toBe("For over 100 years *at home*\nin Leuven.");
    });

    it("migreert de oude persoonlijke slogan naar een begroeting vooraan", () => {
      const cfg = readSlogansSetting({
        items: [{ id: "a", nl: "VTK" }],
        personal: { enabled: true, titleNl: "Welkom terug,", accentNl: "{firstName}!", chancePercent: 35 },
        intervalSeconds: 8,
      });
      expect(cfg.items[0]).toMatchObject({
        audience: "members",
        opener: true,
        window: "any",
        nl: "Welkom terug,\n*{firstName}!*",
      });
      expect(cfg.items).toHaveLength(2);
    });

    it("laat een uitgeschakelde persoonlijke slogan vallen", () => {
      const cfg = readSlogansSetting({
        items: [{ id: "a", nl: "VTK" }],
        personal: { enabled: false, titleNl: "Welkom terug,", accentNl: "{firstName}!" },
      });
      expect(cfg.items).toHaveLength(1);
    });
  });

  describe("resolveSlogans", () => {
    const items = [
      plain("Goeiemorgen, *{firstName}*.", {
        id: "ochtend",
        audience: "members",
        opener: true,
        window: "morning",
      }),
      plain("Goeieavond, *{firstName}*.", {
        id: "avond",
        audience: "members",
        opener: true,
        window: "evening",
      }),
      plain("Word lid.", { id: "gast", audience: "guests" }),
      plain("Ingenieurs zijn *superieur*.", { id: "een" }),
      plain("Glory, glory, *wij zijn VTK!*", { id: "twee" }),
    ];

    it("opent bij een lid met de begroeting van dit dagdeel", () => {
      const out = resolveSlogans({ config: config(items), locale: "nl", user: member, now: at(9) });
      expect(out.openerCount).toBe(1);
      expect(out.items.map((item) => item.id)).toEqual(["ochtend", "een", "twee"]);
      expect(out.items[0]!.text).toBe("Goeiemorgen, Jan.");
    });

    it("neemt de begroeting van het juiste dagdeel", () => {
      const out = resolveSlogans({ config: config(items), locale: "nl", user: member, now: at(21) });
      expect(out.items[0]!.id).toBe("avond");
    });

    it("toont een bezoeker geen begroeting en wel de bezoekersslogan", () => {
      const out = resolveSlogans({ config: config(items), locale: "nl", user: null, now: at(9) });
      expect(out.openerCount).toBe(0);
      expect(out.items.map((item) => item.id)).toEqual(["gast", "een", "twee"]);
    });

    it("valt in het Engels terug op de Nederlandse zin", () => {
      const out = resolveSlogans({
        config: config([plain("Enkel Nederlands", { id: "x" }), { ...plain("NL", { id: "y" }), en: "EN" }]),
        locale: "en",
        user: null,
        now: at(14),
      });
      expect(out.items.map((item) => item.text)).toEqual(["Enkel Nederlands", "EN"]);
    });

    it("gebruikt de oude hero-tekst enkel wanneer er niets overblijft", () => {
      const out = resolveSlogans({
        config: config([plain("Enkel voor leden", { id: "m", audience: "members" })]),
        locale: "nl",
        user: null,
        now: at(14),
        fallback: { nl: "De thuis voor *ingenieurs* in Leuven." },
      });
      expect(out.items).toHaveLength(1);
      expect(out.items[0]!.text).toBe("De thuis voor ingenieurs in Leuven.");
    });

    it("laat de hero nooit zonder titel achter", () => {
      const out = resolveSlogans({ config: config([]), locale: "nl", user: null, now: at(14) });
      expect(out.items).toHaveLength(1);
      expect(out.items[0]!.text.length).toBeGreaterThan(0);
    });
  });

  describe("nextSloganIndex", () => {
    it("rondt terug naar het begin zonder begroeting", () => {
      expect(nextSloganIndex(0, 3, 0)).toBe(1);
      expect(nextSloganIndex(2, 3, 0)).toBe(0);
    });

    it("laat de begroeting na haar beurt vallen", () => {
      expect(nextSloganIndex(0, 3, 1)).toBe(1);
      expect(nextSloganIndex(2, 3, 1)).toBe(1);
    });

    it("blijft staan wanneer er niets anders is", () => {
      expect(nextSloganIndex(0, 1, 1)).toBe(0);
      expect(nextSloganIndex(0, 1, 0)).toBe(0);
    });
  });
});
