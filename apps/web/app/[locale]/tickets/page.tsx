import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, TicketCheck } from "lucide-react";
import { listPublishedTicketEvents } from "@/lib/ticketing/queries";
import { hasLocale } from "@/lib/locale";
import { TicketEventCard } from "@/components/ticketing/public/TicketEventCard";
import type { PublicTicketEvent } from "@/components/ticketing/public/types";

import "@/app/design/vtk-tickets.css";

export default async function TicketsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale = localeParam;
  const base = locale === "nl" ? "" : "/en";
  const events = (await listPublishedTicketEvents(locale)) as PublicTicketEvent[];

  return (
    <div className="vtk-page vtk-tickets-page">
      <header className="ticket-catalog-head">
        <div className="ticket-catalog-head-inner">
          <div>
            <span className="ticket-eyebrow"><span /> VTK Tickets</span>
            <h1>
              {locale === "nl" ? (
                <>
                  Tickets voor <em>VTK-events</em>.
                </>
              ) : (
                <>
                  Tickets for <em>VTK events</em>.
                </>
              )}
            </h1>
            <p>{locale === "nl" ? "Tickets voor cantussen, galabals en andere VTK-events." : "Tickets for cantuses, galas and other VTK events."}</p>
          </div>
          <Link href={`${base}/account#mijn-vtk-tickets`} className="ticket-my-link">
            <TicketCheck size={19} aria-hidden="true" />
            {locale === "nl" ? "Mijn tickets" : "My tickets"}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="ticket-catalog-shell">
        <div className="ticket-catalog-title-row">
          <div>
            <span>{locale === "nl" ? "Beschikbaar" : "Available"}</span>
            <h2>{locale === "nl" ? "Aankomende events" : "Upcoming events"}</h2>
          </div>
          <div className="ticket-catalog-count"><CalendarDays size={17} aria-hidden="true" /> {events.length}</div>
        </div>

        {events.length > 0 ? (
          <ul className="ticket-event-list">
            {events.map((event) => <TicketEventCard key={event.id} event={event} locale={locale} />)}
          </ul>
        ) : (
          <section className="ticket-empty-state">
            <TicketCheck size={30} aria-hidden="true" />
            <h2>{locale === "nl" ? "Momenteel geen ticketverkoop" : "No tickets on sale right now"}</h2>
            <p>{locale === "nl" ? "Nieuwe events verschijnen hier zodra de verkoop opent." : "New events will appear here when sales open."}</p>
            <Link href={`${base}/kalender`} className="ticket-secondary-button">{locale === "nl" ? "Bekijk de kalender" : "View calendar"} <ArrowRight size={17} aria-hidden="true" /></Link>
          </section>
        )}
      </main>
    </div>
  );
}
