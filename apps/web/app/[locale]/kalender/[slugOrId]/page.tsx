import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { pick, type Locale } from "@vtk/i18n";
import { Markdown } from "@/components/ui/Markdown";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";
import { eventMetadata } from "@/lib/pageMetadata";
import { loadCalendarCategory, loadCalendarEvent, loadDefaultEventImage } from "@/lib/pageQueries";
import { focusPosition } from "@/lib/imageFocus";
import { buildMetadata } from "@/lib/seo";
import { getCurrentSession } from "@/lib/session";
import {
  attendeeList,
  interestLabel,
  INTEREST_PUBLIC_THRESHOLD,
  interestTotal,
  viewerInterest,
} from "@/lib/calendar/interest";
import { EventInterest } from "@/components/calendar/EventInterest";
import { AttendeeTable } from "@/components/calendar/AttendeeTable";
import { CategoryCalendar } from "./CategoryCalendar";

import "@/app/design/vtk-event.css";

/**
 * De zin op het doelgroeplabel. Bewust afgeleid van de doelgroep en niet van de
 * categorienaam: "Voor " + naam levert "Voor internationaal" op, wat geen
 * Nederlands is.
 */
function audienceLabel(audience: string | null, locale: Locale): string {
  const nl = locale === "nl";
  if (audience === "FIRST_YEARS") return nl ? "Voor eerstejaars" : "For first years";
  if (audience === "LAST_YEARS") return nl ? "Voor laatstejaars" : "For last years";
  if (audience === "INTERNATIONALS")
    return nl ? "Voor internationals" : "For international students";
  if (audience === "ALUMNI") return nl ? "Voor alumni" : "For alumni";
  return nl ? "Voor een specifieke doelgroep" : "For a specific audience";
}

function formatDateRange(start: Date, end: Date, locale: Locale, allDay: boolean) {
  const dateLocale = locale === "nl" ? "nl-BE" : "en-GB";
  const day = start.toLocaleDateString(dateLocale, {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  if (allDay) return `${day} · ${locale === "nl" ? "hele dag" : "all day"}`;

  const startTime = start.toLocaleTimeString(dateLocale, {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString(dateLocale, {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} · ${startTime} - ${endTime}`;
}

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

  const image = publicUrl(event.imageKey) ?? (await loadDefaultEventImage());
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
 */
export default async function CalendarSegmentPage({ params }: { params: Params }) {
  const { locale: localeParam, slugOrId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === "nl" ? "" : "/en";

  const category = await loadCalendarCategory(slugOrId);
  if (category) return <CategoryCalendar locale={locale} />;

  const event = await loadCalendarEvent(slugOrId);

  if (!event) notFound();

  // Eén evenement, één adres: wie via de oude cuid binnenkomt, gaat door naar de
  // leesbare URL. 308, dus zoekmachines schrijven de link over en de oude vorm
  // concurreert niet met de nieuwe. Loopt via een throw, dus buiten try/catch.
  if (slugOrId !== event.slug) permanentRedirect(`${base}/kalender/${event.slug}`);

  const title = pick(event.titleNl, event.titleEn, locale);
  const description = pick(event.descriptionNl ?? "", event.descriptionEn ?? "", locale);
  const groupName = pick(event.group.nameNl, event.group.nameEn, locale);
  const eventPhoto = publicUrl(event.imageKey);
  const imageSrc = eventPhoto ?? (await loadDefaultEventImage());
  // De uitsnede hoort bij de foto die de redactie zelf koos; de standaardfoto
  // valt terug op het midden, want dat punt is voor elk evenement hetzelfde.
  const imagePosition = eventPhoto
    ? focusPosition({ x: event.imageFocusX, y: event.imageFocusY })
    : undefined;
  // Doelgroepen krijgen een eigen, opvallend label: wie hier toevallig belandt
  // moet meteen zien dat het evenement voor eerstejaars of internationals is.
  const audiences = event.categories.map((c) => c.category).filter((c) => c.audience !== null);
  const themes = event.categories.map((c) => c.category).filter((c) => c.audience === null);

  // "Ik kom naar dit evenement". De teller verschijnt pas vanaf een drempel; zie
  // lib/calendar/interest.ts voor waarom een laag getal averechts werkt.
  const isAlumniEvent = audiences.some((c) => c.audience === "ALUMNI");
  const session = await getCurrentSession();
  const [total, viewer, attendees] = await Promise.all([
    interestTotal(event.id),
    viewerInterest(event.id, session?.user.id ?? null),
    // Enkel een alumni-evenement heeft een namenlijst; elders is interesse een
    // private markering en zou een lijst een deelnemerslijst suggereren.
    isAlumniEvent ? attendeeList(event.id) : Promise.resolve([]),
  ]);
  const countLine = interestLabel(total >= INTEREST_PUBLIC_THRESHOLD ? total : null, locale);
  const nl = locale === "nl";

  return (
    <article className="vtk-page">
      <header className="vtk-page-head vtk-event-head">
        <div>
          <div className="vtk-page-kicker">
            <Link href={`${base}/kalender`} className="vtk-link">
              {locale === "nl" ? "Kalender" : "Calendar"}
            </Link>{" "}
            · {groupName}
          </div>
          <h1 className="vtk-page-title">{title}</h1>
          <p className="vtk-page-subtitle">
            {formatDateRange(event.start, event.end, locale, event.allDay)}
          </p>
          {audiences.length > 0 || themes.length > 0 ? (
            <div className="vtk-event-tags">
              {audiences.map((c) => (
                <Link
                  key={c.slug}
                  href={`${base}/kalender/${c.slug}`}
                  className="vtk-event-tag audience"
                  style={{ background: c.colour, borderColor: c.colour }}
                >
                  {audienceLabel(c.audience, locale)}
                </Link>
              ))}
              {themes.map((c) => (
                <Link key={c.slug} href={`${base}/kalender/${c.slug}`} className="vtk-event-tag">
                  {pick(c.nameNl, c.nameEn, locale)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="vtk-event-meta">
          <div>
            <span>{locale === "nl" ? "Groep" : "Group"}</span>
            <b>{groupName}</b>
          </div>
          <div>
            <span>{locale === "nl" ? "Locatie" : "Location"}</span>
            <b>{event.location ?? (locale === "nl" ? "Nog te bevestigen" : "To be confirmed")}</b>
          </div>
        </div>
      </header>

      <div className="vtk-event-layout">
        <div className="vtk-event-media-col">
          <figure className="vtk-event-photo">
            <Image
              src={imageSrc}
              alt=""
              fill
              sizes="(max-width: 960px) 100vw, 58vw"
              className="vtk-event-photo-img"
              style={imagePosition ? { objectPosition: imagePosition } : undefined}
              priority
            />
          </figure>

          {isAlumniEvent ? <AttendeeTable rows={attendees} locale={locale} /> : null}
        </div>

        <section className="vtk-panel vtk-event-info">
          <h2>{locale === "nl" ? "Over dit event" : "About this event"}</h2>
          {description ? (
            <div className="prose-vtk vtk-event-description">
              <Markdown locale={locale}>{description}</Markdown>
            </div>
          ) : (
            <p>
              {locale === "nl"
                ? "Meer details worden later aangevuld door de organiserende werkgroep."
                : "More details will be added later by the organising work group."}
            </p>
          )}
          <dl className="spec">
            <dt>{locale === "nl" ? "Start" : "Start"}</dt>
            <dd>
              {event.start.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB", {
                timeZone: "Europe/Brussels",
              })}
            </dd>
            <dt>{locale === "nl" ? "Einde" : "End"}</dt>
            <dd>
              {event.end.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB", {
                timeZone: "Europe/Brussels",
              })}
            </dd>
          </dl>
          <div className="vtk-event-actions">
            {/* "Ik kom" hoort bij "Tickets kopen" en "Zet in mijn agenda": het is
                dezelfde soort beslissing over dit evenement. Wat er méér nodig is
                (de zichtbaarheidsvakjes, of het gastformulier bij een
                alumni-evenement) klapt eronder open over de volle breedte. */}
            <EventInterest
              eventId={event.id}
              isAlumniEvent={isAlumniEvent}
              signedIn={Boolean(session)}
              viewer={viewer}
              loginHref={`${base}/inloggen?next=${encodeURIComponent(`${base}/kalender/${event.slug}`)}`}
              labels={{
                interested: nl ? "Geïnteresseerd" : "Interested",
                removeInterest: nl ? "Niet meer geïnteresseerd" : "Remove interest",
                saving: nl ? "Bezig..." : "Working...",
                countLine,
                loginCta: nl
                  ? "Log in om je interesse aan te duiden"
                  : "Sign in to mark your interest",
                detailsHeading: nl
                  ? "Wat mogen anderen zien bij ‘Wie er komt’?"
                  : "What may others see under ‘Who is coming’?",
                detailsHint: nl
                  ? "Zo zien anderen wie er komt, en help je dus mede alumni te overtuigen om te komen door ze te laten weten dat ze mensen zullen herkennen!"
                  : "This shows others who is coming and helps convince fellow alumni by letting them know they will recognise people there.",
                name: nl ? "Naam (optioneel)" : "Name (optional)",
                namePlaceholder: nl ? "Jouw naam" : "Your name",
                showName: nl ? "Toon mijn naam" : "Show my name",
                graduationYear: nl ? "Afstudeerjaar (optioneel)" : "Graduation year (optional)",
                showGraduationYear: nl ? "Toon mijn afstudeerjaar" : "Show my graduation year",
                wasInVtk: nl ? "Ik zat in VTK Praesidium" : "I was in the VTK Praesidium",
                showWasInVtk: nl
                  ? "Toon mijn antwoord over VTK Praesidium"
                  : "Show my answer about the VTK Praesidium",
                perEventHint: nl
                  ? "Deze gegevens gelden alleen voor dit evenement en komen niet uit je profiel. Alleen aangevinkte informatie wordt publiek getoond."
                  : "These details apply only to this event and do not come from your profile. Only selected information is shown publicly.",
                saveDetails: nl ? "Bewaren" : "Save",
                detailsSaved: nl ? "Opgeslagen." : "Saved.",
                errorVisibleValue: nl
                  ? "Vul eerst de naam of het afstudeerjaar in dat je zichtbaar wilt maken."
                  : "First enter the name or graduation year you want to make visible.",
                errorGeneric: nl
                  ? "Er ging iets mis. Probeer het opnieuw."
                  : "Something went wrong. Please try again.",
              }}
            />
            {/* Losse download, geen abonnement: dit is één event, dat verandert
                zelden nog na publicatie. Wie alles wil volgen, abonneert zich op
                de feed vanaf /kalender. */}
            <a
              href={`/api/calendar/event/${event.id}${locale === "en" ? "?lang=en" : ""}`}
              className="btn btn-ghost"
            >
              {locale === "nl" ? "Zet in mijn agenda" : "Add to my calendar"}
            </a>
            {/* Een formulier bij dit evenement, zolang het openstaat. Onder de
                tickets, want wie tickets verkoopt, wil die knop eerst. */}
            {event.form?.status === "PUBLISHED" &&
            (!event.form.opensAt || event.form.opensAt <= new Date()) &&
            (!event.form.closesAt || event.form.closesAt > new Date()) ? (
              <Link
                href={`${base}/formulieren/${event.form.slug}`}
                className={
                  event.ticketEvent?.status === "PUBLISHED" ? "btn btn-ghost" : "btn btn-primary"
                }
              >
                {locale === "nl" ? "Inschrijven" : "Sign up"}
              </Link>
            ) : null}
            {event.ticketEvent?.status === "PUBLISHED" ? (
              <Link href={`${base}/tickets/${event.ticketEvent.slug}`} className="btn btn-primary">
                {locale === "nl" ? "Tickets kopen" : "Buy tickets"}
              </Link>
            ) : event.url ? (
              <a href={event.url} className="btn btn-primary arrow">
                {locale === "nl" ? "Externe eventlink" : "External event link"}
              </a>
            ) : null}
            <Link href={`${base}/kalender`} className="btn btn-ghost vtk-event-back-btn">
              ← {locale === "nl" ? "Terug naar kalender" : "Back to calendar"}
            </Link>
          </div>
        </section>
      </div>
    </article>
  );
}
