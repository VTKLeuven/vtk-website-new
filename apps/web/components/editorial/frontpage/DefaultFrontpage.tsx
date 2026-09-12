import Link from "next/link";
import { pick } from "@vtk/i18n";
import { choiceValue, pickField, rangeValue } from "@/lib/frontpage/fields";
import {
  DEFAULT_FRONTPAGE_ID,
  HOME_AGENDA_DIM_DEFAULT,
  HOME_AGENDA_WEEK,
  getFrontpageModule,
} from "@/lib/frontpage/registry";
import { HERO_WEEK_NEXT_LIMIT_DEFAULT } from "@/lib/calendar/heroWeek";
import { organiserName } from "@/lib/calendar/organiser";
import { heroShiftRowCount, pickHeroShifts } from "@/lib/frontpage/heroShifts";
import { HeroWeek } from "./HeroWeek";
import { HeroSlogan } from "./HeroSlogan";
import { HeroShifts } from "./HeroShifts";
import { Cta, ctaFrom, type FrontpageProps } from "./context";

/**
 * The regular front page: copy on the left, the agenda on the right.
 *
 * Welke agenda dat is, kiest een redacteur in /admin/frontpage: het
 * weekoverzicht (de komende zes dagen, met een ster per evenement) of de oude
 * lijst met de vier eerstvolgende events. Beide blijven bestaan omdat een
 * weekoverzicht in een rustige periode leger oogt dan een lijst, en omdat een
 * nieuwe hero die je niet kan terugzetten geen keuze is.
 *
 * Every text is a field with the wording we have always shipped as its fallback,
 * so an untouched database looks exactly like before and an admin can still
 * rewrite the headline without a deploy.
 *
 * De titel is geen veld maar een lijst slogans uit /admin/slogans, opgelost in
 * `HomeEditorial` en hier enkel nog getoond. Zie lib/slogans.ts voor de regel
 * waarmee de begroeting van een lid de reeks opent.
 */
export function DefaultFrontpage({
  values,
  locale,
  base,
  now,
  upcomingEvents,
  weekEvents,
  signedIn,
  openShifts,
  slogans,
}: FrontpageProps) {
  const nl = locale === "nl";
  // De registry is de bron van de opties; zo blijft "wat staat er als er nog
  // niets gekozen is" op één plaats staan.
  const fields = getFrontpageModule(DEFAULT_FRONTPAGE_ID)?.fields;
  const agendaField = fields?.agenda;
  const agenda = agendaField ? choiceValue(values, "agenda", agendaField) : HOME_AGENDA_WEEK;
  const dimField = fields?.agendaDim;
  const agendaDim = dimField
    ? rangeValue(values, "agendaDim", dimField)
    : HOME_AGENDA_DIM_DEFAULT;
  const nextEventsLimitField = fields?.nextEventsLimit;
  const nextEventsLimit = nextEventsLimitField
    ? rangeValue(values, "nextEventsLimit", nextEventsLimitField)
    : HERO_WEEK_NEXT_LIMIT_DEFAULT;

  const eyebrow = pickField(values, "eyebrow", locale) ?? "Vlaamse Technische Kring · KU Leuven";
  const subtitle =
    pickField(values, "subtitle", locale) ??
    (nl
      ? "Events, cursussen, career, broodjes en alles wat je dag op de campus praktischer maakt. Gerund door studenten, sinds 1920."
      : "Events, courses, careers, sandwiches and everything that makes your day on campus more practical. Run by students, since 1920.");

  const primary =
    ctaFrom(
      pickField(values, "primaryLabel", locale) ?? (nl ? "Ontdek wat we doen" : "Discover what we do"),
      values.primaryUrl ?? "/info",
      base,
    );
  // De tweede knop wijst elke taal naar haar eigen publiek: een Nederlandstalige
  // bezoeker is hier een eerstejaars, wie de site op Engels leest een
  // uitwisselingsstudent. Daarom heeft ze per taal een eigen adres in
  // /admin/frontpage, net zoals ze al een eigen tekst had. De Engelse knop erft
  // het Nederlandse adres bewust niet: dan stuurde ze een uitwisselingsstudent
  // alsnog naar de eerstejaarswerking.
  const secondary = ctaFrom(
    pickField(values, "secondaryLabel", locale) ??
      (nl ? "Eerstejaars? Start hier" : "International? Start here"),
    nl ? (values.secondaryUrl ?? "/eerstejaars") : (values.secondaryUrlEn ?? "/internationals"),
    base,
  );

  const dayKey = (d: Date) =>
    d.toLocaleDateString(nl ? "nl-BE" : "en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "short",
    });
  const monthLabel = (d: Date) => {
    const month = d
      .toLocaleDateString(nl ? "nl-BE" : "en-GB", { month: "short" })
      .replace(".", "");
    return d.getFullYear() === now.getFullYear()
      ? month
      : `${month} '${String(d.getFullYear()).slice(-2)}`;
  };
  const formatTime = (d: Date) =>
    d.toLocaleTimeString(nl ? "nl-BE" : "en-GB", { hour: "2-digit", minute: "2-digit" });

  const heroEvents = upcomingEvents.slice(0, 4);

  // Hoeveel shiften er onder de titel passen, hangt af van hoe hoog die titel
  // uitvalt: de slogans bepalen dat, en die kunnen morgen twee keer zo lang
  // zijn. Groeit de titel, dan valt hier een rij weg in plaats van dat de kolom
  // onder de agenda uitschiet. Zie lib/frontpage/heroShifts.ts.
  const heroShifts = pickHeroShifts(openShifts, {
    now,
    limit: heroShiftRowCount(slogans.items, slogans.size),
  });

  // "Binnenkort" telt de maand vooruit. Niet alles wat de homepage inlas, want
  // dat zijn er veertig en "37 events" is geen "binnenkort"; en niet één week,
  // want dan staat er in september "0 events" naast een agenda die er vier toont.
  const monthAhead = now.getTime() + 30 * 24 * 60 * 60 * 1000;
  const eventsSoon = upcomingEvents.filter(
    (event) => event.start.getTime() < monthAhead,
  ).length;

  const eventGroups = heroEvents.reduce<
    Array<{ key: string; date: Date; events: FrontpageProps["upcomingEvents"] }>
  >((acc, event) => {
    const date = new Date(event.start);
    const key = dayKey(date);
    const found = acc.find((g) => g.key === key);
    if (found) found.events.push(event);
    else acc.push({ key, date, events: [event] });
    return acc;
  }, []);

  const workingYear = (() => {
    // The working year starts on 15 July; see @vtk/auth.
    const y = now.getMonth() > 6 || (now.getMonth() === 6 && now.getDate() >= 15)
      ? now.getFullYear()
      : now.getFullYear() - 1;
    return `${y}-${String(y + 1).slice(-2)}`;
  })();

  return (
    <section className="home-hero">
      <div>
        <div className="eyebrow">
          <span className="dot" />
          {eyebrow}
        </div>
        <HeroSlogan
          slogans={slogans.items}
          openerCount={slogans.openerCount}
          intervalSeconds={slogans.intervalSeconds}
          size={slogans.size}
          labels={{
            pause: nl ? "Slogans pauzeren" : "Pause slogans",
            play: nl ? "Slogans hervatten" : "Resume slogans",
          }}
        />
        <p className="hero-sub">{subtitle}</p>
        <div className="hero-cta">
          <Cta cta={primary} className="btn btn-primary arrow" />
          <Cta cta={secondary} className="btn btn-ghost" />
        </div>
        {/* De shiften en de feitenlijn zijn samen de voet van de kolom en hangen
            aan de onderkant (`margin-top: auto` in vtk-home.css), zodat ze
            uitkomen op de onderlijn van de agenda ernaast. De lucht die de titel
            overlaat, komt daardoor boven dit blok te staan en niet eronder. */}
        <div className="hero-foot">
          <HeroShifts shifts={heroShifts} now={now} locale={locale} base={base} />
          <div className="hero-meta">
            <div className="meta">
              <div className="k">{nl ? "Werkingsjaar" : "Working year"}</div>
              <div className="v">{workingYear}</div>
            </div>
            <div className="meta">
              <div className="k">{nl ? "Binnenkort" : "Coming up"}</div>
              <div className="v">
                {eventsSoon} {nl ? "events" : "events"}
              </div>
            </div>
            <div className="meta">
              <div className="k">{nl ? "Sinds" : "Since"}</div>
              <div className="v">1920</div>
            </div>
          </div>
        </div>
      </div>

      {agenda === HOME_AGENDA_WEEK ? (
        <HeroWeek
          events={weekEvents}
          now={now}
          locale={locale}
          base={base}
          signedIn={signedIn}
          dim={agendaDim}
          nextEventsLimit={nextEventsLimit}
        />
      ) : (
      <aside className="hero-cal">
        <div className="hero-cal-head">
          <div>
            <h3>{nl ? "Aankomende events" : "Upcoming events"}</h3>
            <div className="sub">
              {heroEvents[0]
                ? `${dayKey(new Date(heroEvents[0].start))} → ${dayKey(
                    new Date(heroEvents[heroEvents.length - 1].start),
                  )}`
                : nl
                  ? "Geen geplande events"
                  : "No planned events"}
            </div>
          </div>
          <Link href={`${base}/kalender`} className="all">
            {nl ? "Volledige kalender" : "Full calendar"}
          </Link>
        </div>
        <div className="hero-agenda">
          {eventGroups.length === 0 ? (
            <div className="hero-day">
              <div className="hero-day-label">
                <span className="num">—</span>
                <span className="dow">{nl ? "Geen data" : "No data"}</span>
              </div>
            </div>
          ) : (
            eventGroups.map((group, groupIndex) => (
              <div className="hero-day" key={group.key}>
                <div className="hero-day-label">
                  <span className="num">{String(group.date.getDate()).padStart(2, "0")}</span>
                  <span className="mon">{monthLabel(group.date)}</span>
                  <span className="dow">
                    {group.date.toLocaleDateString(nl ? "nl-BE" : "en-GB", { weekday: "long" })}
                  </span>
                  {group.date.toDateString() === now.toDateString() ? (
                    <span className="today">{nl ? "vandaag" : "today"}</span>
                  ) : null}
                </div>
                {group.events.map((event, eventIndex) => (
                  <Link
                    key={event.id}
                    href={`${base}/kalender/${event.slug}`}
                    className={`hero-ev${groupIndex === 0 && eventIndex === 0 ? " featured" : ""}`}
                  >
                    <div className="t">{formatTime(new Date(event.start))}</div>
                    <div className="n">
                      {groupIndex === 0 && eventIndex === 0 ? <span className="pin" /> : null}
                      {pick(event.titleNl, event.titleEn ?? event.titleNl, locale)}
                      <small>
                        {[event.location, organiserName(event.organiserName, event.group, locale)]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                      {/* Enkel wanneer er al volk naartoe gaat; de drempel zit
                          aan de serverkant, dus een laag getal komt hier niet. */}
                      {event.interestedCount ? (
                        <span className="hero-ev-going">
                          {event.interestedCount} {nl ? "komen" : "going"}
                        </span>
                      ) : null}
                    </div>
                    {/* Own class: the global `.arrow` would glue a second arrow
                        on with ::after. */}
                    <span className="ev-go" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>
      )}
    </section>
  );
}
