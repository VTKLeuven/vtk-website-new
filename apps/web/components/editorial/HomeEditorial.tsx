import Image from "next/image";
import Link from "@/components/ui/Link";
import type { CSSProperties } from "react";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { AANBOD_PHOTOS, aanbodCardBody } from "@/lib/aanbodCards";
import {
  getCachedHeaderTabs,
  getCachedMediaContent,
  getCachedDefaultEventImages,
  getCachedPartners,
  getCachedSettings,
} from "@/lib/cachedContent";
import { videoEmbed } from "@/lib/videoEmbed";
import { getCurrentSession } from "@/lib/session";
import { addDays } from "date-fns";
import { getDictionary } from "@vtk/i18n";
import { PocBand, type PocBandGroup } from "./PocBand";
import { NewsBand } from "./NewsBand";
import { getCachedNews, getPresaleNews } from "@/lib/news/load";
import { POC_BAND_SETTING, readPocBandSetting } from "@/lib/home/pocBand";
import { SHIFTS_BAND_SETTING, readShiftsBandSetting } from "@/lib/home/shiftBand";
import { HomeShiftBand, type HomeShiftItem } from "./HomeShiftBand";
import { ROSTER_PARTICIPANT_SELECT, toRoster } from "@/lib/shift/roster";
import { loadPostNames } from "@/lib/shift/postNames";
import { getCursusdienstHours } from "@/lib/cursusdienstHours";
import { elixirScheduleFromSetting, openingWindowPhase } from "@/lib/elixir/openingWindow";
import { readBarStatus } from "@/lib/elixir/status";
import { publicUrl } from "@/lib/storage";
import { defaultEventImageFor, eventCategorySlugs } from "@/lib/defaultEventImage";
import { PartnerLogo } from "@/components/site/PartnerLogo";
import { EventStar, type EventStarLabels } from "@/components/calendar/EventStar";
import { MomentDays } from "@/components/calendar/MomentDays";
import { CalendarPlusIcon, TicketIcon } from "@/components/ui/icons";
import { focusPosition } from "@/lib/imageFocus";
import { hasUpcomingMoment, momentsSummary, nextOccurrenceAt } from "@/lib/calendar/moments";
import { viewerAudienceFilter } from "@/lib/calendar/audience";
import {
  interestLabel,
  publicInterestCounts,
  viewerInterests,
} from "@/lib/calendar/interest";
import { publishedTicketSlug, TICKET_LINK_SELECT } from "@/lib/ticketing/eventPage";
import { currentWorkingYear } from "@/lib/workingYear";
import { AftermovieGrid, type AftermovieGridItem } from "./AftermovieGrid";
import {
  entriesForService,
  openingHoursNote,
  readOpeningHoursSetting,
} from "@/lib/openingHoursSettings";
import { buildHoursBand, weekFromEntries, weekFromOpeningTimes } from "@/lib/openingHoursWeek";
import { OpeningHoursBand } from "./OpeningHoursBand";
import { BlueprintHero } from "./BlueprintHero";

import "@/app/design/vtk-hero.css";
import "@/app/design/vtk-home.css";
import "@/app/design/vtk-eventcard.css";
import { HOME_LINK_EVENT, OUTBOUND_EVENT, umamiEvent } from "@/lib/analytics";
import { withSource } from "@/lib/ticketing/source";

type CareerSetting = {
  titleNl: string;
  titleEn: string;
  bodyNl: string;
  bodyEn: string;
  ctaLabelNl?: string;
  ctaLabelEn?: string;
  ctaUrl?: string;
};

const ELIXIR_NAME = "'t ElixIr";

function formatTime(d: Date, locale: Locale): string {
  return d.toLocaleTimeString(locale === "nl" ? "nl-BE" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function HomeEditorial({ locale }: { locale: Locale }) {
  const base = locale === "nl" ? "" : "/en";
  const now = new Date();
  const nl = locale === "nl";
  /** De taal waarin datums op deze pagina geschreven worden. */
  const dateTag = nl ? "nl-BE" : "en-GB";

  const [
    settings,
    calendarEvents,
    tabs,
    defaultEventImages,
    partners,
    media,
    session,
    cursusEntries,
    barStatus,
    news,
  ] = await Promise.all([
    // Redactionele inhoud: voor elke bezoeker gelijk, dus uit de gedeelde cache
    // (lib/cachedContent.ts). Wat hieronder persoonlijk is (de kalenderfilter,
    // de sessie, de shiften, de POC's) blijft een lezing per verzoek.
    getCachedSettings([
      "home.openingHours.theokot",
      "home.openingHours.cursusdienst",
      "home.openingHours.elixir",
      "home.career",
      POC_BAND_SETTING,
      SHIFTS_BAND_SETTING,
    ]),
    // Dezelfde doelgroepregel als /kalender: standaard staat alles erop, en enkel
    // wie op /account koos zijn kalender toe te spitsen krijgt hier minder.
    //
    // Op het einde en niet op de start: een evenement over meerdere dagen dat
    // eerder begon, loopt vandaag nog. De limiet ligt ruimer dan de zes kaarten
    // hieronder, omdat een reeks waarvan elk moment al voorbij is maar waarvan
    // de envelop nog loopt, daar nog wegvalt.
    viewerAudienceFilter().then((audiences) =>
      prisma.calendarEvent.findMany({
        where: {
          end: { gte: now },
          publishedAt: { not: null },
          ...audiences,
        },
        orderBy: { start: "asc" },
        take: 12,
        include: {
          categories: { include: { category: true } },
          moments: { orderBy: { start: "asc" }, select: { start: true, end: true, label: true } },
          // Voor het ticketicoon op de evenementkaart; zie `publishedTicketSlug`.
          ticketEvents: { select: TICKET_LINK_SELECT },
        },
      }),
    ),
    getCachedHeaderTabs(locale),
    // De standaardfoto's voor evenementen zonder eigen affiche: de sitebrede en
    // die per thema. Zie lib/defaultEventImage.ts.
    getCachedDefaultEventImages(),
    getCachedPartners(),
    getCachedMediaContent(),
    // De POC-sectie is persoonlijk, dus de homepage leest de sessie. Dat maakt
    // de pagina dynamisch: ze wordt per bezoeker gerenderd in plaats van
    // gecachet. De rest van de pagina deed al een DB-lezing per render, dus dat
    // blijft één ronde extra en geen nieuw soort werk.
    getCurrentSession(),
    // Cursusdienst-uren komen live van cudi.vtk.be; deze lezing valt terug op de
    // laatst gecachte waarde en anders op null (kaart toont "niet beschikbaar").
    getCursusdienstHours(locale),
    // Live geluidsstatus van 't ElixIr: enkel een lezing uit de cache (geheugen,
    // of één Setting-rij vlak na een herstart). De worker praat met Munisense,
    // niet deze render. Zie lib/elixir/status.ts.
    readBarStatus(now),
    // Het nieuws bovenaan de pagina; ook gedeeld over
    // alle bezoekers. Faalt de lezing, dan valt enkel de band weg.
    getCachedNews(locale).catch((error) => {
      console.error("Nieuws lezen mislukt", error);
      return { enabled: false, entries: [] };
    }),
  ]);

  // Een voorverkoop staat enkel in het nieuws van wie erin mag, en hangt dus aan
  // de sessie; daarom los van het gedeelde nieuws. Zie `getPresaleNews`.
  const presaleNews = news.enabled
    ? await getPresaleNews(locale, session, now).catch((error) => {
        console.error("Voorverkoop in het nieuws lezen mislukt", error);
        return [];
      })
    : [];
  const newsEntries = presaleNews.length > 0 ? [...news.entries, ...presaleNews] : news.entries;

  // Aftermovies: `media.aftermovies` is dezelfde instelling als op /media, te
  // beheren via /admin/home. Enkel echte embeds tonen; een losse mp4 of een
  // onherkenbare link hoort in het rooster niet thuis en valt hier weg.
  const aftermovies: AftermovieGridItem[] = media.videos
    .flatMap((video) => {
      const embed = videoEmbed(video.url, video.posterUrl);
      if (!embed) return [];
      return [{
        id: video.id,
        title: pick(video.titleNl, video.titleEn ?? video.titleNl, locale),
        embedUrl: embed.embedUrl,
        externalUrl: embed.externalUrl,
        posterUrl: embed.posterUrl,
      }];
    })
    .slice(0, 6);

  // Wat er nog komt.
  //
  // Bij een evenement met losse momenten telt niet de envelop maar het
  // eerstvolgende moment: een loopweek die maandag begon, heeft op woensdag nog
  // vier loopjes te gaan en is dus niet "voorbij". Om dezelfde reden staan de
  // kaarten op de eerstvolgende keer gesorteerd en niet op de start.
  const upcomingEvents = calendarEvents
    .filter((event) => hasUpcomingMoment(event, now))
    .sort((a, b) => +nextOccurrenceAt(a, now) - +nextOccurrenceAt(b, now));

  // Opkomende evenementen: 2 rijen van 3. Zijn er minder, dan krimpt het
  // rooster gewoon mee (zie `.ev-grid`), zonder lege plaatsen op te vullen.
  const eventCards = upcomingEvents.slice(0, 6);

  // "32 komen" bij een evenement waar al volk naartoe gaat. Enkel boven de
  // drempel; zie lib/calendar/interest.ts voor waarom een laag getal averechts
  // werkt.
  const eventIds = eventCards.map((event) => event.id);
  const [interested, viewerInterestMap, shifts, postNames] = await Promise.all([
    publicInterestCounts(eventIds),
    // Wat de bezoeker zelf al aanduidde, voor de ster op de kaart. Zonder
    // sessie blijft dit leeg en is de ster een link naar het aanmelden.
    viewerInterests(eventIds, session?.user.id ?? null),
    // De shiften voor de shiftband.
    prisma.shift.findMany({
      where: { endTime: { gte: now }, manualGrantId: null },
      orderBy: { startTime: "asc" },
      take: 40,
      select: {
        id: true,
        name: true,
        startTime: true,
        endTime: true,
        // Niet getoond; `ShiftDialog` verwacht de volledige `Shift`-vorm.
        updatedAt: true,
        location: true,
        description: true,
        instructions: true,
        maxParticipants: true,
        reward: true,
        post: true,
        openToInternationals: true,
        _count: { select: { participants: true } },
        participants: {
          select: ROSTER_PARTICIPANT_SELECT,
        },
      },
    }),
    loadPostNames(locale),
  ]);
  const viewerId = session?.user.id ?? "";

  const weekEnd = addDays(now, 7);
  const weekShifts = shifts.filter((s) => s.startTime <= weekEnd);
  const totalOpenSpots = weekShifts.reduce(
    (acc, s) => acc + Math.max(0, s.maxParticipants - s._count.participants),
    0
  );
  const shiftBandItems: HomeShiftItem[] = weekShifts
    .filter((s) => s.maxParticipants - s._count.participants > 0 || s.participants.some((p) => p.userId === viewerId))
    .slice(0, 4)
    .map(({ _count, participants, ...shift }) => ({
      ...shift,
      takenSpots: _count.participants,
      availableSpots: Math.max(0, shift.maxParticipants - _count.participants),
      viewerRegistered: participants.some((p) => p.userId === viewerId),
      roster: toRoster(participants, viewerId),
    }));
  const viewerInterestIds = new Set(viewerInterestMap.keys());

  const starLabels: EventStarLabels = {
    mark: nl ? "Ik kom naar dit evenement" : "I am coming to this event",
    marked: nl ? "Je komt naar dit evenement" : "You are coming to this event",
    signIn: nl ? "Meld je aan om aan te duiden dat je komt" : "Sign in to mark that you are coming",
    failed: nl
      ? "Aanduiden lukte niet. Probeer het straks opnieuw."
      : "Marking this did not work. Try again in a moment.",
  };
  const eventLoginHref = `${base}/inloggen?next=${encodeURIComponent(base === "" ? "/" : base)}`;

  // POC's van jouw richtingen. Zonder sessie of zonder richtingen valt de hele
  // sectie weg: een lijst van alle POC's is hier niet wat gevraagd wordt.
  //
  // De richtingen komen uit de database en niet uit de sessie: `AuthUser` draagt
  // ze niet, en ze daar bij zetten zou elke sessie-payload zwaarder maken voor
  // één sectie op één pagina. Deze lezing gebeurt enkel voor wie ingelogd is.
  const myProgrammes = session
    ? (
        await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { studyProgrammes: true },
        })
      )?.studyProgrammes ?? []
    : [];

  const myPocs =
    myProgrammes.length > 0
      ? await prisma.poc.findMany({
          where: { studyProgrammes: { hasSome: myProgrammes } },
          orderBy: { order: "asc" },
          include: {
            representatives: {
              where: { year: currentWorkingYear(), user: { deletedAt: null } },
              orderBy: { order: "asc" },
              include: { user: true },
            },
          },
        })
      : [];
  // Een POC zonder vertegenwoordigers levert een lege kaart op; die tonen we niet.
  const pocsWithPeople = myPocs.filter((poc) => poc.representatives.length > 0);
  const pocGroups: PocBandGroup[] = pocsWithPeople.map((poc) => ({
    id: poc.id,
    name: pick(poc.nameNl, poc.nameEn ?? poc.nameNl, locale),
    email: poc.email,
    people: poc.representatives.map((rep) => ({
      id: rep.id,
      name: rep.user.name,
      avatarUrl: publicUrl(rep.user.avatarKey),
      role: pick(rep.roleNl ?? "", rep.roleEn ?? rep.roleNl ?? "", locale) || null,
    })),
  }));

  const dict = getDictionary(locale);
  const myProgrammeNames = myProgrammes.map(
    (prog) => dict.onboarding.programmes[prog] ?? prog
  );

  const map = new Map(settings.map((s) => [s.key, s.value as unknown]));
  const pocSetting = readPocBandSetting(map.get(POC_BAND_SETTING));
  const shiftsBandSetting = readShiftsBandSetting(map.get(SHIFTS_BAND_SETTING));
  const theokot = readOpeningHoursSetting(map.get("home.openingHours.theokot"), "theokot");
  const cursusdienst = readOpeningHoursSetting(
    map.get("home.openingHours.cursusdienst"),
    "cursusdienst",
  );
  const elixir = readOpeningHoursSetting(map.get("home.openingHours.elixir"), "elixir");
  const career = map.get("home.career") as CareerSetting | undefined;

  // De titel is "Openingsuren Theokot"; de band toont enkel de naam zelf.
  const serviceName = (title: string) =>
    title.replace(/^Openingsuren\s+/i, "").replace(/\s+opening hours$/i, "");

  // De geluidsmeting is de bron zodra ze vers is; het uurrooster is de fallback
  // wanneer de meting ontbreekt of te oud is (worker plat, integratie niet
  // geconfigureerd, of gewoon de eerste render na een deploy). De meting zelf
  // spreekt enkel binnen de openingsuren, dus buiten het venster zeggen beide
  // hetzelfde.
  const elixirSchedule = elixirScheduleFromSetting(map.get("home.openingHours.elixir"));
  const elixirPhase = openingWindowPhase(now, elixirSchedule);
  const elixirLive = barStatus && !barStatus.stale && elixirPhase !== "closed" ? barStatus : null;
  const hoursBand = buildHoursBand(
    [
      {
        key: "theokot",
        name: serviceName(pick(theokot.titleNl, theokot.titleEn, locale)),
        subtitle: pick(theokot.subtitleNl, theokot.subtitleEn, locale),
        note: openingHoursNote(theokot, locale),
        week: weekFromEntries(entriesForService(theokot, "theokot", locale)),
        recurring: true,
      },
      {
        key: "cursusdienst",
        name: serviceName(pick(cursusdienst.titleNl, cursusdienst.titleEn, locale)),
        subtitle: pick(cursusdienst.subtitleNl, cursusdienst.subtitleEn, locale),
        note: openingHoursNote(cursusdienst, locale),
        // Komt live van cudi.vtk.be: één week, en `null` wanneer cudi plat lag
        // en er ook niets gecachet was.
        week: cursusEntries ? weekFromEntries(cursusEntries) : null,
        recurring: false,
      },
      {
        key: "elixir",
        name: serviceName(pick(elixir.titleNl, elixir.titleEn, locale)) || ELIXIR_NAME,
        subtitle: pick(elixir.subtitleNl, elixir.subtitleEn, locale),
        note: openingHoursNote(elixir, locale),
        // Uit hetzelfde venster als de live-status, zodat balk en status
        // hetzelfde uur zien.
        week: weekFromOpeningTimes(elixirSchedule),
        recurring: true,
        elixir: {
          phase: elixirPhase,
          live: elixirLive
            ? { isOpen: elixirLive.isOpen, measuredAt: new Date(elixirLive.lastUpdated) }
            : null,
        },
      },
    ],
    now,
    locale,
  );

  const aanbodTabs = tabs.filter((t) => t.slug !== "").slice(0, 6);
  const fallbackAanbod = [
    {
      labelNl: "Sociaal",
      labelEn: "Social",
      titleNl: "Cantussen, TDs en galabals.",
      titleEn: "Cantuses, TDs and galas.",
      bodyNl: "Alles wat de ingenieursstudent buiten de aula samenbrengt.",
      bodyEn: "Everything that brings engineering students together outside the lecture hall.",
      href: `${base}/kalender`,
      photo: "/aanbod/sport.jpg",
    },
    {
      labelNl: "Career",
      labelEn: "Career",
      titleNl: "Van campus naar job.",
      titleEn: "From campus to career.",
      bodyNl: "Bedrijvenrelaties, events en kansen om je toekomst scherp te krijgen.",
      bodyEn: "Company relations, events and opportunities to shape what comes next.",
      href: `${base}/career`,
      photo: "/career-fair.jpg",
    },
    {
      labelNl: "Studies",
      labelEn: "Studies",
      titleNl: "Cursusdienst en studiehulp.",
      titleEn: "Course shop and study help.",
      bodyNl: "Praktische ondersteuning voor je semester.",
      bodyEn: "Practical support for your semester.",
      href: `${base}/cursusdienst`,
      photo: "/aanbod/cursusdienst.jpg",
    },
  ];

  const aanbodCards =
    aanbodTabs.length > 0
      ? aanbodTabs.map((tab) => ({
          labelNl: tab.labelNl,
          labelEn: tab.labelEn,
          titleNl: tab.labelNl,
          titleEn: tab.labelEn,
          ...aanbodCardBody(tab.homeBodyNl, tab.homeBodyEn),
          href: `${base}/${tab.slug}`,
          photo: publicUrl(tab.imageKey) ?? AANBOD_PHOTOS[tab.slug],
        }))
      : fallbackAanbod;

  return (
    <div className="vtk-design">
      {/* Hero: de technische bouwtekening van het logo met zes wegwijzers */}
      <BlueprintHero locale={locale} />

      {/* Onder de hero: het nieuws in een lichtblauwe band, die helemaal wegvalt
          zonder berichten of wanneer ze uitstaat in /admin/nieuws. Zie lib/news. */}
      {news.enabled ? (
        <NewsBand entries={newsEntries} locale={locale} base={base} now={now} />
      ) : null}

      {eventCards.length > 0 && (
        <section className="section band events-band">
          <div className="sec-head">
            <h2>{nl ? "Aankomende evenementen." : "Upcoming events."}</h2>
            <div className="meta">
              {eventCards.length} {nl ? "gepland" : "planned"} ·{" "}
              <Link href={`${base}/kalender`}>{nl ? "volledige kalender" : "full calendar"}</Link>
            </div>
          </div>
          <div className="ev-grid">
            {eventCards.map((event) => {
              // De eerstvolgende keer dat er iets is; bij een gewoon evenement
              // gewoon zijn start.
              const start = nextOccurrenceAt(event, now);
              const eventPhoto = publicUrl(event.imageKey);
              // Zonder eigen affiche: de standaardbanner van het thema, en
              // anders de sitebrede foto.
              const photo =
                eventPhoto ??
                defaultEventImageFor(defaultEventImages, eventCategorySlugs(event.categories));
              const title = pick(event.titleNl, event.titleEn ?? event.titleNl, locale);
              const going = interestLabel(interested.get(event.id), locale);
              const location = event.location?.trim() || null;
              const categories = event.categories.map((link) => link.category);
              const theme = categories.find((category) => category.audience === null) ?? null;
              const audiences = categories.filter((category) => category.audience !== null);
              const ticketSlug = publishedTicketSlug(event.ticketEvents);
              return (
                // Dezelfde kaart als in het raster van /kalender, uit
                // `vtk-eventcard.css`. Een kaart met knoppen erin kan geen link
                // zijn: een knop in een anker is ongeldige HTML en op een
                // telefoon opent de ster dan de eventpagina. De titel is de link
                // en spant zich over de kaart (`.ev-card-link::after`), de
                // acties liggen erboven.
                <article key={event.id} className="ev-card">
                  <div className="ev-card-shot">
                    <Image
                      src={photo}
                      alt=""
                      fill
                      // Dezelfde maten als het raster op /kalender: de kaart en
                      // haar breekpunten komen uit hetzelfde stylesheet.
                      sizes="(max-width: 620px) 100vw, (max-width: 1000px) 50vw, 380px"
                      // Enkel de eigen foto draagt een gekozen uitsnede; de
                      // standaardfoto blijft gecentreerd.
                      style={
                        eventPhoto
                          ? {
                              objectPosition: focusPosition({
                                x: event.imageFocusX,
                                y: event.imageFocusY,
                              }),
                            }
                          : undefined
                      }
                    />
                    {/* Weekdag boven het getal, maand eronder: zo staat een
                        datum op een kalenderblad, en zo blijft de pin vierkant.
                        Ze hangt rechtsonder aan de foto en steekt er onderuit,
                        zodat het tekstblok bovenaan begint en het klikvlak van
                        de titel de hele kaart houdt. */}
                    <span className="ev-card-pin">
                      <i>{start.toLocaleDateString(dateTag, { weekday: "short" })}</i>
                      <b>{start.getDate()}</b>
                      <i>{start.toLocaleDateString(dateTag, { month: "short" })}</i>
                    </span>
                  </div>
                  <div className="ev-card-body">
                    <div className="ev-card-tags">
                      {theme ? (
                        <span
                          className="ev-card-cat"
                          style={{ "--cat": theme.colour } as CSSProperties}
                        >
                          {pick(theme.nameNl, theme.nameEn, locale)}
                        </span>
                      ) : null}
                      {audiences.map((audience) => (
                        <span
                          key={audience.id}
                          className="ev-card-aud"
                          style={{ "--cat": audience.colour } as CSSProperties}
                        >
                          {pick(audience.nameNl, audience.nameEn, locale)}
                        </span>
                      ))}
                    </div>
                    <h3 className="ev-card-title">
                      <Link href={withSource(`${base}/kalender/${event.slug}`, "home-evenementen")} className="ev-card-link">
                        {title}
                      </Link>
                    </h3>
                    {/* Dezelfde strip als op /kalender: de dagen die de reeks nog
                        te gaan heeft. Het is dezelfde kaart, dus ook hetzelfde
                        antwoord op "telkens 18:00, maar wanneer dan?". */}
                    <MomentDays
                      moments={event.moments}
                      now={now}
                      locale={locale}
                      timeZone="Europe/Brussels"
                    />
                    <div className="ev-card-foot">
                      <span className="ev-card-when">
                        {/* Zeven keer hetzelfde uur hoort niet zeven keer op een
                            kaart: een reeks momenten wordt "telkens 18:00". */}
                        {event.allDay
                          ? nl
                            ? "Hele dag"
                            : "All day"
                          : (momentsSummary(event.moments, locale, "Europe/Brussels") ??
                            formatTime(start, locale))}
                        {location ? ` · ${location}` : ""}
                      </span>
                      <span className="ev-card-actions">
                        {going ? <span className="ev-going">{going}</span> : null}
                        <EventStar
                          eventId={event.id}
                          title={title}
                          interested={viewerInterestIds.has(event.id)}
                          signedIn={Boolean(session)}
                          loginHref={eventLoginHref}
                          labels={starLabels}
                          className="ev-card-action"
                        />
                        {/* Gewone link naar de .ics, zonder `download`: iOS zet
                            een gedownload bestand in de Bestanden-app, terwijl
                            het zo meteen als evenement opent. Zie de route. */}
                        <a
                          href={`/api/calendar/event/${event.id}${locale === "en" ? "?lang=en" : ""}`}
                          className="ev-card-action"
                          title={nl ? "Zet in mijn agenda" : "Add to my calendar"}
                          aria-label={`${nl ? "Zet in mijn agenda" : "Add to my calendar"}: ${title}`}
                        >
                          <CalendarPlusIcon />
                        </a>
                        {/* Rechtstreeks naar de tickets, zonder eerst langs de
                            eventpagina. Enkel wanneer de ticketpagina online
                            staat, dezelfde regel als de knop daar. */}
                        {ticketSlug ? (
                          <Link
                            href={withSource(`${base}/tickets/${ticketSlug}`, "home-evenementen")}
                            className="ev-card-action"
                            title={nl ? "Tickets kopen" : "Buy tickets"}
                            aria-label={`${nl ? "Tickets kopen" : "Buy tickets"}: ${title}`}
                          >
                            <TicketIcon />
                          </Link>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <OpeningHoursBand
        band={hoursBand}
        meta={now.toLocaleString(dateTag, {
          timeZone: "Europe/Brussels",
          weekday: "short",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
        locale={locale}
        base={base}
      />

      <PocBand
        locale={locale}
        base={base}
        now={now}
        setting={pocSetting}
        groups={pocGroups}
        myProgrammes={myProgrammeNames}
      />

      {shiftsBandSetting.visible && (
        <HomeShiftBand
          locale={locale}
          base={base}
          shifts={shiftBandItems}
          postNames={postNames}
          signedIn={Boolean(session)}
          totalOpenSpots={totalOpenSpots}
          userName={session?.user?.name ?? null}
          t={getDictionary(locale).shift}
        />
      )}

      {aftermovies.length > 0 && (
        <section className="section band aftermovie-band">
          <div className="sec-head">
            <h2>{nl ? "Aftermovies." : "Aftermovies."}</h2>
            <div className="meta">
              {nl ? "Beelden van de afgelopen jaren" : "Footage from past years"} ·{" "}
              <Link href={`${base}/media`}>{nl ? "alle media" : "all media"}</Link>
            </div>
          </div>
          <AftermovieGrid
            items={aftermovies}
            playLabel={nl ? "Video afspelen" : "Play video"}
          />
        </section>
      )}

      <section className="section">
        <div className="sec-head">
          <h2>{nl ? "Wat we doen." : "What we do."}</h2>
          <div className="meta">
            <Link href={`${base}/info`}>{nl ? "bekijk alles" : "see all"}</Link>
          </div>
        </div>
        <div className="aanbod">
          {aanbodCards.slice(0, 6).map((card) => {
            const photo = card.photo;
            const label = pick(card.labelNl, card.labelEn, locale);
            const cardTitle = pick(card.titleNl, card.titleEn, locale);
            // Alle aanbod-kaarten zijn identiek: dezelfde fotokop in 16:9 en
            // dezelfde witte body als een eventkaart. Geen enkele kaart krijgt
            // een aparte featured-stijl.
            return (
              <Link
                key={card.href}
                href={card.href}
                className="acard"
                {...umamiEvent(HOME_LINK_EVENT, { soort: "aanbodkaart", naar: card.href })}
              >
                <span
                  className={`acard-media${photo ? "" : " acard-media-ph"}`}
                  aria-hidden="true"
                >
                  {photo ? (
                    <Image
                      src={photo}
                      alt=""
                      fill
                      sizes="(max-width: 620px) 100vw, (max-width: 1000px) 50vw, 380px"
                    />
                  ) : null}
                </span>
                <div className="acard-body">
                  {/* Bij een headertab is het label de titel; dan stond hier
                      hetzelfde woord twee keer onder elkaar. */}
                  {label && label !== cardTitle ? <div className="tag">{label}</div> : null}
                  <div className="acard-head">
                    <h3>{cardTitle}</h3>
                    <span className="cta">{nl ? "Ontdek" : "Explore"}</span>
                  </div>
                  <p>{pick(card.bodyNl, card.bodyEn, locale)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="section band career-band">
        <div className="sec-head">
          <h2>
            Never too early to build <span className="accent">your career</span>
          </h2>
          <div className="meta">career.vtk.be · {nl ? "vacatures & events" : "vacancies & events"}</div>
        </div>
        <div className="career">
          <div>
            <h3>
              {career
                ? pick(career.titleNl, career.titleEn, locale)
                : nl
                  ? "Ontmoet bedrijven voordat je moet solliciteren."
                  : "Meet companies before you have to apply."}
            </h3>
            <p>
              {career
                ? pick(career.bodyNl, career.bodyEn, locale)
                : nl
                  ? "Doorheen het jaar brengen we studenten en bedrijven samen via career events, bedrijfsrelaties en praktische kansen."
                  : "Throughout the year we bring students and companies together through career events, company relations and practical opportunities."}
            </p>
            <div className="pcount">
              <div className="meta">
                <div className="k">{nl ? "Bedrijven" : "Companies"}</div>
                <div className="v">300+</div>
              </div>
              <div className="meta">
                <div className="k">{nl ? "Studenten" : "Students"}</div>
                <div className="v">3000+</div>
              </div>
            </div>
            <div className="career-actions">
              <a
                href="https://career.vtk.be"
                className="btn btn-primary arrow"
                {...umamiEvent(OUTBOUND_EVENT, { bestemming: "career.vtk.be", vanaf: "homepage" })}
              >
                {nl ? "Naar VTK Career" : "Open VTK Career"}
              </a>
              <a
                href="https://www.career.vtk.be/contact"
                className="btn btn-ghost arrow"
                {...umamiEvent(OUTBOUND_EVENT, {
                  bestemming: "www.career.vtk.be",
                  vanaf: "homepage",
                })}
              >
                {nl ? "Contact voor bedrijven" : "Contact for companies"}
              </a>
            </div>
          </div>
          <figure className="career-photo">
            <Image
              src="/career-fair.jpg"
              alt={
                nl
                  ? "Studenten en bedrijven op de VTK Career Fair"
                  : "Students and companies at the VTK Career Fair"
              }
              width={1600}
              height={1067}
              sizes="(max-width: 1000px) 100vw, 50vw"
            />
            <figcaption>
              <span className="pin" />
              VTK Career Fair
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="partners">
        <div className="partners-head">
          <div>
            <div className="eyebrow">
              <span className="dot" />
              {nl ? "Mede mogelijk gemaakt door" : "With support from"}
            </div>
            <h3>{nl ? "Hoofdpartners" : "Main partners"}</h3>
          </div>
          {/* Bedrijven die partner willen worden komen bij VTK Career terecht,
              niet bij de algemene contactpagina. */}
          <a
            href="https://www.career.vtk.be/contact"
            className="btn btn-ghost arrow"
            target="_blank"
            rel="noopener noreferrer"
          >
            Contact
          </a>
        </div>
        <div className="partners-grid">
          {partners.length === 0 ? (
            <div className="partner">{nl ? "Nog geen partners" : "No partners yet"}</div>
          ) : (
            partners.map((partner) => {
              const logo = publicUrl(partner.logoKey);
              return partner.url ? (
                <a
                  className="partner"
                  key={partner.id}
                  href={partner.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${partner.name} (${nl ? "opent in een nieuw tabblad" : "opens in a new tab"})`}
                >
                  <PartnerLogo src={logo} name={partner.name} />
                </a>
              ) : (
                <div className="partner" key={partner.id}>
                  <PartnerLogo src={logo} name={partner.name} />
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
