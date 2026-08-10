import "server-only";

import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { parseFieldConfig } from "./schema";
import type { VisibilityCondition } from "./visibility";

/**
 * Het publieke formulier: laden, en beslissen of het invulbaar is.
 *
 * Waarom iemand níét kan invullen, is hier één waarde in plaats van een reeks
 * losse checks op de pagina: de bezoeker hoort een duidelijke reden te zien
 * ("vol", "sluit op ...", "enkel voor leden") en niet een leeg scherm.
 */

export type FormAvailability =
  | "OPEN"
  | "DRAFT"
  | "NOT_OPEN_YET"
  | "CLOSED"
  | "FULL"
  | "WAITLIST"
  | "MEMBERS_ONLY"
  | "ALREADY_SUBMITTED"
  | "LANGUAGE_UNAVAILABLE";

export type PublicFormData = NonNullable<Awaited<ReturnType<typeof loadPublicForm>>>;

export async function loadPublicForm(slug: string) {
  const form = await prisma.form.findUnique({
    where: { slug },
    include: {
      calendarEvent: {
        select: { id: true, titleNl: true, titleEn: true, start: true, end: true, location: true },
      },
      sections: { orderBy: { sortOrder: "asc" } },
      fields: {
        where: { archivedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          options: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } },
          conditions: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (!form) return null;

  const submittedCount = await prisma.formEntry.count({
    where: { formId: form.id, status: "SUBMITTED", isTest: false, waitlisted: false },
  });

  return { ...form, submittedCount };
}

/** De velden in de vorm die de renderer verwacht, met quota per optie. */
export function toPublicFields(form: PublicFormData, locale: Locale) {
  return form.fields.map((field) => ({
    id: field.id,
    code: field.code,
    type: field.type,
    labelNl: field.labelNl,
    labelEn: field.labelEn,
    helpNl: field.helpNl,
    helpEn: field.helpEn,
    required: field.required,
    sectionId: field.sectionId,
    config: parseFieldConfig(field.type, field.config),
    options: field.options.map((option) => ({
      id: option.id,
      code: option.code,
      labelNl: option.labelNl,
      labelEn: option.labelEn,
      soldOut: option.quotaLimit != null && option.quotaUsed >= option.quotaLimit,
      waitlist: option.allowWaitlist,
      // Enkel tonen wanneer het krap wordt; "nog 97 plaatsen" is ruis.
      remaining:
        option.quotaLimit != null && option.quotaLimit - option.quotaUsed <= 10
          ? Math.max(0, option.quotaLimit - option.quotaUsed)
          : null,
    })),
    // `locale` is (nog) niet nodig om de velden te bouwen, maar hoort bij de
    // signatuur zodat een latere vertaalslag niet elke aanroeper raakt.
    locale,
  }));
}

export function formConditions(form: PublicFormData): VisibilityCondition[] {
  return form.fields.flatMap((field) =>
    field.conditions.map((condition) => ({
      fieldId: field.id,
      sourceFieldId: condition.sourceFieldId,
      operator: condition.operator,
      value: condition.value,
    }))
  );
}

/**
 * Biedt dit formulier deze taal aan? Een beheerder mag bewust maar één taal
 * invullen; de andere taal krijgt dan een bericht in plaats van een halfleeg
 * formulier of een 404.
 */
export function offersLocale(form: { localeMode: string }, locale: Locale): boolean {
  if (form.localeMode === "NL_ONLY") return locale === "nl";
  if (form.localeMode === "EN_ONLY") return locale === "en";
  return true;
}

export function unavailableMessage(
  form: { unavailableNl: string | null; unavailableEn: string | null },
  locale: Locale
): string {
  const own = locale === "en" ? form.unavailableEn : form.unavailableNl;
  if (own) return own;
  return locale === "en"
    ? "Sorry, this form is only available in Dutch."
    : "Sorry, dit formulier is enkel in het Engels beschikbaar.";
}

export function formAvailability(
  form: {
    status: string;
    audience: string;
    opensAt: Date | null;
    closesAt: Date | null;
    maxEntries: number | null;
    allowWaitlist: boolean;
    localeMode: string;
    allowMultipleSubmissions: boolean;
    submittedCount: number;
  },
  context: { now?: Date; loggedIn: boolean; ownEntries: number; locale: Locale }
): FormAvailability {
  const now = context.now ?? new Date();

  if (form.status !== "PUBLISHED") return "DRAFT";
  if (!offersLocale(form, context.locale)) return "LANGUAGE_UNAVAILABLE";
  if (form.opensAt && now < form.opensAt) return "NOT_OPEN_YET";
  if (form.closesAt && now >= form.closesAt) return "CLOSED";
  if (form.audience === "MEMBERS" && !context.loggedIn) return "MEMBERS_ONLY";
  // Wie al indiende ziet dat liever dan "vol": het is een ander verhaal, ook
  // wanneer het formulier toevallig tegelijk vol zit.
  if (!form.allowMultipleSubmissions && context.ownEntries > 0) return "ALREADY_SUBMITTED";
  if (form.maxEntries != null && form.submittedCount >= form.maxEntries) {
    // Vol met een wachtlijst is niet hetzelfde als dicht: invullen kan nog,
    // maar de bezoeker hoort te weten waar hij aan begint.
    return form.allowWaitlist ? "WAITLIST" : "FULL";
  }
  return "OPEN";
}

/**
 * Hoeveel dagen tot het sluit, voor de melding op de pagina. Geeft null wanneer
 * er geen sluitmoment is of het al voorbij is.
 */
export function daysUntilClose(closesAt: Date | null, now = new Date()): number | null {
  if (!closesAt) return null;
  const milliseconds = closesAt.getTime() - now.getTime();
  if (milliseconds <= 0) return null;
  return Math.ceil(milliseconds / (24 * 60 * 60 * 1000));
}
