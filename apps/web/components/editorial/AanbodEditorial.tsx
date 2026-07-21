import Link from "next/link";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { getCursusdienstHours } from "@/lib/cursusdienstHours";
import {
  DUTCH_FULL_DAYS,
  barPercentForHours,
  dutchDayNameForDate,
  entryForDate,
  findEntryForFullDay,
  isClosedHours,
  isOpenAt,
  shortWeekdayNl,
} from "./hoursUtils";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-aanbod.css";

type OpeningHoursSetting = {
  titleNl: string;
  titleEn: string;
  entries: Array<{ dayNl: string; dayEn: string; hours: string }>;
};

function HoursViz({
  entries,
  now,
  locale,
}: {
  entries: OpeningHoursSetting["entries"];
  now: Date;
  locale: Locale;
}) {
  const todayNl = dutchDayNameForDate(now);
  return (
    <div className="hours-viz">
      {DUTCH_FULL_DAYS.map((full, dayIndex) => {
        const row = findEntryForFullDay(entries, full);
        const hours =
          row?.hours ?? (locale === "nl" ? "Gesloten" : "Closed");
        const closed = isClosedHours(hours);
        const pct = barPercentForHours(hours);
        const isToday = full === todayNl;
        const abb = shortWeekdayNl(new Date(2020, 0, 6 + dayIndex));
        return (
          <div key={full} style={{ display: "contents" }}>
            <div className={`day-lbl${isToday ? " today" : ""}`}>{abb}</div>
            <div className={`bar-track${closed ? " closed" : ""}${isToday ? " today-row" : ""}`}>
              {!closed && pct ? (
                <div className="bar" style={{ left: pct.left, width: pct.width }}>
                  {hours.replace(/\s*[\u2013\u2014–-]\s*/, " → ")}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export async function AanbodEditorial({ locale }: { locale: Locale }) {
  const base = locale === "nl" ? "" : "/en";
  const now = new Date();

  const [settings, cursusEntries] = await Promise.all([
    prisma.setting.findMany({
      where: { key: { in: ["home.openingHours.theokot"] } },
    }),
    // Cursusdienst-uren komen live van cudi.vtk.be, met terugval op de laatst
    // gecachte waarde en anders null (dan tonen we "niet beschikbaar").
    getCursusdienstHours(locale),
  ]);
  const map = new Map(settings.map((s) => [s.key, s.value as unknown]));
  const theokot = map.get("home.openingHours.theokot") as OpeningHoursSetting | undefined;

  const theoToday = theokot ? entryForDate(theokot.entries, now, locale) : undefined;
  const curToday = cursusEntries ? entryForDate(cursusEntries, now, locale) : undefined;
  const theoOpen = theoToday && !isClosedHours(theoToday.hours) && isOpenAt(theoToday.hours, now);
  const curOpen = curToday && !isClosedHours(curToday.hours) && isOpenAt(curToday.hours, now);

  const todayLine = now.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const theoTitle = theokot ? pick(theokot.titleNl, theokot.titleEn, locale).replace(/^Openingsuren\s+/i, "") : "Theokot";
  const curTitle = "Cursusdienst";

  return (
    <div className="vtk-design">
      <header className="page-head">
        <div>
          <div className="crumbs">
            {locale === "nl" ? "Home" : "Home"} ·{" "}
            <span style={{ color: "var(--ink)" }}>
              {locale === "nl" ? "Aanbod · Openingsuren" : "Services · Hours"}
            </span>
          </div>
          <h1>
            {locale === "nl" ? (
              <>
                Aanbod.
                <br />
                <em>Wanneer wat open is.</em>
              </>
            ) : (
              <>
                Services.
                <br />
                <em>When things are open.</em>
              </>
            )}
          </h1>
        </div>
        <div className="page-head-meta">
          {locale === "nl" ? "Diensten" : "Services"}
          <br />
          <b>Theokot · Cursusdienst · Shiften</b>
          <br />
          <br />
          {locale === "nl" ? "Locatie" : "Location"}
          <br />
          <b>Campus Arenberg · Heverlee</b>
          <br />
          <br />
          {locale === "nl" ? "Live status" : "Live status"}
          <br />
          <b>{locale === "nl" ? "per pageload" : "each page load"}</b>
        </div>
      </header>

      <main className="aanbod-wrap">
        <section className="live-ribbon">
          <div className="now-label">
            {locale === "nl" ? "Vandaag" : "Today"}
            <br />
            <b>{todayLine}</b>
          </div>
          <div className="summary">
            {theokot ? (
              <>
                <b>{theoTitle}</b>{" "}
                {theoOpen ? (
                  <span className="op">{locale === "nl" ? "nu open" : "open now"}</span>
                ) : (
                  <span className="cl">{locale === "nl" ? "gesloten of buiten uur" : "closed or outside hours"}</span>
                )}
                {theoToday && !isClosedHours(theoToday.hours) ? ` · ${theoToday.hours}` : ""}
                {" · "}
              </>
            ) : null}
            <b>{curTitle}</b>{" "}
            {cursusEntries ? (
              <>
                {curOpen ? (
                  <span className="op">{locale === "nl" ? "nu open" : "open now"}</span>
                ) : (
                  <span className="cl">{locale === "nl" ? "gesloten of buiten uur" : "closed or outside hours"}</span>
                )}
                {curToday && !isClosedHours(curToday.hours) ? ` · ${curToday.hours}` : ""}
              </>
            ) : (
              <span className="cl">{locale === "nl" ? "uren niet beschikbaar" : "hours unavailable"}</span>
            )}
            {" · "}
            <b>Shiften</b>{" "}
            <span className="cl">{locale === "nl" ? "online via shiften.vtk.be" : "online at shiften.vtk.be"}</span>.
          </div>
          <Link href={`${base}/info`} className="btn btn-accent arrow" style={{ borderColor: "var(--accent)" }}>
            {locale === "nl" ? "Alle diensten" : "All services"}
          </Link>
        </section>

        <section className="services">
          {theokot ? (
            <article className="svc feat">
              <div className="svc-head">
                <div>
                  <div className="svc-num">{"// 001 · Theokot"}</div>
                  <h2>Theokot</h2>
                  <div className="tagline">{locale === "nl" ? "broodjes · koffie · warme snacks" : "sandwiches · coffee · snacks"}</div>
                </div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    textAlign: "right",
                    color: "oklch(0.4 0.15 80)",
                  }}
                >
                  VTK
                  <br />
                  <b style={{ color: "var(--ink)", fontFamily: "var(--sans)", fontSize: 24, letterSpacing: "-0.02em", fontWeight: 500 }}>
                    {new Date().getFullYear()}
                  </b>
                </div>
              </div>
              <div className="svc-status">
                <span className={`state${theoOpen ? " open" : " closed"}`}>
                  {theoOpen
                    ? locale === "nl"
                      ? "Nu open"
                      : "Open now"
                    : locale === "nl"
                      ? "Gesloten / buiten uren"
                      : "Closed / outside hours"}
                </span>
                <span className="change">{locale === "nl" ? "Zie weekschema" : "See weekly schedule"}</span>
              </div>
              <HoursViz entries={theokot.entries} now={now} locale={locale} />
              <dl className="svc-meta">
                <dt>{locale === "nl" ? "LOCATIE" : "LOCATION"}</dt>
                <dd>Dozaal</dd>
                <dt>{locale === "nl" ? "CONTACT" : "CONTACT"}</dt>
                <dd>theokot@vtk.be</dd>
              </dl>
              <div className="svc-actions">
                <span className="btn btn-primary arrow" style={{ opacity: 0.55, pointerEvents: "none" }}>
                  {locale === "nl" ? "Menu vandaag" : "Today's menu"}
                </span>
                <span className="btn btn-ghost arrow" style={{ opacity: 0.55, pointerEvents: "none" }}>
                  {locale === "nl" ? "Broodje bestellen" : "Order sandwich"}
                </span>
              </div>
            </article>
          ) : null}

          <article className="svc">
            <div className="svc-head">
              <div>
                <div className="svc-num">{"// 002 · Cursusdienst"}</div>
                <h2>Cursusdienst</h2>
                <div className="tagline">{locale === "nl" ? "syllabi · boeken · tweedehands" : "syllabi · books · second-hand"}</div>
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  textAlign: "right",
                  color: "var(--muted)",
                }}
              >
                KU Leuven
                <br />
                <b style={{ color: "var(--ink)", fontFamily: "var(--sans)", fontSize: 24, letterSpacing: "-0.02em", fontWeight: 500 }}>
                  VTK
                </b>
              </div>
            </div>
            <div className="svc-status">
              <span className={`state${cursusEntries && curOpen ? " open" : " closed"}`}>
                {!cursusEntries
                  ? locale === "nl"
                    ? "Uren niet beschikbaar"
                    : "Hours unavailable"
                  : curOpen
                    ? locale === "nl"
                      ? "Nu open"
                      : "Open now"
                    : locale === "nl"
                      ? "Gesloten / buiten uren"
                      : "Closed / outside hours"}
              </span>
              <span className="change">{locale === "nl" ? "Cursussen & verkoop" : "Courses & sales"}</span>
            </div>
            {cursusEntries ? (
              <HoursViz entries={cursusEntries} now={now} locale={locale} />
            ) : (
              <p style={{ margin: "24px 0", color: "var(--muted)" }}>
                {locale === "nl"
                  ? "De cursusdienst openingsuren zijn momenteel niet beschikbaar."
                  : "The course shop opening hours are currently unavailable."}
              </p>
            )}
            <dl className="svc-meta">
              <dt>{locale === "nl" ? "LOCATIE" : "LOCATION"}</dt>
              <dd>Dozaal · −1</dd>
              <dt>{locale === "nl" ? "WEB" : "WEB"}</dt>
              <dd>vtk.be</dd>
            </dl>
            <div className="svc-actions">
              <Link href={`${base}/cursusdienst`} className="btn btn-primary arrow">
                {locale === "nl" ? "Naar Cursusdienst" : "Course shop"}
              </Link>
              <span className="btn btn-ghost arrow" style={{ opacity: 0.55, pointerEvents: "none" }}>
                {locale === "nl" ? "Tweedehands" : "Second-hand"}
              </span>
            </div>
          </article>

          <article className="svc">
            <div className="svc-head">
              <div>
                <div className="svc-num">{"// 003 · Shiften"}</div>
                <h2>{locale === "nl" ? "Shiftenbureau" : "Shift desk"}</h2>
                <div className="tagline">{locale === "nl" ? "inschrijven · tijdsloten · events" : "sign-ups · slots · events"}</div>
              </div>
            </div>
            <div className="svc-status">
              <span className="state closed">{locale === "nl" ? "Online platform" : "Online platform"}</span>
              <span className="change">shiften.vtk.be</span>
            </div>
            <div style={{ margin: "24px 0", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div style={{ padding: 20, background: "var(--paper-2)", border: "1px solid var(--rule)" }}>
                <div style={{ fontSize: 36, letterSpacing: "-0.03em", fontWeight: 500 }}>—</div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    marginTop: 4,
                  }}
                >
                  slots
                </div>
              </div>
              <div style={{ padding: 20, background: "var(--paper-2)", border: "1px solid var(--rule)" }}>
                <div style={{ fontSize: 36, letterSpacing: "-0.03em", fontWeight: 500 }}>—</div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    marginTop: 4,
                  }}
                >
                  waitlist
                </div>
              </div>
              <div style={{ padding: 20, background: "var(--ink)", color: "var(--accent)", border: "1px solid var(--ink)" }}>
                <div style={{ fontSize: 36, letterSpacing: "-0.03em", fontWeight: 500 }}>VTK</div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "oklch(0.7 0.02 260)",
                    marginTop: 4,
                  }}
                >
                  events
                </div>
              </div>
            </div>
            <dl className="svc-meta">
              <dt>PLATFORM</dt>
              <dd>shiften.vtk.be</dd>
              <dt>EMAIL</dt>
              <dd>shiften@vtk.be</dd>
            </dl>
            <div className="svc-actions">
              <span className="btn btn-primary arrow" style={{ opacity: 0.55, pointerEvents: "none" }}>
                {locale === "nl" ? "Plan een slot" : "Book a slot"}
              </span>
            </div>
          </article>

          <article className="svc">
            <div className="svc-head">
              <div>
                <div className="svc-num">{"// 004 · Tweedehands"}</div>
                <h2>Tweedehands</h2>
                <div className="tagline">{locale === "nl" ? "boeken · markt · ruilbeurs" : "books · market · exchange"}</div>
              </div>
            </div>
            <div className="svc-status">
              <span className="state open">{locale === "nl" ? "Volgt Cursusdienst" : "Follows course shop"}</span>
              <span className="change">{locale === "nl" ? "Zelfde openingsuren" : "Same opening hours"}</span>
            </div>
            {cursusEntries ? <HoursViz entries={cursusEntries} now={now} locale={locale} /> : null}
            <dl className="svc-meta">
              <dt>{locale === "nl" ? "LOCATIE" : "LOCATION"}</dt>
              <dd>Dozaal · −1</dd>
              <dt>{locale === "nl" ? "INFO" : "INFO"}</dt>
              <dd>cursusdienst@vtk.be</dd>
            </dl>
            <div className="svc-actions">
              <Link href={`${base}/cursusdienst`} className="btn btn-primary arrow">
                {locale === "nl" ? "Naar Cursusdienst" : "Course shop"}
              </Link>
            </div>
          </article>
        </section>

        <section className="menu-strip">
          <div className="menu-strip-head">
            <div>
              <div className="label" style={{ marginBottom: 8 }}>
                {"// 005 — "}
                {locale === "nl" ? "menu · theokot (voorbeeld)" : "menu · theokot (sample)"}
              </div>
              <h3>{locale === "nl" ? "Broodjes" : "Sandwiches"}</h3>
            </div>
            <div className="sub">{locale === "nl" ? "Voorbeelddata" : "Sample data"}</div>
          </div>
          <div className="menu-grid">
            {(
              locale === "nl"
                ? [
                    ["01", "Martino", "Filet américain · sla · ui", "€4,20", "28"],
                    ["02", "Kip curry", "Kip · curry · sla", "€4,50", "12"],
                    ["03", "Gerookte zalm", "Zalm · roomkaas", "€5,20", "0"],
                    ["04", "Mozzarella", "Mozz · pesto · rucola", "€4,50", "18"],
                  ]
                : [
                    ["01", "Martino", "Beef tartare · veg · onion", "€4.20", "28"],
                    ["02", "Chicken curry", "Chicken · curry · lettuce", "€4.50", "12"],
                    ["03", "Smoked salmon", "Salmon · cream cheese", "€5.20", "0"],
                    ["04", "Mozzarella", "Mozz · pesto · rocket", "€4.50", "18"],
                  ]
            ).map(([nr, title, ingr, price, stock]) => (
              <div key={nr} className={`menu-item${stock === "0" ? " sold-out" : ""}`}>
                <div className="nr">{nr}</div>
                <h4>{title}</h4>
                <div className="ingr">{ingr}</div>
                <div className="price">
                  <span>{price}</span>
                  <b>
                    {stock} {locale === "nl" ? "over" : "left"}
                  </b>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="locations">
          <div className="locations-side">
            <div className="label" style={{ marginBottom: 12 }}>
              {"// 006 — "}
              {locale === "nl" ? "locatie" : "location"}
            </div>
            <h3>
              {locale === "nl" ? (
                <>
                  Campus
                  <br />
                  Arenberg.
                </>
              ) : (
                <>
                  Arenberg
                  <br />
                  campus.
                </>
              )}
            </h3>
            <div className="sub">Dozaal · Kasteelpark 1 · 3001 Heverlee</div>
            <p>
              {locale === "nl"
                ? "Alle fysieke diensten van VTK zitten in de Dozaal op campus Arenberg, vlakbij de faculteit Ingenieurswetenschappen."
                : "All VTK services on campus are in the Dozaal on Arenberg, next to the Faculty of Engineering Science."}
            </p>
            <p>
              {locale === "nl"
                ? "Buiten openingsuren verloopt veel online via vtk.be en de gekoppelde platforms."
                : "Outside opening hours, most workflows continue online via vtk.be and linked platforms."}
            </p>
            <dl className="spec" style={{ marginTop: 24 }}>
              <dt>TRAM</dt>
              <dd>Lijn 2 · Kasteelpark</dd>
              <dt>BIKE</dt>
              <dd>{locale === "nl" ? "Overdekte stalling" : "Covered parking"}</dd>
            </dl>
          </div>
          <div className="map-ph">
            <span className="pin-lbl">VTK · Dozaal</span>
            <span className="coords">50.861° N · 4.685° E · Heverlee</span>
          </div>
        </section>
      </main>
    </div>
  );
}
