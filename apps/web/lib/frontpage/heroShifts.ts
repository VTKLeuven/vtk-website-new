import type { DisplaySlogan, SloganSize } from "@/lib/slogans";

/**
 * De shiften onder de herotekst: hoeveel er passen, en welke het worden.
 *
 * Bewust een pure module zonder database en zonder React, net als
 * `lib/calendar/heroWeek.ts`: dit is rekenwerk met kringregels erin, en dat wil
 * je kunnen testen zonder een homepage te renderen.
 *
 * ## Waarom het aantal rijen meebeweegt met de titel
 *
 * De titel is geen blok van vaste hoogte. `hero-slogan-sizer` maakt hem zo hoog
 * als de langste slogan uit /admin/slogans, en die kan van de ene dag op de
 * andere twee keer zo hoog worden; dat is precies wat er gebeurde toen de
 * slogans voor het laatst herschreven werden. Stond er dan een vast aantal
 * shiften onder, dan schoof de linkerkolom onder de agenda uit en werd de hero
 * hoger dan het scherm.
 *
 * Daarom krijgen de titel en de shiften samen één hoogtebudget: groeit de
 * titel, dan valt er een shift weg, en blijft de kolom ongeveer even hoog
 * ongeacht hoeveel regels de slogan inneemt.
 *
 * ## Waar het budget vandaan komt
 *
 * Uit de kolom ernaast. Op de breedste hero (`--max` 1240, tekstkolom 574px) is
 * het weekoverzicht met zes dagen ongeveer 645px hoog. De vaste onderdelen van
 * de linkerkolom nemen daarvan 329px: bovenschrift (19), onderregel (50),
 * knoppen (40), de kop van dit blok (24), de feitenlijn (72) en de
 * tussenruimtes (16 + 24 + 26 + 34 + 24). Blijft er 316px over voor de titel en
 * de shiftrijen samen.
 *
 * Het budget hieronder ligt bewust nog een tikje lager. De hoogte van de titel
 * wordt namelijk geschat, want de server weet niet waar de browser afbreekt, en
 * een schatting die één regel misgokt zou de kolom anders alsnog onder de agenda
 * uit duwen. Met 300 blijft er in elk geval wat lucht over, en die komt dankzij
 * `margin-top: auto` boven het blok te staan, waar ze leest als ademruimte
 * onder de knoppen in plaats van als een gat.
 *
 * Exact hoeft de schatting dus niet te zijn: ze kiest enkel tussen nul en drie
 * rijen. Een rij te weinig oogt altijd beter dan een kolom die uitsteekt.
 */

/** Hoogstens zoveel shiften in de hero; meer maakt van de titel een prikbord. */
export const HERO_SHIFT_MAX_ROWS = 3;

/**
 * De hoogte van één `.hero-shift-row` in `vtk-home.css`: 11px padding boven en
 * onder, een naam van 15/1.35 en een detailregel van 12.5/1.4 met 2px ertussen.
 * Verander je die stijlen, verander dan ook dit getal; dit is de enige plaats
 * waar de rekensom de opmaak moet kennen.
 */
export const HERO_SHIFT_ROW_PX = 62;

/** Wat de titel en de shiftrijen samen mogen innemen. Zie de kop van dit bestand. */
export const HERO_SHIFT_BUDGET_PX = 300;

/**
 * Een shift die binnen dit venster begint (of al bezig is) krijgt de gele stip.
 * Geel betekent hier hetzelfde als in het weekoverzicht: dit gaat over nu.
 */
export const HERO_SHIFT_URGENT_MS = 24 * 60 * 60 * 1000;

/** De tekengrootte per trap, op het plafond van de clamp in `vtk-home.css`. */
const TITLE_SIZE_PX: Record<SloganSize, number> = { l: 80, m: 64, s: 52 };

/** De `line-height` van de titel, dezelfde als in `vtk-home.css`. */
const TITLE_LINE_RATIO = 0.98;

/** De breedte van de tekstkolom op de breedste hero. */
const TITLE_COLUMN_PX = 574;

/**
 * De gemiddelde tekenbreedte van Inter 600 met -0.035em spatiëring, gemeten op
 * de hero zelf. Van 52 tot 80px blijft die verhouding vrijwel gelijk (0.473 tot
 * 0.485), dus één getal volstaat voor alle drie de trappen.
 */
const TITLE_CHAR_EM = 0.475;

/**
 * Een regel loopt nooit tot op de pixel vol: de browser breekt op een woordgrens
 * en laat dus gemiddeld een half woord liggen.
 */
const TITLE_WRAP_SLACK = 0.95;

/** Hoeveel tekens er bij deze trap op één titelregel passen. */
export function heroTitleCharsPerLine(size: SloganSize): number {
  const perLine = (TITLE_COLUMN_PX / (TITLE_CHAR_EM * TITLE_SIZE_PX[size])) * TITLE_WRAP_SLACK;
  return Math.max(1, Math.floor(perLine));
}

/**
 * Hoeveel regels de hoogste slogan uit de reeks beslaat.
 *
 * Het maximum over alle slogans en niet dat van de langste zin: de stapel achter
 * de `h1` is zo hoog als de hoogste, en een slogan met twee harde regelafbrekingen
 * kan hoger zijn dan een langere zin die vanzelf afbreekt.
 */
export function heroTitleLines(
  items: readonly Pick<DisplaySlogan, "lines">[],
  size: SloganSize,
): number {
  const perLine = heroTitleCharsPerLine(size);
  let most = 1;
  for (const item of items) {
    let lines = 0;
    for (const line of item.lines) {
      const length = line.reduce((sum, segment) => sum + segment.text.length, 0);
      lines += Math.max(1, Math.ceil(length / perLine));
    }
    most = Math.max(most, lines);
  }
  return most;
}

/** De geschatte hoogte van de titelstapel in pixels. */
export function heroTitleHeight(
  items: readonly Pick<DisplaySlogan, "lines">[],
  size: SloganSize,
): number {
  return Math.round(heroTitleLines(items, size) * TITLE_SIZE_PX[size] * TITLE_LINE_RATIO);
}

/**
 * Hoeveel shiftrijen er onder deze titel passen: nul tot {@link HERO_SHIFT_MAX_ROWS}.
 *
 * Nul is een geldig antwoord. Bij een titel van vier regels op de grootste trap
 * is er domweg geen plaats meer, en dan is geen blok beter dan een blok met één
 * eenzame rij die de kolom alsnog te hoog maakt.
 */
export function heroShiftRowCount(
  items: readonly Pick<DisplaySlogan, "lines">[],
  size: SloganSize,
): number {
  const left = HERO_SHIFT_BUDGET_PX - heroTitleHeight(items, size);
  if (left < HERO_SHIFT_ROW_PX) return 0;
  return Math.min(HERO_SHIFT_MAX_ROWS, Math.floor(left / HERO_SHIFT_ROW_PX));
}

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
