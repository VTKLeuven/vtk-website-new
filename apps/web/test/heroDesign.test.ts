import { describe, expect, it } from "vitest";
import {
  DEFAULT_HERO_DESIGN,
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
  frontpage: "jobfair",
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
      layout: "inPlace",
      fill: "outline",
      lineWeight: "thin",
      lineStrength: 35,
      pattern: true,
      frontpage: "urenloop",
      hoverColor: "yellow",
      animationSpeed: 75,
    };
    expect(readHeroDesignSetting(value)).toEqual(value);
  });

  it("valt per veld terug wanneer iets niet (meer) bestaat", () => {
    expect(
      readHeroDesignSetting({ design: "construction", layout: "weg", lineStrength: 5, pattern: "ja" }),
    ).toEqual({ ...DEFAULT_HERO_DESIGN, design: "construction" });
  });
});

describe("parseHeroDesignForm", () => {
  it("kent de oude hero als derde keuze", () => {
    expect(parseHeroDesignForm(form({ ...VALID, design: "frontpage" }))?.design).toBe("frontpage");
  });

  it("leest het formulier", () => {
    expect(parseHeroDesignForm(form(VALID))).toEqual({
      design: "construction",
      layout: "register",
      fill: "hatch",
      lineWeight: "thick",
      lineStrength: 70,
      pattern: true,
      frontpage: "jobfair",
      hoverColor: "yellow",
      animationSpeed: 150,
    });
  });

  it("weigert een onbekende waarde of een sterkte buiten het bereik", () => {
    expect(parseHeroDesignForm(form({ ...VALID, design: "foto" }))).toBeNull();
    expect(parseHeroDesignForm(form({ ...VALID, frontpage: "galabal" }))).toBeNull();
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
