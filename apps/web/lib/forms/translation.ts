/**
 * Wat er nog niet vertaald is.
 *
 * Een beheerder mag bewust maar één taal aanbieden; dan is er niets aan de
 * hand en zegt `localeMode` dat. Staat het formulier op beide talen, dan is een
 * half vertaald formulier wél een probleem: de bezoeker krijgt dan een Engelse
 * pagina met Nederlandse vragen ertussen. Deze module somt precies op wat er
 * ontbreekt, zodat de waarschuwing bruikbaar is in plaats van enkel alarmerend.
 */

export type TranslatableForm = {
  localeMode: string;
  titleEn: string | null;
  introNl: string | null;
  introEn: string | null;
  thankYouNl: string | null;
  thankYouEn: string | null;
  requireConsent: boolean;
  consentTextNl: string | null;
  consentTextEn: string | null;
  confirmationEnabled: boolean;
  confirmationSubjectNl: string | null;
  confirmationSubjectEn: string | null;
  confirmationBodyNl: string | null;
  confirmationBodyEn: string | null;
};

export type TranslatableField = {
  code: string;
  labelNl: string;
  labelEn: string | null;
  helpNl: string | null;
  helpEn: string | null;
  archivedAt?: Date | null;
  options?: Array<{ code: string; labelNl: string; labelEn: string | null; archivedAt?: Date | null }>;
};

export type TranslatableSection = {
  titleNl: string;
  titleEn: string | null;
};

export type MissingTranslation = {
  /** Waar het over gaat, zoals de beheerder het kent. */
  what: string;
  /** Waar het staat: instellingen, een veld, een sectie. */
  where: "settings" | "section" | "field" | "option";
};

/** Een Nederlandse tekst zonder Engelse tegenhanger telt als ontbrekend. */
function missing(nl: string | null, en: string | null): boolean {
  return Boolean(nl?.trim()) && !en?.trim();
}

export function missingTranslations(
  form: TranslatableForm,
  fields: readonly TranslatableField[],
  sections: readonly TranslatableSection[] = []
): MissingTranslation[] {
  // Eén taal aanbieden is een keuze, geen vergetelheid.
  if (form.localeMode !== "BOTH") return [];

  const gaps: MissingTranslation[] = [];
  const add = (what: string, where: MissingTranslation["where"]) => gaps.push({ what, where });

  if (!form.titleEn?.trim()) add("Titel", "settings");
  if (missing(form.introNl, form.introEn)) add("Introductie", "settings");
  if (missing(form.thankYouNl, form.thankYouEn)) add("Bedanktekst", "settings");
  if (form.requireConsent && missing(form.consentTextNl, form.consentTextEn)) {
    add("Toestemmingstekst", "settings");
  }
  if (form.confirmationEnabled) {
    if (missing(form.confirmationSubjectNl, form.confirmationSubjectEn)) {
      add("Onderwerp bevestigingsmail", "settings");
    }
    if (missing(form.confirmationBodyNl, form.confirmationBodyEn)) {
      add("Tekst bevestigingsmail", "settings");
    }
  }

  for (const section of sections) {
    if (missing(section.titleNl, section.titleEn)) add(`Sectie "${section.titleNl}"`, "section");
  }

  for (const field of fields) {
    // Een veld dat niet meer op het formulier staat, hoeft geen vertaling.
    if (field.archivedAt) continue;
    if (!field.labelEn?.trim()) add(`Vraag "${field.labelNl}"`, "field");
    if (missing(field.helpNl, field.helpEn)) add(`Toelichting bij "${field.labelNl}"`, "field");
    for (const option of field.options ?? []) {
      if (option.archivedAt) continue;
      if (!option.labelEn?.trim()) {
        add(`Optie "${option.labelNl}" bij "${field.labelNl}"`, "option");
      }
    }
  }

  return gaps;
}
