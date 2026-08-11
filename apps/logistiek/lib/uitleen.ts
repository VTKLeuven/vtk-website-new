import type {
  UitleenPricingMode,
  UitleenRequesterType,
  UitleenReservationStatus,
  UitleenTransportBookingStatus,
} from '@prisma/client';
import type { LogistiekLocale } from './i18n-shared';

export function formatEuro(cents: number): string {
  const euros = Math.floor(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const sign = cents < 0 ? '-' : '';
  return `${sign}€ ${euros},${rest.toString().padStart(2, '0')}`;
}

/** Prijs die nog niet gekend kan zijn (per-km voor de rit): toon een placeholder. */
export function formatPriceCents(
  cents: number | null | undefined,
  locale: LogistiekLocale = 'nl'
): string {
  if (cents != null) return formatEuro(cents);
  return locale === 'en' ? 'To be determined' : 'Nog te bepalen';
}

/**
 * "YYYY-MM-DD" uit een date-input naar een Date op UTC-middernacht, zoals
 * Prisma `@db.Date`-kolommen ze bewaart. Ongeldige input geeft null.
 */
export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date;
}

/** Vandaag als date-only (UTC-middernacht), voor vergelijkingen met @db.Date. */
export function todayDateOnly(now: Date = new Date()): Date {
  // Belgische wall-clock datum, onafhankelijk van de server-timezone.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return new Date(`${formatter.format(now)}T00:00:00.000Z`);
}

/**
 * De maandag van de week waarin dit moment valt, als date-only (UTC-middernacht,
 * zoals `todayDateOnly`). Belgische wall-clock, dus een rit van zondagavond
 * 23:00 hoort nog bij die week en niet bij de volgende.
 */
export function startOfWeek(date: Date = new Date()): Date {
  const day = todayDateOnly(date);
  const weekday = (day.getUTCDay() + 6) % 7; // maandag = 0
  return new Date(day.getTime() - weekday * 24 * 60 * 60 * 1000);
}

/**
 * ISO-weeknummer (maandag als eerste dag, week 1 bevat 4 januari). Voor de titel
 * van het weekoverzicht: "week 38" zegt Logistiek meer dan een datumbereik.
 */
export function isoWeekNumber(date: Date): number {
  const thursday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  // Naar de donderdag van deze week: die bepaalt in welk jaar de week valt.
  thursday.setUTCDate(thursday.getUTCDate() - ((thursday.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function formatDateOnly(date: Date, locale: LogistiekLocale = 'nl'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * Compacte periode: "1 tot 30 augustus 2026", "1 augustus tot 3 september 2026"
 * of twee volledige datums wanneer het jaar verschilt. Voor koppen boven een
 * lijst, waar twee volledige datums naast elkaar te veel ruis geven.
 */
export function formatDateRange(from: Date, to: Date, locale: LogistiekLocale = 'nl'): string {
  const tag = locale === 'en' ? 'en-GB' : 'nl-BE';
  const part = (date: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(tag, { timeZone: 'UTC', ...opts }).format(date);
  const joiner = locale === 'en' ? 'to' : 'tot';

  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const sameMonth = sameYear && from.getUTCMonth() === to.getUTCMonth();

  if (sameMonth) {
    return `${part(from, { day: 'numeric' })} ${joiner} ${part(to, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  if (sameYear) {
    return `${part(from, { day: 'numeric', month: 'long' })} ${joiner} ${part(to, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  const full = { day: 'numeric', month: 'long', year: 'numeric' } as const;
  return `${part(from, full)} ${joiner} ${part(to, full)}`;
}

/** Date (@db.Date, UTC-middernacht) naar de "YYYY-MM-DD"-waarde van een date-input. */
export function toDateInputValue(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Date naar de "YYYY-MM-DDTHH:mm"-waarde van een datetime-local-input (Brussel). */
export function toDatetimeLocalValue(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

export function formatDateTime(date: Date, locale: LogistiekLocale = 'nl'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Twee gesloten datumbereiken overlappen. */
export function rangesOverlap(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date): boolean {
  return aFrom <= bTo && aTo >= bFrom;
}

/**
 * Ligt dit moment op een kwartier?
 *
 * Ritten worden op het kwartier gepland: zo plant Logistiek de kar in, en uren
 * als 14:07 maken het weekoverzicht onleesbaar. De server weigert een ander
 * tijdstip in plaats van stil af te ronden, want afronden verschuift een rit
 * zonder dat de aanvrager het ziet.
 *
 * In UTC gerekend zodat de server-timezone niet meespeelt; elke echte
 * tijdzone-offset is een veelvoud van een kwartier, dus het antwoord verandert
 * niet met de zone.
 */
export function isOnQuarterHour(date: Date): boolean {
  return (
    date.getUTCMinutes() % 15 === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
  );
}

/** Aantal begonnen uren tussen twee momenten, met één uur als minimum. */
export function billedHours(startAt: Date, endAt: Date): number {
  const ms = endAt.getTime() - startAt.getTime();
  if (ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
}

/**
 * Prijs van een transportboeking volgens de tariefmodus van het voertuig.
 * Geeft null wanneer de prijs nog niet gekend is (PER_KM voor de rit, zonder
 * ingevoerde kilometers).
 */
export function transportPriceCents(params: {
  pricingMode: UitleenPricingMode;
  rateCents: number;
  startAt: Date;
  endAt: Date;
  kilometers?: number | null;
}): number | null {
  switch (params.pricingMode) {
    case 'FREE':
      return 0;
    case 'FLAT':
      return params.rateCents;
    case 'PER_HOUR':
      return billedHours(params.startAt, params.endAt) * params.rateCents;
    case 'PER_KM':
      return params.kilometers != null && params.kilometers >= 0
        ? params.kilometers * params.rateCents
        : null;
    default:
      return null;
  }
}

export const PRICING_MODE_LABELS: Record<UitleenPricingMode, string> = {
  FREE: 'Gratis',
  PER_HOUR: 'Per uur',
  PER_KM: 'Per kilometer',
  FLAT: 'Vast bedrag',
};

const PRICING_MODE_LABELS_EN: Record<UitleenPricingMode, string> = {
  FREE: 'Free',
  PER_HOUR: 'Per hour',
  PER_KM: 'Per kilometre',
  FLAT: 'Flat rate',
};

export function pricingModeLabel(mode: UitleenPricingMode, locale: LogistiekLocale): string {
  return (locale === 'en' ? PRICING_MODE_LABELS_EN : PRICING_MODE_LABELS)[mode];
}

export const REQUESTER_TYPE_LABELS: Record<UitleenRequesterType, string> = {
  INTERN: 'Interne post',
  WERKGROEP: 'Werkgroep',
  EXTERN: 'Extern',
};

const REQUESTER_TYPE_LABELS_EN: Record<UitleenRequesterType, string> = {
  INTERN: 'Internal post',
  WERKGROEP: 'Work group',
  EXTERN: 'External',
};

export function requesterTypeLabel(type: UitleenRequesterType, locale: LogistiekLocale): string {
  return (locale === 'en' ? REQUESTER_TYPE_LABELS_EN : REQUESTER_TYPE_LABELS)[type];
}

/**
 * Namens wie een aanvraag gebeurt, als één label: de post bij INTERN, anders de
 * bewaarde naam van de werkgroep of de externe. Gedeeld door de aanvragenlijst
 * en de kalender, zodat beide schermen dezelfde naam tonen.
 */
export function requesterLabel(request: {
  requesterType: UitleenRequesterType;
  requesterName: string | null;
  group: { nameNl: string } | null;
}): string {
  if (request.requesterType === 'INTERN') {
    return request.group?.nameNl ?? REQUESTER_TYPE_LABELS.INTERN;
  }
  return request.requesterName ?? REQUESTER_TYPE_LABELS[request.requesterType];
}

/**
 * Termijn waarbinnen een aanvraag "last minute" heet. Zeven dagen: met veertien
 * kreeg bijna elke aanvraag de badge, en een signaal dat overal staat is geen
 * signaal meer. Het team past dit zelf aan op /beheer/instellingen.
 */
export const DEFAULT_LAST_MINUTE_DAYS = 7;

/** Deadline-signaal: de afhaaldag valt binnen `days` na het moment van aanvragen. */
export function isLastMinute(
  pickupDate: Date,
  requestedAt: Date = new Date(),
  days: number = DEFAULT_LAST_MINUTE_DAYS
): boolean {
  const elapsed = (pickupDate.getTime() - requestedAt.getTime()) / (24 * 60 * 60 * 1000);
  return elapsed < days;
}

/**
 * De staat van een exemplaar, zoals het team ze noteert. Interne informatie: ze
 * staat in het beheer en op de detailpagina enkel voor `logistiek.manage`, want
 * ze zegt iets over onderhoud en niet over wat je kan aanvragen.
 */
export const ITEM_CONDITION_LABELS: Record<string, string> = {
  WERKT: 'Werkt',
  TESTEN: 'Nog testen',
  ONVOLLEDIG: 'Onvolledig',
  KAPOT: 'Kapot / vervangen',
};

export const RESERVATION_STATUS_LABELS: Record<UitleenReservationStatus, string> = {
  REQUESTED: 'Aangevraagd',
  APPROVED: 'Goedgekeurd',
  REJECTED: 'Afgewezen',
  CANCELLED: 'Geannuleerd',
  PICKED_UP: 'Afgehaald',
  RETURNED: 'Teruggebracht',
};

const RESERVATION_STATUS_LABELS_EN: Record<UitleenReservationStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  PICKED_UP: 'Collected',
  RETURNED: 'Returned',
};

export function reservationStatusLabel(
  status: UitleenReservationStatus,
  locale: LogistiekLocale
): string {
  return (locale === 'en' ? RESERVATION_STATUS_LABELS_EN : RESERVATION_STATUS_LABELS)[status];
}

export const VAN_STATUS_LABELS: Record<UitleenTransportBookingStatus, string> = {
  REQUESTED: 'Aangevraagd',
  APPROVED: 'Goedgekeurd',
  REJECTED: 'Afgewezen',
  CANCELLED: 'Geannuleerd',
  COMPLETED: 'Uitgevoerd',
};

const VAN_STATUS_LABELS_EN: Record<UitleenTransportBookingStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

export function vanStatusLabel(
  status: UitleenTransportBookingStatus,
  locale: LogistiekLocale
): string {
  return (locale === 'en' ? VAN_STATUS_LABELS_EN : VAN_STATUS_LABELS)[status];
}

/** Statussen die voorraad innemen bij de beschikbaarheidsberekening. */
export const STOCK_CONSUMING_STATUSES: UitleenReservationStatus[] = ['APPROVED', 'PICKED_UP'];

export type ReservationLineInput = {
  itemId: string;
  quantity: number;
  /** Opmerking bij deze lijn ("liefst de zwarte"); optioneel. */
  note?: string;
};

export class UitleenValidationError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'UitleenValidationError';
    this.code = code;
  }
}
