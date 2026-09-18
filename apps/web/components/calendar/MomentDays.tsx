import {
  momentDayParts,
  momentStrip,
  momentStripRest,
  type EventMoment,
} from "@/lib/calendar/moments";

/**
 * De dagenstrip van een evenement met losse momenten: de dagen die de reeks nog
 * te gaan heeft, de eerstvolgende in het geel.
 *
 * Eén evenement blijft één kaart en één lijstrij, dus die ene rij moet zeggen
 * dat er nog vier loopjes volgen. "telkens 20:00" zegt hoe laat, deze strip zegt
 * wanneer; samen zijn ze het antwoord op de vraag die de kaart hiervoor open
 * liet. Wat er niet op past, wordt "+3 tot wo 23 sep".
 *
 * Bewust geen client-component en zonder hooks: de homepage rendert hem op de
 * server, /kalender in de browser. Het enige verschil is de tijdzone, want op de
 * server bestaat "de zone van de bezoeker" niet.
 *
 * Wat hij tekent, beslist `momentStrip` in lib/calendar/moments.ts; dat zijn de
 * regels en die staan los getest. Hoe hij eruitziet, staat in `.ev-days`
 * (vtk-eventcard.css). De hero heeft dezelfde vorm op een donkere grond
 * (`.hero-week-strip`).
 */
export function MomentDays({
  moments,
  now,
  locale,
  timeZone,
  className,
}: {
  moments: readonly EventMoment[];
  now: Date;
  locale: "nl" | "en";
  /** "Europe/Brussels" op de server; laat leeg in de browser. */
  timeZone?: string;
  className?: string;
}) {
  const strip = momentStrip(moments, now);
  if (!strip) return null;
  return (
    <span className={className ? `ev-days ${className}` : "ev-days"}>
      {strip.days.map((day) => {
        const parts = momentDayParts(day.start, locale, timeZone);
        return (
          <span key={day.start.toISOString()} className={`day${day.next ? " next" : ""}`}>
            <i>{parts.weekday}</i>
            {parts.day}
          </span>
        );
      })}
      {strip.rest > 0 ? (
        <span className="rest">{momentStripRest(strip, locale, timeZone)}</span>
      ) : null}
    </span>
  );
}
