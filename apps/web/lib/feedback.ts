import type { Locale } from "@vtk/i18n";

/**
 * Websitefeedback: wat een lid via het accountmenu over de site zelf meldt.
 *
 * Hier staan enkel de gedeelde afspraken (grenzen, categorieën, labels), zodat
 * het formulier, de server action en het beheerscherm dezelfde lijst gebruiken.
 * Het I/O-werk staat in `app/actions/feedback.ts`.
 */

export const FEEDBACK_LIMITS = {
  message: 4000,
  note: 1000,
  path: 300,
  userAgent: 400,
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

/**
 * De categorie in één woord, plus de zin eronder in het formulier. Twee talen,
 * want dit staat zowel op de publieke site als in het beheer.
 */
export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, { nl: string; en: string }> = {
  BUG: { nl: "Bug", en: "Bug" },
  CONTENT: { nl: "Inhoud", en: "Content" },
  DESIGN: { nl: "Design", en: "Design" },
  FEATURE: { nl: "Idee", en: "Idea" },
  OTHER: { nl: "Iets anders", en: "Something else" },
};

export const FEEDBACK_KIND_HINTS: Record<FeedbackKind, { nl: string; en: string }> = {
  BUG: { nl: "Iets werkt niet", en: "Something is broken" },
  CONTENT: { nl: "Tekst of info klopt niet", en: "Text or info is wrong" },
  DESIGN: { nl: "Ziet er raar uit", en: "Looks off" },
  FEATURE: { nl: "Voorstel voor iets nieuws", en: "A suggestion for something new" },
  OTHER: { nl: "Past nergens bij", en: "Fits nowhere else" },
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

/**
 * Het pad waar de melder stond, zoals we het bewaren: enkel een pad op deze
 * site, met querystring maar zonder domein. Een volledige URL uit een
 * gemanipuleerd formulier zou van het beheerscherm een doorverwijzing naar om
 * het even welke site maken.
 */
export function normaliseFeedbackPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  // `//evil.example` is voor een browser een protocol-relatieve URL, geen pad.
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw.slice(0, FEEDBACK_LIMITS.path);
}
