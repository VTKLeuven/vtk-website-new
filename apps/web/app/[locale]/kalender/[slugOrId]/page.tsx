import type { Metadata } from "next";
import Link from "@/components/ui/Link";
import { notFound, permanentRedirect } from "next/navigation";
import { pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { eventLinkLabel } from "@/lib/calendar/eventLink";
import { publicUrl } from "@/lib/storage";
import { defaultEventImageFor, eventCategorySlugs } from "@/lib/defaultEventImage";
import { eventMetadata } from "@/lib/pageMetadata";
import { loadCalendarCategory, loadCalendarEvent, loadDefaultEventImages } from "@/lib/pageQueries";
import { buildMetadata } from "@/lib/seo";
import { getPublishedTicketEventBySlug } from "@/lib/ticketing/queries";
import {
  eventPageTicketLabel,
  eventPageTickets,
  separateTicketPages,
} from "@/lib/ticketing/eventPage";
import {
  AddToCalendarLink,
  clockLabel,
  dayLabel,
  EventHead,
  EventInterestButton,
  EventPhotoAndAbout,
  EventWhenBlock,
  loadEventParticipation,
  openEventForm,
} from "@/components/calendar/EventPageParts";
import { EventTicketsPage } from "@/components/calendar/EventTicketsPage";
import { TicketShopLink } from "@/components/ticketing/public/TicketShopLink";
import type { PublicTicketEvent } from "@/components/ticketing/public/types";
import { CategoryCalendar } from "./CategoryCalendar";

import "@/app/design/vtk-event.css";

type Params = Promise<{ locale: string; slugOrId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slugOrId } = await params;
  if (!hasLocale(locale)) return {};

  // Zelfde volgorde als de pagina hieronder: eerst de categorie, dan het event.
  const category = await loadCalendarCategory(slugOrId);
  if (category) {
    return buildMetadata({
      title: pick(category.nameNl, category.nameEn, locale),
      description: pick(category.descriptionNl ?? "", category.descriptionEn ?? "", locale),
      path: `/kalender/${category.slug}`,
      locale,
    });
  }

  const event = await loadCalendarEvent(slugOrId);
  if (!event) return {};

  const image =
    publicUrl(event.imageKey) ??
    defaultEventImageFor(await loadDefaultEventImages(), eventCategorySlugs(event.categories));
  return eventMetadata(event, locale, `/kalender/${event.slug}`, image);
}

/**
 * Eén dynamisch segment onder /kalender voor drie dingen: een categorieslug
 * ("eerstejaars"), een event-slug ("galabal-2026") en een event-id (een cuid).
 *
 * De categorie krijgt voorrang; de save-actions bewaken dat een categorie en een
 * evenement nooit dezelfde slug innemen, want anders zou het evenement hier
 * onbereikbaar zijn. Het derde geval is de oude vorm van de URL: die blijft
 * werken en stuurt permanent door naar de slug, zodat een link die ooit in een
 * groepsgesprek of in een agenda-uitnodiging beland is niet op een 404 uitkomt.
 *
 * Staan er tickets op de eventpagina (`TicketEvent.onEventPage`), dan wordt dit
 * de eventpagina met het ticketpaneel, met de eerste verkoop gekozen; zie
 * `EventTicketsPage`.
 */
export default async function CalendarSegmentPage({ params }: { params: Params }) {
  const { locale: localeParam, slugOrId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === "nl" ? "" : "/en";

  const category = await loadCalendarCategory(slugOrId);
  if (category) return <CategoryCalendar locale={locale} slug={category.slug} />;

  const event = await loadCalendarEvent(slugOrId);

  if (!event) notFound();

  // Eén evenement, één adres: wie via de oude cuid binnenkomt, gaat door naar de
  // leesbare URL. 308, dus zoekmachines schrijven de link over en de oude vorm
  // concurreert niet met de nieuwe. Loopt via een throw, dus buiten try/catch.
  if (slugOrId !== event.slug) permanentRedirect(`${base}/kalender/${event.slug}`);

  const returnPath = `${base}/kalender/${event.slug}`;
  const onPage = eventPageTickets(event.ticketEvents);
  const first = onPage[0]
    ? ((await getPublishedTicketEventBySlug(onPage[0].slug, locale)) as PublicTicketEvent | null)
    : null;
  if (first) {
    return (
      <EventTicketsPage
        event={event}
        tickets={onPage}
        allTickets={event.ticketEvents}
        selected={first}
        locale={locale}
        returnPath={returnPath}
      />
    );
  }

  const nl = locale === "nl";
  const participation = await loadEventParticipation(event, returnPath);
  const form = openEventForm(event);
  // De verkopen met een eigen ticketpagina. Meestal één ("Tickets kopen"); bij
  // meer dan één krijgt elke knop de naam van zijn verkoop.
  const ticketPages = separateTicketPages(event.ticketEvents);

  // Het regeltje rechts van "Doe mee": hoeveel dagen, of het uur. Een
  // evenement over meerdere dagen heeft geen kort uur; de start en het einde
  // staan dan voluit in het paneel zelf.
  const sideSummary =
    event.moments.length > 0
      ? nl
        ? `${event.moments.length} ${event.moments.length === 1 ? "dag" : "dagen"}`
        : `${event.moments.length} ${event.moments.length === 1 ? "day" : "days"}`
      : event.allDay
        ? nl
          ? "Hele dag"
          : "All day"
        : dayLabel(event.start, locale, "short") === dayLabel(event.end, locale, "short")
          ? `${clockLabel(event.start, locale)} - ${clockLabel(event.end, locale)}`
          : null;

  return (
    <article className="vtk-page">
      <EventHead event={event} locale={locale} />

      {/* Dezelfde opbouw als de ticketpagina: links de foto met de omschrijving
          eronder, rechts een paneel met wanneer en de knoppen dat blijft staan
          terwijl je leest. Zo eindigt een lange omschrijving niet meer naast
          een leeg vlak, met de knoppen drie schermen lager. Zie
          docs/design-decisions.md. */}
      <div className="vtk-event-layout">
        <div className="vtk-event-main">
          <EventPhotoAndAbout
            event={event}
            locale={locale}
            participation={participation}
            sizes="(max-width: 960px) 100vw, 58vw"
          />
        </div>

        <aside className="vtk-panel vtk-event-side" aria-labelledby="event-side-title">
          <div className="vtk-event-side-head">
            <h2 id="event-side-title">{nl ? "Doe mee" : "Join in"}</h2>
            {sideSummary ? <small>{sideSummary}</small> : null}
          </div>
          <EventWhenBlock event={event} locale={locale} participation={participation} />
          <div className="vtk-event-actions">
            {/* "Ik kom" hoort bij "Tickets kopen" en "Zet in mijn agenda": het is
                dezelfde soort beslissing over dit evenement. Wat er méér nodig is
                (de zichtbaarheidsvakjes, of het gastformulier bij een
                alumni-evenement) klapt eronder open over de volle breedte. */}
            <EventInterestButton event={event} locale={locale} participation={participation} />
            <AddToCalendarLink event={event} locale={locale} />
            {/* Een formulier bij dit evenement, zolang het openstaat. Onder de
                tickets, want wie tickets verkoopt, wil die knop eerst. */}
            {form ? (
              <Link
                href={`${base}/formulieren/${form.slug}`}
                className={ticketPages.length > 0 ? "btn btn-ghost" : "btn btn-primary"}
              >
                {nl ? "Inschrijven" : "Sign up"}
              </Link>
            ) : null}
            {ticketPages.length > 0 ? (
              ticketPages.map((ticket, index) => (
                <TicketShopLink
                  key={ticket.id}
                  href={`${base}/tickets/${ticket.slug}`}
                  className="btn btn-primary"
                >
                  {ticketPages.length === 1
                    ? nl
                      ? "Tickets kopen"
                      : "Buy tickets"
                    : `Tickets: ${eventPageTicketLabel(ticket, locale, index)}`}
                </TicketShopLink>
              ))
            ) : event.url ? (
              <a href={event.url} className="btn btn-primary arrow">
                {eventLinkLabel(event, locale)}
              </a>
            ) : null}
            <Link href={`${base}/kalender`} className="btn btn-ghost vtk-event-back-btn">
              ← {nl ? "Terug naar kalender" : "Back to calendar"}
            </Link>
          </div>
        </aside>
      </div>
    </article>
  );
}
