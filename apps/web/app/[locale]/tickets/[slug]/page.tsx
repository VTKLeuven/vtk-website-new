import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, ShieldCheck } from "lucide-react";
import type { Locale } from "@vtk/i18n";
import { getPublishedTicketEventBySlug } from "@/lib/ticketing/queries";
import { hasLocale } from "@/lib/locale";
import { buildMetadata } from "@/lib/seo";
import { TicketShop } from "@/components/ticketing/public/TicketShop";
import {
  formatTicketDate,
  serializeTicketEvent,
  type PublicTicketEvent,
} from "@/components/ticketing/public/types";

import "@/app/design/vtk-tickets.css";

type Params = Promise<{ locale: string; slug: string }>;

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

export default async function TicketEventPage({ params }: { params: Params }) {
  const { locale: localeParam, slug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale = localeParam;
  const base = locale === "nl" ? "" : "/en";
  const event = await loadEvent(slug, locale);
  if (!event) notFound();

  return (
    <div className="vtk-page vtk-tickets-page">
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
        <TicketShop event={serializeTicketEvent(event)} locale={locale} />
      </main>
    </div>
  );
}
