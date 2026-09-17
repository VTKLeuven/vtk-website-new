import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Eye, MapPin, PencilLine, ShieldCheck } from "lucide-react";
import type { Locale } from "@vtk/i18n";
import {
  getPublishedTicketEventBySlug,
  getTicketEventPreviewBySlug,
} from "@/lib/ticketing/queries";
import { hasLocale } from "@/lib/locale";
import { buildMetadata } from "@/lib/seo";
import { paymentMethodChoice } from "@/lib/ticketing/paymentMethods";
import { TicketShop } from "@/components/ticketing/public/TicketShop";
import {
  formatTicketDate,
  serializeTicketEvent,
  type PublicTicketEvent,
} from "@/components/ticketing/public/types";

import "@/app/design/vtk-tickets.css";

type Params = Promise<{ locale: string; slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const PREVIEW = {
  nl: {
    label: "Voorbeeld",
    draft: "Dit is een voorbeeld van de ticketpagina. Bezoekers zien ze pas na publiceren.",
    live: "Dit is een voorbeeld: het event staat al live, dit is dezelfde pagina.",
    types: "Je ziet hier alle actieve tickettypes, ook die enkel voor leden of ereleden zichtbaar zijn, en bestellen is uitgeschakeld.",
    back: "Terug naar de instellingen",
  },
  en: {
    label: "Preview",
    draft: "This is a preview of the ticket page. Visitors only see it once you publish.",
    live: "This is a preview: the event is already live, this is the same page.",
    types: "You see every active ticket type here, including the ones only visible to members or honorary members, and ordering is disabled.",
    back: "Back to the settings",
  },
} as const;

/** Zodat `generateMetadata` en de pagina zelf dezelfde query delen. */
const loadEvent = cache(
  async (slug: string, locale: Locale) =>
    (await getPublishedTicketEventBySlug(slug, locale)) as PublicTicketEvent | null,
);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(locale)) return {};

  const event = await loadEvent(slug, locale);
  if (!event) return {};

  // De datum voorop: bij een gedeelde ticketlink is "wanneer" het eerste wat
  // iemand wil weten, en de beschrijving van een event begint zelden met de dag.
  const date = formatTicketDate(event.startsAt, locale);
  const place = event.location ? ` · ${event.location}` : "";
  return buildMetadata({
    title: event.title,
    description: `${date}${place}${event.description ? ` · ${event.description}` : ""}`,
    path: `/tickets/${slug}`,
    locale,
    type: "article",
  });
}

export default async function TicketEventPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { locale: localeParam, slug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale = localeParam;
  const base = locale === "nl" ? "" : "/en";
  const preview = (await searchParams).preview === "1";
  const event = preview
    ? ((await getTicketEventPreviewBySlug(slug, locale)) as PublicTicketEvent | null)
    : await loadEvent(slug, locale);
  if (!event) notFound();
  const previewText = PREVIEW[locale];

  return (
    <div className="vtk-page vtk-tickets-page">
      {preview ? (
        <div className="ticket-preview-bar">
          <p>
            <span className="ticket-preview-tag">
              <Eye size={14} aria-hidden="true" /> {previewText.label}
            </span>
            <strong>{event.status === "PUBLISHED" ? previewText.live : previewText.draft}</strong>
            <span>{previewText.types}</span>
          </p>
          <Link
            className="ticket-preview-back"
            href={`${base}/admin/tickets/${event.id}/instellingen`}
          >
            <PencilLine size={16} aria-hidden="true" /> {previewText.back}
          </Link>
        </div>
      ) : null}
      <header className="ticket-shop-head">
        <div className="ticket-shop-head-inner">
          <Link href={`${base}/tickets`} className="ticket-back-link"><ArrowLeft size={17} aria-hidden="true" /> {locale === "nl" ? "Alle tickets" : "All tickets"}</Link>
          <span className="ticket-eyebrow"><span /> {event.ownerGroupName ?? "VTK"}</span>
          <h1>{event.title}</h1>
          {event.description ? <p className="ticket-shop-description">{event.description}</p> : null}
          <div className="ticket-shop-facts">
            <span><CalendarDays size={18} aria-hidden="true" /> {formatTicketDate(event.startsAt, locale)}</span>
            <span><MapPin size={18} aria-hidden="true" /> {event.location ?? (locale === "nl" ? "Locatie volgt" : "Location to be announced")}</span>
            <span><ShieldCheck size={18} aria-hidden="true" /> {locale === "nl" ? "Veilige betaling" : "Secure payment"}</span>
          </div>
        </div>
      </header>
      <main className="ticket-shop-shell">
        <TicketShop
          event={serializeTicketEvent(event)}
          locale={locale}
          paymentChoice={paymentMethodChoice(locale)}
          preview={preview}
        />
      </main>
    </div>
  );
}
