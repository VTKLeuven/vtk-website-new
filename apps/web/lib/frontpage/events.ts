import "server-only";

import { localDateTimeToUtc } from "@/lib/ticketing/time";
import {
  HERO_WEEK_TIME_ZONE,
  heroWeekDayDate,
  heroWeekDayKey,
  type HeroWeekPlacement,
} from "@/lib/calendar/heroWeek";
import type { FrontpageEvent } from "@/components/editorial/frontpage/context";

/**
 * De evenementen die een front page krijgt, vanuit één plaats gevormd.
 *
 * De homepage en het voorbeeldscherm in /admin/frontpage renderen dezelfde
 * componenten en moeten dus dezelfde velden meegeven. Ze deden dat elk met hun
 * eigen `include` en hun eigen mapping, en dat is precies hoe een voorbeeld gaat
 * afwijken van de echte pagina.
 */

/** Wat deze module minimaal nodig heeft van een `CalendarEvent`-rij. */
export type FrontpageEventRow = {
  id: string;
  slug: string;
  start: Date;
  allDay: boolean;
  titleNl: string;
  titleEn: string | null;
  location: string | null;
  heroWeek: HeroWeekPlacement;
  group: { nameNl: string; nameEn: string };
  categories: Array<{ category: { colour: string; audience: string | null } }>;
};

/** Het `include`-blok dat bij `FrontpageEventRow` hoort. */
export const FRONTPAGE_EVENT_INCLUDE = {
  group: true,
  categories: { include: { category: true } },
} as const;

/**
 * Vanaf wanneer de homepage evenementen leest: middernacht gisteren, in
 * Brusselse tijd.
 *
 * Het weekoverzicht kan gisteren tonen wanneer daar iets stond, dus de lezing
 * moet een dag verder terug beginnen dan "nu". Alles wat daarvoor ligt, komt
 * nergens meer op de homepage.
 */
export function frontpageEventsSince(now: Date): Date {
  const yesterday = heroWeekDayDate(heroWeekDayKey(now, HERO_WEEK_TIME_ZONE));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return localDateTimeToUtc(`${yesterday.toISOString().slice(0, 10)}T00:00`, HERO_WEEK_TIME_ZONE);
}

/**
 * De kleur die het evenement op de homepage draagt.
 *
 * Een thema (Career, Sport) gaat voor op een doelgroep: de doelgroepkleur is in
 * de kalender de kleur van het label "Eerstejaars", niet van het evenement zelf.
 */
function categoryColour(row: FrontpageEventRow): string | null {
  const theme = row.categories.find((link) => link.category.audience === null);
  return (theme ?? row.categories[0])?.category.colour ?? null;
}

export function toFrontpageEvent(
  row: FrontpageEventRow,
  extras: { interestedCount: number | null; viewerInterested: boolean },
): FrontpageEvent {
  return {
    id: row.id,
    slug: row.slug,
    start: row.start,
    allDay: row.allDay,
    titleNl: row.titleNl,
    titleEn: row.titleEn,
    location: row.location,
    group: { nameNl: row.group.nameNl, nameEn: row.group.nameEn },
    interestedCount: extras.interestedCount,
    categoryColour: categoryColour(row),
    heroWeek: row.heroWeek,
    viewerInterested: extras.viewerInterested,
  };
}

/**
 * Alle rijen omzetten, met de tellers en de eigen keuzes erbij.
 *
 * `interested` bevat enkel wat boven de publieke drempel zit (zie
 * lib/calendar/interest.ts); wat er niet in staat, toont geen teller.
 */
export function toFrontpageEvents(
  rows: readonly FrontpageEventRow[],
  interested: Map<string, number>,
  viewerInterestIds: ReadonlySet<string>,
): FrontpageEvent[] {
  return rows.map((row) =>
    toFrontpageEvent(row, {
      interestedCount: interested.get(row.id) ?? null,
      viewerInterested: viewerInterestIds.has(row.id),
    }),
  );
}
