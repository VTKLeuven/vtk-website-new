import type { AppCalendarEvent, AppEventMoment, AppLocale } from './api/contract';
import { dayKeyOf } from './monthGrid';

/**
 * De losse momenten van een evenement dat over meerdere dagen loopt (een
 * loopweek, drie filmavonden). De regels zijn die van de kalender op de site
 * (`lib/calendar/moments.ts`): één evenement blijft één rij, en die rij staat op
 * de eerstvolgende keer dat er iets is, niet op de dag waarop de reeks ooit
 * begon.
 *
 * Alles hier is weergave. Welk moment de affiche en de plaats levert, beslist de
 * server al (`eventAsOfNow`); de app kiest enkel welke datum er op de rij staat.
 */

const TZ = 'Europe/Brussels';

function momentsOf(event: Pick<AppCalendarEvent, 'moments'>): AppEventMoment[] {
  return event.moments ?? [];
}

/** Het eerstvolgende moment, en wanneer alles voorbij is het laatste. `null` zonder momenten. */
export function leadMoment(
  event: Pick<AppCalendarEvent, 'moments'>,
  now: Date = new Date(),
): AppEventMoment | null {
  const moments = momentsOf(event);
  if (moments.length === 0) return null;
  return moments.find((moment) => new Date(moment.end) >= now) ?? moments[moments.length - 1];
}

/** De start waarop een rij staat: het eerstvolgende moment, of de start zelf. */
export function displayStart(event: AppCalendarEvent, now: Date = new Date()): string {
  return leadMoment(event, now)?.start ?? event.start;
}

/**
 * De dagen waarop een evenement in het maandrooster hoort: elke dag met een
 * moment, of enkel de startdag voor een gewoon evenement.
 */
export function eventDayKeys(event: AppCalendarEvent): string[] {
  const moments = momentsOf(event);
  if (moments.length === 0) return [dayKeyOf(event.start)];
  return [...new Set(moments.map((moment) => dayKeyOf(moment.start)))];
}

const clock = new Intl.DateTimeFormat('nl-BE', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Wat er onder de titel van een reeks staat: "Nog 4 keer, telkens 18:00" of
 * "Nog 4 keer". `null` voor een gewoon evenement of een reeks van één.
 *
 * Bewust "telkens" en niet "elke dag", zoals op de site: de momenten hoeven niet
 * op opeenvolgende dagen te staan.
 */
export function momentsSummary(
  event: AppCalendarEvent,
  locale: AppLocale,
  now: Date = new Date(),
): string | null {
  const moments = momentsOf(event);
  if (moments.length < 2) return null;
  const upcoming = moments.filter((moment) => new Date(moment.end) >= now);
  const pool = upcoming.length > 0 ? upcoming : moments;
  const first = clock.format(new Date(pool[0].start));
  const shared = pool.every((moment) => clock.format(new Date(moment.start)) === first);
  const count =
    upcoming.length > 0
      ? locale === 'en'
        ? `${upcoming.length} more ${upcoming.length === 1 ? 'time' : 'times'}`
        : `Nog ${upcoming.length} keer`
      : locale === 'en'
        ? `${moments.length} times`
        : `${moments.length} keer`;
  return shared ? `${count}, ${locale === 'en' ? 'each time' : 'telkens'} ${first}` : count;
}
