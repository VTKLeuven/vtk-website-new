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
 * Hoeveel dagvakjes een strip hoogstens toont voor ze afkapt op "+n".
 *
 * Zes en niet meer: de strip staat zowel op een kaart van 380 pixels als in de
 * hero naast de titel, en zes vakjes van ongeveer vijftig pixels passen daar
 * nog op één regel. Wat er niet op past, zegt het laatste vakje.
 */
export const MOMENT_STRIP_MAX = 6;

/** Eén dagvakje in de strip. */
export type MomentStripDay = {
  /** De start van dat moment; de strip toont er de dag van. */
  start: Date;
  /** De eerstvolgende keer. Dat vakje staat in het geel; de rest is rustig. */
  next: boolean;
};

export type MomentStrip = {
  days: MomentStripDay[];
  /** Hoeveel keren er niet op de strip passen. */
  rest: number;
  /** De laatste keer van de reeks; het "+n"-vakje zegt tot wanneer ze loopt. */
  last: Date;
};

/**
 * De dagen die een reeks nog te gaan heeft, als strip onder de titel.
 *
 * Dit is het antwoord op "telkens 18:00, maar op welke dagen dan?". Bewust
 * enkel wat nog komt: een loopweek die woensdag halfweg is, moet zeggen dat er
 * nog vier loopjes zijn en niet dat er twee voorbij zijn. Daardoor schuift de
 * strip mee met de rij en met de datum op de kaart, die allebei al op het
 * eerstvolgende moment staan (`leadMoment`).
 *
 * `null` bij hoogstens één moment: dan is er geen reeks en zegt een strip van
 * één vakje niets wat de datum ernaast niet al zegt.
 *
 * Is alles voorbij (een kaart in een voorbije week, een archiefpagina), dan
 * toont ze de laatste dagen in plaats van niets, en draagt geen enkel vakje de
 * markering "eerstvolgend".
 */
export function momentStrip(
  moments: readonly EventMoment[],
  now: Date,
  max = MOMENT_STRIP_MAX,
): MomentStrip | null {
  if (moments.length < 2) return null;
  const upcoming = moments.filter((moment) => moment.end >= now);
  const pool = upcoming.length > 0 ? upcoming : moments.slice(-max);
  const days = pool.slice(0, max).map((moment, index) => ({
    start: moment.start,
    next: upcoming.length > 0 && index === 0,
  }));
  return {
    days,
    rest: pool.length - days.length,
    last: pool[pool.length - 1]!.start,
  };
}

/**
 * De dag van een moment zoals een vakje hem draagt: "vr" boven "18", elk in
 * hun eigen element zodat de cijfers uitlijnen.
 */
export function momentDayParts(
  date: Date,
  locale: "nl" | "en",
  timeZone?: string,
): { weekday: string; day: string } {
  const tag = locale === "nl" ? "nl-BE" : "en-GB";
  return {
    weekday: date
      .toLocaleDateString(tag, { timeZone, weekday: "short" })
      .replace(".", ""),
    day: date.toLocaleDateString(tag, { timeZone, day: "numeric" }),
  };
}

/** "tot wo 23 sep": waar een reeks eindigt die niet op de strip past. */
export function momentStripRest(
  strip: MomentStrip,
  locale: "nl" | "en",
  timeZone?: string,
): string {
  const tag = locale === "nl" ? "nl-BE" : "en-GB";
  const last = strip.last
    .toLocaleDateString(tag, { timeZone, weekday: "short", day: "numeric", month: "short" })
    .replace(/\./g, "");
  return locale === "nl" ? `+${strip.rest} tot ${last}` : `+${strip.rest} until ${last}`;
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

/**
 * Hoeveel dagen van een evenement met losse momenten er in het paneel van de
 * eventpagina zichtbaar zijn voor "Toon alle dagen". Zeven past een week
 * trainingen of een loopweek volledig en houdt het paneel binnen één scherm.
 */
export const EVENT_MOMENTS_VISIBLE = 7;
