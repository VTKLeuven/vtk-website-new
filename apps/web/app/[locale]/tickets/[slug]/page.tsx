import type { Metadata } from "next";
import { cache } from "react";
import Link from "@/components/ui/Link";
import { EventPhoto } from "@/components/calendar/EventPhoto";
import { notFound } from "next/navigation";
import { Eye, PencilLine } from "lucide-react";
import type { Locale } from "@vtk/i18n";
import {
  getPublishedTicketEventBySlug,
  getTicketEventPreviewBySlug,
} from "@/lib/ticketing/queries";
import { loadCalendarEvent } from "@/lib/pageQueries";
import { eventPageTickets, sortEventPageTickets } from "@/lib/ticketing/eventPage";
import { EventTicketsPage } from "@/components/calendar/EventTicketsPage";
import { hasLocale } from "@/lib/locale";
import { MapPinIcon, UsersIcon } from "@/components/ui/icons";
import { buildMetadata } from "@/lib/seo";
import { paymentMethodChoice } from "@/lib/ticketing/paymentMethods";
import { TicketShop } from "@/components/ticketing/public/TicketShop";
import {
  formatTicketDate,
  serializeTicketEvent,
  type PublicTicketEvent,
} from "@/components/ticketing/public/types";

import "@/app/design/vtk-event.css";
import "@/app/design/vtk-tickets.css";
import "@/app/design/vtk-ticket-shop.css";

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
    // De naam van de verkoop erbij: een event met meerdere ticketpagina's heeft
    // anders twee gedeelde links met exact dezelfde titel.
    title: event.label ? `${event.title} · ${event.label}` : event.title,
    description: `${date}${place}${event.description ? ` · ${event.description}` : ""}`,
    path: `/tickets/${slug}`,
    locale,
    type: "article",
    // Een privéverkoop hoort in geen zoekmachine; zonder de link bestaat de
    // pagina toch niet, maar een browser die haar ooit toonde deelt ze zo niet.
    noIndex: event.isPrivate,
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
  const previewBar = preview ? (
    <div className="ticket-preview-bar">
      <p>
        <span className="ticket-preview-tag">
          <Eye size={14} aria-hidden="true" /> {previewText.label}
        </span>
        <strong>{event.status === "PUBLISHED" ? previewText.live : previewText.draft}</strong>
        <span>{previewText.types}</span>
      </p>
      <Link className="ticket-preview-back" href={`${base}/admin/tickets/${event.id}/instellingen`}>
        <PencilLine size={16} aria-hidden="true" /> {previewText.back}
      </Link>
    </div>
  ) : null;

  // Staat deze verkoop op de eventpagina, dan is dit adres die eventpagina, met
  // deze verkoop gekozen. Het adres blijft van deze verkoop, zodat ze apart te
  // delen is. Staat het kalenderevent (nog) niet online, dan blijft het een
  // losse ticketpagina: anders zou een concept de verkoop verbergen.
  if (event.onEventPage && event.calendarEventId) {
    const calendarEvent = await loadCalendarEvent(event.calendarEventId);
    if (calendarEvent) {
      let tabs = eventPageTickets(calendarEvent.ticketEvents);
      // Een voorbeeld van een verkoop die nog niet gepubliceerd is, of een
      // privéverkoop voor wie de link volgde: die hoort er dan toch als tab bij,
      // anders toont de pagina een andere verkoop. Wie de link niet heeft, komt
      // hier niet: `loadEvent` gaf dan al null.
      const self = calendarEvent.ticketEvents.find((ticket) => ticket.id === event.id);
      if (self && !tabs.some((ticket) => ticket.id === self.id)) {
        tabs = sortEventPageTickets([...tabs, self]);
      }
      return (
        <EventTicketsPage
          event={calendarEvent}
          tickets={tabs}
          allTickets={calendarEvent.ticketEvents}
          selected={event}
          locale={locale}
          preview={preview}
          returnPath={`${base}/tickets/${event.slug}`}
          before={previewBar}
        />
      );
    }
  }

  const organiser = event.ownerGroupName ?? "VTK";
  const location = event.location ?? (locale === "nl" ? "Locatie volgt" : "Location to be announced");

  return (
    <div className="vtk-page vtk-tickets-page">
      {previewBar}
      {/* Dezelfde kop als een event in de kalender (vtk-event.css): de lange
          beschrijving hoort niet op de donkere band, die staat hieronder. */}
      <header className="vtk-page-head vtk-event-head">
        <div>
          <div className="vtk-page-kicker">
            {/* Een privéverkoop staat niet op /tickets, dus daar hoort geen
                terugweg naartoe; het woord zegt waarom iemand anders deze pagina
                niet ziet wanneer je het adres doorstuurt. */}
            {event.isPrivate ? (
              locale === "nl" ? "Privéverkoop" : "Private sale"
            ) : (
              <Link href={`${base}/tickets`} className="vtk-link">Tickets</Link>
            )}{" "}
            · {organiser}
          </div>
          <h1 className="vtk-page-title">{event.title}</h1>
          <p className="vtk-page-subtitle">
            {/* Een event met meerdere ticketpagina's: de titel is die van het
                event, de naam zegt welke verkoop dit is. */}
            {event.label ? `${event.label} · ` : null}
            {formatTicketDate(event.startsAt, locale)}
          </p>
        </div>
        <div className="vtk-event-meta">
          <div>
            <span>{locale === "nl" ? "Organisator" : "Organiser"}</span>
            <b>
              <UsersIcon />
              {organiser}
            </b>
          </div>
          <div>
            <span>{locale === "nl" ? "Locatie" : "Location"}</span>
            <b>
              <MapPinIcon />
              {location}
            </b>
          </div>
        </div>
      </header>
      <main className="tshop-shell">
        <TicketShop
          event={serializeTicketEvent(event)}
          locale={locale}
          paymentChoice={paymentMethodChoice(locale)}
          preview={preview}
          about={<TicketEventAbout event={event} locale={locale} />}
          practical={<TicketEventPractical event={event} locale={locale} organiser={organiser} location={location} />}
        />
      </main>
    </div>
  );
}

/** Het uur van een moment, voor "tot" in het praktische blok. */
function formatTicketTime(value: string | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** De dag van een moment, zonder uur: dat staat er apart onder. */
function formatTicketDay(value: string | Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

/** Zoveel momenten staan er in het praktische blok; de rest vat één regel samen. */
const PRACTICAL_MOMENTS_VISIBLE = 7;

/**
 * Poster en beschrijving, onder de gegevens in de linkerkolom.
 *
 * De beschrijving is platte tekst uit het beheer: een lege regel is een nieuwe
 * alinea en een enkele regelovergang blijft staan (`white-space: pre-line`),
 * want redacteurs schrijven er opsommingen in met gewone regels.
 */
function TicketEventAbout({ event, locale }: { event: PublicTicketEvent; locale: Locale }) {
  const paragraphs = (event.description ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <>
      {event.poster ? (
        <EventPhoto
          className="tshop-poster"
          src={event.poster.src}
          sizes="(max-width: 960px) 100vw, 760px"
          focus={event.poster.focus ?? null}
          mobile={event.poster.mobile}
        />
      ) : null}
      {paragraphs.length > 0 ? (
        <section className="tshop-about">
          <h2 className="tshop-heading">{locale === "nl" ? "Over dit event" : "About this event"}</h2>
          <div className="tshop-description">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/**
 * Wanneer, waar en wie: een register onder het ticketpaneel. Op een smal scherm
 * zakt het onder de beschrijving (zie vtk-ticket-shop.css).
 */
function TicketEventPractical({
  event,
  locale,
  organiser,
  location,
}: {
  event: PublicTicketEvent;
  locale: Locale;
  organiser: string;
  location: string;
}) {
  // Een cantus loopt over middernacht; "tot 02:00" zegt dan genoeg. Pas een
  // event van meer dan een dag krijgt de volledige einddatum.
  const sameNight =
    new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime() < 24 * 60 * 60 * 1000;
  // Een event met losse momenten (twee avonden, een loopweek) loopt niet door van
  // het eerste tot het laatste: "tot donderdag 21:00" las als één lange zit.
  const moments = event.moments ?? [];
  const shownMoments = moments.slice(0, PRACTICAL_MOMENTS_VISIBLE);
  const restMoments = moments.length - shownMoments.length;

  return (
    <aside className="tshop-rail" aria-labelledby="ticket-practical-heading">
      <h2 id="ticket-practical-heading">{locale === "nl" ? "Praktisch" : "Practical"}</h2>
      <dl>
        <div>
          <dt>{locale === "nl" ? "Wanneer" : "When"}</dt>
          {moments.length > 0 ? (
            <dd className="tshop-rail-moments">
              {shownMoments.map((moment) => (
                <div key={new Date(moment.start).toISOString()}>
                  {formatTicketDay(moment.start, locale)}
                  <span>
                    {formatTicketTime(moment.start, locale)} - {formatTicketTime(moment.end, locale)}
                    {moment.label ? ` · ${moment.label}` : null}
                  </span>
                </div>
              ))}
              {restMoments > 0 ? (
                <span>
                  {locale === "nl"
                    ? `en nog ${restMoments} ${restMoments === 1 ? "moment" : "momenten"}, tot ${formatTicketDay(moments[moments.length - 1]!.start, locale)}`
                    : `and ${restMoments} more, until ${formatTicketDay(moments[moments.length - 1]!.start, locale)}`}
                </span>
              ) : null}
            </dd>
          ) : (
            <dd>
              {formatTicketDate(event.startsAt, locale)}
              {sameNight ? (
                <span>
                  {locale === "nl" ? "tot " : "until "}
                  {formatTicketTime(event.endsAt, locale)}
                </span>
              ) : (
                <span>
                  {locale === "nl" ? "tot " : "until "}
                  {formatTicketDate(event.endsAt, locale)}
                </span>
              )}
            </dd>
          )}
        </div>
        <div>
          <dt>{locale === "nl" ? "Locatie" : "Location"}</dt>
          <dd>
            {location}
            {event.locationAddress ? <span>{event.locationAddress}</span> : null}
          </dd>
        </div>
        <div>
          <dt>{locale === "nl" ? "Organisator" : "Organiser"}</dt>
          <dd>{organiser}</dd>
        </div>
        {event.contactEmail ? (
          <div>
            <dt>{locale === "nl" ? "Vragen" : "Questions"}</dt>
            <dd>
              <a href={`mailto:${event.contactEmail}`}>{event.contactEmail}</a>
            </dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}
