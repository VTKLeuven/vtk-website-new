import type { Locale } from "@vtk/i18n";

/**
 * Websitefeedback: wat een lid via het accountmenu over de site zelf meldt.
 *
 * Sinds oktober 2026 landt die feedback in Dopl, het platform waar IT al zijn
 * werk bijhoudt; de site toont enkel dat formulier (`FeedbackDialog`). De rest
 * van dit bestand (categorieën, statussen, labels) dient nog voor het beheer van
 * de meldingen die de site zelf bewaarde, op /admin/it/feedback.
 */

/** Waar Dopl draait; enkel berichten van deze oorsprong worden gelezen. */
export const DOPL_ORIGIN = "https://dopl.vtk.be";

/** Het publieke formulier "Feedback Nieuwe Website" in Dopl. */
export const DOPL_FEEDBACK_FORM_SLUG = "website-feedback-nieuwe-website";

const DOPL_FEEDBACK_FORM_BASE = `${DOPL_ORIGIN}/f/${DOPL_FEEDBACK_FORM_SLUG}`;

/**
 * Wat Dopl van wie feedback geeft al kan weten: de taal van de pagina, en bij
 * een ingelogd lid zijn naam en adres. Dopl zelf is Engelstalig; enkel het
 * publieke formulier spreekt Nederlands, met `?lang=nl`. Naam en adres vullen
 * de twee contactvelden in, die het lid nog kan wijzigen (Dopl D-142).
 */
export type DoplFeedbackContext = {
  locale: Locale;
  name?: string | null;
  email?: string | null;
};

function contextParams(context: DoplFeedbackContext): URLSearchParams {
  const params = new URLSearchParams();
  // Engels is wat Dopl zonder parameter al doet.
  if (context.locale === "nl") params.set("lang", "nl");
  if (context.email) params.set("email", context.email);
  if (context.name) params.set("name", context.name);
  return params;
}

/** Het formulier als gewone pagina, voor wie het in een nieuw tabblad opent. */
export function doplFeedbackFormUrl(context: DoplFeedbackContext): string {
  const query = contextParams(context).toString();
  return query ? `${DOPL_FEEDBACK_FORM_BASE}?${query}` : DOPL_FEEDBACK_FORM_BASE;
}

/**
 * Het formulier zoals `embed.js` van Dopl het in zijn modal laadt: zonder de
 * paginarand, met zijn eigen sluitknop, en met de site als `origin`. Dopl
 * aanvaardt een inzending enkel van een oorsprong die het formulier toelaat
 * (`allowedEmbedOrigins`), en leest die uit deze parameter wanneer de browser
 * `ancestorOrigins` niet kent.
 */
export function doplFeedbackEmbedUrl(hostOrigin: string, context: DoplFeedbackContext): string {
  const params = new URLSearchParams({ embed: "modal", origin: hostOrigin });
  for (const [key, value] of contextParams(context)) params.set(key, value);
  return `${DOPL_FEEDBACK_FORM_BASE}?${params.toString()}`;
}

export const FEEDBACK_LIMITS = {
  note: 1000,
} as const;

/** Waarover de melding gaat; volgt de enum `WebsiteFeedbackKind`. */
export const FEEDBACK_KINDS = ["BUG", "CONTENT", "DESIGN", "FEATURE", "OTHER"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_STATUSES = ["NEW", "PLANNED", "DONE", "DISMISSED"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === "string" && (FEEDBACK_KINDS as readonly string[]).includes(value);
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

/** De categorie in één woord, in beide talen van het beheer. */
export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, { nl: string; en: string }> = {
  BUG: { nl: "Bug", en: "Bug" },
  CONTENT: { nl: "Inhoud", en: "Content" },
  DESIGN: { nl: "Design", en: "Design" },
  FEATURE: { nl: "Idee", en: "Idea" },
  OTHER: { nl: "Iets anders", en: "Something else" },
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, { nl: string; en: string }> = {
  NEW: { nl: "Nieuw", en: "New" },
  PLANNED: { nl: "Op de lijst", en: "On the list" },
  DONE: { nl: "Opgelost", en: "Done" },
  DISMISSED: { nl: "Niets mee gedaan", en: "No action" },
};

export function feedbackKindLabel(kind: FeedbackKind, locale: Locale): string {
  return locale === "nl" ? FEEDBACK_KIND_LABELS[kind].nl : FEEDBACK_KIND_LABELS[kind].en;
}

export function feedbackStatusLabel(status: FeedbackStatus, locale: Locale): string {
  return locale === "nl" ? FEEDBACK_STATUS_LABELS[status].nl : FEEDBACK_STATUS_LABELS[status].en;
}
