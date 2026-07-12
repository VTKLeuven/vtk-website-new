import Link from "next/link";
import { ArrowRight, CalendarDays, LogIn, MapPin, Ticket } from "lucide-react";
import {
  availableTicketCount,
  formatTicketDate,
  formatTicketPrice,
  type PublicTicketEvent,
} from "./types";

export function TicketEventCard({
  event,
  locale,
}: {
  event: PublicTicketEvent;
  locale: "nl" | "en";
}) {
  const base = locale === "nl" ? "" : "/en";
  const activeTypes = event.ticketTypes.filter((type) => type.active);
  const available = availableTicketCount(activeTypes);
  const minimum = activeTypes.length
    ? Math.min(...activeTypes.map((type) => type.priceCents))
    : null;

  return (
    <li className="ticket-event-card">
      <Link href={`${base}/tickets/${event.slug}`} className="ticket-event-card-link">
        <div className="ticket-event-date" aria-hidden="true">
          <span>
            {new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-BE", {
              month: "short",
            })
              .format(new Date(event.startsAt))
              .replace(".", "")}
          </span>
          <strong>{new Date(event.startsAt).getDate()}</strong>
        </div>

        <div className="ticket-event-copy">
          <div className="ticket-event-owner">{event.ownerGroupName ?? "VTK"}</div>
          <h2>{event.title}</h2>
          <div className="ticket-event-facts">
            <span>
              <CalendarDays size={16} aria-hidden="true" />
              {formatTicketDate(event.startsAt, locale)}
            </span>
            <span>
              <MapPin size={16} aria-hidden="true" />
              {event.location ?? (locale === "nl" ? "Locatie volgt" : "Location to be announced")}
            </span>
          </div>
        </div>

        <div className="ticket-event-price">
          <span>{locale === "nl" ? "Vanaf" : "From"}</span>
          <strong>
            {event.requiresLogin && minimum === null
              ? locale === "nl"
                ? "Na inloggen"
                : "After sign-in"
              : minimum === null
              ? locale === "nl"
                ? "Niet beschikbaar"
                : "Unavailable"
              : formatTicketPrice(minimum, event.currency, locale)}
          </strong>
          <small className={available > 0 || event.requiresLogin ? "is-available" : "is-sold-out"}>
            {event.requiresLogin ? (
              <LogIn size={14} aria-hidden="true" />
            ) : (
              <Ticket size={14} aria-hidden="true" />
            )}
            {event.requiresLogin
              ? locale === "nl"
                ? "Inloggen voor tickets"
                : "Sign in for tickets"
              : available > 0
              ? locale === "nl"
                ? `${available} beschikbaar`
                : `${available} available`
              : locale === "nl"
                ? "Uitverkocht"
                : "Sold out"}
          </small>
        </div>

        <ArrowRight className="ticket-event-arrow" size={22} aria-hidden="true" />
      </Link>
    </li>
  );
}
