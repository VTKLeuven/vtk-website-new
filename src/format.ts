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
