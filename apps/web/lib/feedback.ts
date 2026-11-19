import type { Locale } from "@vtk/i18n";

/**
 * Websitefeedback: wat een lid via het accountmenu over de site zelf meldt.
 *
 * Sinds oktober 2026 landt die feedback in Dopl, het platform waar IT al zijn
 * werk bijhoudt; de site toont enkel dat formulier (`FeedbackDialog`). Het
 * beheerscherm voor wat de site daarvoor zelf bewaarde (/admin/it/feedback) is
 * in november 2026 weggehaald; de tabel `WebsiteFeedback` blijft staan.
 */

/** Waar Dopl draait; enkel berichten van deze oorsprong worden gelezen. */
export const DOPL_ORIGIN = "https://dopl.vtk.be";

/** Het publieke formulier "Feedback Nieuwe Website" in Dopl. */
export const DOPL_FEEDBACK_FORM_SLUG = "website-feedback-nieuwe-website";

const DOPL_FEEDBACK_FORM_BASE = `${DOPL_ORIGIN}/f/${DOPL_FEEDBACK_FORM_SLUG}`;

/**
 * Wat Dopl van wie feedback geeft al kan weten: de taal van de pagina, en bij
 * een ingelogd lid zijn naam en adres. Dopl zelf is Engelstalig; enkel het
 * publieke formulier spreekt Nederlands, met `?lang=nl`: Dopls eigen woorden
 * (D-142) en de velden van het formulier zelf, voor zover die in de builder van
 * Dopl een Nederlandse versie hebben (D-143). De taal van de site beslist dus de
 * taal van het formulier. Naam en adres vullen de twee contactvelden in, die het
 * lid nog kan wijzigen.
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
