/**
 * Welke berichten er in de Nieuws-band op de homepage staan, en welk er
 * uitgelicht wordt.
 *
 * Bewust een pure module zonder database en zonder React, net als
 * `lib/calendar/heroWeek.ts`: dit zijn de regels van de kring, en die wil je
 * kunnen testen zonder een homepage te renderen. Het lezen gebeurt in
 * `load.ts`, het tekenen in `components/editorial/NewsBand.tsx`.
 *
 * De regels, en waarom ze zo zijn (zie ook docs/design-decisions.md):
 *
 * - **Een mededeling en een woordje van de praeses schrijft iemand zelf.** Ze
 *   staan erin tussen hun start en hun einde, zolang ze aan staan.
 * - **De rest komt vanzelf, uit zijn bron.** Een ticketverkoop, inschrijvingen,
 *   een nieuw Bakske of Ir.Reëel en een nieuw fotoalbum worden bij het lezen
 *   afgeleid; zo valt een album dat verdwijnt of een verkoop die sluit vanzelf
 *   weg, zonder dat iemand een bericht moet opruimen.
 * - **Elk automatisch bericht heeft een houdbaarheid.** Nieuws is wat recent is:
 *   een ticketverkoop die al drie weken loopt, staat al op /tickets en in de
 *   agenda. Zie de constanten hieronder.
 * - **Uitgelicht is wat de redactie kiest, anders het woordje, anders het
 *   nieuwste.** Het woordje van de praeses is geschreven om gelezen te worden
 *   en wordt dus niet als tegel tussen de andere berichten gezet.
 */

import { presaleStart, type PresaleConfig } from "@/lib/ticketing/presale";

/** Waar een bericht vandaan komt. Ook de sleutel van `NewsHidden.source`. */
export type NewsSource =
  | "notice"
  | "praeses"
  | "tickets"
  | "signup"
  | "bakske"
  | "irreeel"
  | "album";

/** De soorten die vanzelf in het nieuws komen, in de volgorde van het beheer. */
export const NEWS_AUTO_SOURCES = ["tickets", "signup", "bakske", "irreeel", "album"] as const;
export type NewsAutoSource = (typeof NEWS_AUTO_SOURCES)[number];

export function isNewsAutoSource(value: string): value is NewsAutoSource {
  return (NEWS_AUTO_SOURCES as readonly string[]).includes(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Zo lang staat een geopende ticketverkoop in het nieuws. Twee weken: lang
 * genoeg dat wie maar af en toe langskomt het ziet, kort genoeg dat het nieuws
 * blijft. Daarna staat het event nog op /tickets en in het weekoverzicht.
 */
export const TICKETS_NEWS_DAYS = 14;

/** Zo lang staat een nieuw fotoalbum in het nieuws, gerekend vanaf zijn datum. */
export const ALBUM_NEWS_DAYS = 14;

/**
 * Zo lang staat een nieuw nummer van het Bakske of Ir.Reëel in het nieuws.
 * Verschijnt er eerder een volgend nummer van hetzelfde blad, dan neemt dat de
 * plaats in: twee Bakskes naast elkaar is één te veel.
 */
export const MAGAZINE_NEWS_DAYS = 21;

/** Zo lang na zijn datum draagt een bericht het gele "Nieuw". */
export const NEWS_FRESH_DAYS = 2;

/** Hoeveel regels van het woordje in de uitgelichte kaart staan voor "Lees de hele brief". */
export const NEWS_LETTER_LINES = 9;

function within(date: Date, now: Date, days: number): boolean {
  const age = now.getTime() - date.getTime();
  return age >= 0 && age <= days * DAY_MS;
}

/**
 * Wanneer een ticketverkoop nieuws werd: bij de publieke start van de verkoop,
 * of bij het publiceren wanneer dat later kwam (een event dat gepubliceerd wordt
 * terwijl de verkoop al "open" stond, is pas dan te zien). Een voorverkoop telt
 * hier niet: dat is geen nieuws voor wie er niet in mag. Wie er wel in mag,
 * krijgt een eigen bericht; zie {@link ticketPresaleInNews}.
 */
export function ticketNewsDate(event: {
  salesStartAt: Date | null;
  publishedAt: Date | null;
}): Date | null {
  if (!event.publishedAt) return null;
  if (!event.salesStartAt) return event.publishedAt;
  return event.salesStartAt > event.publishedAt ? event.salesStartAt : event.publishedAt;
}

/** Staat deze ticketverkoop nu in het nieuws? */
export function ticketInNews(
  event: {
    status: string;
    startsAt: Date;
    salesStartAt: Date | null;
    salesEndAt: Date | null;
    publishedAt: Date | null;
  },
  now: Date,
): boolean {
  if (event.status !== "PUBLISHED") return false;
  if (event.startsAt <= now) return false;
  if (event.salesEndAt && event.salesEndAt <= now) return false;
  const date = ticketNewsDate(event);
  return date !== null && within(date, now, TICKETS_NEWS_DAYS);
}

/**
 * Moet de redactie deze ticketverkoop eerst zelf in het nieuws zetten? Een
 * werkgroep verkoopt haar tickets via de site, maar wat er op de homepage komt,
 * beslist de redactie van de kring: een verkoop van een werkgroep staat er dus
 * standaard niet in, die van een praesidiumpost wel. Wie `news.manage` heeft,
 * zet ze er in /admin/nieuws toch in (`NewsShown`). Geldt voor het gewone
 * bericht en voor de voorverkoop, die dezelfde sleutel dragen.
 */
export function ticketNeedsNewsOptIn(event: { ownerGroup: { type: string } }): boolean {
  return event.ownerGroup.type === "WERKGROEP";
}

/**
 * Staat een automatisch bericht uit het nieuws? Wanneer de redactie het verborg
 * (`NewsHidden`), of wanneer het standaard uit staat en niemand het erin zette
 * (`NewsShown`). Verbergen wint: de actie houdt de twee exclusief, maar een
 * verborgen bericht hoort nooit per ongeluk terug te komen.
 */
export function isNewsEntryHidden(entry: {
  hidden: boolean;
  needsOptIn: boolean;
  shown: boolean;
}): boolean {
  if (entry.hidden) return true;
  return entry.needsOptIn && !entry.shown;
}

/**
 * Wanneer een voorverkoop nieuws werd, voor wie erin mag: bij haar start, of bij
 * het publiceren wanneer dat later kwam. `null` zonder voorverkoop.
 */
export function ticketPresaleNewsDate(
  event: PresaleConfig & { salesStartAt: Date | null; publishedAt: Date | null },
): Date | null {
  if (!event.publishedAt) return null;
  const start = presaleStart(event);
  if (!start) return null;
  return start > event.publishedAt ? start : event.publishedAt;
}

/**
 * Loopt de voorverkoop van deze ticketverkoop nu, zodat ze in het nieuws kan
 * staan van wie erin mag? Of de bezoeker erin mag, beslist `inPresaleAudience`;
 * dat hangt aan een sessie en hoort dus niet in het gedeelde nieuws.
 *
 * Enkel tot de publieke start. Vanaf dan neemt het gewone bericht
 * (`ticketInNews`) het over, met dezelfde sleutel: het bericht blijft voor wie
 * het al zag dus hetzelfde bericht, en een redacteur die het verborg of
 * uitlichtte, raakt beide.
 */
export function ticketPresaleInNews(
  event: PresaleConfig & {
    status: string;
    startsAt: Date;
    salesStartAt: Date | null;
    salesEndAt: Date | null;
    publishedAt: Date | null;
  },
  now: Date,
): boolean {
  if (event.status !== "PUBLISHED") return false;
  if (event.startsAt <= now) return false;
  if (event.salesEndAt && event.salesEndAt <= now) return false;
  if (!event.salesStartAt || event.salesStartAt <= now) return false;
  const date = ticketPresaleNewsDate(event);
  return date !== null && within(date, now, TICKETS_NEWS_DAYS);
}

/**
 * Wanneer inschrijvingen nieuws werden: bij het aanduiden, of bij het
 * publiceren wanneer het evenement toen nog een concept was.
 */
export function signupNewsDate(event: {
  registrationNewsAt: Date | null;
  publishedAt: Date | null;
}): Date | null {
  if (!event.registrationNewsAt || !event.publishedAt) return null;
  return event.registrationNewsAt > event.publishedAt ? event.registrationNewsAt : event.publishedAt;
}

/**
 * Staan de inschrijvingen van dit evenement nu in het nieuws? Tot het begint:
 * wie zich daarna nog wil inschrijven, heeft niets meer aan het bericht.
 */
export function signupInNews(
  event: {
    url: string | null;
    start: Date;
    registrationNewsAt: Date | null;
    publishedAt: Date | null;
  },
  now: Date,
): boolean {
  if (!event.url) return false;
  if (event.start <= now) return false;
  const date = signupNewsDate(event);
  return date !== null && date <= now;
}

/**
 * De nummers van het Bakske en Ir.Reëel die nu nieuws zijn: per blad hoogstens
 * het nieuwste, en enkel binnen `MAGAZINE_NEWS_DAYS` na zijn datum. Een nummer
 * met een datum in de toekomst is nog niet verschenen.
 */
export function magazinesInNews<T extends { kind: string; publishedAt?: string }>(
  publications: readonly T[],
  now: Date,
): T[] {
  const newest = new Map<string, { item: T; date: Date }>();
  for (const item of publications) {
    if (!item.publishedAt) continue;
    const date = new Date(item.publishedAt);
    if (Number.isNaN(date.getTime()) || date > now) continue;
    const current = newest.get(item.kind);
    if (!current || date > current.date) newest.set(item.kind, { item, date });
  }
  return [...newest.values()]
    .filter(({ date }) => within(date, now, MAGAZINE_NEWS_DAYS))
    .map(({ item }) => item);
}

/**
 * De datum van een album in het nieuws: de datum die het album zelf draagt (die
 * van de activiteit), anders wanneer het laatst gewijzigd werd.
 */
export function albumNewsDate(album: { date: string | null; updatedAt: string | null }): Date | null {
  const raw = album.date ?? album.updatedAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function albumInNews(album: { date: string | null; updatedAt: string | null }, now: Date): boolean {
  const date = albumNewsDate(album);
  return date !== null && within(date, now, ALBUM_NEWS_DAYS);
}

/** Staat een zelfgeschreven bericht nu in het nieuws? */
export function postInNews(
  post: { active: boolean; publishedAt: Date; endsAt: Date | null },
  now: Date,
): boolean {
  if (!post.active) return false;
  if (post.publishedAt > now) return false;
  return !post.endsAt || post.endsAt > now;
}

/** Draagt dit bericht het gele "Nieuw"? */
export function isFreshNews(date: string, now: Date): boolean {
  const parsed = new Date(date);
  return !Number.isNaN(parsed.getTime()) && within(parsed, now, NEWS_FRESH_DAYS);
}

/** Het minimum dat de samenstelling van een bericht moet weten. */
export type NewsComposable = {
  key: string;
  source: NewsSource;
  /** ISO-datum: wanneer het nieuws werd. Bepaalt wat "het nieuwste" is. */
  date: string;
  /**
   * ISO-datum die het bericht toont, wanneer dat een andere is dan `date`: de
   * dag van het evenement bij een ticketverkoop of een inschrijving.
   */
  shownDate?: string;
  /** Door de redactie uitgelicht. */
  featured: boolean;
};

/**
 * De volgorde van de tegels in de carrousel. Elke tegel draagt een datumpin, en
 * die moet je van links naar rechts kunnen lezen: eerst wat nog komt, het
 * vroegste eerst (vanavond voor volgende week), daarna wat al gebeurde, het
 * recentste eerst. Gesorteerd op wanneer iets nieuws werd, stond een verkoop
 * die gisteren opende voor een evenement over twee weken vóór het evenement
 * van morgen, en sprongen de pinnen heen en weer.
 */
export function compareNewsTiles(now: Date) {
  type Dated = Pick<NewsComposable, "date" | "shownDate">;
  const ahead = (entry: Dated) => entry.shownDate !== undefined && new Date(entry.shownDate) > now;
  return (a: Dated, b: Dated): number => {
    const aAhead = ahead(a);
    const bAhead = ahead(b);
    if (aAhead !== bAhead) return aAhead ? -1 : 1;
    if (aAhead) return a.shownDate!.localeCompare(b.shownDate!);
    return (b.shownDate ?? b.date).localeCompare(a.shownDate ?? a.date);
  };
}

/**
 * Wat de band toont: één uitgelicht bericht en alle andere als tegels in de
 * carrousel ernaast. Er is geen maximum: de carrousel schuift, dus een bericht
 * dat in het nieuws hoort, staat erin. Wat te oud is, valt er al uit via de
 * houdbaarheid hierboven.
 *
 * Uitgelicht is het bericht dat de redactie aanduidde, anders het nieuwste
 * woordje van de praeses, anders gewoon het nieuwste bericht. De tegels volgen
 * {@link compareNewsTiles}.
 */
export function composeNews<T extends NewsComposable>(
  entries: readonly T[],
  now: Date,
): { featured: T | null; rest: T[] } {
  const newest = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  if (newest.length === 0) return { featured: null, rest: [] };
  const featured =
    newest.find((entry) => entry.featured) ??
    newest.find((entry) => entry.source === "praeses") ??
    newest[0]!;
  return {
    featured,
    rest: newest.filter((entry) => entry !== featured).sort(compareNewsTiles(now)),
  };
}

/** Een kalenderdag in Brussel als `yyyy-mm-dd`, zodat datums als tekst te vergelijken zijn. */
function brusselsDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** De maandag van de week van `day` (`yyyy-mm-dd`), `weeksBack` weken terug. */
function mondayOf(day: string, weeksBack: number): string {
  const noon = new Date(`${day}T12:00:00Z`);
  const sinceMonday = (noon.getUTCDay() + 6) % 7;
  noon.setUTCDate(noon.getUTCDate() - sinceMonday - 7 * weeksBack);
  return noon.toISOString().slice(0, 10);
}

/** Een groep op /nieuws: een week rond vandaag, of een maand. */
export type NewsPeriod<T> = {
  /** Uniek per groep, voor React. */
  key: string;
  /** Welke week rond vandaag, of `null` voor een maand. */
  week: "this" | "next" | "last" | null;
  /** Maandag van de week (`yyyy-mm-dd`) bij een week, anders `null`. */
  monday: string | null;
  /** De maand (`yyyy-mm`) bij een maand, anders `null`. */
  month: string | null;
  entries: T[];
};

/** Een dag `days` dagen na `day` (`yyyy-mm-dd`). */
function addDays(day: string, days: number): string {
  const noon = new Date(`${day}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + days);
  return noon.toISOString().slice(0, 10);
}

/**
 * De berichten van /nieuws per periode, zoals de agenda van de kalender, op de
 * datum die een bericht toont (`shownDate`, de dag van het evenement bij een
 * ticketverkoop of inschrijving, anders `date`). Wanneer de verkoop opende,
 * zegt een lezer weinig: een cantus van donderdag onder "Vorige week" omdat
 * de tickets toen te koop gingen, las als een vergissing.
 *
 * De volgorde is die van de band ({@link compareNewsTiles}): eerst wat nog
 * komt (deze week, volgende week, daarna per maand), het vroegste eerst; dan
 * wat al gebeurde (vorige week, daarvoor per maand), het recentste eerst. Een
 * week begint op maandag, in Brussel. Binnen deze week staat wat nog komt voor
 * wat al voorbij is, net als in de band.
 */
export function groupNewsByPeriod<T extends { date: string; shownDate?: string }>(
  entries: readonly T[],
  now: Date,
): NewsPeriod<T>[] {
  const today = brusselsDay(now);
  const thisMonday = mondayOf(today, 0);
  const lastMonday = mondayOf(today, 1);
  const nextMonday = addDays(thisMonday, 7);
  const afterNextWeek = addDays(thisMonday, 14);

  // Eerst de weken rond vandaag, dan de maanden erna, dan die ervoor. De
  // rangorde van een groep is dus: 0 deze week, 1 volgende week, 2 later,
  // 3 vorige week, 4 vroeger.
  const groups = new Map<string, NewsPeriod<T> & { rank: number }>();
  for (const entry of [...entries].sort(compareNewsTiles(now))) {
    const day = brusselsDay(new Date(entry.shownDate ?? entry.date));
    let group: Omit<NewsPeriod<T>, "entries"> & { rank: number };
    if (day >= thisMonday && day < nextMonday) {
      group = { key: "this-week", week: "this", monday: thisMonday, month: null, rank: 0 };
    } else if (day >= nextMonday && day < afterNextWeek) {
      group = { key: "next-week", week: "next", monday: nextMonday, month: null, rank: 1 };
    } else if (day >= afterNextWeek) {
      group = { key: `later-${day.slice(0, 7)}`, week: null, monday: null, month: day.slice(0, 7), rank: 2 };
    } else if (day >= lastMonday) {
      group = { key: "last-week", week: "last", monday: lastMonday, month: null, rank: 3 };
    } else {
      group = { key: `earlier-${day.slice(0, 7)}`, week: null, monday: null, month: day.slice(0, 7), rank: 4 };
    }
    const existing = groups.get(group.key);
    if (existing) existing.entries.push(entry);
    else groups.set(group.key, { ...group, entries: [entry] });
  }
  return [...groups.values()]
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      // Later: de vroegste maand eerst. Vroeger: de recentste maand eerst.
      return a.rank === 2 ? a.month!.localeCompare(b.month!) : b.month!.localeCompare(a.month!);
    })
    .map((group) => ({
      key: group.key,
      week: group.week,
      monday: group.monday,
      month: group.month,
      entries: group.entries,
    }));
}
