import type { UitleenReservationStatus, UitleenVanBookingStatus } from '@prisma/client';

export function formatEuro(cents: number): string {
  const euros = Math.floor(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const sign = cents < 0 ? '-' : '';
  return `${sign}€ ${euros},${rest.toString().padStart(2, '0')}`;
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

export function formatDateOnly(date: Date): string {
  return new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('nl-BE', {
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

export const VAN_HOURLY_RATE_CENTS = 750;

/** Prijs camionette: elk begonnen uur telt, met één uur als minimum. */
export function vanPriceCents(startAt: Date, endAt: Date, rateCents: number = VAN_HOURLY_RATE_CENTS): number {
  const ms = endAt.getTime() - startAt.getTime();
  if (ms <= 0) return rateCents;
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  return Math.max(1, hours) * rateCents;
}

export const RESERVATION_STATUS_LABELS: Record<UitleenReservationStatus, string> = {
  REQUESTED: 'Aangevraagd',
  APPROVED: 'Goedgekeurd',
  REJECTED: 'Afgewezen',
  CANCELLED: 'Geannuleerd',
  PICKED_UP: 'Afgehaald',
  RETURNED: 'Teruggebracht',
};

export const VAN_STATUS_LABELS: Record<UitleenVanBookingStatus, string> = {
  REQUESTED: 'Aangevraagd',
  APPROVED: 'Goedgekeurd',
  REJECTED: 'Afgewezen',
  CANCELLED: 'Geannuleerd',
  COMPLETED: 'Uitgevoerd',
};

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
