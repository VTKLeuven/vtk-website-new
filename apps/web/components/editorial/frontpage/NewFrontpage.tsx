import Link from "@/components/ui/Link";
import { pick, type Locale } from "@vtk/i18n";
import { pickField } from "@/lib/frontpage/fields";
import {
  HERO_WEEK_TIME_ZONE,
  heroWeekDayKey,
  heroWeekDayDate,
  heroWeekEventDays,
} from "@/lib/calendar/heroWeek";
import { EventStar, type EventStarLabels } from "@/components/calendar/EventStar";
import { organiserName } from "@/lib/calendar/organiser";
import { HeroSlogan } from "./HeroSlogan";
import { Cta, ctaFrom, type FrontpageProps, type FrontpageEvent } from "./context";

function shiftDayKey(key: string, days: number): string {
  const date = heroWeekDayDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayShortLabel(date: Date, locale: Locale): string {
  return date.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "UTC",
    weekday: "short",
  });
}

function monthShortLabel(date: Date, locale: Locale): string {
  return date
    .toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
      timeZone: "UTC",
      month: "short",
    })
    .replace(".", "");
}

function clockLabel(date: Date, locale: Locale): string {
  return date.toLocaleTimeString(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: HERO_WEEK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

type WeekDayItem = {
  key: string;
  date: Date;
  dayNum: string;
  weekday: string;
  isToday: boolean;
  events: Array<{
    event: FrontpageEvent;
    moment: NonNullable<FrontpageEvent["moments"]>[number] | null;
    time: string;
    isRepeat: boolean;
  }>;
};

/**
 * Nieuwe verfijnde frontpage variant.
 *
 * Volledig afgestemd op de gebruikersnotities:
 * 1. Rustige achtergrond (via /hero-clean.jpg).
 * 2. Brede verdeling: linkerkolom links, kalender rechts met royale tussenruimte.
 * 3. Eyebrow zonder bolletje.
 * 4. Strak sans-serif geel accent in de slogan (geen cursief serif).
 * 5. Kalendertitel "Komende week" met datumbereik en link naar volledige kalender.
 * 6. Datumkolom: dagnummer bovenaan, weekdag eronder in een compacte badge (geel voor vandaag).
 * 7. Strakke scheidingslijnen zonder wazige fade-out gradient.
 * 8. Volledige 7 dagen (inclusief zaterdag en zondag). Lege dagen tonen "Niets gepland".
 * 9. Hoog contrast (helder wit en goudgeel, geen donkergrijs).
 * 10. Geen hero-meta onderaan (Werkingsjaar, Binnenkort, Sinds 1920 weggelaten).
 * 11. Compacte hoogte zodat de hero volledig boven de vouw op een laptopscherm past.
 */
export function NewFrontpage({
  values,
  locale,
  base,
  now,
  weekEvents,
  signedIn,
  openShifts,
  slogans,
}: FrontpageProps) {
  const nl = locale === "nl";

  const eyebrow =
    pickField(values, "eyebrow", locale) ?? "Vlaamse Technische Kring · KU Leuven";
  const subtitle =
    pickField(values, "subtitle", locale) ??
    (nl
      ? "Events, cursussen, career, broodjes en alles wat je dag op de campus praktischer maakt. Gerund door studenten, sinds 1920."
      : "Events, courses, careers, sandwiches and everything that makes your day on campus more practical. Run by students, since 1920.");

  const primary = ctaFrom(
    pickField(values, "primaryLabel", locale) ?? (nl ? "Ontdek wat we doen" : "Discover what we do"),
    values.primaryUrl ?? "/info",
    base,
  );

  const secondary = ctaFrom(
    pickField(values, "secondaryLabel", locale) ??
      (nl ? "Eerstejaars? Start hier" : "International? Start here"),
    nl ? (values.secondaryUrl ?? "/eerstejaars") : (values.secondaryUrlEn ?? "/internationals"),
    base,
  );

  const agendaTitle =
    pickField(values, "agendaTitle", locale) ?? (nl ? "Komende week" : "Upcoming week");

  const todayKey = heroWeekDayKey(now, HERO_WEEK_TIME_ZONE);

  // 7 opeenvolgende dagen vanaf vandaag (inclusief zaterdag en zondag)
  const days: WeekDayItem[] = [];
  for (let i = 0; i < 7; i++) {
    const key = shiftDayKey(todayKey, i);
    const date = heroWeekDayDate(key);
    const dayNum = String(Number(key.slice(8, 10)));
    const weekday = weekdayShortLabel(date, locale);
    const isToday = key === todayKey;

    const eventsOnDay: WeekDayItem["events"] = [];

    for (const event of weekEvents) {
      if (event.heroWeek === "HIDDEN") continue;
      const eventDays = heroWeekEventDays(event, HERO_WEEK_TIME_ZONE);
      if (eventDays.includes(key)) {
        const moment =
          event.moments?.find(
            (m) => heroWeekDayKey(m.start, HERO_WEEK_TIME_ZONE) === key,
          ) ?? null;

        const isFirstDay = eventDays[0] === key;
        const isRepeat = !isFirstDay && !moment;

        let time = "";
        if (moment) {
          time = clockLabel(moment.start, locale);
        } else if (eventDays.length > 1 && !isFirstDay) {
          const dayIdx = eventDays.indexOf(key) + 1;
          time = nl ? `dag ${dayIdx} van ${eventDays.length}` : `day ${dayIdx} of ${eventDays.length}`;
        } else if (event.allDay) {
          time = nl ? "hele dag" : "all day";
        } else {
          time = clockLabel(event.start, locale);
        }

        eventsOnDay.push({ event, moment, time, isRepeat });
      }
    }

    eventsOnDay.sort((a, b) => {
      const aTime = a.moment ? a.moment.start.getTime() : a.event.start.getTime();
      const bTime = b.moment ? b.moment.start.getTime() : b.event.start.getTime();
      return aTime - bTime;
    });

    days.push({
      key,
      date,
      dayNum,
      weekday,
      isToday,
      events: eventsOnDay,
    });
  }

  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const rangeLabel =
    firstDay && lastDay
      ? `${firstDay.weekday} ${firstDay.dayNum} ${nl ? "tot" : "to"} ${lastDay.weekday} ${lastDay.dayNum} ${monthShortLabel(lastDay.date, locale)}`
      : "";

  const starLabels: EventStarLabels = {
    mark: nl ? "Ik kom naar dit evenement" : "I am coming to this event",
    marked: nl ? "Je komt naar dit evenement" : "You are coming to this event",
    signIn: nl ? "Meld je aan om aan te duiden dat je komt" : "Sign in to mark that you are coming",
    failed: nl
      ? "Aanduiden lukte niet. Probeer het straks opnieuw."
      : "Marking this did not work. Try again in a moment.",
  };
  const loginHref = `${base}/inloggen?next=${encodeURIComponent(base === "" ? "/" : base)}`;

  return (
    <section className="home-hero fp-nieuw">
      {/* Linker kolom: Titel & Acties (naar links uitgelijnd met royale ruimte) */}
      <div className="hero-copy">
        {/* Geen bolletje voor het bovenschrift */}
        <div className="fp-eyebrow">
          <span>{eyebrow}</span>
        </div>

        <HeroSlogan
          slogans={slogans.items}
          openerCount={slogans.openerCount}
          intervalSeconds={slogans.intervalSeconds}
          size={slogans.size === "l" ? "m" : slogans.size}
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

        {/* Compacte shift-chip */}
        {openShifts.length > 0 && (
          <div className="fp-shift-chip">
            <span className="fp-chip-pulse" aria-hidden="true" />
            <span className="fp-chip-text">
              {nl
                ? `${openShifts.length} openstaande shift${openShifts.length > 1 ? "en" : ""} deze week`
                : `${openShifts.length} open shift${openShifts.length > 1 ? "s" : ""} this week`}
            </span>
            <Link href={`${base}/shift`} className="fp-chip-link">
              {nl ? "Help mee" : "Help out"} &rarr;
            </Link>
          </div>
        )}
      </div>

      {/* Rechter kolom: Verticale weekkalender (7 dagen, strakke scheidingen, dagbadge onder elkaar) */}
      <aside className="hero-cal-week" aria-label={agendaTitle}>
        {/* Header: Komende week + datumbereik + Volledige kalender link */}
        <div className="cal-week-head">
          <div className="cal-week-title-wrap">
            <h3>{agendaTitle}</h3>
            {rangeLabel ? <span className="cal-week-range">{rangeLabel}</span> : null}
          </div>
          <Link href={`${base}/kalender`} className="cal-week-all">
            {nl ? "Volledige kalender" : "Full calendar"}{" "}
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>

        {/* 7 opeenvolgende dagen onder elkaar */}
        <div className="cal-week-days">
          {days.map((day) => {
            const hasEvents = day.events.length > 0;
            return (
              <div
                key={day.key}
                className={`cal-week-day-row${day.isToday ? " is-today" : ""}${!hasEvents ? " is-empty" : ""}`}
              >
                {/* Datumkolom: dagnummer op kop, weekdag eronder */}
                <div className="cal-date-col">
                  <div className="cal-date-badge">
                    <span className="cal-date-num">{day.dayNum}</span>
                    <span className="cal-date-dow">{day.weekday}</span>
                  </div>
                </div>

                {/* Evenementenkolom */}
                <div className="cal-events-col">
                  {!hasEvents ? (
                    <div className="cal-empty-row">
                      <span className="cal-empty-text">
                        {nl ? "Niets gepland" : "Nothing planned"}
                      </span>
                    </div>
                  ) : (
                    day.events.map((entry) => {
                      const { event, moment, time, isRepeat } = entry;
                      const title = pick(event.titleNl, event.titleEn ?? event.titleNl, locale);
                      const meta = [
                        moment?.label || null,
                        event.location,
                        organiserName(event.organiserName, event.group, locale),
                      ]
                        .filter(Boolean)
                        .join(" · ");

                      return (
                        <div
                          key={`${day.key}-${event.id}${moment ? `-${moment.start.toISOString()}` : ""}`}
                          className={`cal-ev-row${isRepeat ? " is-repeat" : ""}`}
                        >
                          <span
                            className="cal-ev-dot"
                            aria-hidden="true"
                            style={
                              event.categoryColour
                                ? ({ "--cat": event.categoryColour } as React.CSSProperties)
                                : undefined
                            }
                          />
                          <div className="cal-ev-main">
                            <Link href={`${base}/kalender/${event.slug}`} className="cal-ev-title">
                              {title}
                            </Link>
                            {meta ? <span className="cal-ev-meta">{meta}</span> : null}
                          </div>
                          <span className="cal-ev-time">{time}</span>
                          {moment ? (
                            <EventStar
                              eventId={event.id}
                              momentStart={moment.start.toISOString()}
                              title={`${title}${moment.label ? ` (${moment.label})` : ""}`}
                              interested={event.viewerInterestedMoments.includes(
                                moment.start.toISOString(),
                              )}
                              signedIn={signedIn}
                              loginHref={loginHref}
                              labels={starLabels}
                              className="cal-ev-star"
                            />
                          ) : isRepeat ? (
                            <span className="cal-ev-star" aria-hidden="true" />
                          ) : (
                            <EventStar
                              eventId={event.id}
                              title={title}
                              interested={event.viewerInterested}
                              signedIn={signedIn}
                              loginHref={loginHref}
                              labels={starLabels}
                              className="cal-ev-star"
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </section>
  );
}
