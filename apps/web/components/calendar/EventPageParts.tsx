import Link from "@/components/ui/Link";
import Image from "next/image";
import { pick, type Locale } from "@vtk/i18n";
import { Markdown } from "@/components/ui/Markdown";
import { MapPinIcon, UsersIcon } from "@/components/ui/icons";
import { organiserName } from "@/lib/calendar/organiser";
import { EVENT_MOMENTS_VISIBLE, momentsSummary } from "@/lib/calendar/moments";
import { publicUrl } from "@/lib/storage";
import { defaultEventImageFor, eventCategorySlugs } from "@/lib/defaultEventImage";
import { loadCalendarEvent, loadDefaultEventImages } from "@/lib/pageQueries";
import { focusPosition } from "@/lib/imageFocus";
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

/**
 * De bouwstenen van een eventpagina, gedeeld door `/kalender/<slug>` en door een
 * ticketpagina die op de eventpagina staat (`TicketEvent.onEventPage`, zie
 * `EventTicketsPage`). Twee pagina's die hetzelfde evenement tonen, horen
 * dezelfde kop, foto en beschrijving te hebben; anders lopen ze bij de eerste
 * wijziging uit elkaar, zoals de eventkaart ooit.
 */

export type CalendarEventPageData = NonNullable<Awaited<ReturnType<typeof loadCalendarEvent>>>;

/** Eén moment van het evenement; zie `CalendarEventMoment`. */
type EventMomentRow = { start: Date; end: Date; label: string | null };

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

export function dayLabel(date: Date, locale: Locale, style: "long" | "short" = "long") {
  return date.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: style,
    day: "2-digit",
    month: style === "long" ? "long" : "short",
    ...(style === "long" ? { year: "numeric" as const } : {}),
  });
}

export function clockLabel(date: Date, locale: Locale) {
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

export function formatDateRange(start: Date, end: Date, locale: Locale, allDay: boolean) {
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

/** Wanneer het evenement doorgaat, in één regel: de reeks dagen of van start tot einde. */
export function eventWhen(event: CalendarEventPageData, locale: Locale) {
  return event.moments.length > 0
    ? formatMomentsRange(event.moments, locale)
    : formatDateRange(event.start, event.end, locale, event.allDay);
}

/** De donkere kop: titel, wanneer, doelgroep en thema, organisator en locatie. */
export function EventHead({ event, locale }: { event: CalendarEventPageData; locale: Locale }) {
  const base = locale === "nl" ? "" : "/en";
  const title = pick(event.titleNl, event.titleEn, locale);
  // Wie het organiseert, en dat is niet altijd de groep die het beheert; zie
  // lib/calendar/organiser.ts.
  const organiser = organiserName(event.organiserName, event.group, locale);
  // Doelgroepen krijgen een eigen, opvallend label: wie hier toevallig belandt
  // moet meteen zien dat het evenement voor eerstejaars of internationals is.
  const audiences = event.categories.map((c) => c.category).filter((c) => c.audience !== null);
  const themes = event.categories.map((c) => c.category).filter((c) => c.audience === null);

  return (
    <header className="vtk-page-head vtk-event-head">
      <div>
        <div className="vtk-page-kicker">
          <Link href={`${base}/kalender`} className="vtk-link">
            {locale === "nl" ? "Kalender" : "Calendar"}
          </Link>{" "}
          · {organiser}
        </div>
        <h1 className="vtk-page-title">{title}</h1>
        <p className="vtk-page-subtitle">{eventWhen(event, locale)}</p>
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
  );
}

/** De affiche, "Over dit event" en bij een alumni-evenement wie er komt. */
export async function EventPhotoAndAbout({
  event,
  locale,
  participation,
  sizes,
}: {
  event: CalendarEventPageData;
  locale: Locale;
  participation: EventParticipation;
  /** Hoe breed de foto in de layout staat; de ticketkolom is smaller. */
  sizes: string;
}) {
  const description = pick(event.descriptionNl ?? "", event.descriptionEn ?? "", locale);
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

  return (
    <>
      <figure className="vtk-event-photo">
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes={sizes}
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

      {participation.isAlumniEvent ? (
        <AttendeeTable rows={participation.attendees} locale={locale} />
      ) : null}
    </>
  );
}

/** Wat de bezoeker met dit evenement te maken heeft: interesse, dagen, aanmelden. */
export type EventParticipation = Awaited<ReturnType<typeof loadEventParticipation>>;

/**
 * "Ik kom naar dit evenement". De teller verschijnt pas vanaf een drempel; zie
 * lib/calendar/interest.ts voor waarom een laag getal averechts werkt.
 *
 * `returnPath` is het adres waar een bezoeker na het inloggen terug moet komen:
 * de eventpagina, of de ticketpagina die op de eventpagina staat.
 */
export async function loadEventParticipation(event: CalendarEventPageData, returnPath: string) {
  const isAlumniEvent = event.categories.some((c) => c.category.audience === "ALUMNI");
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
  return {
    isAlumniEvent,
    signedIn: Boolean(session),
    viewer,
    attendees,
    interestedMoments: new Set(viewerMoments.get(event.id) ?? []),
    total,
    loginHref: `/inloggen?next=${encodeURIComponent(returnPath)}`,
  };
}

/** De knop "Geïnteresseerd", met alles wat een alumni-evenement erbij vraagt. */
export function EventInterestButton({
  event,
  locale,
  participation,
  quiet = false,
}: {
  event: CalendarEventPageData;
  locale: Locale;
  participation: EventParticipation;
  /**
   * Een omlijnde knop in plaats van een volle. Op een eventpagina met tickets
   * is "Verder naar gegevens" de handeling; interesse staat er stil onder.
   */
  quiet?: boolean;
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const countLine = interestLabel(
    participation.total >= INTEREST_PUBLIC_THRESHOLD ? participation.total : null,
    locale,
  );
  return (
    <EventInterest
      eventId={event.id}
      isAlumniEvent={participation.isAlumniEvent}
      signedIn={participation.signedIn}
      viewer={participation.viewer}
      loginHref={`${base}${participation.loginHref}`}
      quiet={quiet}
      labels={{
        interested: nl ? "Geïnteresseerd" : "Interested",
        removeInterest: nl ? "Niet meer geïnteresseerd" : "Remove interest",
        saving: nl ? "Bezig..." : "Working...",
        countLine,
        loginCta: nl ? "Log in om je interesse aan te duiden" : "Sign in to mark your interest",
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
  );
}

/**
 * Losse download, geen abonnement: dit is één event, dat verandert zelden nog na
 * publicatie. Wie alles wil volgen, abonneert zich op de feed vanaf /kalender.
 */
export function AddToCalendarLink({ event, locale }: { event: CalendarEventPageData; locale: Locale }) {
  return (
    <a
      href={`/api/calendar/event/${event.id}${locale === "en" ? "?lang=en" : ""}`}
      className="btn btn-ghost"
    >
      {locale === "nl" ? "Zet in mijn agenda" : "Add to my calendar"}
    </a>
  );
}

/** Een formulier bij dit evenement, zolang het openstaat. */
export function openEventForm(event: CalendarEventPageData, now = new Date()) {
  const form = event.form;
  if (!form || form.status !== "PUBLISHED") return null;
  if (form.opensAt && form.opensAt > now) return null;
  if (form.closesAt && form.closesAt <= now) return null;
  return form;
}

/**
 * Wanneer het doorgaat: een evenement met losse momenten zegt dag per dag
 * wannéér, met een ster per dag; een ander evenement een start en een einde.
 */
export function EventWhenBlock({
  event,
  locale,
  participation,
}: {
  event: CalendarEventPageData;
  locale: Locale;
  participation: EventParticipation;
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const title = pick(event.titleNl, event.titleEn, locale);
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

  if (event.moments.length === 0) {
    return (
      <dl className="spec">
        <dt>{nl ? "Start" : "Start"}</dt>
        <dd>{specMoment(event.start, event.allDay, locale)}</dd>
        <dt>{nl ? "Einde" : "End"}</dt>
        <dd>{specMoment(event.end, event.allDay, locale)}</dd>
      </dl>
    );
  }

  return (
    <section className="vtk-event-moments">
      <h3>{nl ? "Wanneer" : "When"}</h3>
      {/* Een ster per dag, en niet enkel de knop eronder: bij een loopweek kom
          je naar het loopje van woensdag, niet naar "de loopweek". Die knop
          blijft staan en zet ze alle samen aan. */}
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
              className={index >= EVENT_MOMENTS_VISIBLE ? "vtk-event-moment is-extra" : "vtk-event-moment"}
            >
              <span className="day">{dayLabel(moment.start, locale, "short")}</span>
              <span className="time">
                {clockLabel(moment.start, locale)} - {clockLabel(moment.end, locale)}
              </span>
              <EventStar
                eventId={event.id}
                momentStart={momentIso}
                title={momentTitle}
                interested={participation.interestedMoments.has(momentIso)}
                signedIn={participation.signedIn}
                loginHref={`${base}${participation.loginHref}`}
                labels={momentStarLabels}
                className="vtk-event-moment-star"
              />
              {/* De eigen naam van dit moment ("Nachtloop") is een eigennaam en
                  geen labeltje: `.label` uit de basislaag zette ze in kapitalen
                  met spatiëring, waardoor "Loopje 1" als een rubriek las in
                  plaats van als de naam van die avond. */}
              {moment.label ? <span className="name">{moment.label}</span> : null}
            </li>
          );
        })}
      </EventMomentsList>
    </section>
  );
}
