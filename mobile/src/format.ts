import type { AppLocale } from './api/contract';

/**
 * Datums, uren en geld, altijd in de tijdzone van Leuven.
 *
 * `Europe/Brussels` staat er expliciet bij en dat is geen detail: een toestel dat
 * op vakantie in een andere zone staat, zou anders een broodjesafhaling van 12u
 * als 13u tonen. De server stuurt ISO-tijdstippen precies zodat dit hier één keer
 * gebeurt.
 */

const TZ = 'Europe/Brussels';

function tag(locale: AppLocale): string {
  return locale === 'en' ? 'en-GB' : 'nl-BE';
}

/** "maandag 15 september" */
export function formatDay(iso: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

/** "ma 15 sep" */
export function formatDayShort(iso: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

/** "12:00" */
export function formatTime(iso: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** "12:00 - 16:00" */
export function formatTimeRange(startIso: string, endIso: string, locale: AppLocale): string {
  return `${formatTime(startIso, locale)} - ${formatTime(endIso, locale)}`;
}

/**
 * Wanneer een evenement doorgaat, in één regel. Een evenement over meerdere
 * dagen krijgt beide dagen; anders staat er "15 september 18:00 - 02:00" en lijkt
 * het alsof het diezelfde nacht al gedaan was.
 */
export function formatEventWhen(
  startIso: string,
  endIso: string,
  allDay: boolean,
  locale: AppLocale,
): string {
  const start = formatDay(startIso, locale);
  const sameDay =
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(startIso)) ===
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(endIso));

  if (allDay) {
    return sameDay ? start : `${start} tot ${formatDay(endIso, locale)}`;
  }
  if (sameDay) return `${start}, ${formatTimeRange(startIso, endIso, locale)}`;
  return `${start} ${formatTime(startIso, locale)} tot ${formatDay(endIso, locale)} ${formatTime(endIso, locale)}`;
}

/** Eurocent naar "€2,60"; zelfde notatie als `formatEuro` op de site. */
export function formatEuro(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/** "15 september", voor een ban of een deadline. */
export function formatDate(iso: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(tag(locale), {
    timeZone: TZ,
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

/**
 * De lopende klok: `1:04:32`.
 *
 * Uren zonder voorloopnul, minuten en seconden met. Dat is hoe een stopwatch
 * eruitziet, en het houdt de breedte stabiel genoeg om niet te dansen terwijl hij
 * loopt.
 */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor(safe / 60) % 60;
  const rest = safe % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${hours}:${pad(minutes)}:${pad(rest)}`;
}

/**
 * Een duur om te lezen, niet om af te tellen: `4u 32`, `18 min`, `0 min`.
 *
 * Seconden staan er bewust niet in. In een ranglijst of een dagtotaal zeggen ze
 * niets en maken ze de kolom onrustig; alleen de klok die nu loopt, telt per
 * seconde.
 */
export function formatSpan(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}u` : `${hours}u ${String(rest).padStart(2, '0')}`;
}
