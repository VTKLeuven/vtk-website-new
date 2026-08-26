import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { pick, type Locale } from "@vtk/i18n";
import { Markdown } from "@/components/ui/Markdown";
import { hasLocale } from "@/lib/locale";
import { publicUrl } from "@/lib/storage";
import { eventMetadata } from "@/lib/pageMetadata";
import { loadCalendarCategory, loadCalendarEvent, loadDefaultEventImage } from "@/lib/pageQueries";
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
  if (audience === "INTERNATIONALS") return nl ? "Voor internationals" : "For international students";
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

  const startTime = start.toLocaleTimeString(dateLocale, { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" });
  const endTime = end.toLocaleTimeString(dateLocale, { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" });
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
  return eventMetadata(event, locale, `/kalender/${event.id}`, image);
}

/**
 * Eén dynamisch segment onder /kalender voor twee dingen: een categorieslug
 * ("eerstejaars") en een event-id (een cuid). De categorie krijgt voorrang,
 * omdat haar slug beheerd wordt en dus nooit per ongeluk een cuid is. Zo houden
 * we `vtk.be/kalender/eerstejaars` als URL zonder de bestaande links naar
 * `/kalender/<id>` (vanaf de homepage) te breken.
 */
export default async function CalendarSegmentPage({ params }: { params: Params }) {
  const { locale: localeParam, slugOrId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === "nl" ? "" : "/en";

  const category = await loadCalendarCategory(slugOrId);
  if (category) return <CategoryCalendar category={category} locale={locale} />;

  const event = await loadCalendarEvent(slugOrId);

  if (!event) notFound();

  const title = pick(event.titleNl, event.titleEn, locale);
  const description = pick(event.descriptionNl ?? "", event.descriptionEn ?? "", locale);
  const groupName = pick(event.group.nameNl, event.group.nameEn, locale);
  const imageSrc = publicUrl(event.imageKey) ?? (await loadDefaultEventImage());
  // Doelgroepen krijgen een eigen, opvallend label: wie hier toevallig belandt
  // moet meteen zien dat het evenement voor eerstejaars of internationals is.
  const audiences = event.categories
    .map((c) => c.category)
    .filter((c) => c.audience !== null);
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
  const countLine = interestLabel(
    total >= INTEREST_PUBLIC_THRESHOLD ? total : null,
    locale,
  );
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
          <p className="vtk-page-subtitle">{formatDateRange(event.start, event.end, locale, event.allDay)}</p>
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
        <figure className="vtk-event-photo">
          <Image
            src={imageSrc}
            alt=""
            fill
            sizes="(max-width: 960px) 100vw, 58vw"
            className="vtk-event-photo-img"
            priority
          />
        </figure>

        <section className="vtk-panel vtk-event-info">
          <h2>
            {locale === "nl" ? "Over dit event" : "About this event"}
          </h2>
          {description ? (
            <div className="prose-vtk vtk-event-description">
              <Markdown>{description}</Markdown>
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
            <dd>{event.start.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB", { timeZone: "Europe/Brussels" })}</dd>
            <dt>{locale === "nl" ? "Einde" : "End"}</dt>
            <dd>{event.end.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB", { timeZone: "Europe/Brussels" })}</dd>
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
              accountHref={`${base}/account`}
              loginHref={`${base}/inloggen?next=${encodeURIComponent(`${base}/kalender/${event.id}`)}`}
              labels={{
                join: nl ? "Ik kom naar dit evenement" : "I am coming to this event",
                joined: nl ? "Je komt" : "You are coming",
                leave: nl ? "Toch niet" : "Never mind",
                saving: nl ? "Bezig..." : "Working...",
                countLine,
                loginCta: nl
                  ? "Log in om aan te duiden dat je komt"
                  : "Sign in to say you are coming",
                showHeading: nl
                  ? "Wat mag er in de lijst staan?"
                  : "What may appear in the list?",
                showHint: nl
                  ? "Alles staat standaard uit. Vink je niets aan, dan tel je gewoon mee in het aantal."
                  : "Everything is off by default. If you tick nothing you simply count towards the total.",
                showName: nl ? "Mijn naam" : "My name",
                showGraduationYear: nl ? "Mijn afstudeerjaar" : "My graduation year",
                showWasInVtk: nl ? "Dat ik in VTK zat" : "That I was in VTK",
                showSave: nl ? "Bewaren" : "Save",
                showToggle: nl ? "Zichtbaarheid" : "Visibility",
                guestIntro: nl
                  ? "Geen account nodig. Zeg iets over jezelf, zodat andere alumni zien wie er komt; je naam is optioneel."
                  : "No account needed. Say something about yourself so other alumni can see who is coming; your name is optional.",
                guestName: nl ? "Naam (optioneel)" : "Name (optional)",
                guestNameHint: nl
                  ? "Laat leeg om anoniem in de lijst te staan."
                  : "Leave empty to appear anonymously in the list.",
                guestYear: nl ? "Afstudeerjaar" : "Graduation year",
                guestWasInVtk: nl ? "Ik heb ooit in VTK gezeten" : "I was part of VTK",
                guestSubmit: nl ? "Ik kom" : "I am coming",
                guestUpdate: nl ? "Bijwerken" : "Update",
                guestRemove: nl ? "Toch niet" : "Never mind",
                guestDone: nl ? "Genoteerd. Tot dan." : "Noted. See you there.",
                errorNothing: nl
                  ? "Vul minstens je afstudeerjaar in of vink aan dat je in VTK zat."
                  : "Fill in at least your graduation year, or tick that you were in VTK.",
                errorGeneric: nl
                  ? "Er ging iets mis. Probeer het opnieuw."
                  : "Something went wrong. Please try again.",
                profileHint: nl
                  ? "Je naam, afstudeerjaar en VTK-verleden komen uit je profiel."
                  : "Your name, graduation year and VTK history come from your profile.",
                profileLink: nl ? "Profiel bewerken" : "Edit profile",
              }}
            />
            <Link href={`${base}/kalender`} className="btn btn-ghost">
              ← {locale === "nl" ? "Terug naar kalender" : "Back to calendar"}
            </Link>
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
                className={event.ticketEvent?.status === "PUBLISHED" ? "btn btn-ghost" : "btn btn-primary"}
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
          </div>
        </section>

        {isAlumniEvent ? <AttendeeTable rows={attendees} locale={locale} /> : null}
      </div>
    </article>
  );
}
