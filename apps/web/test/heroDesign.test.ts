import { describe, expect, it } from "vitest";
import {
  DEFAULT_HERO_DESIGN,
  DEFAULT_HERO_SUBS,
  HERO_SUB_MAX_LENGTH,
  heroSubFieldName,
  parseHeroDesignForm,
  readHeroDesignSetting,
} from "@/lib/home/heroDesign";
import { CONSTRUCTION_LINES } from "@/lib/home/heroConstruction";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const VALID = {
  design: "construction",
  layout: "register",
  fill: "hatch",
  lineWeight: "thick",
  lineStrength: "70",
  pattern: "true",
  hoverColor: "yellow",
  animationSpeed: "150",
};

describe("readHeroDesignSetting", () => {
  it("houdt zonder bewaarde keuze het huidige design", () => {
    expect(DEFAULT_HERO_DESIGN.design).toBe("classic");
    expect(readHeroDesignSetting(undefined)).toEqual(DEFAULT_HERO_DESIGN);
    expect(readHeroDesignSetting(null)).toEqual(DEFAULT_HERO_DESIGN);
    expect(readHeroDesignSetting("construction")).toEqual(DEFAULT_HERO_DESIGN);
    expect(readHeroDesignSetting([])).toEqual(DEFAULT_HERO_DESIGN);
  });

  it("leest een geldige keuze", () => {
    const value = {
      design: "construction",
      layout: "leaders",
      fill: "outline",
      lineWeight: "thin",
      lineStrength: 35,
      pattern: true,
      hoverColor: "yellow",
      animationSpeed: 75,
      subs: {
        ...DEFAULT_HERO_SUBS,
        kalender: { nl: "Wat er aankomt", en: "What is coming up" },
      },
    };
    expect(readHeroDesignSetting(value)).toEqual(value);
  });

  it("geeft een rij van voor de tekstjes de standaardteksten", () => {
    expect(readHeroDesignSetting({ design: "classic" }).subs).toEqual(DEFAULT_HERO_SUBS);
    expect(readHeroDesignSetting({ design: "classic", subs: "weg" }).subs).toEqual(DEFAULT_HERO_SUBS);
    expect(readHeroDesignSetting({ design: "classic", subs: null }).subs).toEqual(DEFAULT_HERO_SUBS);
  });

  it("valt per tekstje terug, niet voor de hele lijst", () => {
    const { subs } = readHeroDesignSetting({
      subs: {
        tickets: { nl: "Eigen tekst", en: "  " },
        career: { nl: 3, en: "x".repeat(HERO_SUB_MAX_LENGTH + 1) },
      },
    });
    expect(subs.tickets).toEqual({ nl: "Eigen tekst", en: DEFAULT_HERO_SUBS.tickets.en });
    expect(subs.career).toEqual(DEFAULT_HERO_SUBS.career);
    expect(subs.kalender).toEqual(DEFAULT_HERO_SUBS.kalender);
  });

  it("valt per veld terug wanneer iets niet (meer) bestaat", () => {
    expect(
      readHeroDesignSetting({ design: "construction", layout: "weg", lineStrength: 5, pattern: "ja" }),
    ).toEqual({ ...DEFAULT_HERO_DESIGN, design: "construction" });
  });
});

describe("parseHeroDesignForm", () => {
  it("kent elk design", () => {
    for (const design of ["classic", "construction", "oldHero", "urenloop", "jobfair"]) {
      expect(parseHeroDesignForm(form({ ...VALID, design }))?.design).toBe(design);
    }
  });

  it("leest het formulier", () => {
    expect(parseHeroDesignForm(form(VALID))).toEqual({
      design: "construction",
      layout: "register",
      fill: "hatch",
      lineWeight: "thick",
      lineStrength: 70,
      pattern: true,
      hoverColor: "yellow",
      animationSpeed: 150,
      subs: DEFAULT_HERO_SUBS,
    });
  });

  it("bewaart een tekstje zonder witruimte en zet een leeg veld terug op de standaard", () => {
    const { subs } = parseHeroDesignForm(
      form({
        ...VALID,
        [heroSubFieldName("shiften", "nl")]: "  Kom shiften  ",
        [heroSubFieldName("shiften", "en")]: "   ",
      }),
    )!;
    expect(subs.shiften).toEqual({ nl: "Kom shiften", en: DEFAULT_HERO_SUBS.shiften.en });
  });

  it("weigert een tekstje dat te lang is", () => {
    const name = heroSubFieldName("tickets", "en");
    const exact = "x".repeat(HERO_SUB_MAX_LENGTH);
    expect(parseHeroDesignForm(form({ ...VALID, [name]: exact }))?.subs.tickets.en).toBe(exact);
    expect(parseHeroDesignForm(form({ ...VALID, [name]: `${exact}x` }))).toBeNull();
  });

  it("weigert een onbekende waarde of een sterkte buiten het bereik", () => {
    expect(parseHeroDesignForm(form({ ...VALID, design: "foto" }))).toBeNull();
    expect(parseHeroDesignForm(form({ ...VALID, design: "nieuw" }))).toBeNull();
    expect(parseHeroDesignForm(form({ ...VALID, layout: "randen" }))).toBeNull();
    expect(parseHeroDesignForm(form({ ...VALID, fill: "geel" }))).toBeNull();
    expect(parseHeroDesignForm(form({ ...VALID, lineStrength: "10" }))).toBeNull();
    expect(parseHeroDesignForm(form({ ...VALID, lineStrength: "veel" }))).toBeNull();
    expect(parseHeroDesignForm(form({ ...VALID, pattern: "misschien" }))).toBeNull();
    expect(parseHeroDesignForm(form({ ...VALID, hoverColor: "rood" }))).toBeNull();
    expect(parseHeroDesignForm(form({ ...VALID, animationSpeed: "10" }))).toBeNull();
  });
});

describe("de constructietekening", () => {
  it("bevat 23 lijnen en 2 cirkels, met de cirkels het laatst", () => {
    expect(CONSTRUCTION_LINES).toHaveLength(25);
    expect(CONSTRUCTION_LINES.filter((line) => line.d.includes("C"))).toHaveLength(2);
    expect(CONSTRUCTION_LINES.slice(-2).every((line) => line.d.includes("C"))).toBe(true);
  });

  it("kent elke lijn waarop een bestemming staat", () => {
    const named = CONSTRUCTION_LINES.flatMap((line) => (line.line ? [line.line] : []));
    expect(named.sort()).toEqual(["basis", "cursusdienst", "kalender", "midden"]);
  });
});
