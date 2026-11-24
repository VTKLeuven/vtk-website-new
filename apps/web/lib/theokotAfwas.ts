/**
 * Afwasbeurten in Theokot (/admin/theokot/afwas): een post, werkgroep of
 * jaarwerking boekt een of meer uren van een namiddag om na een eigen
 * evenement af te wassen.
 *
 * Hier staat het rekenwerk dat de pagina, de server action, de worker en de
 * tests delen: welke namiddagen er zijn, op welk uur, en of Theokot die dag
 * open is. Puur en zonder server-imports. Zie docs/design-decisions.md,
 * "Theokot: afwasbeurten".
 */

import { brusselsWallClockMinutes, brusselsYMD, isoWeekday, shiftYMD, ymdKey, type YMD } from '@/lib/brussels';
import { templateTimeOfDay, type ShiftTemplate } from '@/lib/shift/templates';
import { mondayOf, weekdaysOf } from '@/lib/theokotShifts';

export { defaultTheokotWeek, mondayOf, weekdaysOf } from '@/lib/theokotShifts';

/** Zoveel weken staan er onder elkaar op het scherm; de pijlen gaan per zoveel verder. */
export const AFWAS_WEEKS_PER_PAGE = 6;

/** Verder dan een jaar vooruit boeken heeft geen zin en is meestal een tikfout. */
export const AFWAS_HORIZON_DAYS = 366;

/** De herinnering vertrekt zoveel voor het begin, zoals die van een shift. */
export const AFWAS_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Staat een afwas zo lang zonder namiddag, dan krijgt de groep één herinnering
 * om er een te kiezen. Twee dagen: Logistiek brengt de bekers op maandag, dus
 * wie op maandag genoteerd wordt en woensdag nog niets koos, heeft dan nog
 * donderdag en vrijdag.
 */
export const AFWAS_PICK_REMINDER_MS = 2 * 24 * 60 * 60 * 1000;

/** Is de herinnering "kies een namiddag" aan de beurt? */
export function pickReminderDue(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= AFWAS_PICK_REMINDER_MS;
}

/**
 * Drie uren per werkdag, zoals de Excel "bekers afwassen": 14u-15u, 15u-16u en
 * 16u-17u. Eén groep per uur; een afwas mag er meer dan één nemen.
 */
export const AFWAS_HOURS = 3;
const HOUR = 60;

/** De namiddag van de afwas, in minuten sinds middernacht op de Brusselse klok. */
export type AfwasSlot = {
  /** Het begin van het eerste uur. */
  startMinutes: number;
  /** Het einde van het laatste uur. */
  endMinutes: number;
  /** De shift uit het sjabloon waar het beginuur van komt; null = de terugval. */
  shiftName: string | null;
};

/** Zonder sjabloon: 14:00, het begin van de namiddagshift zoals ze meegeleverd wordt. */
export const AFWAS_FALLBACK_SLOT: AfwasSlot = {
  startMinutes: 14 * 60,
  endMinutes: 14 * 60 + AFWAS_HOURS * HOUR,
  shiftName: null,
};

/**
 * De namiddag begint waar de namiddagshift uit het Theokot-sjabloon begint (de
 * shift met "namiddag" in haar naam, anders de laatste van de dag), en telt
 * drie uren. Zo volgt de afwas vanzelf wanneer Theokot de namiddag verschuift.
 */
export function afwasSlot(template: Pick<ShiftTemplate, 'timeOfDay' | 'shifts'> | null): AfwasSlot {
  const entries = (template?.shifts ?? []).filter((entry) => entry.enabled);
  if (!template || entries.length === 0) return AFWAS_FALLBACK_SLOT;
  const entry =
    entries.find((candidate) => /namiddag|afternoon/i.test(candidate.name)) ??
    entries.reduce((latest, candidate) => (candidate.startOffsetMinutes > latest.startOffsetMinutes ? candidate : latest));
  const [hours, minutes] = templateTimeOfDay(template).split(':').map(Number);
  const startMinutes = hours * 60 + minutes + entry.startOffsetMinutes;
  const endMinutes = startMinutes + AFWAS_HOURS * HOUR;
  // Een namiddag die over middernacht zou lopen, is geen namiddag meer: dan
  // klopt er iets niet in het sjabloon, en is het vaste uur beter dan onzin.
  if (startMinutes < 0 || endMinutes > 24 * 60) return AFWAS_FALLBACK_SLOT;
  return { startMinutes, endMinutes, shiftName: entry.name };
}

/** "14:00". */
export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** 0, 1, 2. */
export const AFWAS_HOUR_INDEXES: readonly number[] = Array.from({ length: AFWAS_HOURS }, (_, index) => index);

export function isAfwasHour(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < AFWAS_HOURS;
}

/** Geldige uren, elk één keer, op volgorde. */
export function normalizeHours(hours: readonly number[]): number[] {
  return [...new Set(hours.filter(isAfwasHour))].sort((a, b) => a - b);
}

export function hourStart(day: YMD, slot: AfwasSlot, hour: number): Date {
  return brusselsWallClockMinutes(day, slot.startMinutes + hour * HOUR);
}

/** "14:00–15:00". */
export function hourLabel(slot: AfwasSlot, hour: number): string {
  const from = slot.startMinutes + hour * HOUR;
  return `${clock(from)}–${clock(from + HOUR)}`;
}

/** Aansluitende uren samen: "14:00–16:00", en anders "14:00–15:00, 16:00–17:00". */
export function hoursLabel(slot: AfwasSlot, hours: readonly number[]): string {
  const sorted = normalizeHours(hours);
  const runs: [number, number][] = [];
  for (const hour of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[1] === hour - 1) last[1] = hour;
    else runs.push([hour, hour]);
  }
  return runs
    .map(([from, to]) => `${clock(slot.startMinutes + from * HOUR)}–${clock(slot.startMinutes + (to + 1) * HOUR)}`)
    .join(', ');
}

/** Van het begin van het eerste tot het einde van het laatste uur, voor een mail. */
export function bookedSpan(day: YMD, slot: AfwasSlot, hours: readonly number[]): { start: Date; end: Date } {
  const sorted = normalizeHours(hours);
  const first = sorted[0] ?? 0;
  const last = sorted[sorted.length - 1] ?? AFWAS_HOURS - 1;
  return { start: hourStart(day, slot, first), end: hourStart(day, slot, last + 1) };
}

/** Het begin van de namiddag (het eerste uur). */
export function slotStart(day: YMD, slot: AfwasSlot): Date {
  return brusselsWallClockMinutes(day, slot.startMinutes);
}

// -----------------------------------------------------------------------------
// De dag zoals de database hem bewaart
//
// `TheokotDishwash.day` is een `DATE`: Prisma geeft dat terug als middernacht in
// UTC. Een kalenderdag, geen tijdstip, dus nooit langs de Brusselse klok.
// -----------------------------------------------------------------------------

export function dayToDate(day: YMD): Date {
  return new Date(Date.UTC(day.year, day.month - 1, day.day));
}

export function dateToDay(date: Date): YMD {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

// -----------------------------------------------------------------------------
// Is Theokot die dag open?
// -----------------------------------------------------------------------------

/**
 * `open`: er is een verkoopdag. `closed`: de week staat online zonder deze dag,
 * of de dag staat op dicht. `unknown`: er staat voor die week nog niets online,
 * en dan gaan we ervan uit dat Theokot open is.
 *
 * Een verkoopweek gaat pas de week ervoor online, terwijl een post weken vooruit
 * boekt. Zolang er niets staat, is "dicht" dus geen conclusie: dat zou elke
 * boeking van volgende maand blokkeren. Pas wanneer Theokot de week neerzet en
 * deze dag ontbreekt, weten we het.
 */
export type TheokotDayState = 'open' | 'closed' | 'unknown';

/** De verkoopdagen per week: maandag (`yyyy-mm-dd`) -> dag (`yyyy-mm-dd`) -> open. */
export type WeekSessions = Map<string, Map<string, boolean>>;

/** `TheokotSession.date` is middernacht op de Brusselse klok. */
export function groupSessionsByWeek(sessions: readonly { date: Date; isOpen: boolean }[]): WeekSessions {
  const weeks: WeekSessions = new Map();
  for (const session of sessions) {
    const day = brusselsYMD(session.date);
    const monday = ymdKey(mondayOf(day));
    const week = weeks.get(monday) ?? new Map<string, boolean>();
    week.set(ymdKey(day), session.isOpen);
    weeks.set(monday, week);
  }
  return weeks;
}

export function theokotDayState(day: YMD, weeks: WeekSessions): TheokotDayState {
  const week = weeks.get(ymdKey(mondayOf(day)));
  if (!week || week.size === 0) return 'unknown';
  return week.get(ymdKey(day)) === true ? 'open' : 'closed';
}

// -----------------------------------------------------------------------------
// Kan deze namiddag geboekt worden?
// -----------------------------------------------------------------------------

/** Waarom een dag niet te boeken is; null = wel (voor de uren die nog moeten komen). */
export type AfwasBlock = 'weekend' | 'past' | 'closed' | 'tooFar';

export function afwasBlock(input: { day: YMD; state: TheokotDayState; slot: AfwasSlot; now: Date }): AfwasBlock | null {
  const { day, state, slot, now } = input;
  if (isoWeekday(day) > 5) return 'weekend';
  // Voorbij zodra ook het laatste uur begonnen is: wie 's middags merkt dat er
  // nog een stapel ligt, kan om 15:00 nog het uur van 16:00 nemen.
  if (hourPast(day, slot, AFWAS_HOURS - 1, now)) return 'past';
  if (state === 'closed') return 'closed';
  const last = shiftYMD(brusselsYMD(now), AFWAS_HORIZON_DAYS);
  if (ymdKey(day) > ymdKey(last)) return 'tooFar';
  return null;
}

/** Is dit uur al begonnen? */
export function hourPast(day: YMD, slot: AfwasSlot, hour: number, now: Date): boolean {
  return now.getTime() >= hourStart(day, slot, hour).getTime();
}

/**
 * Valt het begin binnen de 24 uur? Dan is de herinnering van "de dag ervoor"
 * al voorbij: een boeking van vanmiddag voor morgen hoort geen mail te krijgen
 * die zegt dat het morgen is, want dat weet wie net boekte al.
 */
export function reminderWindowPassed(start: Date, now: Date): boolean {
  return start.getTime() - now.getTime() <= AFWAS_REMINDER_LEAD_MS;
}

/** Is het tijd voor de herinnering: binnen 24 uur, en nog niet begonnen? */
export function reminderDue(start: Date, now: Date): boolean {
  return start.getTime() > now.getTime() && start.getTime() - now.getTime() <= AFWAS_REMINDER_LEAD_MS;
}

// -----------------------------------------------------------------------------
// Het raster op het scherm
// -----------------------------------------------------------------------------

/** `count` werkweken vanaf een maandag, elk met haar vijf werkdagen. */
export function afwasWeeks(firstMonday: YMD, count: number): YMD[][] {
  return Array.from({ length: count }, (_, index) => weekdaysOf(shiftYMD(firstMonday, index * 7)));
}

// -----------------------------------------------------------------------------
// Wat er af te wassen valt, en de week na het evenement
// -----------------------------------------------------------------------------

/** Zelfde waarden als de enum `TheokotDishwashKind`; hier zonder Prisma-import. */
export const AFWAS_KINDS = ['ECOCUPS', 'GLAZEN', 'KOMMETJES', 'ANDERS'] as const;
export type AfwasKind = (typeof AFWAS_KINDS)[number];

const KIND_LABELS: Record<AfwasKind, { nl: string; en: string }> = {
  ECOCUPS: { nl: 'Ecocups', en: 'Ecocups' },
  GLAZEN: { nl: 'Glazen', en: 'Glasses' },
  KOMMETJES: { nl: 'Kommetjes', en: 'Bowls' },
  ANDERS: { nl: 'Iets anders', en: 'Something else' },
};

export function kindLabel(kind: AfwasKind, nl: boolean): string {
  return KIND_LABELS[kind][nl ? 'nl' : 'en'];
}

export function isAfwasKind(value: string): value is AfwasKind {
  return (AFWAS_KINDS as readonly string[]).includes(value);
}

/** "3 bakken · Ecocups, glazen": hoeveel eerst, dan wat. */
export function describeAfwas(quantity: string, kinds: readonly AfwasKind[], nl: boolean): string {
  const ordered = AFWAS_KINDS.filter((kind) => kinds.includes(kind));
  const what = ordered
    .map((kind, index) => (index === 0 ? kindLabel(kind, nl) : kindLabel(kind, nl).toLocaleLowerCase(nl ? 'nl-BE' : 'en-GB')))
    .join(', ');
  return [quantity.trim(), what].filter(Boolean).join(' · ');
}

/**
 * Valt de namiddag in de week na het evenement? Logistiek brengt de vuile
 * bekers op de maandag na het evenement naar Theokot en haalt ze de maandag
 * daarna terug, dus enkel die vijf namiddagen werken. Daarbuiten waarschuwt
 * het scherm; weigeren doet het niet (een keuze van Theokot, zie de design
 * decisions). Zonder datum van het evenement valt er niets te zeggen.
 */
export function inWeekAfterEvent(eventDay: YMD | null, day: YMD | null): boolean {
  if (!eventDay || !day) return true;
  return ymdKey(mondayOf(day)) === ymdKey(shiftYMD(mondayOf(eventDay), 7));
}

/** De maandag van de week na het evenement, voor in de waarschuwing. */
export function weekAfterEvent(eventDay: YMD): YMD {
  return shiftYMD(mondayOf(eventDay), 7);
}
