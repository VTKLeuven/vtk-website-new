import { z } from "zod";

/**
 * Wat een veldtype kan en hoe zijn config eruitziet.
 *
 * Dit bestand is de enige waarheid over veldtypes: de editor bouwt er zijn
 * opties mee, het publieke formulier rendert ermee, en de server valideert
 * ermee. Bewust vrij van server-only imports zodat de client dezelfde regels
 * gebruikt; de server blijft die van hem wel opnieuw toepassen.
 */

export const FORM_FIELD_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "EMAIL",
  "PHONE",
  "URL",
  "NUMBER",
  "DATE",
  "TIME",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "DROPDOWN",
  "BOOLEAN",
  "SCALE",
  "FILE",
  "CONSENT",
  "PROFILE",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** Types waarbij de beheerder een lijst keuzeopties beheert. */
export const CHOICE_TYPES = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "DROPDOWN"] as const;

export function isChoiceType(type: string): boolean {
  return (CHOICE_TYPES as readonly string[]).includes(type);
}

/** Types waarbij een bezoeker meerdere opties tegelijk kan aanduiden. */
export function isMultiChoiceType(type: string): boolean {
  return type === "MULTIPLE_CHOICE";
}

export const PROFILE_FIELDS = ["RNUMBER", "STUDY_PROGRAMME", "STUDY_YEAR"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/**
 * Hoe een veld zijn antwoord opslaat. Bepaalt of een typewissel toegelaten is
 * wanneer er al antwoorden zijn: binnen dezelfde vorm mag het (kort naar lang
 * tekst), erbuiten niet (keuze naar getal), want dan staat het bestaande
 * antwoord in de verkeerde kolom.
 */
export type StorageKind = "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "OPTIONS" | "FILE";

const STORAGE_BY_TYPE: Record<FormFieldType, StorageKind> = {
  SHORT_TEXT: "TEXT",
  LONG_TEXT: "TEXT",
  EMAIL: "TEXT",
  PHONE: "TEXT",
  URL: "TEXT",
  PROFILE: "TEXT",
  TIME: "TEXT",
  NUMBER: "NUMBER",
  SCALE: "NUMBER",
  DATE: "DATE",
  BOOLEAN: "BOOLEAN",
  CONSENT: "BOOLEAN",
  SINGLE_CHOICE: "OPTIONS",
  MULTIPLE_CHOICE: "OPTIONS",
  DROPDOWN: "OPTIONS",
  FILE: "FILE",
};

export function storageKindFor(type: string): StorageKind {
  return STORAGE_BY_TYPE[type as FormFieldType] ?? "TEXT";
}

/**
 * Mag het type van een veld met bestaande antwoorden naar `next` wijzigen?
 * De editor blokkeert de rest met uitleg in plaats van stilletjes antwoorden
 * onleesbaar te maken.
 */
export function canChangeTypeWithAnswers(current: string, next: string): boolean {
  return storageKindFor(current) === storageKindFor(next);
}

// -----------------------------------------------------------------------------
// Config per veldtype
// -----------------------------------------------------------------------------

const MAX_TEXT_LENGTH = 10_000;

/** Gedeeld door elk type: een afbeelding bij de vraag (bv. een plattegrond). */
const commonConfig = z.object({
  imageKey: z.string().max(300).nullish(),
});

const textConfig = commonConfig.extend({
  maxLength: z.number().int().min(1).max(MAX_TEXT_LENGTH).nullish(),
  /** Regex plus de melding die de bezoeker ziet wanneer ze niet matcht. */
  pattern: z.string().max(300).nullish(),
  patternMessageNl: z.string().max(300).nullish(),
  patternMessageEn: z.string().max(300).nullish(),
  placeholder: z.string().max(200).nullish(),
});

const longTextConfig = textConfig.extend({
  rows: z.number().int().min(2).max(30).nullish(),
  maxLines: z.number().int().min(1).max(200).nullish(),
});

const numberConfig = commonConfig.extend({
  min: z.number().nullish(),
  max: z.number().nullish(),
  integerOnly: z.boolean().nullish(),
  placeholder: z.string().max(200).nullish(),
});

const dateConfig = commonConfig.extend({
  /** ISO-datums (yyyy-mm-dd), niet vertaald en niet tijdzonegevoelig. */
  minDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  maxDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

const choiceConfig = commonConfig.extend({
  /** Volgorde per bezoeker husselen, tegen de voorkeur voor de eerste optie. */
  shuffle: z.boolean().nullish(),
  /** "Andere, namelijk ..." met een vrij tekstveld erbij. */
  allowOther: z.boolean().nullish(),
  otherLabelNl: z.string().max(200).nullish(),
  otherLabelEn: z.string().max(200).nullish(),
  minChecked: z.number().int().min(0).max(100).nullish(),
  maxChecked: z.number().int().min(1).max(100).nullish(),
});

const scaleConfig = commonConfig.extend({
  min: z.number().int().min(0).max(10).nullish(),
  max: z.number().int().min(2).max(10).nullish(),
  minLabelNl: z.string().max(100).nullish(),
  minLabelEn: z.string().max(100).nullish(),
  maxLabelNl: z.string().max(100).nullish(),
  maxLabelEn: z.string().max(100).nullish(),
  /** Sterren zijn dezelfde schaal, anders getekend. */
  display: z.enum(["numbers", "stars"]).nullish(),
});

const fileConfig = commonConfig.extend({
  maxFiles: z.number().int().min(1).max(10).nullish(),
  maxSizeMb: z.number().int().min(1).max(50).nullish(),
  /** Zonder punt en in kleine letters: ["pdf", "png"]. */
  allowedExtensions: z.array(z.string().regex(/^[a-z0-9]{1,10}$/)).max(20).nullish(),
});

const profileConfig = commonConfig.extend({
  profileField: z.enum(PROFILE_FIELDS),
});

const CONFIG_SCHEMAS = {
  SHORT_TEXT: textConfig,
  LONG_TEXT: longTextConfig,
  EMAIL: textConfig,
  PHONE: textConfig,
  URL: textConfig,
  NUMBER: numberConfig,
  DATE: dateConfig,
  TIME: commonConfig,
  SINGLE_CHOICE: choiceConfig,
  MULTIPLE_CHOICE: choiceConfig,
  DROPDOWN: choiceConfig,
  BOOLEAN: commonConfig,
  SCALE: scaleConfig,
  FILE: fileConfig,
  CONSENT: commonConfig,
  PROFILE: profileConfig,
} as const;

export type FormFieldConfig = {
  imageKey?: string | null;
  maxLength?: number | null;
  pattern?: string | null;
  patternMessageNl?: string | null;
  patternMessageEn?: string | null;
  placeholder?: string | null;
  rows?: number | null;
  maxLines?: number | null;
  min?: number | null;
  max?: number | null;
  integerOnly?: boolean | null;
  minDate?: string | null;
  maxDate?: string | null;
  shuffle?: boolean | null;
  allowOther?: boolean | null;
  otherLabelNl?: string | null;
  otherLabelEn?: string | null;
  minChecked?: number | null;
  maxChecked?: number | null;
  minLabelNl?: string | null;
  minLabelEn?: string | null;
  maxLabelNl?: string | null;
  maxLabelEn?: string | null;
  display?: "numbers" | "stars" | null;
  maxFiles?: number | null;
  maxSizeMb?: number | null;
  allowedExtensions?: string[] | null;
  profileField?: ProfileField | null;
};

export const DEFAULT_FILE_MAX_SIZE_MB = 10;
export const DEFAULT_FILE_MAX_FILES = 1;
export const DEFAULT_SCALE_MIN = 1;
export const DEFAULT_SCALE_MAX = 5;

/**
 * Leest een opgeslagen `config`-kolom uit. Onbekende sleutels vallen weg en een
 * onbruikbare waarde valt terug op de standaard: een veld dat ooit met een
 * andere versie bewaard werd, mag het formulier niet laten crashen.
 */
export function parseFieldConfig(type: string, raw: unknown): FormFieldConfig {
  const schema = CONFIG_SCHEMAS[type as FormFieldType] ?? commonConfig;
  const parsed = schema.safeParse(raw ?? {});
  const config = (parsed.success ? parsed.data : {}) as FormFieldConfig;

  if (type === "PROFILE" && !config.profileField) {
    // Een profielveld zonder bron is zinloos; r-nummer is de veiligste gok en
    // de editor toont de keuze sowieso.
    return { ...config, profileField: "RNUMBER" };
  }
  if (type === "SCALE") {
    const min = config.min ?? DEFAULT_SCALE_MIN;
    const max = config.max ?? DEFAULT_SCALE_MAX;
    // Een omgekeerde of te korte schaal is niet te tekenen.
    return max > min ? { ...config, min, max } : { ...config, min: DEFAULT_SCALE_MIN, max: DEFAULT_SCALE_MAX };
  }
  return config;
}

/**
 * Valideert wat de editor opstuurt. Anders dan `parseFieldConfig` mag dit wél
 * weigeren: een onmogelijke instelling hoort meteen als fout terug te komen in
 * plaats van stil genegeerd te worden.
 */
export function validateFieldConfig(type: string, raw: unknown): FormFieldConfig {
  const schema = CONFIG_SCHEMAS[type as FormFieldType] ?? commonConfig;
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) throw new Error("INVALID_FIELD_CONFIG");
  const config = parsed.data as FormFieldConfig;

  if (config.min != null && config.max != null && config.max < config.min) {
    throw new Error("INVALID_FIELD_RANGE");
  }
  if (config.minChecked != null && config.maxChecked != null && config.maxChecked < config.minChecked) {
    throw new Error("INVALID_FIELD_RANGE");
  }
  if (config.minDate && config.maxDate && config.maxDate < config.minDate) {
    throw new Error("INVALID_FIELD_RANGE");
  }
  if (config.pattern) {
    try {
      new RegExp(config.pattern);
    } catch {
      throw new Error("INVALID_FIELD_PATTERN");
    }
  }
  if (type === "SCALE") {
    const min = config.min ?? DEFAULT_SCALE_MIN;
    const max = config.max ?? DEFAULT_SCALE_MAX;
    if (max <= min) throw new Error("INVALID_FIELD_RANGE");
  }
  return config;
}

/**
 * Een stabiele, leesbare veldcode uit een label. Dit wordt de kolomnaam in de
 * CSV en de sleutel in een prefill-link, dus hij mag nooit meewijzigen met het
 * label; enkel bij het aanmaken wordt hij afgeleid.
 */
export function fieldCodeFrom(label: string, taken: readonly string[] = []): string {
  const base =
    label
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "veld";

  if (!taken.includes(base)) return base;
  for (let suffix = 2; suffix < 1_000; suffix += 1) {
    const candidate = `${base}_${suffix}`.slice(0, 48);
    if (!taken.includes(candidate)) return candidate;
  }
  throw new Error("FIELD_CODE_EXHAUSTED");
}

/** Dezelfde regels als hierboven, maar voor een keuzeoptie binnen één veld. */
export function optionCodeFrom(label: string, taken: readonly string[] = []): string {
  return fieldCodeFrom(label, taken);
}
