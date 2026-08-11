/**
 * Zuivere domeinlogica voor de broodjesmomenten: de grocomeet (GM) en het VTK
 * Bureau. Beide zijn dezelfde vergadering-met-broodjes; enkel het publiek en de
 * beheerder verschillen (zie docs/design-decisions.md).
 *
 * Dit bestand bevat GEEN server-only imports (geen prisma/mail), zodat het net
 * als `lib/theokot.ts` in server- én clientcomponenten bruikbaar is. De
 * DB-afhankelijke logica (aanbod ophalen, koppelen aan een verkoopdag, ongeldig
 * maken + mail) staat in `lib/meetings-server.ts`.
 */

import type { MeetingKind } from '@prisma/client';

import { brusselsTimeOnDay, brusselsYMD, isoWeekday, isoWeekKey, parseYMD, ymdKey } from './brussels';

// -----------------------------------------------------------------------------
// Soorten en standaardwaarden
// -----------------------------------------------------------------------------

export const MEETING_KINDS = ['GROCOMEET', 'BUREAU'] as const satisfies readonly MeetingKind[];

/**
 * Welke weken het voorstel aanduidt. Een tweewekelijkse vergadering hangt aan de
 * pariteit van het ISO-weeknummer en niet aan "elke tweede vanaf de start van het
 * semester": zo blijft ze kloppen over de kerstvakantie heen, en het is ook hoe
 * een agenda erover praat ("de even weken").
 */
export type WeekParity = 'all' | 'even' | 'odd';

/** Standaardritme per soort. `weekday` is ISO: 1 = maandag ... 7 = zondag. */
export const MEETING_DEFAULTS: Record<
  MeetingKind,
  { weekday: number; time: string; parity: WeekParity }
> = {
  GROCOMEET: { weekday: 5, time: '12:45', parity: 'all' },
  BUREAU: { weekday: 4, time: '12:40', parity: 'even' },
};

export function meetingKindLabel(kind: MeetingKind, nl: boolean): string {
  if (kind === 'GROCOMEET') return nl ? 'Grocomeet' : 'Grocomeet';
  return nl ? 'VTK Bureau' : 'VTK Bureau';
}

/** Het pad waar iemand zijn reservatie voor dit moment maakt of aanpast. */
export function meetingPath(kind: MeetingKind, slug: string, base = ''): string {
  return kind === 'GROCOMEET' ? `${base}/grocomeet` : `${base}/bureau/${slug}`;
}

// -----------------------------------------------------------------------------
// Semesters
//
// De planningskalender vraagt per semester welke dagen er een moment is. Een
// werkingsjaar Y loopt van 15 juli Y tot 14 juli Y+1 (zie @vtk/auth), dus
// semester 1 valt in het kalenderjaar Y en semester 2 in Y+1.
// -----------------------------------------------------------------------------

export type Semester = 1 | 2;

/** De maanden die de kalender van dit semester toont, als {year, month} (1-12). */
export function semesterMonths(workingYear: number, semester: Semester): Array<{ year: number; month: number }> {
  if (semester === 1) {
    return [
      { year: workingYear, month: 9 },
      { year: workingYear, month: 10 },
      { year: workingYear, month: 11 },
      { year: workingYear, month: 12 },
      { year: workingYear + 1, month: 1 },
    ];
  }
  return [2, 3, 4, 5, 6].map((month) => ({ year: workingYear + 1, month }));
}

/** In welk semester een datum valt. Augustus tot en met januari is semester 1. */
export function semesterForDate(date: Date): Semester {
  const { month } = brusselsYMD(date);
  return month >= 8 || month === 1 ? 1 : 2;
}

/**
 * Het semester waarvoor het beheer nu een kalender voorgeschoteld krijgt. Vanaf
 * januari is dat semester 2: dan wordt de tweede helft van het jaar ingepland,
 * ook al horen de laatste januaridagen nog bij semester 1.
 */
export function semesterToPlan(now: Date = new Date()): Semester {
  const { month } = brusselsYMD(now);
  return month >= 8 ? 1 : 2;
}

/** "2026-10-16" -> Date op Brussel-middernacht, of null bij ongeldige invoer. */
export function parseDayValue(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = brusselsTimeOnDay(new Date(`${value}T12:00:00Z`), '00:00');
  return Number.isNaN(day.getTime()) ? null : day;
}

/** Alle dagen van een maand als "YYYY-MM-DD", plus op welke weekdag ze vallen. */
export function monthDays(year: number, month: number): Array<{ value: string; day: number; weekday: number }> {
  const days: Array<{ value: string; day: number; weekday: number }> = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = 1; day <= last; day += 1) {
    const ymd = { year, month, day };
    days.push({ value: ymdKey(ymd), day, weekday: isoWeekday(ymd) });
  }
  return days;
}

/** Het ISO-weeknummer van een "YYYY-MM-DD"-dag. */
export function isoWeekNumber(dayValue: string): number {
  const ymd = parseYMD(dayValue);
  if (!ymd) return 0;
  return Number(isoWeekKey(ymd).split('-W')[1]);
}

/**
 * De dagen die de kalender voorstelt: elke vaste weekdag van het semester, in de
 * gevraagde weken. Een voorstel, geen regel: het beheer klikt dagen weg of bij,
 * en kan met één klik naar de andere weken springen wanneer het semester net
 * verkeerd uitkomt.
 */
export function suggestedMeetingDays(
  workingYear: number,
  semester: Semester,
  kind: MeetingKind,
  parity: WeekParity = MEETING_DEFAULTS[kind].parity,
): string[] {
  const { weekday } = MEETING_DEFAULTS[kind];
  return semesterMonths(workingYear, semester)
    .flatMap((m) => monthDays(m.year, m.month))
    .filter((d) => d.weekday === weekday && matchesParity(d.value, parity))
    .map((d) => d.value);
}

function matchesParity(dayValue: string, parity: WeekParity): boolean {
  if (parity === 'all') return true;
  const even = isoWeekNumber(dayValue) % 2 === 0;
  return parity === 'even' ? even : !even;
}

// -----------------------------------------------------------------------------
// Bestelvenster
// -----------------------------------------------------------------------------

export type MeetingWindowInput = {
  startsAt: Date;
  opensAt: Date | null;
  useTheokot: boolean;
};

/**
 * Tot wanneer er besteld of gewijzigd kan worden. Met Theokot-broodjes is dat
 * exact dezelfde deadline als voor studenten (de turflijst wordt dan geprint);
 * zonder verkoopdag valt de deadline op het moment zelf.
 */
export function meetingCloseAt(
  meeting: MeetingWindowInput,
  session: { orderCloseAt: Date } | null,
): Date {
  if (meeting.useTheokot && session) return session.orderCloseAt;
  return meeting.startsAt;
}

export type MeetingWindowState = 'UPCOMING' | 'OPEN' | 'CLOSED';

export function meetingWindowState(
  meeting: MeetingWindowInput,
  session: { orderCloseAt: Date } | null,
  now: Date = new Date(),
): MeetingWindowState {
  if (meeting.opensAt && now < meeting.opensAt) return 'UPCOMING';
  return now < meetingCloseAt(meeting, session) ? 'OPEN' : 'CLOSED';
}

// -----------------------------------------------------------------------------
// Drankjes
// -----------------------------------------------------------------------------

export const DEFAULT_MEETING_DRINKS = [
  'Cola',
  'Cola Zero',
  'Fanta',
  'Fanta Lemon',
  'Sprite',
  'Bruiswater',
  'Ice Tea',
  'Ice Tea Green',
  'Ice Tea Peach',
  'Schweppes',
];

export const DEFAULT_DRINK_PRICE_CENTS = 100;

export type MeetingDrinks = { priceCents: number; items: string[] };

export const DEFAULT_MEETING_DRINK_CONFIG: MeetingDrinks = {
  priceCents: DEFAULT_DRINK_PRICE_CENTS,
  items: DEFAULT_MEETING_DRINKS,
};

/** Leest de (mogelijk ontbrekende) `meetings.drinks`-setting uit. */
export function parseMeetingDrinks(value: unknown): MeetingDrinks {
  const src = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const price = typeof src.priceCents === 'number' ? src.priceCents : Number(src.priceCents);
  const items = Array.isArray(src.items)
    ? src.items.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : [];
  return {
    priceCents: Number.isInteger(price) && price >= 0 ? price : DEFAULT_DRINK_PRICE_CENTS,
    items: items.length > 0 ? items.map((item) => item.trim()) : DEFAULT_MEETING_DRINKS,
  };
}

// -----------------------------------------------------------------------------
// Aanbod en reservaties
// -----------------------------------------------------------------------------

/**
 * Naam-sleutel om een gereserveerd broodje terug te vinden in het aanbod van de
 * verkoopdag. Er is geen id om op te matchen: een reservatie wordt weken vooraf
 * gemaakt uit de catalogus, terwijl het aanbod-item van die dag pas bestaat
 * wanneer Theokot de week aanmaakt. De naam is wat beide gemeen hebben, en het
 * is ook waarop een mens ze vergelijkt.
 */
export function offeringNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export type ReservationAmounts = { itemPriceCents: number; drinkPriceCents: number };

export function reservationTotalCents(reservation: ReservationAmounts): number {
  return reservation.itemPriceCents + reservation.drinkPriceCents;
}

export function sumReservationTotals(reservations: ReservationAmounts[]): number {
  return reservations.reduce((total, r) => total + reservationTotalCents(r), 0);
}
