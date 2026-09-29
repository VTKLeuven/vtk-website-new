import type { ReactNode } from "react";
import { Clock } from "lucide-react";
import Link from "@/components/ui/Link";
import type { Locale } from "@vtk/i18n";
import { organiserName } from "@/lib/calendar/organiser";
import { paymentMethodChoice } from "@/lib/ticketing/paymentMethods";
import {
  eventPageTicketLabel,
  separateTicketPages,
  ticketTimeRange,
  type EventPageTicket,
} from "@/lib/ticketing/eventPage";
import { TicketShop } from "@/components/ticketing/public/TicketShop";
import { TicketShopLink } from "@/components/ticketing/public/TicketShopLink";
import {
  serializeTicketEvent,
  type PublicTicketEvent,
} from "@/components/ticketing/public/types";
import {
  AddToCalendarLink,
  dayLabel,
  EventHead,
  EventInterestButton,
  EventPhotoAndAbout,
  EventWhenBlock,
  eventWhen,
  loadEventParticipation,
  openEventForm,
  type CalendarEventPageData,
} from "./EventPageParts";

import "@/app/design/vtk-event.css";
import "@/app/design/vtk-tickets.css";
import "@/app/design/vtk-ticket-shop.css";

/**
 * De eventpagina met de tickets erop: de kop en de beschrijving van het
 * kalenderevent, en rechts het ticketpaneel waar op een gewone eventpagina
 * "Doe mee" staat. Interesse en "Zet in mijn agenda" staan klein onder het
 * paneel; het praktische daaronder.
 *
 * Getoond op `/kalender/<slug>` (met de eerste verkoop gekozen) en op
 * `/tickets/<slug>` van elke verkoop met `onEventPage`. Heeft het event er meer
 * dan één, dan staan ze als tabs bovenaan het paneel, en elke tab is een link
 * naar het eigen adres van die verkoop: zo blijft "de losse cantussen" te delen
 * zonder de volledige 12u erbij. Zie docs/design-decisions.md.
 */
export async function EventTicketsPage({
  event,
  tickets,
  allTickets,
  selected,
  locale,
  preview = false,
  returnPath,
  before,
}: {
  event: CalendarEventPageData;
  /** De verkopen op de eventpagina, in de volgorde van de tabs. */
  tickets: EventPageTicket[];
  /** Alle verkopen van het event, ook die met een eigen ticketpagina. */
  allTickets: EventPageTicket[];
  /** De gekozen verkoop, zoals de shop ze nodig heeft. */
  selected: PublicTicketEvent;
  locale: Locale;
  preview?: boolean;
  /** Waar een bezoeker na het inloggen terug moet komen. */
  returnPath: string;
  /** Boven de kop, zoals de voorbeeldbalk van het ticketbeheer. */
  before?: ReactNode;
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const participation = await loadEventParticipation(event, returnPath);
  const form = openEventForm(event);
  const separate = separateTicketPages(allTickets);

  return (
    <article className="vtk-page vtk-tickets-page">
      {before}
      <EventHead event={event} locale={locale} />
      <main className="tshop-shell">
        <TicketShop
          // Een andere verkoop is een ander winkelmandje: zonder sleutel bleven de
          // aantallen van de vorige tab staan na het wisselen.
          key={selected.id}
          event={serializeTicketEvent(selected)}
          locale={locale}
          paymentChoice={paymentMethodChoice(locale)}
          preview={preview}
          choices={
            <TicketChoices tickets={tickets} selected={selected} locale={locale} base={base} />
          }
          about={
            <EventPhotoAndAbout
              event={event}
              locale={locale}
              participation={participation}
              sizes="(max-width: 960px) 100vw, 760px"
            />
          }
          practical={
            <>
              {event.moments.length > 0 ? (
                <div className="tshop-event-when">
                  <EventWhenBlock event={event} locale={locale} participation={participation} />
                </div>
              ) : null}
              <div className="vtk-event-actions tshop-event-actions">
                <EventInterestButton
                  event={event}
                  locale={locale}
                  participation={participation}
                  quiet
                />
                <AddToCalendarLink event={event} locale={locale} />
                {form ? (
                  <Link href={`${base}/formulieren/${form.slug}`} className="btn btn-ghost">
                    {nl ? "Inschrijven" : "Sign up"}
                  </Link>
                ) : null}
                {/* Een verkoop van dit event die niet op de eventpagina staat,
                    houdt haar eigen pagina; hier staat de weg ernaartoe. */}
                {separate.map((ticket, index) => (
                  <TicketShopLink
                    key={ticket.id}
                    href={`${base}/tickets/${ticket.slug}`}
                    className="btn btn-ghost"
                  >
                    Tickets:{" "}
                    {eventPageTicketLabel(ticket, locale, tickets.length + index)}
                  </TicketShopLink>
                ))}
              </div>
              <EventPractical event={event} selected={selected} locale={locale} />
            </>
          }
        />
      </main>
    </article>
  );
}

/**
 * De tabs bovenaan het ticketpaneel, en het uur van deze tickets wanneer dat
 * afwijkt van het event. Een tab is een link: elke verkoop heeft haar eigen adres
 * en dat is wat iemand deelt.
 */
function TicketChoices({
  tickets,
  selected,
  locale,
  base,
}: {
  tickets: EventPageTicket[];
  selected: PublicTicketEvent;
  locale: Locale;
  base: string;
}) {
  const nl = locale === "nl";
  const current = tickets.find((ticket) => ticket.id === selected.id);
  const ownTimes = current?.ownTimes ? current : null;
  if (tickets.length < 2 && !ownTimes) return null;

  return (
    <div className="tshop-choices">
      {tickets.length > 1 ? (
        <nav className="tshop-choice-tabs" aria-label={nl ? "Soort tickets" : "Ticket options"}>
          {tickets.map((ticket, index) => (
            <TicketShopLink
              key={ticket.id}
              href={`${base}/tickets/${ticket.slug}`}
              scroll={false}
              className="tshop-choice"
              aria-current={ticket.id === selected.id ? "page" : undefined}
            >
              {eventPageTicketLabel(ticket, locale, index)}
            </TicketShopLink>
          ))}
        </nav>
      ) : null}
      {ownTimes ? (
        <p className="tshop-choice-note">
          <Clock size={16} aria-hidden="true" />
          <span>
            {nl ? "Deze tickets: " : "These tickets: "}
            <strong>
              {dayLabel(ownTimes.startsAt, locale, "short")}, {ticketTimeRange(ownTimes, locale)}
            </strong>
          </span>
        </p>
      ) : null}
    </div>
  );
}

/** Wanneer, waar en wie: het register onder het paneel, zoals op een ticketpagina. */
function EventPractical({
  event,
  selected,
  locale,
}: {
  event: CalendarEventPageData;
  selected: PublicTicketEvent;
  locale: Locale;
}) {
  const nl = locale === "nl";
  const organiser = organiserName(event.organiserName, event.group, locale);
  const startsAt = new Date(selected.startsAt);
  const endsAt = new Date(selected.endsAt);

  return (
    <aside className="tshop-rail" aria-labelledby="event-practical-heading">
      <h2 id="event-practical-heading">{nl ? "Praktisch" : "Practical"}</h2>
      <dl>
        <div>
          <dt>{nl ? "Wanneer" : "When"}</dt>
          <dd>
            {selected.ownTimes ? (
              <>
                {dayLabel(startsAt, locale)}
                <span>{ticketTimeRange({ startsAt, endsAt }, locale)}</span>
              </>
            ) : (
              eventWhen(event, locale)
            )}
          </dd>
        </div>
        <div>
          <dt>{nl ? "Locatie" : "Location"}</dt>
          <dd>
            {event.location ?? (nl ? "Nog te bevestigen" : "To be confirmed")}
            {selected.locationAddress ? <span>{selected.locationAddress}</span> : null}
          </dd>
        </div>
        <div>
          <dt>{nl ? "Organisator" : "Organiser"}</dt>
          <dd>{organiser}</dd>
        </div>
        {selected.contactEmail ? (
          <div>
            <dt>{nl ? "Vragen" : "Questions"}</dt>
            <dd>
              <a href={`mailto:${selected.contactEmail}`}>{selected.contactEmail}</a>
            </dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}
