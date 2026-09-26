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
 *   en wordt dus niet tussen de korte regels van het register gedrukt.
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

/** Hoeveel berichten de band toont, uitgelicht inbegrepen. */
export const NEWS_COUNT_DEFAULT = 6;
export const NEWS_COUNT_MIN = 3;
export const NEWS_COUNT_MAX = 8;

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
  /** ISO-datum; waarop gesorteerd wordt. */
  date: string;
  /** Door de redactie uitgelicht. */
  featured: boolean;
};

/**
 * Wat de band toont: één uitgelicht bericht en de rest als register, samen
 * hoogstens `count`.
 *
 * Uitgelicht is het bericht dat de redactie aanduidde, anders het nieuwste
 * woordje van de praeses, anders gewoon het nieuwste bericht. Het register is de
 * rest, nieuwste eerst.
 */
export function composeNews<T extends NewsComposable>(
  entries: readonly T[],
  count: number = NEWS_COUNT_DEFAULT,
): { featured: T | null; rest: T[] } {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length === 0 || count < 1) return { featured: null, rest: [] };
  const featured =
    sorted.find((entry) => entry.featured) ??
    sorted.find((entry) => entry.source === "praeses") ??
    sorted[0]!;
  return { featured, rest: sorted.filter((entry) => entry !== featured).slice(0, count - 1) };
}
