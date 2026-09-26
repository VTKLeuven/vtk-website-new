import type { Metadata } from "next";
import Link from "@/components/ui/Link";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { pick, type Locale } from "@vtk/i18n";
import { Markdown } from "@/components/ui/Markdown";
import { MapPinIcon, UsersIcon } from "@/components/ui/icons";
import { hasLocale } from "@/lib/locale";
import { organiserName } from "@/lib/calendar/organiser";
import { eventLinkLabel } from "@/lib/calendar/eventLink";
import { EVENT_MOMENTS_VISIBLE, momentsSummary } from "@/lib/calendar/moments";
import { publicUrl } from "@/lib/storage";
import { defaultEventImageFor, eventCategorySlugs } from "@/lib/defaultEventImage";
import { eventMetadata } from "@/lib/pageMetadata";
import { loadCalendarCategory, loadCalendarEvent, loadDefaultEventImages } from "@/lib/pageQueries";
import { focusPosition } from "@/lib/imageFocus";
import { buildMetadata } from "@/lib/seo";
import { getCurrentSession } from "@/lib/session";
import {
  attendeeList,
  interestLabel,
  INTEREST_PUBLIC_THRESHOLD,
  interestTotal,
  viewerInterest,
  viewerMomentStarts,
} from "@/lib/calendar/interest";
import { EventInterest } from "@/components/calendar/EventInterest";
import { EventStar } from "@/components/calendar/EventStar";
import { EventMomentsList } from "@/components/calendar/EventMomentsList";
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

/** Eén moment van het evenement; zie `CalendarEventMoment`. */
type EventMomentRow = { start: Date; end: Date; label: string | null };

function dayLabel(date: Date, locale: Locale, style: "long" | "short" = "long") {
  return date.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: style,
    day: "2-digit",
    month: style === "long" ? "long" : "short",
    ...(style === "long" ? { year: "numeric" as const } : {}),
  });
}

function clockLabel(date: Date, locale: Locale) {
  return date.toLocaleTimeString(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Een tijdstip in het paneel: "ma 28 sep, 18:30", of enkel de dag bij een heledagevenement. */
function specMoment(date: Date, allDay: boolean, locale: Locale) {
  const day = dayLabel(date, locale, "short");
  return allDay ? day : `${day}, ${clockLabel(date, locale)}`;
}

/**
 * De regel onder de titel bij een evenement met losse momenten: van de eerste
 * tot en met de laatste dag, met het gedeelde uur erachter wanneer elk moment
 * hetzelfde uur draagt. Welke dagen het precies zijn, staat in de lijst in de
 * infokaart; die zin hier moet in één oogopslag te lezen zijn.
 */
function formatMomentsRange(moments: EventMomentRow[], locale: Locale) {
  const first = moments[0]!.start;
  const last = moments[moments.length - 1]!.start;
  const span = `${dayLabel(first, locale)} ${locale === "nl" ? "t.e.m." : "to"} ${dayLabel(
    last,
    locale,
  )}`;
  const summary = momentsSummary(moments, locale, "Europe/Brussels");
  return summary ? `${span} · ${summary}` : span;
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

  const title = pick(event.titleNl, event.titleEn, locale);
  const description = pick(event.descriptionNl ?? "", event.descriptionEn ?? "", locale);
  // Wie het organiseert, en dat is niet altijd de groep die het beheert; zie
  // lib/calendar/organiser.ts.
  const organiser = organiserName(event.organiserName, event.group, locale);
  const eventPhoto = publicUrl(event.imageKey);
  // Zonder eigen affiche: de standaardbanner van het thema (Cantus, Career, ...)
  // en anders de sitebrede foto. Zie lib/defaultEventImage.ts.
  const imageSrc =
    eventPhoto ??
    defaultEventImageFor(await loadDefaultEventImages(), eventCategorySlugs(event.categories));
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
  const [total, viewer, attendees, viewerMoments] = await Promise.all([
    interestTotal(event.id),
    viewerInterest(event.id, session?.user.id ?? null),
    // Enkel een alumni-evenement heeft een namenlijst; elders is interesse een
    // private markering en zou een lijst een deelnemerslijst suggereren.
    isAlumniEvent ? attendeeList(event.id) : Promise.resolve([]),
    // Welke dagen van een reeks dit lid aanduidde; per dag staat er een ster in
    // de lijst onder "Wanneer".
    viewerMomentStarts([event.id], session?.user.id ?? null),
  ]);
  const interestedMoments = new Set(viewerMoments.get(event.id) ?? []);
  const countLine = interestLabel(total >= INTEREST_PUBLIC_THRESHOLD ? total : null, locale);
  const nl = locale === "nl";
  const interestLoginHref = `${base}/inloggen?next=${encodeURIComponent(
    `${base}/kalender/${event.slug}`,
  )}`;
  // Dezelfde handeling als de ster in het weekoverzicht, maar over één dag van
  // de reeks; daarom dezelfde teksten met "die dag" erin.
  const momentStarLabels = {
    mark: nl ? "Ik kom die dag" : "I am coming that day",
    marked: nl ? "Je komt die dag" : "You are coming that day",
    signIn: nl ? "Meld je aan om aan te duiden dat je komt" : "Sign in to mark that you are coming",
    failed: nl
      ? "Aanduiden lukte niet. Probeer het straks opnieuw."
      : "Marking this did not work. Try again in a moment.",
  };

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
      <header className="vtk-page-head vtk-event-head">
        <div>
          <div className="vtk-page-kicker">
            <Link href={`${base}/kalender`} className="vtk-link">
              {locale === "nl" ? "Kalender" : "Calendar"}
            </Link>{" "}
            · {organiser}
          </div>
          <h1 className="vtk-page-title">{title}</h1>
          <p className="vtk-page-subtitle">
            {event.moments.length > 0
              ? formatMomentsRange(event.moments, locale)
              : formatDateRange(event.start, event.end, locale, event.allDay)}
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
        {/* Het icoon staat naast de waarde en niet naast het opschrift: het
            zegt hetzelfde als "Organisator" en "Locatie" erboven, en helpt vooral om
            de twee kaartjes uit elkaar te houden in een oogopslag. Decoratief
            dus, en `Icon` zet er al `aria-hidden` op. */}
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
              {event.location ?? (locale === "nl" ? "Nog te bevestigen" : "To be confirmed")}
            </b>
          </div>
        </div>
      </header>

      {/* Dezelfde opbouw als de ticketpagina: links de foto met de omschrijving
          eronder, rechts een paneel met wanneer en de knoppen dat blijft staan
          terwijl je leest. Zo eindigt een lange omschrijving niet meer naast
          een leeg vlak, met de knoppen drie schermen lager. Zie
          docs/design-decisions.md. */}
      <div className="vtk-event-layout">
        <div className="vtk-event-main">
          <figure className="vtk-event-photo">
            <Image
              src={imageSrc}
              alt=""
              fill
              sizes="(max-width: 960px) 100vw, 58vw"
              quality={90}
              className="vtk-event-photo-img"
              style={imagePosition ? { objectPosition: imagePosition } : undefined}
              priority
            />
          </figure>

          <section className="vtk-event-about">
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
          </section>

          {isAlumniEvent ? <AttendeeTable rows={attendees} locale={locale} /> : null}
        </div>

        <aside className="vtk-panel vtk-event-side" aria-labelledby="event-side-title">
          <div className="vtk-event-side-head">
            <h2 id="event-side-title">{nl ? "Doe mee" : "Join in"}</h2>
            {sideSummary ? <small>{sideSummary}</small> : null}
          </div>
          {/* Een evenement met losse momenten zegt hier wannéér het doorgaat, dag
              per dag. Dat is precies wat één start en één einde niet kunnen
              zeggen: die zouden er een blok van maken dat de hele week doorloopt. */}
          {event.moments.length > 0 ? (
            <section className="vtk-event-moments">
              <h3>{nl ? "Wanneer" : "When"}</h3>
              {/* Een ster per dag, en niet enkel de knop hieronder: bij een
                  loopweek kom je naar het loopje van woensdag, niet naar "de
                  loopweek". Die knop blijft staan en zet ze alle samen aan. */}
              <p className="vtk-event-moments-hint">
                {nl ? "Duid per dag aan of je erbij bent." : "Mark the days you are coming to."}
              </p>
              <EventMomentsList
                total={event.moments.length}
                labels={{
                  more: nl
                    ? `Toon alle ${event.moments.length} dagen`
                    : `Show all ${event.moments.length} days`,
                  less: nl ? "Toon minder dagen" : "Show fewer days",
                }}
              >
                {event.moments.map((moment, index) => {
                  const momentIso = moment.start.toISOString();
                  const momentTitle = moment.label
                    ? `${title} (${moment.label})`
                    : `${title}, ${dayLabel(moment.start, locale, "short")}`;
                  return (
                    <li
                      key={momentIso}
                      className={
                        index >= EVENT_MOMENTS_VISIBLE ? "vtk-event-moment is-extra" : "vtk-event-moment"
                      }
                    >
                      <span className="day">{dayLabel(moment.start, locale, "short")}</span>
                      <span className="time">
                        {clockLabel(moment.start, locale)} - {clockLabel(moment.end, locale)}
                      </span>
                      <EventStar
                        eventId={event.id}
                        momentStart={momentIso}
                        title={momentTitle}
                        interested={interestedMoments.has(momentIso)}
                        signedIn={Boolean(session)}
                        loginHref={interestLoginHref}
                        labels={momentStarLabels}
                        className="vtk-event-moment-star"
                      />
                      {/* De eigen naam van dit moment ("Nachtloop") is een
                          eigennaam en geen labeltje: `.label` uit de basislaag
                          zette ze in kapitalen met spatiëring, waardoor
                          "Loopje 1" als een rubriek las in plaats van als de
                          naam van die avond. */}
                      {moment.label ? <span className="name">{moment.label}</span> : null}
                    </li>
                  );
                })}
              </EventMomentsList>
            </section>
          ) : (
            <dl className="spec">
              <dt>{locale === "nl" ? "Start" : "Start"}</dt>
              <dd>{specMoment(event.start, event.allDay, locale)}</dd>
              <dt>{locale === "nl" ? "Einde" : "End"}</dt>
              <dd>{specMoment(event.end, event.allDay, locale)}</dd>
            </dl>
          )}
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
              loginHref={interestLoginHref}
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
                {eventLinkLabel(event, locale)}
              </a>
            ) : null}
            <Link href={`${base}/kalender`} className="btn btn-ghost vtk-event-back-btn">
              ← {locale === "nl" ? "Terug naar kalender" : "Back to calendar"}
            </Link>
          </div>
        </aside>
      </div>
    </article>
  );
}
