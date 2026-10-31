/**
 * Welke hero de homepage heeft, te kiezen in /admin/home. Alles over de hero staat
 * daar: er is geen ander scherm voor.
 *
 * `classic` is de bouwtekening en blijft de standaard: zonder rij in `Setting`
 * verandert er niets aan de site. `construction` tekent het logo met zijn echte
 * constructielijnen (lib/home/heroConstruction.ts). `oldHero`, `urenloop` en
 * `jobfair` zijn de fotohero's (components/editorial/LegacyHero.tsx). De velden na
 * `design` blijven bewaard wanneer iemand wisselt, zodat een gekozen opstelling niet
 * verloren gaat.
 */

export const HERO_DESIGN_SETTING = "home.heroDesign";

export const HERO_DESIGNS = ["classic", "construction", "oldHero", "urenloop", "jobfair"] as const;
export const HERO_LAYOUTS = ["lineEnds", "leaders", "register"] as const;
export const HERO_FILLS = ["solid", "hatch", "outline"] as const;
export const HERO_LINE_WEIGHTS = ["thin", "medium", "thick"] as const;

/** De kleur van de naam wanneer je over een bestemming gaat. */
export const HERO_HOVER_COLORS = ["white", "yellow"] as const;

export type HeroDesignName = (typeof HERO_DESIGNS)[number];
export type HeroLayout = (typeof HERO_LAYOUTS)[number];
export type HeroFill = (typeof HERO_FILLS)[number];
export type HeroLineWeight = (typeof HERO_LINE_WEIGHTS)[number];
export type HeroHoverColor = (typeof HERO_HOVER_COLORS)[number];

export type HeroDesignSetting = {
  design: HeroDesignName;
  layout: HeroLayout;
  fill: HeroFill;
  lineWeight: HeroLineWeight;
  /** Hoe sterk de constructielijnen staan, in procent. */
  lineStrength: number;
  /** Het technische patroon achter de band. */
  pattern: boolean;
  hoverColor: HeroHoverColor;
  /** De snelheid van de animatie bij het laden, in procent van de normale. */
  animationSpeed: number;
};

export const HERO_LINE_STRENGTH_MIN = 20;
export const HERO_LINE_STRENGTH_MAX = 100;
export const HERO_LINE_STRENGTH_STEP = 5;

export const HERO_ANIMATION_SPEED_MIN = 50;
export const HERO_ANIMATION_SPEED_MAX = 200;
export const HERO_ANIMATION_SPEED_STEP = 25;

export const DEFAULT_HERO_DESIGN: HeroDesignSetting = {
  design: "classic",
  layout: "lineEnds",
  fill: "solid",
  lineWeight: "medium",
  lineStrength: 55,
  pattern: false,
  hoverColor: "white",
  animationSpeed: 100,
};

/** De drie designs met een foto, die LegacyHero rendert. */
export type HeroPhotoDesign = Extract<HeroDesignName, "oldHero" | "urenloop" | "jobfair">;

export function isHeroPhotoDesign(design: HeroDesignName): design is HeroPhotoDesign {
  return design === "oldHero" || design === "urenloop" || design === "jobfair";
}

/** Waarmee de duur en de vertraging van de animatie vermenigvuldigd worden. */
export function heroAnimationTempo(setting: HeroDesignSetting): number {
  return 100 / setting.animationSpeed;
}

/** De lijndikte in pixels op ware grootte. */
export const HERO_LINE_WEIGHT_PX: Record<HeroLineWeight, number> = {
  thin: 1,
  medium: 1.5,
  thick: 2.2,
};

function oneOf<T extends string>(options: readonly T[], value: unknown): T | null {
  return options.includes(value as T) ? (value as T) : null;
}

function validRange(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number)) return null;
  if (number < min || number > max) return null;
  return number;
}

const validStrength = (value: unknown) =>
  validRange(value, HERO_LINE_STRENGTH_MIN, HERO_LINE_STRENGTH_MAX);
const validSpeed = (value: unknown) =>
  validRange(value, HERO_ANIMATION_SPEED_MIN, HERO_ANIMATION_SPEED_MAX);

/** Wat er bewaard staat; een onbekende waarde valt per veld terug op de standaard. */
export function readHeroDesignSetting(value: unknown): HeroDesignSetting {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_HERO_DESIGN;
  }
  const record = value as Record<string, unknown>;
  return {
    design: oneOf(HERO_DESIGNS, record.design) ?? DEFAULT_HERO_DESIGN.design,
    layout: oneOf(HERO_LAYOUTS, record.layout) ?? DEFAULT_HERO_DESIGN.layout,
    fill: oneOf(HERO_FILLS, record.fill) ?? DEFAULT_HERO_DESIGN.fill,
    lineWeight: oneOf(HERO_LINE_WEIGHTS, record.lineWeight) ?? DEFAULT_HERO_DESIGN.lineWeight,
    lineStrength: validStrength(record.lineStrength) ?? DEFAULT_HERO_DESIGN.lineStrength,
    pattern: typeof record.pattern === "boolean" ? record.pattern : DEFAULT_HERO_DESIGN.pattern,
    hoverColor: oneOf(HERO_HOVER_COLORS, record.hoverColor) ?? DEFAULT_HERO_DESIGN.hoverColor,
    animationSpeed: validSpeed(record.animationSpeed) ?? DEFAULT_HERO_DESIGN.animationSpeed,
  };
}

/** Het formulier uit /admin/home; `null` zodra een veld niet klopt. */
export function parseHeroDesignForm(formData: FormData): HeroDesignSetting | null {
  const design = oneOf(HERO_DESIGNS, formData.get("design"));
  const layout = oneOf(HERO_LAYOUTS, formData.get("layout"));
  const fill = oneOf(HERO_FILLS, formData.get("fill"));
  const lineWeight = oneOf(HERO_LINE_WEIGHTS, formData.get("lineWeight"));
  const lineStrength = validStrength(formData.get("lineStrength"));
  const pattern = formData.get("pattern");
  const hoverColor = oneOf(HERO_HOVER_COLORS, formData.get("hoverColor"));
  const animationSpeed = validSpeed(formData.get("animationSpeed"));
  if (!design || !layout || !fill || !lineWeight || lineStrength === null) return null;
  if (!hoverColor || animationSpeed === null) return null;
  if (pattern !== "true" && pattern !== "false") return null;
  return {
    design,
    layout,
    fill,
    lineWeight,
    lineStrength,
    pattern: pattern === "true",
    hoverColor,
    animationSpeed,
  };
}
