import type { Metadata } from "next";
import { cache } from "react";
import Link from "@/components/ui/Link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Eye, PencilLine } from "lucide-react";
import type { Locale } from "@vtk/i18n";
import {
  getPublishedTicketEventBySlug,
  getTicketEventPreviewBySlug,
} from "@/lib/ticketing/queries";
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
  const organiser = event.ownerGroupName ?? "VTK";
  const location = event.location ?? (locale === "nl" ? "Locatie volgt" : "Location to be announced");

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
      {/* Dezelfde kop als een event in de kalender (vtk-event.css): de lange
          beschrijving hoort niet op de donkere band, die staat hieronder. */}
      <header className="vtk-page-head vtk-event-head">
        <div>
          <div className="vtk-page-kicker">
            <Link href={`${base}/tickets`} className="vtk-link">Tickets</Link> · {organiser}
          </div>
          <h1 className="vtk-page-title">{event.title}</h1>
          <p className="vtk-page-subtitle">{formatTicketDate(event.startsAt, locale)}</p>
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
        <figure className="vtk-event-photo tshop-poster">
          <Image
            src={event.poster.src}
            alt=""
            fill
            sizes="(max-width: 960px) 100vw, 760px"
            className="vtk-event-photo-img"
            style={{ objectPosition: event.poster.position }}
            priority
          />
        </figure>
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

  return (
    <aside className="tshop-rail" aria-labelledby="ticket-practical-heading">
      <h2 id="ticket-practical-heading">{locale === "nl" ? "Praktisch" : "Practical"}</h2>
      <dl>
        <div>
          <dt>{locale === "nl" ? "Wanneer" : "When"}</dt>
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
