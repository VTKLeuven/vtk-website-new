import Image from "next/image";
import Link from "@/components/ui/Link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import {
  availableTicketCount,
  formatTicketMoment,
  formatTicketPrice,
  type PublicTicketEvent,
} from "./types";

/** Onder dit aantal zegt de kaart hoeveel er nog zijn, net als het ticketpaneel. */
const LOW_STOCK = 20;
/** Meer soorten dan dit worden "+2 andere": de kaart is een overzicht, geen kassa. */
const MAX_PRICE_ROWS = 4;

function brussels(value: string | Date, locale: "nl" | "en", options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    timeZone: "Europe/Brussels",
    ...options,
  })
    .format(new Date(value))
    .replace(".", "");
}

/** De eerste alinea, op één regel. De kaart knipt ze zelf af op twee regels. */
function excerpt(description: string | null | undefined): string {
  const first = (description ?? "").split(/\n\s*\n/)[0] ?? "";
  return first.replace(/\s+/g, " ").trim();
}

export type TicketEventState = "open" | "soon";

/** Staat de verkoop van dit event voor deze bezoeker nu open? */
export function ticketEventState(event: PublicTicketEvent): TicketEventState {
  return event.salesOpensAt ? "soon" : "open";
}

/**
 * Wat er nu over de verkoop te zeggen valt, in één pil. De volgorde telt: wie
 * geen tickets kan kopen, moet eerst weten waarom.
 */
function eventStatus(event: PublicTicketEvent, locale: "nl" | "en") {
  const nl = locale === "nl";
  if (event.salesOpensAt) {
    return {
      tone: "info",
      label: `${nl ? "Te koop vanaf" : "On sale from"} ${formatTicketMoment(event.salesOpensAt, locale)}`,
    };
  }
  if (event.requiresLogin) return { tone: "info", label: nl ? "Inloggen voor tickets" : "Sign in for tickets" };
  if (event.requiresMembership) return { tone: "info", label: nl ? "Enkel voor leden" : "Members only" };
  const available = availableTicketCount(event.ticketTypes.filter((type) => type.active));
  if (available < 1) return { tone: "out", label: nl ? "Uitverkocht" : "Sold out" };
  if (event.presale) return { tone: "low", label: nl ? "Voorverkoop voor jou" : "Presale for you" };
  if (available <= LOW_STOCK) return { tone: "low", label: nl ? `Nog ${available}` : `${available} left` };
  return { tone: "ok", label: nl ? "Te koop" : "On sale" };
}

/**
 * Eén event op /tickets: poster, wat het is, en rechts de tickets met hun
 * prijzen zoals deze bezoeker ze betaalt. Zie vtk-ticket-catalog.css.
 */
export function TicketEventCard({
  event,
  locale,
}: {
  event: PublicTicketEvent;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const types = event.ticketTypes.filter((type) => type.active);
  const shownTypes = types.slice(0, MAX_PRICE_ROWS);
  const status = eventStatus(event, locale);
  const soldOut = status.tone === "out";
  const summary = excerpt(event.description);

  return (
    <li className="tcat-card" data-sold-out={soldOut || undefined}>
      <div className="tcat-shot">
        {event.poster ? (
          <Image
            src={event.poster.src}
            alt=""
            fill
            sizes="(max-width: 620px) 100vw, 240px"
            style={{ objectFit: "cover", objectPosition: event.poster.position }}
          />
        ) : null}
        <span className="tcat-date" aria-hidden="true">
          <small>{brussels(event.startsAt, locale, { weekday: "short" })}</small>
          <b>{brussels(event.startsAt, "en", { day: "numeric" })}</b>
          <small>{brussels(event.startsAt, locale, { month: "short" })}</small>
        </span>
      </div>

      <div className="tcat-body">
        <span className="tcat-owner">{event.ownerGroupName ?? "VTK"}</span>
        {/* De titel draagt de link; `::after` spant ze over de hele kaart. */}
        <h3 className="tcat-title">
          <Link href={`${base}/tickets/${event.slug}`}>{event.title}</Link>
        </h3>
        <p className="tcat-facts">
          <span>
            <CalendarDays size={15} aria-hidden="true" />
            {formatTicketMoment(event.startsAt, locale)}
          </span>
          <span>
            <MapPin size={15} aria-hidden="true" />
            {event.location ?? (nl ? "Locatie volgt" : "Location to be announced")}
          </span>
        </p>
        {summary ? <p className="tcat-summary">{summary}</p> : null}
      </div>

      <div className="tcat-side">
        <div>
          <h4>Tickets</h4>
          {shownTypes.length > 0 ? (
            <ul className="tcat-prices">
              {shownTypes.map((type) => {
                const typeSoldOut = type.available < 1;
                const low = !typeSoldOut && type.available <= LOW_STOCK;
                const hasMemberPrice = type.memberPriceCents != null;
                const price = hasMemberPrice ? type.memberPriceCents! : type.priceCents;
                const notes = [
                  hasMemberPrice
                    ? `${nl ? "Lid · niet-lid" : "Member · non-member"} ${formatTicketPrice(type.priceCents, event.currency, locale)}`
                    : null,
                  typeSoldOut ? (nl ? "Uitverkocht" : "Sold out") : null,
                  low ? (nl ? `Nog ${type.available}` : `${type.available} left`) : null,
                ].filter(Boolean);
                return (
                  <li key={type.id} data-sold-out={typeSoldOut || undefined}>
                    <span>{type.name}</span>
                    <b>{price === 0 ? (nl ? "Gratis" : "Free") : formatTicketPrice(price, event.currency, locale)}</b>
                    {notes.length > 0 ? <small>{notes.join(" · ")}</small> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="tcat-none">
              {event.requiresLogin
                ? nl ? "Log in om de tickets te zien." : "Sign in to see the tickets."
                : event.requiresMembership
                  ? nl ? "De tickets zijn er voor leden van VTK." : "The tickets are for members of VTK."
                  : nl ? "Geen tickets meer te koop." : "No tickets left for sale."}
            </p>
          )}
          {types.length > shownTypes.length ? (
            <p className="tcat-more">
              {nl
                ? `+${types.length - shownTypes.length} andere`
                : `+${types.length - shownTypes.length} more`}
            </p>
          ) : null}
        </div>
        <div className="tcat-foot">
          <span className="tcat-pill" data-tone={status.tone}>{status.label}</span>
          <span className="tcat-go" aria-hidden="true">
            {nl ? "Bekijk" : "View"}
            <ArrowRight size={15} />
          </span>
        </div>
      </div>
    </li>
  );
}
