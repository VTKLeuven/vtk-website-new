/**
 * De shiften onder de herotekst: welke het worden.
 *
 * Bewust een pure module zonder database en zonder React, net als
 * `lib/calendar/heroWeek.ts`: dit is rekenwerk met kringregels erin, en dat wil
 * je kunnen testen zonder een homepage te renderen.
 */

/** Hoogstens zoveel shiften in de hero; meer maakt van de titel een prikbord. */
export const HERO_SHIFT_MAX_ROWS = 3;

/**
 * Een shift die binnen dit venster begint (of al bezig is) krijgt de gele stip.
 * Geel betekent hier hetzelfde als in het weekoverzicht: dit gaat over nu.
 */
export const HERO_SHIFT_URGENT_MS = 24 * 60 * 60 * 1000;

/** Het minimum dat een shift moet dragen om in de hero afgewogen te kunnen worden. */
export type HeroShiftInput = {
  startTime: Date;
  endTime: Date;
  maxParticipants: number;
  /** Hoeveel plaatsen er al bezet zijn. */
  takenSpots: number;
  /** Of de bezoeker zelf al ingeschreven is. */
  viewerRegistered: boolean;
};

/** Het aantal vrije plaatsen, nooit negatief. */
export function heroShiftFreeSpots(shift: Pick<HeroShiftInput, "maxParticipants" | "takenSpots">): number {
  return Math.max(0, shift.maxParticipants - shift.takenSpots);
}

/** Of deze shift de gele stip krijgt: ze begint binnen een dag, of ze is bezig. */
export function isHeroShiftUrgent(shift: Pick<HeroShiftInput, "startTime">, now: Date): boolean {
  return shift.startTime.getTime() - now.getTime() <= HERO_SHIFT_URGENT_MS;
}

/**
 * Welke shiften de hero toont.
 *
 * De regels, en waarom ze zo zijn:
 *
 * - **Enkel waar nog plaats is.** Dit blok is een oproep, geen rooster. Een
 *   volle shift zegt de bezoeker niets wat hij kan doen.
 * - **Niet wat je zelf al doet.** Dezelfde regel als `GET /api/shift`: je eigen
 *   shift is voor jou geen vacature. Op /shift staat ze gewoon bij je eigen
 *   shiften.
 * - **Wat bezig is, blijft staan.** Op einde en niet op start gefilterd: bij een
 *   shift die een uur geleden begon en nog een plaats vrij heeft, kan iemand
 *   vandaag nog iets doen.
 * - **De eerstvolgende eerst.** Ook wanneer een latere shift meer plaatsen vrij
 *   heeft: wat morgen is, is dringender dan wat over drie weken is.
 */
export function pickHeroShifts<T extends HeroShiftInput>(
  shifts: readonly T[],
  { now, limit }: { now: Date; limit: number },
): T[] {
  if (limit <= 0) return [];
  return shifts
    .filter(
      (shift) =>
        shift.endTime.getTime() > now.getTime() &&
        !shift.viewerRegistered &&
        heroShiftFreeSpots(shift) > 0,
    )
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .slice(0, limit);
}
