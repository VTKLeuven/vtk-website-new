import Link from "next/link";
import { pick, type Locale } from "@vtk/i18n";
import {
  HERO_WEEK_TIME_ZONE,
  selectHeroWeek,
  type HeroWeekDay,
} from "@/lib/calendar/heroWeek";
import { HeroWeekStar, type HeroWeekStarLabels } from "./HeroWeekStar";
import type { FrontpageEvent } from "./context";

/**
 * Het weekoverzicht naast de titel op de homepage.
 *
 * Zes dagen onder elkaar, de dag in de marge, de evenementen ernaast, en per
 * evenement een ster om aan te duiden dat je komt. Geen kaart eromheen: de
 * leesbaarheid komt van een zacht verloop in de scrim (`.hero-week-wash`), zodat
 * de herofoto gewoon doorloopt. Zie docs/design-decisions.md voor waarom deze
 * vorm het haalde van een paneel.
 *
 * Welke dagen en welke evenementen erin staan, beslist `selectHeroWeek`; die
 * regels staan los getest in lib/calendar/heroWeek.ts. Dit bestand tekent alleen.
 */

function dayNumber(key: string): string {
  return String(Number(key.slice(8, 10)));
}

/** De dagnaam bij een dagsleutel. `day.date` staat op middag UTC, dus UTC uitlezen. */
function weekdayLabel(date: Date, locale: Locale, style: "short" | "long"): string {
  return date.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "UTC",
    weekday: style,
  });
}

function monthLabel(date: Date, locale: Locale): string {
  return date
    .toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", { timeZone: "UTC", month: "short" })
    .replace(".", "");
}

function timeLabel(event: FrontpageEvent, locale: Locale, nl: boolean): string {
  if (event.allDay) return nl ? "hele dag" : "all day";
  return event.start.toLocaleTimeString(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: HERO_WEEK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HeroWeek({
  events,
  now,
  locale,
  base,
  signedIn,
  dim,
  nextEventsLimit,
}: {
  events: FrontpageEvent[];
  now: Date;
  locale: Locale;
  base: string;
  signedIn: boolean;
  /** Donkerte van de waas in procent; in te stellen in /admin/frontpage. */
  dim: number;
  /** Maximum aantal rijen in de rustige-weeklijst; in te stellen in de admin. */
  nextEventsLimit: number;
}) {
  const nl = locale === "nl";
  const { mode, days } = selectHeroWeek(events, now, { nextLimit: nextEventsLimit });
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: HERO_WEEK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const first = days[0];
  const last = days[days.length - 1];
  const range =
    first && last
      ? `${weekdayLabel(first.date, locale, "short")} ${dayNumber(first.key)} ${nl ? "tot" : "to"} ${weekdayLabel(
          last.date,
          locale,
          "short",
        )} ${dayNumber(last.key)} ${monthLabel(last.date, locale)}`
      : null;

  const starLabels: HeroWeekStarLabels = {
    mark: nl ? "Ik kom naar dit evenement" : "I am coming to this event",
    marked: nl ? "Je komt naar dit evenement" : "You are coming to this event",
    signIn: nl ? "Meld je aan om aan te duiden dat je komt" : "Sign in to mark that you are coming",
    failed: nl
      ? "Aanduiden lukte niet. Probeer het straks opnieuw."
      : "Marking this did not work. Try again in a moment.",
  };
  const loginHref = `${base}/inloggen?next=${encodeURIComponent(base === "" ? "/" : base)}`;

  return (
    <aside
      className="hero-week"
      style={{ "--hero-week-dim": dim / 100 } as React.CSSProperties}
    >
      {/* Het verloop dat de tekst draagt. Puur decoratief: het staat achter de
          rijen en heeft zelf geen rand, zodat de foto blijft doorlopen. */}
      <div className="hero-week-wash" aria-hidden="true" />

      <div className="hero-week-head">
        <h3>
          {mode === "window"
            ? nl
              ? "De komende dagen"
              : "The next few days"
            : nl
              ? "Eerstvolgende events"
              : "Next events"}
        </h3>
        {range ? <span className="range">{range}</span> : null}
        <Link href={`${base}/kalender`} className="all">
          {nl ? "Volledige kalender" : "Full calendar"}{" "}
          <span aria-hidden="true">&#8594;</span>
        </Link>
      </div>

      {days.length === 0 ? (
        <p className="hero-week-empty">
          {nl
            ? "Er staat nog niets in de kalender. Zodra er iets gepland is, verschijnt het hier."
            : "Nothing is in the calendar yet. As soon as something is planned it shows up here."}
        </p>
      ) : (
        days.map((day: HeroWeekDay<FrontpageEvent>) => {
          const empty = day.events.length === 0 && day.more === 0;
          return (
            <div
              className={`hero-week-day${day.key === todayKey ? " today" : ""}${empty ? " empty" : ""}`}
              key={day.key}
            >
              <div className="hero-week-label">
                <span className="num">{dayNumber(day.key)}</span>
                <span className="dow">{weekdayLabel(day.date, locale, "short")}</span>
              </div>
              <div className="hero-week-evs">
                {day.events.map((event) => {
                  const title = pick(event.titleNl, event.titleEn ?? event.titleNl, locale);
                  const meta = [
                    event.location,
                    pick(event.group.nameNl, event.group.nameEn, locale),
                    // Enkel boven de publieke drempel; zie lib/calendar/interest.ts.
                    event.interestedCount
                      ? `${event.interestedCount} ${nl ? "komen" : "going"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div
                      className="hero-week-ev"
                      key={event.id}
                      style={
                        event.categoryColour
                          ? ({ "--cat": event.categoryColour } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <span className="dot" aria-hidden="true" />
                      <Link href={`${base}/kalender/${event.slug}`} className="body">
                        <span className="title">{title}</span>
                        {meta ? <small>{meta}</small> : null}
                      </Link>
                      <span className="time">{timeLabel(event, locale, nl)}</span>
                      <HeroWeekStar
                        eventId={event.id}
                        title={title}
                        interested={event.viewerInterested}
                        signedIn={signedIn}
                        loginHref={loginHref}
                        labels={starLabels}
                      />
                    </div>
                  );
                })}
                {day.more > 0 ? (
                  <Link href={`${base}/kalender`} className="hero-week-more">
                    {nl ? `Nog ${day.more} die dag` : `${day.more} more that day`}
                  </Link>
                ) : null}
                {empty ? (
                  <span className="hero-week-none">{nl ? "niets gepland" : "nothing planned"}</span>
                ) : null}
              </div>
            </div>
          );
        })
      )}
    </aside>
  );
}
