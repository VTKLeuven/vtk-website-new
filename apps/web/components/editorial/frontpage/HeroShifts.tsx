import Link from "next/link";
import { getDictionary, type Locale } from "@vtk/i18n";
import { HERO_WEEK_TIME_ZONE } from "@/lib/calendar/heroWeek";
import { heroShiftFreeSpots, isHeroShiftUrgent } from "@/lib/frontpage/heroShifts";
import type { FrontpageShift } from "./context";

/**
 * De shiften die nog openstaan, onder de herotekst.
 *
 * Bewust geen kaart en geen paneel, net als het weekoverzicht ernaast: een
 * bovenschrift, rijen met een haarlijn ertussen die naar rechts oplost, en geel
 * enkel voor wat binnen een dag begint. De rij snelle links eronder zegt waar je
 * naartoe kan; dit blok zegt waar er nu handen tekort zijn, en dat is het enige
 * wat het hier komt doen.
 *
 * Hoeveel rijen er staan, beslist `heroShiftRowCount` op basis van de hoogte van
 * de titel; welke shiften het worden, beslist `pickHeroShifts`. Beide regels
 * staan los getest in lib/frontpage/heroShifts.ts. Dit bestand tekent alleen.
 *
 * Het blok staat er ook voor wie niet aangemeld is. De namen en uren van een
 * shift zijn geen geheim, en het is voor de kring net het publiek dat nog niet
 * weet dat het kan helpen; /shift vraagt zelf om aan te melden en stuurt daarna
 * terug.
 */

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function timeLabel(date: Date, locale: Locale): string {
  return date.toLocaleTimeString(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: HERO_WEEK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Wanneer de shift is, in zo weinig mogelijk woorden.
 *
 * Binnen de week volstaat de dagnaam: "vrijdag" is dichterbij dan "19 sep" en
 * leest sneller. Verder weg wordt het de datum, want "vrijdag" zegt dan niet
 * welke vrijdag. Vandaag en morgen krijgen hun eigen woord: daar gaat het blok
 * eigenlijk over.
 */
function dayLabel(start: Date, now: Date, locale: Locale, nl: boolean): string {
  const tag = locale === "nl" ? "nl-BE" : "en-GB";
  const dayIn = (date: Date) =>
    date.toLocaleDateString("en-CA", { timeZone: HERO_WEEK_TIME_ZONE });
  const startDay = dayIn(start);
  if (startDay === dayIn(now)) return nl ? "Vandaag" : "Today";
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (startDay === dayIn(tomorrow)) return nl ? "Morgen" : "Tomorrow";

  const withinWeek = start.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000;
  const label = withinWeek
    ? start.toLocaleDateString(tag, { timeZone: HERO_WEEK_TIME_ZONE, weekday: "long" })
    : start
        .toLocaleDateString(tag, {
          timeZone: HERO_WEEK_TIME_ZONE,
          weekday: "short",
          day: "numeric",
          month: "short",
        })
        .replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function HeroShifts({
  shifts,
  now,
  locale,
  base,
}: {
  shifts: FrontpageShift[];
  now: Date;
  locale: Locale;
  base: string;
}) {
  if (shifts.length === 0) return null;
  const nl = locale === "nl";
  const t = getDictionary(locale).shift;

  return (
    <section className="hero-shifts" aria-labelledby="hero-shifts-head">
      <div className="hero-shifts-head">
        <h2 id="hero-shifts-head">{nl ? "Shiften die openstaan" : "Shifts still open"}</h2>
        <Link href={`${base}/shift`} className="all">
          {nl ? "Alle shiften" : "All shifts"}
        </Link>
      </div>

      {shifts.map((shift) => {
        const free = heroShiftFreeSpots(shift);
        const spots = free === 1 ? t.spots.one : fill(t.spots.few, { n: free });
        const reward =
          shift.reward === 1 ? t.reward.one : fill(t.reward.many, { n: shift.reward });
        return (
          <Link
            key={shift.id}
            href={`${base}/shift`}
            className={`hero-shift-row${isHeroShiftUrgent(shift, now) ? " urgent" : ""}`}
          >
            <span className="dot" aria-hidden="true" />
            <span className="body">
              <span className="t">{shift.name}</span>
              <span className="d">
                {dayLabel(shift.startTime, now, locale, nl)} {timeLabel(shift.startTime, locale)}
                {nl ? " tot " : " to "}
                {timeLabel(shift.endTime, locale)}, {spots.toLowerCase()}
              </span>
            </span>
            {/* De beloning staat rechts, waar in het weekoverzicht het uur staat:
                dezelfde kolom, dezelfde rol. Het is wat je eraan overhoudt. */}
            <span className="reward">{reward}</span>
          </Link>
        );
      })}
    </section>
  );
}
