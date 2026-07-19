import Image from "next/image";
import Link from "next/link";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { currentWorkingYear } from "@/lib/workingYear";
import { getVisibleHeaderTabsForNav } from "@/lib/headerTabs";
import { AANBOD_PHOTOS } from "@/lib/aanbodPhotos";
import { getMediaContent } from "@/lib/media-content";
import { videoEmbed } from "@/lib/videoEmbed";
import { getCurrentSession } from "@/lib/session";
import { publicUrl } from "@/lib/storage";
import { BUILTIN_DEFAULT_EVENT_IMAGE, DEFAULT_EVENT_IMAGE_SETTING } from "@/lib/defaultEventImage";
import { PartnerLogo } from "@/components/site/PartnerLogo";
import { AftermovieGrid, type AftermovieGridItem } from "./AftermovieGrid";
import {
  dutchDayNameForDate,
  entryForDate,
  isClosedHours,
  isOpenAt,
} from "./hoursUtils";

import "@/app/design/vtk-home.css";

type OpeningHoursSetting = {
  titleNl: string;
  titleEn: string;
  /** Ondertitel op de homepage-kaart ("Broodjes & warme snacks"), via admin. */
  subtitleNl?: string;
  subtitleEn?: string;
  entries: Array<{ dayNl: string; dayEn: string; hours: string }>;
};

type CareerSetting = {
  titleNl: string;
  titleEn: string;
  bodyNl: string;
  bodyEn: string;
  ctaLabelNl?: string;
  ctaLabelEn?: string;
  ctaUrl?: string;
};

/** "2026-27" voor het werkingsjaar dat op 15 juli begint (zie @vtk/auth). */
function workingYearLabel(d: Date): string {
  const y = currentWorkingYear(d);
  return `${y}-${String(y + 1).slice(-2)}`;
}

/**
 * Maandlabel bij een dag in de agenda ("sep"), met jaartal zodra de dag in een
 * ander kalenderjaar valt dan vandaag ("jan '27"), anders staat er enkel een
 * dagnummer en weet je niet welke maand bedoeld wordt.
 */
function monthLabel(d: Date, now: Date, locale: Locale): string {
  const month = d.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", { month: "short" }).replace(".", "");
  return d.getFullYear() === now.getFullYear() ? month : `${month} '${String(d.getFullYear()).slice(-2)}`;
}

/** Gesloten-melding op een openingsurenkaart, met de naam van de dienst erin. */
function closedLabel(name: string, nl: boolean): string {
  return nl ? `${name} is momenteel gesloten :(` : `${name} is currently closed :(`;
}

function dayKey(d: Date, locale: Locale): string {
  return d.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
}

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

  const [settings, upcomingEvents, tabs, partners, media, session] = await Promise.all([
    prisma.setting.findMany({
      where: {
        key: {
          in: [
            "home.openingHours.cursusdienst",
            "home.openingHours.theokot",
            "home.featuredAlbums",
            "home.career",
            DEFAULT_EVENT_IMAGE_SETTING,
          ],
        },
      },
    }),
    prisma.calendarEvent.findMany({
      where: { start: { gte: now }, visibility: "PUBLIC" },
      orderBy: { start: "asc" },
      take: 8,
      include: { group: true },
    }),
    getVisibleHeaderTabsForNav(),
    prisma.partner.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      take: 12,
    }),
    getMediaContent(),
    // De POC-sectie is persoonlijk, dus de homepage leest de sessie. Dat maakt
    // de pagina dynamisch: ze wordt per bezoeker gerenderd in plaats van
    // gecachet. De rest van de pagina deed al een DB-lezing per render, dus dat
    // blijft één ronde extra en geen nieuw soort werk.
    getCurrentSession(),
  ]);

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

  // Opkomende evenementen: 2 rijen van 3. Zijn er minder, dan krimpt het
  // rooster gewoon mee (zie `.ev-grid`), zonder lege plaatsen op te vullen.
  const eventCards = upcomingEvents.slice(0, 6);

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
            representatives: { orderBy: { order: "asc" }, include: { user: true } },
          },
        })
      : [];
  // Een POC zonder vertegenwoordigers levert een lege kaart op; die tonen we niet.
  const pocsWithPeople = myPocs.filter((poc) => poc.representatives.length > 0);

  const map = new Map(settings.map((s) => [s.key, s.value as unknown]));
  const cursus = map.get("home.openingHours.cursusdienst") as OpeningHoursSetting | undefined;
  const theokot = map.get("home.openingHours.theokot") as OpeningHoursSetting | undefined;
  const career = map.get("home.career") as CareerSetting | undefined;
  const defaultEventImage =
    publicUrl((map.get(DEFAULT_EVENT_IMAGE_SETTING) as { imageKey?: string | null } | undefined)?.imageKey) ??
    BUILTIN_DEFAULT_EVENT_IMAGE;

  const theoToday = theokot ? entryForDate(theokot.entries, now, locale) : undefined;
  const theoOpen = theoToday && isOpenAt(theoToday.hours, now);
  const curToday = cursus ? entryForDate(cursus.entries, now, locale) : undefined;
  const curOpen = curToday && !isClosedHours(curToday.hours) && isOpenAt(curToday.hours, now);
  // De titel is "Openingsuren Theokot"; de kaartkop en de gesloten-melding
  // gebruiken enkel de naam zelf.
  const theokotName = theokot
    ? pick(theokot.titleNl, theokot.titleEn, locale).replace(/^Openingsuren\s+/i, "")
    : "";
  const cursusName = cursus
    ? pick(cursus.titleNl, cursus.titleEn, locale).replace(/^Openingsuren\s+/i, "")
    : "";

  const eventGroups = upcomingEvents.slice(0, 5).reduce<Array<{ key: string; date: Date; events: typeof upcomingEvents }>>(
    (acc, event) => {
      const date = new Date(event.start);
      const key = dayKey(date, locale);
      const found = acc.find((g) => g.key === key);
      if (found) found.events.push(event);
      else acc.push({ key, date, events: [event] });
      return acc;
    },
    []
  );

  const aanbodTabs = tabs.filter((t) => t.slug !== "").slice(0, 6);
  const quickLinks = [
    {
      k: nl ? "Eten" : "Eat",
      v: "Theokot",
      m: theoToday && !isClosedHours(theoToday.hours) ? theoToday.hours : nl ? "Bekijk openingsuren" : "See hours",
      href: `${base}/theokot`,
    },
    {
      k: nl ? "Boeken" : "Books",
      v: nl ? "Cursusdienst" : "Course shop",
      m: curToday && !isClosedHours(curToday.hours) ? curToday.hours : nl ? "Cursussen & tweedehands" : "Courses & second-hand",
      href: `${base}/cursusdienst`,
    },
    {
      k: nl ? "Tweedehands" : "Second-hand",
      v: nl ? "Tweedehands Boeken" : "Second-hand Books",
      m: nl ? "Koop & verkoop" : "Buy & sell",
      href: "https://cudi.vtk.be/vtk/secondhand",
    },
    {
      k: nl ? "Reserveer" : "Reserve",
      v: nl ? "Tijdsloten Cudi" : "Cudi Time Slots",
      m: nl ? "Praktische tools" : "Practical tools",
      href: "https://cudi.vtk.be/vtk/account/slots",
    },
    { k: nl ? "Werk" : "Work", v: "Shiften", m: nl ? "Help mee" : "Join a shift", href: `${base}/shift` },
    { k: nl ? "Kalender" : "Calendar", v: nl ? "Kalender" : "Calendar", m: nl ? "Alle events" : "All events", href: `${base}/kalender` },
  ];

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
          bodyNl: "Ontdek pagina's, activiteiten en praktische info van deze werking.",
          bodyEn: "Discover pages, activities and practical information from this work group.",
          href: `${base}/${tab.slug}`,
          photo: publicUrl(tab.imageKey) ?? AANBOD_PHOTOS[tab.slug],
        }))
      : fallbackAanbod;

  return (
    <div className="vtk-design">
      {/* De hero-foto en scrim lopen door tot en met de quick links; de zone
          draagt de achtergrond zodat beide secties op hetzelfde donker zitten. */}
      <div className="home-dark-zone">
        <section className="home-hero">
          <div>
            <div className="eyebrow">
              <span className="dot" />
              Vlaamse Technische Kring · KU Leuven
            </div>
            <h1>
              {nl ? (
                <>
                  De thuis voor <span className="serif">ingenieurs</span>
                  <br />
                  in Leuven.
                </>
              ) : (
                <>
                  The home for <span className="serif">engineers</span>
                  <br />
                  in Leuven.
                </>
              )}
            </h1>
            <p className="hero-sub">
              {nl
                ? "Events, cursussen, career, broodjes en alles wat je dag op de campus praktischer maakt. Gerund door studenten, sinds 1920."
                : "Events, courses, careers, sandwiches and everything that makes your day on campus more practical. Run by students, since 1920."}
            </p>
            <div className="hero-cta">
              <Link href={`${base}/aanbod`} className="btn btn-primary arrow">
                {nl ? "Ontdek wat we doen" : "Discover what we do"}
              </Link>
              <Link href={`${base}/eerstejaars`} className="btn btn-ghost">
                {nl ? "Eerstejaars? Start hier" : "First-year? Start here"}
              </Link>
            </div>
            <div className="hero-meta">
              <div className="meta">
                <div className="k">{nl ? "Werkingsjaar" : "Working year"}</div>
                <div className="v">{workingYearLabel(now)}</div>
              </div>
              <div className="meta">
                <div className="k">{nl ? "Binnenkort" : "This week"}</div>
                <div className="v">
                  {upcomingEvents.length} {nl ? "events" : "events"}
                </div>
              </div>
              <div className="meta">
                <div className="k">{nl ? "Sinds" : "Since"}</div>
                <div className="v">1920</div>
              </div>
            </div>
          </div>

          <aside className="cal">
            <div className="cal-head">
              <div>
                <h3>{nl ? "Aankomende events" : "Upcoming events"}</h3>
                <div className="sub">
                  {upcomingEvents[0]
                    ? `${dayKey(new Date(upcomingEvents[0].start), locale)} → ${dayKey(new Date(upcomingEvents[Math.min(upcomingEvents.length - 1, 4)].start), locale)}`
                    : nl
                      ? "Geen geplande events"
                      : "No planned events"}
                </div>
              </div>
              <Link href={`${base}/kalender`} className="all">
                {nl ? "Volledige kalender" : "Full calendar"}
              </Link>
            </div>
            <div className="agenda">
              {eventGroups.length === 0 ? (
                <div className="day-group">
                  <div className="day-label">
                    <span className="num">—</span>
                    <span className="dow">{nl ? "Geen data" : "No data"}</span>
                  </div>
                </div>
              ) : (
                eventGroups.map((group, groupIndex) => (
                  <div className="day-group" key={group.key}>
                    <div className="day-label">
                      <span className="num">{String(group.date.getDate()).padStart(2, "0")}</span>
                      <span className="mon">{monthLabel(group.date, now, locale)}</span>
                      <span className="dow">
                        {group.date.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", { weekday: "long" })}
                      </span>
                      {group.date.toDateString() === now.toDateString() ? (
                        <span className="today">{nl ? "vandaag" : "today"}</span>
                      ) : null}
                    </div>
                    {group.events.map((event, eventIndex) => {
                      const eventDate = new Date(event.start);
                      const content = (
                        <>
                          <div className="t">{formatTime(eventDate, locale)}</div>
                          <div className="n">
                            {groupIndex === 0 && eventIndex === 0 ? <span className="pin" /> : null}
                            {pick(event.titleNl, event.titleEn, locale)}
                            <small>
                              {[event.location, pick(event.group.nameNl, event.group.nameEn, locale)]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          </div>
                          {/* Eigen klasse: de globale `.arrow` plakt er via ::after
                              een tweede pijl achter. */}
                          <span className="ev-go" aria-hidden="true">
                            →
                          </span>
                        </>
                      );
                      return (
                        <Link
                          key={event.id}
                          href={`${base}/kalender/${event.id}`}
                          className={`ev${groupIndex === 0 && eventIndex === 0 ? " featured" : ""}`}
                        >
                          {content}
                        </Link>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </aside>
        </section>

        <section className="quick">
          <div className="quick-row">
            {quickLinks.map((item) => {
              const body = (
                <>
                  <span className="k">{item.k}</span>
                  <span className="v">{item.v}</span>
                  <span className="m">{item.m}</span>
                </>
              );
              return item.href.startsWith("http") ? (
                <a key={item.k} className="ql" href={item.href}>
                  {body}
                </a>
              ) : (
                <Link key={item.k} className="ql" href={item.href}>
                  {body}
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {(theokot || cursus) && (
        <section className="hours-strip">
          <div className="sec-head">
            <h2>{nl ? "Openingsuren." : "Opening hours."}</h2>
            <div className="meta">
              {now.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB", {
                weekday: "short",
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
          <div className="hours-grid">
            {theokot ? (
              <div className="hours-col">
                <h3>{theokotName}</h3>
                <div className="sub">
                  {pick(theokot.subtitleNl, theokot.subtitleEn, locale) ||
                    (nl ? "Broodjes & warme snacks" : "Sandwiches & snacks")}
                </div>
                <div className={`status${theoOpen ? "" : " closed"}`}>
                  {theoOpen ? (nl ? "Nu open" : "Open now") : closedLabel(theokotName, nl)}
                </div>
                <dl className="hours-list">
                  {theokot.entries.map((row, i) => {
                    const todayCls = row.dayNl === dutchDayNameForDate(now) ? "today" : "";
                    return (
                      <div key={i} style={{ display: "contents" }}>
                        <dt className={todayCls}>{row.dayNl.slice(0, 2).toUpperCase()}</dt>
                        <dd className={todayCls}>{row.hours}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ) : null}
            {cursus ? (
              <div className="hours-col section-hours-bg">
                <h3>{cursusName}</h3>
                <div className="sub">
                  {pick(cursus.subtitleNl, cursus.subtitleEn, locale) ||
                    (nl ? "Cursussen & tweedehands" : "Courses & second-hand")}
                </div>
                <div className={`status${curOpen ? "" : " closed"}`}>
                  {curOpen ? (nl ? "Nu open" : "Open now") : closedLabel(cursusName, nl)}
                </div>
                <dl className="hours-list">
                  {cursus.entries.map((row, i) => {
                    const todayCls = row.dayNl === dutchDayNameForDate(now) ? "today" : "";
                    return (
                      <div key={i} style={{ display: "contents" }}>
                        <dt className={todayCls}>{row.dayNl.slice(0, 2).toUpperCase()}</dt>
                        <dd className={todayCls}>{row.hours}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ) : null}
          </div>
        </section>
      )}

      <section className="section">
        <div className="sec-head">
          <h2>{nl ? "Wat we doen." : "What we do."}</h2>
          <div className="meta">
            <Link href={`${base}/aanbod`}>{nl ? "bekijk alles" : "see all"}</Link>
          </div>
        </div>
        <div className="aanbod">
          {aanbodCards.slice(0, 6).map((card) => {
            const photo = card.photo;
            // Alle aanbod-kaarten zijn identiek: een fotokop onder navy scrim met
            // witte body. Geen enkele kaart krijgt een aparte featured-stijl.
            return (
              <Link key={card.href} href={card.href} className="acard">
                <div className="acard-body">
                  <span
                    className={`acard-media${photo ? "" : " acard-media-ph"}`}
                    aria-hidden="true"
                  >
                    {photo ? (
                      <Image
                        src={photo}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 33vw"
                      />
                    ) : null}
                  </span>
                  <div className="tag">→ {pick(card.labelNl, card.labelEn, locale)}</div>
                  <h3>{pick(card.titleNl, card.titleEn, locale)}</h3>
                  <p>{pick(card.bodyNl, card.bodyEn, locale)}</p>
                </div>
                <div className="cta">{nl ? "Ontdek" : "Explore"}</div>
              </Link>
            );
          })}
        </div>
      </section>

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

      {eventCards.length > 0 && (
        <section className="section band events-band">
          <div className="sec-head">
            <h2>{nl ? "Opkomende evenementen." : "Upcoming events."}</h2>
            <div className="meta">
              {eventCards.length} {nl ? "gepland" : "planned"} ·{" "}
              <Link href={`${base}/kalender`}>{nl ? "volledige kalender" : "full calendar"}</Link>
            </div>
          </div>
          <div className="ev-grid">
            {eventCards.map((event) => {
              const start = new Date(event.start);
              const photo = publicUrl(event.imageKey) ?? defaultEventImage;
              return (
                <Link key={event.id} href={`${base}/kalender/${event.id}`} className="evcard">
                  <span className="evcard-media" aria-hidden="true">
                    <Image
                      src={photo}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 33vw"
                    />
                  </span>
                  <div className="evcard-body">
                    <div className="evcard-when">
                      <span className="num">{String(start.getDate()).padStart(2, "0")}</span>
                      <span className="mon">
                        {start.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
                          month: "short",
                        })}
                      </span>
                      <span className="time">{event.allDay
                        ? nl ? "Hele dag" : "All day"
                        : formatTime(start, locale)}</span>
                    </div>
                    <h3>{pick(event.titleNl, event.titleEn ?? event.titleNl, locale)}</h3>
                    <p>
                      {[event.location, pick(event.group.nameNl, event.group.nameEn, locale)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="section band career-band">
        <div className="sec-head">
          <h2>
            Never too early to build <span className="accent">your career</span>
          </h2>
          <div className="meta">career.vtk.be · {nl ? "vacatures & events" : "vacancies & events"}</div>
        </div>
        <div className="career">
          <div>
            <div className="eyebrow">
              <span className="dot" />
              VTK Career
            </div>
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
              <div className="meta">
                <div className="k">{nl ? "Platform" : "Platform"}</div>
                <div className="v">career</div>
              </div>
            </div>
            <a href="https://career.vtk.be" className="btn btn-primary arrow" style={{ marginTop: 24 }}>
              {nl ? "Naar VTK Career" : "Open VTK Career"}
            </a>
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

      {pocsWithPeople.length > 0 && (
        <section className="section band poc-band">
          <div className="sec-head">
            <h2>{nl ? "Jouw richtingsvertegenwoordigers." : "Your student representatives."}</h2>
            <div className="meta">
              {nl ? "Op basis van je richtingen" : "Based on your programmes"} ·{" "}
              <Link href={`${base}/pocs`}>
                {nl ? "alle richtingsvertegenwoordigers" : "all student representatives"}
              </Link>
            </div>
          </div>
          {/* De meeste leden hebben één richting, hooguit twee: laat de kaarten
              dan de volle breedte delen in plaats van een halve pagina leeg te
              laten. Vanaf drie valt het rooster terug op vaste kolommen. */}
          <div className={`poc-grid${pocsWithPeople.length < 3 ? " poc-grid-few" : ""}`}>
            {pocsWithPeople.map((poc) => (
              <div className="poccard" key={poc.id}>
                <div className="poccard-head">
                  <h3>{pick(poc.nameNl, poc.nameEn ?? poc.nameNl, locale)}</h3>
                </div>
                <ul className="poc-people">
                  {poc.representatives.map((rep) => {
                    const avatar = publicUrl(rep.user.avatarKey);
                    const role = pick(rep.roleNl ?? "", rep.roleEn ?? rep.roleNl ?? "", locale);
                    return (
                      <li key={rep.id}>
                        <span className="poc-face">
                          {avatar ? (
                            // Avatars staan achter /api/media; die route streamt uit
                            // object storage en next/image hoeft er niet tussen.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatar} alt="" loading="lazy" />
                          ) : (
                            <span className="poc-initial" aria-hidden="true">
                              {rep.user.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </span>
                        <span className="poc-name">{rep.user.name}</span>
                        {role ? <span className="poc-role">{role}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

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
              return (
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
