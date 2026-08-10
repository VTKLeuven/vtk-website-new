import {
  DEFAULT_FILE_MAX_FILES,
  DEFAULT_SCALE_MAX,
  DEFAULT_SCALE_MIN,
  isChoiceType,
  isMultiChoiceType,
  parseFieldConfig,
  type FormFieldConfig,
} from "./schema";
import {
  visibleFieldIds,
  type AnswerValue,
  type VisibilityCondition,
} from "./visibility";

/**
 * De serverside waarheid over een inzending.
 *
 * De publieke pagina valideert clientside voor het comfort, maar hier wordt
 * beslist. Twee regels waar dit hele bestand om draait: een verborgen veld is
 * nooit verplicht, en een verborgen veld aanvaardt geen antwoord, ongeacht wat
 * de client opstuurt.
 */

export type ValidationField = {
  id: string;
  code: string;
  type: string;
  required: boolean;
  config: unknown;
  options: Array<{ code: string; archivedAt?: Date | string | null }>;
};

export type ValidationInput = {
  fields: readonly ValidationField[];
  conditions: readonly VisibilityCondition[];
  answers: Readonly<Record<string, AnswerValue>>;
  /** Aantal geüploade bestanden per veld; de upload zelf is al gebeurd. */
  fileCounts?: Readonly<Record<string, { count: number; extensions: string[] }>>;
};

export type ValidationResult = {
  /** Veld-id -> foutcode. Leeg betekent: mag ingediend worden. */
  errors: Record<string, string>;
  /** Enkel de zichtbare velden, opgeschoond en klaar om te bewaren. */
  cleaned: Record<string, AnswerValue>;
  visible: Set<string>;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RNUMBER = /^[rR]\d{7}$/;

function hasAnswer(value: AnswerValue | undefined, type: string): boolean {
  if (!value) return false;
  if (isChoiceType(type)) {
    // Een vrije "Andere"-tekst telt als antwoord, ook zonder aangevinkte optie.
    return (value.options?.length ?? 0) > 0 || Boolean(value.text?.trim());
  }
  if (type === "BOOLEAN" || type === "CONSENT") return value.checked === true;
  if (type === "NUMBER" || type === "SCALE") {
    return value.number !== null && value.number !== undefined;
  }
  if (type === "FILE") return (value.files ?? 0) > 0;
  return Boolean(value.text?.trim());
}

function validateOne(
  field: ValidationField,
  config: FormFieldConfig,
  value: AnswerValue,
  fileInfo?: { count: number; extensions: string[] }
): string | null {
  switch (field.type) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
    case "PHONE":
    case "PROFILE": {
      const text = value.text?.trim() ?? "";
      if (!text) return null;
      if (config.maxLength && text.length > config.maxLength) return "TOO_LONG";
      if (config.maxLines && text.split("\n").length > config.maxLines) return "TOO_MANY_LINES";
      if (config.pattern) {
        try {
          if (!new RegExp(config.pattern).test(text)) return "PATTERN";
        } catch {
          // Een kapot patroon mag geen bezoeker tegenhouden; de editor weigert
          // het bij het opslaan, dus dit kan enkel bij oudere data.
          return null;
        }
      }
      if (field.type === "PROFILE" && config.profileField === "RNUMBER" && !RNUMBER.test(text)) {
        return "RNUMBER";
      }
      return null;
    }

    case "EMAIL": {
      const text = value.text?.trim() ?? "";
      return !text || EMAIL.test(text) ? null : "EMAIL";
    }

    case "URL": {
      const text = value.text?.trim() ?? "";
      if (!text) return null;
      try {
        const url = new URL(text);
        return url.protocol === "http:" || url.protocol === "https:" ? null : "URL";
      } catch {
        return "URL";
      }
    }

    case "TIME": {
      const text = value.text?.trim() ?? "";
      return !text || TIME.test(text) ? null : "TIME";
    }

    case "DATE": {
      const text = value.text?.trim() ?? "";
      if (!text) return null;
      if (!ISO_DATE.test(text) || Number.isNaN(Date.parse(text))) return "DATE";
      if (config.minDate && text < config.minDate) return "DATE_TOO_EARLY";
      if (config.maxDate && text > config.maxDate) return "DATE_TOO_LATE";
      return null;
    }

    case "NUMBER": {
      const number = value.number;
      if (number === null || number === undefined) return null;
      if (!Number.isFinite(number)) return "NUMBER";
      if (config.integerOnly && !Number.isInteger(number)) return "NUMBER_INTEGER";
      if (config.min != null && number < config.min) return "NUMBER_TOO_SMALL";
      if (config.max != null && number > config.max) return "NUMBER_TOO_LARGE";
      return null;
    }

    case "SCALE": {
      const number = value.number;
      if (number === null || number === undefined) return null;
      const min = config.min ?? DEFAULT_SCALE_MIN;
      const max = config.max ?? DEFAULT_SCALE_MAX;
      return Number.isInteger(number) && number >= min && number <= max ? null : "SCALE";
    }

    case "BOOLEAN":
      return null;

    case "CONSENT":
      // Verplichte toestemming is het enige geval waar "niet aangevinkt" een
      // fout is in plaats van "niet ingevuld"; de required-check hieronder
      // dekt dat, hier valt niets meer te keuren.
      return null;

    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE":
    case "DROPDOWN": {
      const selected = value.options ?? [];
      const known = new Set(
        field.options.filter((option) => !option.archivedAt).map((option) => option.code)
      );
      if (selected.some((code) => !known.has(code))) return "UNKNOWN_OPTION";
      if (new Set(selected).size !== selected.length) return "UNKNOWN_OPTION";
      if (!isMultiChoiceType(field.type) && selected.length > 1) return "TOO_MANY_CHOICES";
      if (isMultiChoiceType(field.type)) {
        if (config.minChecked && selected.length > 0 && selected.length < config.minChecked) {
          return "TOO_FEW_CHOICES";
        }
        if (config.maxChecked && selected.length > config.maxChecked) return "TOO_MANY_CHOICES";
      }
      if (value.text?.trim() && !config.allowOther) return "OTHER_NOT_ALLOWED";
      return null;
    }

    case "FILE": {
      if (!fileInfo || fileInfo.count === 0) return null;
      const maxFiles = config.maxFiles ?? DEFAULT_FILE_MAX_FILES;
      if (fileInfo.count > maxFiles) return "TOO_MANY_FILES";
      const allowed = config.allowedExtensions;
      if (allowed && allowed.length > 0) {
        const rejected = fileInfo.extensions.some(
          (extension) => !allowed.includes(extension.toLowerCase())
        );
        if (rejected) return "FILE_TYPE";
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Valideert een inzending en geeft terug wat er bewaard mag worden.
 *
 * Antwoorden op onzichtbare velden verdwijnen uit `cleaned`: ze worden niet
 * geweigerd met een foutmelding (de bezoeker heeft die vraag nooit gezien en
 * kan er niets aan doen), maar ze worden ook niet bewaard.
 */
export function validateSubmission(input: ValidationInput): ValidationResult {
  const visible = visibleFieldIds(
    input.fields.map((field) => ({ id: field.id, type: field.type })),
    input.conditions,
    input.answers
  );

  const errors: Record<string, string> = {};
  const cleaned: Record<string, AnswerValue> = {};

  for (const field of input.fields) {
    if (!visible.has(field.id)) continue;
    const config = parseFieldConfig(field.type, field.config);
    const value = input.answers[field.id] ?? {};
    const fileInfo = input.fileCounts?.[field.id];
    const answered =
      field.type === "FILE" ? (fileInfo?.count ?? 0) > 0 : hasAnswer(value, field.type);

    if (field.required && !answered) {
      errors[field.id] = field.type === "CONSENT" ? "CONSENT_REQUIRED" : "REQUIRED";
      continue;
    }

    const error = validateOne(field, config, value, fileInfo);
    if (error) {
      errors[field.id] = error;
      continue;
    }

    if (!answered) continue;
    cleaned[field.id] = normalise(field, value, fileInfo);
  }

  return { errors, cleaned, visible };
}

/** Alleen de velden bewaren die bij dit type horen, zodat er geen restwaarden
 *  van een vorig type in de rij belanden. */
function normalise(
  field: ValidationField,
  value: AnswerValue,
  fileInfo?: { count: number; extensions: string[] }
): AnswerValue {
  if (isChoiceType(field.type)) {
    return {
      options: value.options ?? [],
      text: value.text?.trim() || null,
    };
  }
  if (field.type === "BOOLEAN" || field.type === "CONSENT") {
    return { checked: value.checked === true };
  }
  if (field.type === "NUMBER" || field.type === "SCALE") {
    return { number: value.number ?? null };
  }
  if (field.type === "FILE") {
    return { files: fileInfo?.count ?? 0 };
  }
  return { text: value.text?.trim() ?? "" };
}

/**
 * Welke opties met een quotum deze inzending claimt. De reservatie zelf gebeurt
 * in de transactie van het indienen; dit zegt enkel wat er geclaimd wordt.
 */
export function claimedOptionCodes(
  fields: readonly ValidationField[],
  cleaned: Readonly<Record<string, AnswerValue>>
): string[] {
  const codes: string[] = [];
  for (const field of fields) {
    if (!isChoiceType(field.type)) continue;
    codes.push(...(cleaned[field.id]?.options ?? []));
  }
  return codes;
}
