import type { AppLocale } from './api/contract';
import { dayKeyOf, todayKey } from './monthGrid';

/**
 * Een lijst per week, met een kop zoals op /shift en /kalender van de site:
 * "Deze week", "Volgende week", daarna het weeknummer, met het bereik ernaast
 * ("16 tot 22 november"). De weken lopen op de klok van Brussel en beginnen op
 * maandag; zie `monthGrid.ts` voor waarom alles op datumsleutels en UTC-middag
 * rekent.
 */
export type WeekGroup<T> = { key: string; name: string; range: string; items: T[] };

const DAY_MS = 24 * 60 * 60 * 1000;

function noonOf(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** De maandag van de week waarin een datumsleutel valt, als UTC-middag. */
function mondayOf(key: string): Date {
  const date = noonOf(key);
  const weekday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - weekday * DAY_MS);
}

/** ISO-weeknummer van een maandag (UTC-middag). */
function isoWeek(monday: Date): number {
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4, 12));
  const firstMonday = new Date(
    firstThursday.getTime() - ((firstThursday.getUTCDay() + 6) % 7) * DAY_MS,
  );
  return Math.round((monday.getTime() - firstMonday.getTime()) / (7 * DAY_MS)) + 1;
}

/**
 * Groepeert `items` per week op het tijdstip dat `isoOf` teruggeeft. De volgorde
 * van de items blijft; de weken staan in de volgorde waarin ze voor het eerst
 * voorkomen, dus sorteer de lijst eerst op tijd.
 */
export function groupByWeek<T>(
  items: readonly T[],
  isoOf: (item: T) => string,
  locale: AppLocale,
): WeekGroup<T>[] {
  const thisMonday = mondayOf(todayKey()).getTime();
  const tag = locale === 'en' ? 'en-GB' : 'nl-BE';
  const dayMonth = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric', month: 'long' });
  const dayOnly = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric' });

  const weeks = new Map<number, WeekGroup<T>>();
  for (const item of items) {
    const monday = mondayOf(dayKeyOf(isoOf(item)));
    let week = weeks.get(monday.getTime());
    if (!week) {
      const offset = Math.round((monday.getTime() - thisMonday) / (7 * DAY_MS));
      const sunday = new Date(monday.getTime() + 6 * DAY_MS);
      const from =
        monday.getUTCMonth() === sunday.getUTCMonth() ? dayOnly.format(monday) : dayMonth.format(monday);
      week = {
        key: String(monday.getTime()),
        name:
          offset <= 0
            ? locale === 'en'
              ? 'This week'
              : 'Deze week'
            : offset === 1
              ? locale === 'en'
                ? 'Next week'
                : 'Volgende week'
              : `Week ${isoWeek(monday)}`,
        range: `${from} ${locale === 'en' ? 'to' : 'tot'} ${dayMonth.format(sunday)}`,
        items: [],
      };
      weeks.set(monday.getTime(), week);
    }
    week.items.push(item);
  }
  return [...weeks.values()];
}
