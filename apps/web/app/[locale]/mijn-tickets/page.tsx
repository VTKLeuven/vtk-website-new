import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@vtk/auth/server";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogIn,
  MapPin,
  TicketCheck,
} from "lucide-react";
import { listTicketsForCurrentUser } from "@/lib/ticketing/queries";
import { hasLocale } from "@/lib/locale";
import {
  formatTicketDate,
  formatTicketPrice,
  type PublicOrder,
} from "@/components/ticketing/public/types";

import "@/app/design/vtk-tickets.css";

function OrderState({ status, locale }: { status: string; locale: "nl" | "en" }) {
  const ready = status === "PAID" || status === "PARTIALLY_REFUNDED";
  return (
    <span className={`my-ticket-state${ready ? " is-ready" : ""}`}>
      {ready ? <CheckCircle2 size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}
      {ready
        ? locale === "nl" ? "Klaar" : "Ready"
        : locale === "nl" ? "In verwerking" : "Processing"}
    </span>
  );
}

export default async function MyTicketsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale = localeParam;
  const base = locale === "nl" ? "" : "/en";
  const session = await getSession(await headers());

  if (!session) {
    return (
      <main className="vtk-page my-tickets-page">
        <section className="ticket-auth-state">
          <LogIn size={30} aria-hidden="true" />
          <h1>{locale === "nl" ? "Log in voor je tickets" : "Sign in for your tickets"}</h1>
          <p>{locale === "nl" ? "Bekijk al je VTK-tickets op één plek." : "See all your VTK tickets in one place."}</p>
          <Link href={`${base}/inloggen`} className="ticket-primary-button">
            {locale === "nl" ? "Inloggen" : "Sign in"} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>
      </main>
    );
  }

  const orders = (await listTicketsForCurrentUser()) as PublicOrder[];

  return (
    <div className="vtk-page my-tickets-page">
      <header className="my-tickets-head">
        <div>
          <span className="ticket-eyebrow"><span /> {locale === "nl" ? "Persoonlijk" : "Personal"}</span>
          <h1>{locale === "nl" ? "Mijn tickets" : "My tickets"}</h1>
          <p>{locale === "nl" ? `Aangemeld als ${session.user.email}` : `Signed in as ${session.user.email}`}</p>
        </div>
        <Link href={`${base}/tickets`} className="ticket-secondary-button">
          {locale === "nl" ? "Meer tickets" : "Find tickets"} <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </header>

      <main className="my-tickets-shell">
        {orders.length > 0 ? (
          <ul className="my-ticket-orders">
            {orders.map((order) => (
              <li key={order.id}>
                <Link href={`${base}/mijn-tickets/${order.id}`} className="my-ticket-order-link">
                  <div className="my-ticket-order-date" aria-hidden="true">
                    <strong>{new Date(order.event.startsAt).getDate()}</strong>
                    <span>{new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-BE", { month: "short" }).format(new Date(order.event.startsAt)).replace(".", "")}</span>
                  </div>
                  <div className="my-ticket-order-copy">
                    <div><OrderState status={order.status} locale={locale} /><span>{order.orderNumber}</span></div>
                    <h2>{order.event.title}</h2>
                    <p><CalendarDays size={15} aria-hidden="true" /> {formatTicketDate(order.event.startsAt, locale)}</p>
                    <p><MapPin size={15} aria-hidden="true" /> {order.event.location ?? "-"}</p>
                  </div>
                  <div className="my-ticket-order-meta">
                    <span>{order.tickets.length} {order.tickets.length === 1 ? "ticket" : "tickets"}</span>
                    <strong>{formatTicketPrice(order.totalCents, order.currency, locale)}</strong>
                  </div>
                  <ArrowRight size={21} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <section className="ticket-empty-state">
            <TicketCheck size={30} aria-hidden="true" />
            <h2>{locale === "nl" ? "Nog geen tickets" : "No tickets yet"}</h2>
            <p>{locale === "nl" ? "Je betaalde bestellingen verschijnen automatisch hier." : "Your paid orders will automatically appear here."}</p>
            <Link href={`${base}/tickets`} className="ticket-primary-button">{locale === "nl" ? "Bekijk events" : "Browse events"} <ArrowRight size={17} aria-hidden="true" /></Link>
          </section>
        )}
      </main>
    </div>
  );
}
