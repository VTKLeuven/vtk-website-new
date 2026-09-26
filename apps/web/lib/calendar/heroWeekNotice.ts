/**
 * Wanneer de post een herinnering krijgt over een evenement dat bijna op de
 * homepage staat.
 *
 * Het weekoverzicht in de hero toont de komende zes dagen (zaterdag valt weg,
 * zie `heroWeek.ts`). Een evenement schuift daar dus vanzelf in, en precies dan
 * wil je niet ontdekken dat het nog een concept is of dat er nog geen affiche
 * op staat: het is dan te laat om er nog iets aan te doen zonder haast.
 *
 * Deze module houdt enkel de regels bij, zonder database en zonder mail, zodat
 * ze te testen zijn zonder een homepage of een mailserver. Het versturen staat
 * in `lib/calendar/heroWeekNoticeMailer.ts`.
 *
 * De regels:
 *
 * - **Het venster is dat van de hero**, niet "vijf dagen op voorhand": hangt de
 *   hero ooit een dag verder terug of vooruit, dan schuift deze herinnering
 *   mee. Een evenement over meerdere dagen telt zodra één van zijn dagen in het
 *   venster valt.
 * - **Een concept telt mee, ook al staat het nergens.** Dat is het punt: het
 *   evenement zou in het overzicht staan als het gepubliceerd was, en de mail
 *   is de laatste duw om dat te doen.
 * - **`HIDDEN` valt weg.** Iemand heeft dat evenement bewust uit het
 *   weekoverzicht gehaald; dan is "het komt bijna op de homepage" onjuist.
 * - **Eén mail per evenement.** Staat het nog als concept én zonder banner, dan
 *   is dat één mail met twee punten. Wie daarna de banner toevoegt maar het
 *   concept laat staan, krijgt geen tweede; twee herinneringen voor hetzelfde
 *   evenement lezen als spam en dan wordt ook de eerste genegeerd.
 * - **Voorbij is voorbij.** Een evenement dat al afgelopen is, krijgt niets
 *   meer: het venster kan gisteren tonen, maar daar valt niets meer te redden.
 */

import {
  HERO_WEEK_TIME_ZONE,
  heroWeekDayKeys,
  heroWeekEventDays,
  type HeroWeekMoment,
  type HeroWeekPlacement,
} from "./heroWeek";

/** Wat er aan dit evenement nog ontbreekt. */
export type HeroWeekNoticeReason = "draft" | "banner";

/** Het minimum dat een evenement moet dragen om beoordeeld te kunnen worden. */
export type HeroWeekNoticeInput = {
  id: string;
  start: Date;
  end: Date;
  allDay: boolean;
  heroWeek: HeroWeekPlacement;
  moments?: readonly HeroWeekMoment[];
  /** `null` = concept. */
  publishedAt: Date | null;
  /** `null` = nog geen eigen banner; de kalender toont dan de standaardfoto. */
  imageKey: string | null;
  /** Wanneer de post hier al een mail over kreeg. */
  heroWeekNoticeAt: Date | null;
};

/**
 * De openstaande punten van dit evenement, in de volgorde waarin ze in de mail
 * staan. Leeg = er is niets aan de hand.
 */
export function heroWeekNoticeReasons(
  event: Pick<HeroWeekNoticeInput, "publishedAt" | "imageKey">,
): HeroWeekNoticeReason[] {
  const reasons: HeroWeekNoticeReason[] = [];
  // Het concept eerst: zonder publiceren haalt een banner niets uit.
  if (!event.publishedAt) reasons.push("draft");
  if (!event.imageKey) reasons.push("banner");
  return reasons;
}

/** Komt dit evenement binnen het venster van het weekoverzicht? */
export function inHeroWeekWindow(
  event: Pick<HeroWeekNoticeInput, "start" | "end" | "allDay" | "moments" | "heroWeek">,
  now: Date,
  timeZone = HERO_WEEK_TIME_ZONE,
): boolean {
  if (event.heroWeek === "HIDDEN") return false;
  // Zonder gisteren: het gaat om wat eraan komt, niet om wat geweest is.
  // Een zondag telt mee wanneer dit evenement er zelf op staat; de andere
  // evenementen kennen we hier niet, dus een lege zondag wordt aangenomen en
  // het venster loopt dan een dag verder, net als op de homepage.
  const days = heroWeekEventDays(event, timeZone);
  const window = new Set(
    heroWeekDayKeys(now, {
      includeYesterday: false,
      timeZone,
      keepSunday: (key) => days.includes(key),
    }),
  );
  return days.some((day) => window.has(day));
}

/**
 * Verdient dit evenement nu een herinnering? Alles samen: het venster, de
 * openstaande punten, en of er al eens een mail voor vertrok.
 */
export function needsHeroWeekNotice(
  event: HeroWeekNoticeInput,
  now: Date,
  timeZone = HERO_WEEK_TIME_ZONE,
): boolean {
  if (event.heroWeekNoticeAt) return false;
  if (event.end.getTime() < now.getTime()) return false;
  if (heroWeekNoticeReasons(event).length === 0) return false;
  return inHeroWeekWindow(event, now, timeZone);
}
