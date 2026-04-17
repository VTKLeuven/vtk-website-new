import Link from "next/link";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import {
  dutchDayNameForDate,
  entryForDate,
  isClosedHours,
  isOpenAt,
  parseHoursRange,
  shortWeekdayNl,
} from "./hoursUtils";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-home.css";

type OpeningHoursSetting = {
  titleNl: string;
  titleEn: string;
  entries: Array<{ dayNl: string; dayEn: string; hours: string }>;
};

type FeaturedAlbumsSetting = { albumSlugs: string[] };

function academicYearLabel(d: Date, locale: Locale): string {
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}–${String(y + 1).slice(-2)}`;
}

export async function HomeEditorial({ locale }: { locale: Locale }) {
  const base = locale === "nl" ? "" : "/en";
  const now = new Date();

  const [settings, upcomingEvents, tabs, partners, featuredAlbums] = await Promise.all([
    prisma.setting.findMany({
      where: {
        key: {
          in: ["home.openingHours.cursusdienst", "home.openingHours.theokot", "home.featuredAlbums"],
        },
      },
    }),
    prisma.calendarEvent.findMany({
      where: { start: { gte: now }, visibility: "PUBLIC" },
      orderBy: { start: "asc" },
      take: 5,
      include: { group: true },
    }),
    prisma.headerTab.findMany({
      where: { visible: true },
      orderBy: { order: "asc" },
    }),
    prisma.partner.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      take: 12,
    }),
    (async () => {
      const raw = await prisma.setting.findUnique({ where: { key: "home.featuredAlbums" } });
      const value = (raw?.value as FeaturedAlbumsSetting | null) ?? { albumSlugs: [] };
      if (value.albumSlugs.length === 0) return [];
      return prisma.photoAlbum.findMany({
        where: { slug: { in: value.albumSlugs }, publishedAt: { not: null } },
        include: { coverPhoto: true },
      });
    })(),
  ]);

  const map = new Map(settings.map((s) => [s.key, s.value as unknown]));
  const cursus = map.get("home.openingHours.cursusdienst") as OpeningHoursSetting | undefined;
  const theokot = map.get("home.openingHours.theokot") as OpeningHoursSetting | undefined;

  const tileTabs = tabs.filter((t) => t.slug !== "").slice(0, 4);
  const next = upcomingEvents[0];
  const cover = featuredAlbums[0]?.coverPhoto;
  const coverUrl = cover ? publicUrl(cover.thumbnailKey || cover.storageKey) : null;

  const theoToday = theokot ? entryForDate(theokot.entries, now, locale) : undefined;

  const theoOpen = theoToday && isOpenAt(theoToday.hours, now);
  const curToday = cursus ? entryForDate(cursus.entries, now, locale) : undefined;
  const curOpen = curToday && !isClosedHours(curToday.hours) && isOpenAt(curToday.hours, now);

  const todayLine = now.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="vtk-design">
      <header className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <div className="hero-main">
              <div className="label">
                // 001 — {locale === "nl" ? "welkom · editie" : "welcome · edition"}{" "}
                {academicYearLabel(now, locale)}
              </div>
              <h1>
                {locale === "nl" ? (
                  <>
                    Partner
                    <br />
                    in crime
                    <br />
                    <em>sinds</em> <mark>1920.</mark>
                  </>
                ) : (
                  <>
                    Partner
                    <br />
                    in crime
                    <br />
                    <em>since</em> <mark>1920.</mark>
                  </>
                )}
              </h1>
              <p className="hero-lede">
                {locale === "nl"
                  ? "De Vlaamse Technische Kring is de studentenkring van burgerlijke ingenieurs aan de KU Leuven. Kalender, cursussen, broodjes, shiften — alles wat je dag op de groep draait, op één plek."
                  : "The Flemish Technical Circle is the student association for civil engineering students at KU Leuven. Calendar, courses, sandwiches, shifts — everything that shapes your day on campus, in one place."}
              </p>
              <div className="hero-actions">
                <Link href={`${base}/over-vtk`} className="btn btn-primary arrow">
                  {locale === "nl" ? "Wat is VTK" : "What is VTK"}
                </Link>
                <Link href={`${base}/kalender`} className="btn btn-ghost">
                  {locale === "nl" ? "Bekijk kalender" : "View calendar"}
                </Link>
              </div>
              <div className="hero-meta">
                <dl className="spec">
                  <dt>{locale === "nl" ? "FACULTEIT" : "FACULTY"}</dt>
                  <dd>{locale === "nl" ? "Ingenieurswetenschappen" : "Engineering Science"}</dd>
                  <dt>{locale === "nl" ? "CAMPUS" : "CAMPUS"}</dt>
                  <dd>Arenberg · Heverlee</dd>
                  <dt>VTK</dt>
                  <dd>vtk.be</dd>
                  <dt>{locale === "nl" ? "KALENDER" : "CALENDAR"}</dt>
                  <dd>
                    <Link href={`${base}/kalender`}>{locale === "nl" ? "live" : "live"}</Link>
                  </dd>
                </dl>
              </div>
              <div className="hero-photo-bleed ph">
                <div className="ph-label">PHOTO · arenberg</div>
              </div>
            </div>

            <aside className="hero-side">
              <div className="next-event">
                <h3>// 002 — {locale === "nl" ? "eerstvolgend" : "next up"}</h3>
                {next ? (
                  <>
                    <div className="next-event-date">
                      <b>{String(new Date(next.start).getDate()).padStart(2, "0")}</b>
                      <span>
                        {new Date(next.start)
                          .toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
                            month: "short",
                          })
                          .toUpperCase()}{" "}
                        ·{" "}
                        {new Date(next.start).toLocaleTimeString(locale === "nl" ? "nl-BE" : "en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <h2>{pick(next.titleNl, next.titleEn, locale)}</h2>
                    <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
                      {[next.location, pick(next.group.nameNl, next.group.nameEn, locale)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {next.url ? (
                      <a href={next.url} className="btn btn-accent arrow" style={{ marginTop: 20 }}>
                        {locale === "nl" ? "Meer info" : "Details"}
                      </a>
                    ) : (
                      <Link href={`${base}/kalender`} className="btn btn-accent arrow" style={{ marginTop: 20 }}>
                        {locale === "nl" ? "Kalender" : "Calendar"}
                      </Link>
                    )}
                  </>
                ) : (
                  <>
                    <div className="next-event-date">
                      <b>—</b>
                      <span>{locale === "nl" ? "GEEN DATA" : "NO DATA"}</span>
                    </div>
                    <h2>{locale === "nl" ? "Nog geen events" : "No upcoming events"}</h2>
                    <Link href={`${base}/kalender`} className="btn btn-accent arrow" style={{ marginTop: 20 }}>
                      {locale === "nl" ? "Kalender" : "Calendar"}
                    </Link>
                  </>
                )}
              </div>
              <div className="hero-photo ph" style={{ minHeight: 280 }}>
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div className="ph-label">PHOTO · VTK</div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </header>

      <div className="marquee">
        <div className="marquee-track">
          <span>Vlaamse Technische Kring</span>
          <span className="star">✦</span>
          <span>Partner in crime since 1920</span>
          <span className="star">✦</span>
          <span>Ingenieurswetenschappen · KU Leuven</span>
          <span className="star">✦</span>
          <span>Vlaamse Technische Kring</span>
          <span className="star">✦</span>
          <span>Partner in crime since 1920</span>
          <span className="star">✦</span>
          <span>Ingenieurswetenschappen · KU Leuven</span>
          <span className="star">✦</span>
        </div>
      </div>

      <section className="block">
        <div className="block-head">
          <div className="block-num">003 — {locale === "nl" ? "kalender" : "calendar"}</div>
          <h2>
            {locale === "nl" ? (
              <>
                Binnenkort
                <br />
                op het programma.
              </>
            ) : (
              <>
                Coming up
                <br />
                on the programme.
              </>
            )}
          </h2>
        </div>

        <div className="events-list">
          {upcomingEvents.length === 0 ? (
            <p style={{ padding: "32px 0", color: "var(--muted)" }}>
              {locale === "nl" ? "Geen geplande evenementen." : "No upcoming events."}
            </p>
          ) : (
            upcomingEvents.map((e) => {
              const d = new Date(e.start);
              const inner = (
                <>
                  <div className="event-date">
                    <b>{String(d.getDate()).padStart(2, "0")}</b>
                    {d
                      .toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
                        month: "short",
                      })
                      .toUpperCase()}{" "}
                    · {shortWeekdayNl(d).toLowerCase()}
                  </div>
                  <div className="event-title">{pick(e.titleNl, e.titleEn, locale)}</div>
                  <div className="event-desc">
                    {[e.location, pick(e.group.nameNl, e.group.nameEn, locale)].filter(Boolean).join(" · ")}
                  </div>
                  <div className="event-tag">{e.group.code}</div>
                  <div className="event-go">→</div>
                </>
              );
              return e.url ? (
                <a key={e.id} href={e.url} className="event-row">
                  {inner}
                </a>
              ) : (
                <Link key={e.id} href={`${base}/kalender`} className="event-row">
                  {inner}
                </Link>
              );
            })
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 32 }}>
          <Link href={`${base}/kalender`} className="btn btn-ghost arrow">
            {locale === "nl" ? "Volledige kalender" : "Full calendar"}
          </Link>
        </div>
      </section>

      <section className="hours-strip">
        <div style={{ maxWidth: "var(--max)", margin: "0 auto", padding: "32px 32px 0" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              borderBottom: "1px solid oklch(0.28 0.04 260)",
              paddingBottom: 24,
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "oklch(0.6 0.02 260)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                004 — {locale === "nl" ? "openingsuren" : "opening hours"}
              </div>
              <h2
                style={{
                  color: "var(--paper)",
                  fontSize: "clamp(36px, 6vw, 56px)",
                  letterSpacing: "-0.03em",
                  marginTop: 8,
                  fontWeight: 500,
                  lineHeight: 1,
                }}
              >
                {locale === "nl" ? "Live aanbod." : "Live services."}
              </h2>
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "oklch(0.6 0.02 260)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                textAlign: "right",
              }}
            >
              {locale === "nl" ? "NU" : "NOW"}
              <br />
              <span style={{ color: "var(--accent)", fontSize: 14 }}>{todayLine}</span>
            </div>
          </div>
        </div>
        <div className="hours-grid" style={{ paddingTop: 32 }}>
          {theokot ? (
            <div className="hours-col">
              <h3>{pick(theokot.titleNl, theokot.titleEn, locale).replace(/^Openingsuren\s+/i, "")}</h3>
              <div className="sub">{locale === "nl" ? "Broodjes & warme snacks" : "Sandwiches & snacks"}</div>
              <div className={`status${theoOpen ? "" : " closed"}`}>
                {theoOpen
                  ? locale === "nl"
                    ? "Nu open"
                    : "Open now"
                  : locale === "nl"
                    ? "Gesloten / buiten uren"
                    : "Closed / outside hours"}
              </div>
              <dl className="hours-list">
                {theokot.entries.map((row, i) => {
                  const isToday = row.dayNl === dutchDayNameForDate(now);
                  const todayCls = isToday ? " today" : "";
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
              <div className="sub">{locale === "nl" ? "Cursussen & tweedehands" : "Courses & second-hand"}</div>
              <div className={`status${curOpen ? "" : " closed"}`}>
                {curOpen
                  ? locale === "nl"
                    ? "Nu open"
                    : "Open now"
                  : locale === "nl"
                    ? "Gesloten / buiten uren"
                    : "Closed / outside hours"}
              </div>
              <dl className="hours-list">
                {cursus.entries.map((row, i) => {
                  const isToday = row.dayNl === dutchDayNameForDate(now);
                  const todayCls = isToday ? " today" : "";
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
          <div className="hours-col">
            <h3>{locale === "nl" ? "Shiftenbureau" : "Shift desk"}</h3>
            <div className="sub">{locale === "nl" ? "Inschrijven & tijdsloten" : "Sign-ups & time slots"}</div>
            <div className="status closed">
              {locale === "nl" ? "Online · 24/7" : "Online · 24/7"}
            </div>
            <dl className="hours-list">
              <dt>WWW</dt>
              <dd>shiften.vtk.be</dd>
              <dt>{locale === "nl" ? "INFO" : "INFO"}</dt>
              <dd>{locale === "nl" ? "via VTK-site" : "via VTK site"}</dd>
            </dl>
            <span className="btn btn-accent arrow" style={{ marginTop: 24, opacity: 0.5, pointerEvents: "none" }}>
              {locale === "nl" ? "Plan een slot" : "Book a slot"}
            </span>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: "var(--max)", margin: "0 auto", padding: 0, borderBottom: "1px solid var(--rule)" }}>
        <div className="tiles">
          {tileTabs.map((tab, i) => (
            <Link key={tab.id} href={`${base}/${tab.slug}`} className="tile">
              <div className="tile-num">→ {String(5 + i).padStart(3, "0")}</div>
              <h3>{pick(tab.labelNl, tab.labelEn, locale)}</h3>
              <p>{locale === "nl" ? "Ontdek pagina's en activiteiten." : "Discover pages and activities."}</p>
              <div className="tile-arrow">↗</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="block">
        <div className="block-head">
          <div className="block-num">009 — {locale === "nl" ? "over" : "about"}</div>
          <h2>
            {locale === "nl" ? (
              <>
                Geen gewone
                <br />
                studentenkring.
              </>
            ) : (
              <>
                Not your average
                <br />
                student society.
              </>
            )}
          </h2>
        </div>
        <div className="manifesto">
          <div className="manifesto-text">
            <p>
              <em>{locale === "nl" ? "Sinds 1920, één doel:" : "Since 1920, one goal:"}</em>{" "}
              {locale === "nl"
                ? "het leven van de ingenieursstudent in Leuven wat draaglijker maken."
                : "making life for engineering students in Leuven a little easier."}
            </p>
            <p>
              {locale === "nl"
                ? "We draaien een broodjesbar, een cursusdienst, activiteiten en career-events. Grotendeels vrijwillig. Altijd voor de studenten."
                : "We run a sandwich bar, a course shop, activities and career events — mostly volunteer-run, always for students."}
            </p>
            <p>
              {locale === "nl"
                ? "Geen fancy missie-statements. Gewoon: als er iets geregeld moet worden, dan doen wij dat mee."
                : "No fancy mission statements — if something needs organising, we help make it happen."}
            </p>
          </div>
          <div className="manifesto-stats">
            <div className="stat">
              <div className="stat-val">
                105<span className="acc">.</span>
              </div>
              <div className="stat-lbl">{locale === "nl" ? "jaargangen sinds oprichting" : "years since founding"}</div>
            </div>
            <div className="stat">
              <div className="stat-val">
                3 200<span className="acc">+</span>
              </div>
              <div className="stat-lbl">{locale === "nl" ? "studenten op de campus" : "students on campus"}</div>
            </div>
            <div className="stat">
              <div className="stat-val">
                16<span className="acc"></span>
              </div>
              <div className="stat-lbl">{locale === "nl" ? "werkgroepen" : "work groups"}</div>
            </div>
            <div className="stat">
              <div className="stat-val">
                1<span className="acc">×</span>
              </div>
              <div className="stat-lbl">vtk.be</div>
            </div>
          </div>
        </div>
      </section>

      <section className="partners">
        <div className="partners-head">
          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              // 010 — {locale === "nl" ? "mede mogelijk gemaakt door" : "with support from"}
            </div>
            <h3>{locale === "nl" ? "Hoofdpartners" : "Main partners"}</h3>
          </div>
          <Link href={`${base}/contact`} className="btn btn-ghost arrow">
            {locale === "nl" ? "Contact" : "Contact"}
          </Link>
        </div>
        <div className="partners-grid">
          {partners.length === 0 ? (
            <div className="partner" style={{ gridColumn: "1 / -1" }}>
              {locale === "nl" ? "Nog geen partners" : "No partners yet"}
            </div>
          ) : (
            partners.map((p) => {
              const url = publicUrl(p.logoKey);
              return (
                <div key={p.id} className="partner">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={p.name} />
                  ) : (
                    p.name
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
