/** Monday-first month grid cells (42 days) for editorial calendar. */

import { leadMoment, NIGHT_EVENT_MAX_MS, type EventMoment } from '@/lib/calendar/moments';

export type GridDay = {
  date: Date;
  inMonth: boolean;
};

export function monthGridCells(year: number, monthIndex: number): GridDay[] {
  const first = new Date(year, monthIndex, 1);
  const startPad = mondayFirstWeekdayIndex(first);
  const start = new Date(year, monthIndex, 1 - startPad);
  const cells: GridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      date: d,
      inMonth: d.getMonth() === monthIndex,
    });
  }
  return cells;
}

/**
 * Rollend venster van `weeks` weken vanaf de maandag van de week rond `anchor`.
 * Alle dagen in dit venster zijn actief (inMonth: true).
 *
 * De agenda toont er vier. Zes weken van 132 pixels zijn hoger dan het scherm
 * van een 13-inch laptop, dus wie de kalender opendeed zag hoogstens anderhalve
 * week zonder te scrollen. Vier weken passen wel, en de week die net voorbij is
 * hoort niet in een venster dat vooruitkijkt.
 */
export function rollingWeeksGridCells(anchor: Date = new Date(), weeks = 4): GridDay[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  start.setDate(start.getDate() - mondayFirstWeekdayIndex(start));
  const cells: GridDay[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      date: d,
      inMonth: true,
    });
  }
  return cells;
}

/** De zeven kalenderdagen van de week rond `anchor`, van maandag tot zondag. */
export function weekGridDays(anchor: Date): Date[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  start.setDate(start.getDate() - mondayFirstWeekdayIndex(start));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

/** De maandag van de week waarin `date` valt, op middernacht. */
export function startOfWeek(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - mondayFirstWeekdayIndex(monday));
  return monday;
}

/**
 * Het tijdsbereik dat de kalender voor deze dagen ophaalt: van middernacht van
 * de eerste dag tot het laatste moment van de laatste, in lokale tijd.
 */
export function dayRange(days: Date[]): { start: Date; end: Date } {
  const start = new Date(days[0]!);
  start.setHours(0, 0, 0, 0);
  const end = new Date(days.at(-1)!);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Het bereik dat de kalender bij het openen toont: het maandraster rond `now`,
 * want het affichesraster is de standaardweergave. De pagina haalt precies dit
 * bereik al op de server op, zodat de eerste HTML de kaarten al bevat.
 */
export function openingRange(now: Date): { start: Date; end: Date } {
  return dayRange(monthGridCells(now.getFullYear(), now.getMonth()).map((cell) => cell.date));
}

/**
 * Welke evenementen een ophaling oplevert: het bereik, de categorie (`all` of
 * een slug) en het doelgroepfilter. De server geeft deze sleutel mee met wat hij
 * al ophaalde; de browser haalt enkel opnieuw op wanneer zijn eigen sleutel
 * afwijkt, wat bij een bezoeker in een andere tijdzone gebeurt.
 */
export function eventsRequestKey(
  range: { start: Date; end: Date },
  filter: string,
  onlyMyAudiences: boolean
): string {
  return [range.start.toISOString(), range.end.toISOString(), filter, onlyMyAudiences ? 'mine' : 'all'].join('|');
}

function mondayFirstWeekdayIndex(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Een moment zoals de kalender-API hem doorgeeft: ISO-tekst, want hij komt door
 * een JSON-antwoord. `toMoments` maakt er `Date`s van.
 */
export type CalendarMoment = { start: string; end: string; label?: string | null };

export type CalendarInterval = {
  start: string;
  end: string;
  allDay: boolean;
  /**
   * De losse momenten, wanneer het evenement er meer dan één heeft. Leeg of
   * afwezig = het evenement loopt van `start` tot `end` door.
   *
   * Dit maakt het verschil tussen een festival dat drie dagen doorloopt (één
   * balk over het rooster) en een loopweek met elke dag een loopje (een pil op
   * elke dag, met het uur van die dag).
   */
  moments?: CalendarMoment[] | null;
};

/** De momenten van een evenement als `Date`s, in volgorde. */
export function toMoments(event: CalendarInterval): EventMoment[] {
  return (event.moments ?? [])
    .map((moment) => ({
      start: new Date(moment.start),
      end: new Date(moment.end),
      label: moment.label ?? null,
    }))
    .sort((a, b) => +a.start - +b.start);
}

/**
 * De dag waarop een kaart of een lijstrij van dit evenement hoort te staan: de
 * eerstvolgende keer dat er iets is, en bij een gewoon evenement zijn start.
 *
 * Eén evenement blijft één kaart, dus die kaart moet **meeschuiven** met de
 * reeks. Een loopweek die vrijdag begon, staat op maandag nog altijd in de
 * kalender, maar dan op maandag: op de dag waarop de reeks ooit begon, zou ze in
 * een week staan die al voorbij is en dus achter de knop "toon voorbije weken"
 * verdwijnen terwijl er nog vier loopjes komen.
 *
 * Dit is dezelfde datum die in de pin van de kaart staat. Zo zeggen de kop van
 * het weekblok en de pin erin altijd hetzelfde.
 */
export function eventLeadDate(event: CalendarInterval, now: Date): Date {
  return leadMoment(toMoments(event), now)?.start ?? new Date(event.start);
}

/**
 * All-day end dates are inclusive in our CMS; timed events end exclusively.
 *
 * Evenementen die voor middernacht beginnen en erna eindigen (zoals een cantus
 * of fakparty) worden enkel over meerdere dagen weergegeven als ze langer dan
 * 12 uur duren en over meerdere dagen verspreid zijn. Kortere nachtactiviteiten
 * horen alleen bij hun startdag thuis in het raster.
 */
export function eventDayRange(event: CalendarInterval): { first: Date; last: Date } {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const lastInstant = !event.allDay && end > start ? new Date(+end - 1) : end;
  const first = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(lastInstant.getFullYear(), lastInstant.getMonth(), lastInstant.getDate());

  if (!event.allDay && last > first) {
    const durationMs = end.getTime() - start.getTime();
    if (durationMs <= NIGHT_EVENT_MAX_MS) {
      return { first, last: first };
    }
  }

  return { first, last };
}

/** De dag van een moment: dezelfde nachtregel als bij een evenement. */
function momentDayRange(moment: EventMoment): { first: Date; last: Date } {
  return eventDayRange({
    start: moment.start.toISOString(),
    end: moment.end.toISOString(),
    allDay: false,
  });
}

/**
 * Het moment dat op deze dag doorgaat, of `null`.
 *
 * Enkel het moment dat op deze dag **begint**: een nachtloop tot twee uur hoort
 * bij de avond waarop hij vertrok, niet als begin van de ochtend erna.
 */
export function momentOnDay(event: CalendarInterval, day: Date): EventMoment | null {
  return (
    toMoments(event).find((moment) => isSameCalendarDay(moment.start, day)) ?? null
  );
}

export function eventOccursOnDay(event: CalendarInterval, day: Date): boolean {
  const moments = toMoments(event);
  if (moments.length > 0) {
    // Enkel de dagen waarop er echt iets is. De dagen ertussen horen bij geen
    // enkel moment en blijven dus leeg, ook al ligt de envelop eromheen.
    return moments.some((moment) => {
      const { first, last } = momentDayRange(moment);
      return day >= first && day <= last;
    });
  }
  const { first, last } = eventDayRange(event);
  return day >= first && day <= last;
}

/**
 * Bepaalt of een evenement al volledig voorbij is.
 *
 * Bij een evenement met losse momenten: enkel voorbij wanneer het laatste moment
 * afgelopen is; zolang er nog minstens één moment bezig is of moet beginnen, is
 * het evenement actief.
 *
 * Bij een heledagevenement: voorbij na het einde van de laatste dag (23:59:59.999).
 *
 * Bij een gewoon evenement: voorbij zodra de eindtijd voorbij is.
 */
export function isEventPast(event: CalendarInterval, now: Date): boolean {
  const moments = toMoments(event);
  if (moments.length > 0) {
    return !moments.some((m) => m.end >= now);
  }
  if (event.allDay) {
    const { last } = eventDayRange(event);
    const endOfDay = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999);
    return endOfDay < now;
  }
  return new Date(event.end) < now;
}

/**
 * Loopt dit evenement over meerdere dagen **door**? Dat is wat een balk over het
 * rooster rechtvaardigt.
 *
 * Een evenement met losse momenten is dat per definitie niet: het staat als
 * gewone pil op elk van zijn dagen, met het uur van die dag erbij. Een balk van
 * maandag tot zondag zou zeggen dat er ook 's nachts en tussendoor iets is.
 */
export function isMultiDayEvent(event: CalendarInterval): boolean {
  if (event.moments?.length) return false;
  const { first, last } = eventDayRange(event);
  return last > first;
}

/** Clip bars to a week and pack overlapping spans into separate rows. */
export function weekEventSpans<T extends CalendarInterval>(events: T[], days: Date[]) {
  const spans = events
    .filter(isMultiDayEvent)
    .flatMap((event) => {
      const columns = days.flatMap((day, index) => (eventOccursOnDay(event, day) ? [index] : []));
      if (!columns.length) return [];
      const { first, last } = eventDayRange(event);
      return [
        {
          event,
          start: columns[0]!,
          end: columns.at(-1)!,
          continuesBefore: first < days[0]!,
          continuesAfter: last > days.at(-1)!,
        },
      ];
    })
    .sort((a, b) => a.start - b.start || b.end - a.end || +new Date(a.event.start) - +new Date(b.event.start));
  const occupied: number[] = [];
  return spans.map((span) => {
    let lane = occupied.findIndex((end) => end < span.start);
    if (lane < 0) lane = occupied.length;
    occupied[lane] = span.end;
    return { ...span, lane };
  });
}
