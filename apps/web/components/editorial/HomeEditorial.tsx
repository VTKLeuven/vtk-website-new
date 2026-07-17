import Image from "next/image";
import Link from "next/link";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { getVisibleHeaderTabsForNav } from "@/lib/headerTabs";
import { publicUrl } from "@/lib/storage";
import { PartnerLogo } from "@/components/site/PartnerLogo";
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

/**
 * Fallback-foto per werking op de aanbod-kaarten (fotografie-richting).
 * Beheerders uploaden per tab een eigen foto via /admin/inhoud
 * (HeaderTab.imageKey); deze statische set geldt enkel zolang een tab er geen
 * heeft. Slugs zonder foto vallen terug op het gestreepte placeholder-patroon.
 */
const AANBOD_PHOTOS: Record<string, string> = {
  theokot: "/aanbod/theokot.jpg",
  cursusdienst: "/aanbod/cursusdienst.jpg",
  onderwijs: "/aanbod/onderwijs.jpg",
  sport: "/aanbod/sport.jpg",
  internationaal: "/aanbod/internationaal.jpg",
  career: "/career-fair.jpg",
  skireis: "/aanbod/skireis.jpg",
  activiteiten: "/aanbod/skireis.jpg",
};

function academicYearLabel(d: Date): string {
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String(y + 1).slice(-2)}`;
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

  const [settings, upcomingEvents, tabs, partners] = await Promise.all([
    prisma.setting.findMany({
      where: {
        key: {
          in: [
            "home.openingHours.cursusdienst",
            "home.openingHours.theokot",
            "home.featuredAlbums",
            "home.career",
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
  ]);

  const map = new Map(settings.map((s) => [s.key, s.value as unknown]));
  const cursus = map.get("home.openingHours.cursusdienst") as OpeningHoursSetting | undefined;
  const theokot = map.get("home.openingHours.theokot") as OpeningHoursSetting | undefined;
  const career = map.get("home.career") as CareerSetting | undefined;

  const theoToday = theokot ? entryForDate(theokot.entries, now, locale) : undefined;
  const theoOpen = theoToday && isOpenAt(theoToday.hours, now);
  const curToday = cursus ? entryForDate(cursus.entries, now, locale) : undefined;
  const curOpen = curToday && !isClosedHours(curToday.hours) && isOpenAt(curToday.hours, now);

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
              <Link href={`${base}/over-vtk`} className="btn btn-primary arrow">
                {nl ? "Word lid" : "Become a member"}
              </Link>
              <Link href={`${base}/eerstejaars`} className="btn btn-ghost">
                {nl ? "Eerstejaars? Start hier" : "First-year? Start here"}
              </Link>
            </div>
            <div className="hero-meta">
              <div className="meta">
                <div className="k">{nl ? "Editie" : "Edition"}</div>
                <div className="v">{academicYearLabel(now)}</div>
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
                          <span className="arrow">→</span>
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
                <h3>{pick(theokot.titleNl, theokot.titleEn, locale).replace(/^Openingsuren\s+/i, "")}</h3>
                <div className="sub">{nl ? "Broodjes & warme snacks" : "Sandwiches & snacks"}</div>
                <div className={`status${theoOpen ? "" : " closed"}`}>
                  {theoOpen ? (nl ? "Nu open" : "Open now") : nl ? "Gesloten / buiten uren" : "Closed / outside hours"}
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
                <h3>{pick(cursus.titleNl, cursus.titleEn, locale).replace(/^Openingsuren\s+/i, "")}</h3>
                <div className="sub">{nl ? "Cursussen & tweedehands" : "Courses & second-hand"}</div>
                <div className={`status${curOpen ? "" : " closed"}`}>
                  {curOpen ? (nl ? "Nu open" : "Open now") : nl ? "Gesloten / buiten uren" : "Closed / outside hours"}
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
            {nl ? "Werkgroepen en diensten" : "Work groups and services"} ·{" "}
            <Link href={`${base}/info`}>{nl ? "bekijk alles" : "see all"}</Link>
          </div>
        </div>
        <div className="aanbod">
          {aanbodCards.slice(0, 6).map((card, index) => {
            const feat = index === 0;
            const photo = card.photo;
            // De featured kaart wordt een mini-hero met de foto als volledige
            // achtergrond; gewone kaarten krijgen een fotokop onder navy scrim.
            const photoCard = feat && Boolean(photo);
            return (
              <Link
                key={card.href}
                href={card.href}
                className={`acard${feat ? " feat" : ""}${photoCard ? " acard-photo" : ""}`}
              >
                {photoCard && photo ? (
                  <span className="acard-bg" aria-hidden="true">
                    <Image
                      src={photo}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 33vw"
                    />
                  </span>
                ) : null}
                <div className="acard-body">
                  {photoCard ? null : (
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
                  )}
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

      <section className="section career-band">
        <div className="sec-head">
          <h2>Never too early to build your career</h2>
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

      <section className="partners">
        <div className="partners-head">
          <div>
            <div className="eyebrow">
              <span className="dot" />
              {nl ? "Mede mogelijk gemaakt door" : "With support from"}
            </div>
            <h3>{nl ? "Hoofdpartners" : "Main partners"}</h3>
          </div>
          <Link href={`${base}/contact`} className="btn btn-ghost arrow">
            Contact
          </Link>
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
