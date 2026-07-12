import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, ShieldCheck } from "lucide-react";
import { getPublishedTicketEventBySlug } from "@/lib/ticketing/queries";
import { hasLocale } from "@/lib/locale";
import { TicketShop } from "@/components/ticketing/public/TicketShop";
import {
  formatTicketDate,
  serializeTicketEvent,
  type PublicTicketEvent,
} from "@/components/ticketing/public/types";

import "@/app/design/vtk-tickets.css";

export default async function TicketEventPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: localeParam, slug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale = localeParam;
  const base = locale === "nl" ? "" : "/en";
  const event = (await getPublishedTicketEventBySlug(slug, locale)) as PublicTicketEvent | null;
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
