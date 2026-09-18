/**
 * De losse momenten van een evenement: de gedeelde regels rond
 * `CalendarEventMoment`.
 *
 * Bewust een pure module zonder database en zonder React, net als heroWeek.ts:
 * de server rendert hiermee de eventpagina en de feeds, en de kalenderpagina in
 * de browser gebruikt dezelfde functies. Welke dagen een moment beslaat, staat
 * niet hier maar bij de twee roosters die het al berekenden
 * (`lib/calendar/heroWeek.ts` en `components/editorial/calendarGrid.ts`): die
 * rekenen elk in hun eigen dagconventie en die wilden we niet samenvoegen om er
 * een derde bij te krijgen.
 */

/** Tijdzone van de kring; dezelfde als overal elders in de kalender. */
export const MOMENT_TIME_ZONE = "Europe/Brussels";

/**
 * Hoe lang een nachtactiviteit mag duren om enkel bij haar startdag te horen.
 * Eén grens voor de hele kalender: het weekoverzicht in de hero en het
 * maandrooster op /kalender lezen hem allebei hier.
 */
export const NIGHT_EVENT_MAX_MS = 12 * 60 * 60 * 1000;

/** Eén moment, zoals de database en de API hem dragen. */
export type EventMoment = {
  start: Date;
  end: Date;
  /** Een eigen naam voor dit ene moment ("Nachtloop"), of niets. */
  label?: string | null;
};

/**
 * De envelop rond een reeks momenten: de start van het eerste en het einde van
 * het laatste. Dat is wat `CalendarEvent.start`/`.end` bewaren, zodat alles wat
 * niets van momenten weet ongewijzigd blijft werken.
 */
export function momentsEnvelope(
  moments: readonly EventMoment[],
): { start: Date; end: Date } | null {
  if (moments.length === 0) return null;
  let start = moments[0]!.start;
  let end = moments[0]!.end;
  for (const moment of moments) {
    if (moment.start < start) start = moment.start;
    if (moment.end > end) end = moment.end;
  }
  return { start, end };
}

/** `HH:MM` van een moment, in de gekozen zone (standaard die van de browser). */
export function clockTime(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("nl-BE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Het uur dat elk moment deelt, of `null` zodra er één afwijkt.
 *
 * Dit is wat een loopweek samenvat tot één regel: zeven keer "18:00" hoort niet
 * zeven keer op een kaart te staan. Wijkt er één moment af, dan is er geen
 * gedeeld uur en zegt de kaart hoeveel momenten er zijn, want dan is elke
 * samenvatting op één uur gelogen.
 */
export function sharedMomentTime(
  moments: readonly EventMoment[],
  timeZone?: string,
): string | null {
  if (moments.length === 0) return null;
  const first = clockTime(moments[0]!.start, timeZone);
  return moments.every((moment) => clockTime(moment.start, timeZone) === first) ? first : null;
}

/**
 * Het moment waar een kaart of een lijstrij op staat: het eerstvolgende, en
 * wanneer alles voorbij is het laatste.
 *
 * Eén evenement blijft één kaart, dus de datum erop hoort de eerstvolgende keer
 * te zijn dat er iets is, en niet de dag waarop de reeks ooit begon.
 */
export function leadMoment(
  moments: readonly EventMoment[],
  now: Date,
): EventMoment | null {
  if (moments.length === 0) return null;
  return moments.find((moment) => moment.end >= now) ?? moments[moments.length - 1]!;
}

/** De eerstvolgende keer dat een evenement doorgaat; zonder momenten is dat zijn start. */
export function nextOccurrenceAt(
  event: { start: Date; moments?: readonly EventMoment[] },
  now: Date,
): Date {
  return leadMoment(event.moments ?? [], now)?.start ?? event.start;
}

/**
 * Loopt er nog iets van dit evenement? Voor een evenement met momenten is dat de
 * vraag of er nog een moment komt, en niet of de envelop al begonnen is: een
 * loopweek die maandag startte, heeft op woensdag nog vier loopjes te gaan.
 */
export function hasUpcomingMoment(
  event: { start: Date; moments?: readonly EventMoment[] },
  now: Date,
): boolean {
  const moments = event.moments ?? [];
  if (moments.length === 0) return event.start >= now;
  return moments.some((moment) => moment.end >= now);
}

/**
 * Wat er op de plaats van het uur komt te staan bij een evenement met momenten:
 * "telkens 18:00" wanneer ze hetzelfde uur delen, anders het aantal.
 *
 * Bewust "telkens" en niet "elke dag": de momenten hoeven niet op
 * opeenvolgende dagen te staan, en drie filmavonden in drie weken zijn geen
 * "elke dag".
 */
export function momentsSummary(
  moments: readonly EventMoment[],
  locale: "nl" | "en",
  timeZone?: string,
): string | null {
  if (moments.length === 0) return null;
  const shared = sharedMomentTime(moments, timeZone);
  if (shared) return locale === "nl" ? `telkens ${shared}` : `each time ${shared}`;
  return locale === "nl" ? `${moments.length} momenten` : `${moments.length} moments`;
}
