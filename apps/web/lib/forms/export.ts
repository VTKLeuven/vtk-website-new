import { createCsv, type CsvValue } from "@/lib/ticketing/csv";
import { isChoiceType } from "./schema";

/**
 * De CSV-export van de inzendingen.
 *
 * Het kolomcontract is de kern: elke kolom is de stabiele `code` van een veld,
 * niet zijn positie en niet zijn label. Een veld hernoemen, herordenen of van
 * het formulier halen verplaatst dus nooit een antwoord naar een andere kolom,
 * en een gearchiveerd veld houdt zijn kolom zolang er antwoorden op staan.
 */

export type ExportField = {
  id: string;
  code: string;
  type: string;
  labelNl: string;
  labelEn: string | null;
  sortOrder: number;
  archivedAt: Date | null;
  options: Array<{ code: string; labelNl: string; labelEn: string | null }>;
};

export type ExportAnswer = {
  fieldId: string;
  fieldCode: string;
  valueText: string | null;
  valueNumber: number | null;
  valueDate: Date | null;
  valueBool: boolean | null;
  valueOptions: string[];
};

export type ExportEntry = {
  id: string;
  status: string;
  reviewStatus: string;
  internalNote: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  isTest: boolean;
  reviewerName: string | null;
  answers: ExportAnswer[];
  uploads: Array<{ fieldId: string; originalName: string }>;
};

export type ExportOptions = {
  locale: "nl" | "en";
  /** Enkel deze veldcodes exporteren; leeg betekent alle velden. */
  fieldCodes?: readonly string[];
  includeMetadata?: boolean;
};

const META_COLUMNS = {
  nl: ["Ingediend op", "Status", "Beoordeling", "Naam", "E-mail", "Beoordelaar", "Notitie", "Test"],
  en: ["Submitted at", "Status", "Review", "Name", "E-mail", "Reviewer", "Note", "Test"],
} as const;

function label(field: ExportField, locale: "nl" | "en"): string {
  return locale === "en" && field.labelEn ? field.labelEn : field.labelNl;
}

/** Eén antwoord als tekst, met de labels van de gekozen opties. */
export function answerToText(
  field: ExportField,
  answer: ExportAnswer | undefined,
  uploads: readonly { fieldId: string; originalName: string }[],
  locale: "nl" | "en"
): string {
  if (field.type === "FILE") {
    return uploads
      .filter((upload) => upload.fieldId === field.id)
      .map((upload) => upload.originalName)
      .join(" | ");
  }
  if (!answer) return "";

  if (isChoiceType(field.type)) {
    const chosen = answer.valueOptions.map((code) => {
      const option = field.options.find((candidate) => candidate.code === code);
      if (!option) return code;
      return locale === "en" && option.labelEn ? option.labelEn : option.labelNl;
    });
    // De vrije "Andere"-tekst hoort in dezelfde kolom; een aparte kolom per
    // keuzeveld zou de export verdubbelen voor iets dat zelden ingevuld is.
    if (answer.valueText) chosen.push(answer.valueText);
    return chosen.join(" | ");
  }
  if (answer.valueBool !== null) {
    return answer.valueBool ? (locale === "en" ? "yes" : "ja") : locale === "en" ? "no" : "nee";
  }
  if (answer.valueNumber !== null) return String(answer.valueNumber);
  if (answer.valueDate) return answer.valueDate.toISOString().slice(0, 10);
  return answer.valueText ?? "";
}

/**
 * De kolommen: de velden die nog op het formulier staan, plus gearchiveerde
 * velden waar nog antwoorden op staan. Die laatste achteraan, want ze horen
 * niet meer bij de volgorde van het formulier.
 */
export function exportColumns(
  fields: readonly ExportField[],
  entries: readonly ExportEntry[],
  options: ExportOptions
): ExportField[] {
  const answeredCodes = new Set(
    entries.flatMap((entry) => entry.answers.map((answer) => answer.fieldCode))
  );
  const selected = options.fieldCodes?.length ? new Set(options.fieldCodes) : null;

  const active = fields
    .filter((field) => !field.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = fields
    .filter((field) => field.archivedAt && answeredCodes.has(field.code))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return [...active, ...archived].filter((field) => !selected || selected.has(field.code));
}

export function buildEntriesCsv(
  fields: readonly ExportField[],
  entries: readonly ExportEntry[],
  options: ExportOptions
): string {
  const locale = options.locale;
  const columns = exportColumns(fields, entries, options);
  const includeMetadata = options.includeMetadata !== false;

  const headers = [
    ...(includeMetadata ? META_COLUMNS[locale] : []),
    // Het label is voor de lezer, de code voor wie de kolom terugvindt na een
    // hernoeming.
    ...columns.map((field) => `${label(field, locale)} (${field.code})`),
  ];

  const rows: CsvValue[][] = entries.map((entry) => {
    const byField = new Map(entry.answers.map((answer) => [answer.fieldId, answer]));
    return [
      ...(includeMetadata
        ? [
            entry.submittedAt ?? entry.createdAt,
            entry.status,
            entry.reviewStatus,
            entry.submitterName ?? "",
            entry.submitterEmail ?? "",
            entry.reviewerName ?? "",
            entry.internalNote ?? "",
            entry.isTest ? (locale === "en" ? "yes" : "ja") : "",
          ]
        : []),
      ...columns.map((field) =>
        answerToText(field, byField.get(field.id), entry.uploads, locale)
      ),
    ];
  });

  return createCsv(headers, rows);
}

/**
 * Het antwoordoverzicht per gesloten vraag, voor de grafiek naast de tabel.
 * Enkel keuzevelden en schalen: een open tekstveld heeft geen zinvolle telling.
 */
export function answerSummary(
  fields: readonly ExportField[],
  entries: readonly ExportEntry[],
  locale: "nl" | "en"
): Array<{
  fieldId: string;
  label: string;
  total: number;
  buckets: Array<{ label: string; count: number }>;
}> {
  const summaries = [];

  for (const field of fields) {
    if (field.archivedAt) continue;
    const relevant = isChoiceType(field.type) || field.type === "BOOLEAN" || field.type === "SCALE";
    if (!relevant) continue;

    const counts = new Map<string, number>();
    let total = 0;

    for (const entry of entries) {
      const answer = entry.answers.find((candidate) => candidate.fieldId === field.id);
      if (!answer) continue;

      if (isChoiceType(field.type)) {
        for (const code of answer.valueOptions) {
          const option = field.options.find((candidate) => candidate.code === code);
          const name = option
            ? locale === "en" && option.labelEn
              ? option.labelEn
              : option.labelNl
            : code;
          counts.set(name, (counts.get(name) ?? 0) + 1);
          total += 1;
        }
        continue;
      }
      if (field.type === "BOOLEAN" && answer.valueBool !== null) {
        const name = answer.valueBool ? (locale === "en" ? "yes" : "ja") : locale === "en" ? "no" : "nee";
        counts.set(name, (counts.get(name) ?? 0) + 1);
        total += 1;
        continue;
      }
      if (field.type === "SCALE" && answer.valueNumber !== null) {
        const name = String(answer.valueNumber);
        counts.set(name, (counts.get(name) ?? 0) + 1);
        total += 1;
      }
    }

    if (total === 0) continue;
    summaries.push({
      fieldId: field.id,
      label: label(field, locale),
      total,
      buckets: [...counts.entries()]
        .map(([bucketLabel, count]) => ({ label: bucketLabel, count }))
        .sort((a, b) => b.count - a.count),
    });
  }

  return summaries;
}
