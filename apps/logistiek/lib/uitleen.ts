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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
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

export function formatDateOnly(date: Date, locale: LogistiekLocale = 'nl'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
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

/** Deadline-signaal: de opbouw start binnen de 14 dagen na de aanvraag. */
export function isLastMinute(pickupDate: Date, requestedAt: Date = new Date()): boolean {
  const days = (pickupDate.getTime() - requestedAt.getTime()) / (24 * 60 * 60 * 1000);
  return days < 14;
}

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

export type ReservationLineInput = { itemId: string; quantity: number };

export class UitleenValidationError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'UitleenValidationError';
    this.code = code;
  }
}
