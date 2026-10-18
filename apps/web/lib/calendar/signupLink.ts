import type { Locale } from "@vtk/i18n";
import { eventLinkLabel } from "@/lib/calendar/eventLink";
import { publishedTicketSlug, type TicketLinkRow } from "@/lib/ticketing/eventPage";

/**
 * De knop naast "Meer info" buiten de site: waar je je inschrijft of een ticket
 * koopt. Dezelfde voorrang als de knoppen op de eventpagina: eerst de eigen
 * ticketverkoop, dan het formulier bij het evenement, dan de externe link.
 *
 * Gedeeld door de Discord-posts (en hun klikteller) en de herinneringsmail. Puur,
 * zodat de klikteller bij elke klik opnieuw dezelfde keuze maakt: een
 * ticketverkoop die intussen een andere slug kreeg, komt zo niet op een 404 uit.
 */

export type EventSignupLinkKind = "tickets" | "form" | "link";

export type EventSignupLinkSource = {
  url: string | null;
  urlLabelNl: string | null;
  urlLabelEn: string | null;
  ticketEvents: readonly TicketLinkRow[];
  form: {
    slug: string;
    status: string;
    closesAt: Date | null;
  } | null;
};

export type EventSignupLink = {
  kind: EventSignupLinkKind;
  label: string;
  /** Een pad op de site ("/tickets/galabal") of een volledige externe URL. */
  href: string;
};

/** Het `select`-blok dat bij `EventSignupLinkSource` hoort. */
export const SIGNUP_LINK_SELECT = {
  url: true,
  urlLabelNl: true,
  urlLabelEn: true,
  ticketEvents: { select: { slug: true, status: true, isPrivate: true, startsAt: true, createdAt: true } },
  form: { select: { slug: true, status: true, closesAt: true } },
} as const;

export function eventSignupLink(
  event: EventSignupLinkSource,
  now: Date,
  locale: Locale = "nl",
): EventSignupLink | null {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const ticketSlug = publishedTicketSlug(event.ticketEvents);
  if (ticketSlug) {
    return { kind: "tickets", label: nl ? "Tickets kopen" : "Buy tickets", href: `${base}/tickets/${ticketSlug}` };
  }

  // Een formulier dat nog niet open is, krijgt de knop wel: de formulierpagina
  // zegt dan zelf vanaf wanneer. Een gesloten formulier niet meer.
  const form = event.form;
  if (form && form.status === "PUBLISHED" && !(form.closesAt && form.closesAt <= now)) {
    return { kind: "form", label: nl ? "Inschrijven" : "Sign up", href: `${base}/formulieren/${form.slug}` };
  }

  const url = event.url?.trim();
  if (url && (/^https?:\/\//i.test(url) || (url.startsWith("/") && !url.startsWith("//")))) {
    return { kind: "link", label: eventLinkLabel(event, locale), href: url };
  }
  return null;
}

/** Een pad op de site wordt een volledige URL; een externe link blijft wat hij is. */
export function absoluteHref(href: string, siteOrigin: string): string {
  return href.startsWith("/") ? `${siteOrigin}${href}` : href;
}
