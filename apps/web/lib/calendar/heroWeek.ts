/**
 * Welke dagen en welke evenementen het weekoverzicht in de hero toont.
 *
 * Bewust een pure module zonder database en zonder React: dit zijn de regels van
 * de kring, en die wil je kunnen testen zonder een homepage te renderen. De
 * lezing zelf gebeurt in `HomeEditorial`, het tekenen in `DefaultFrontpage`.
 *
 * De regels, en waarom ze zo zijn (zie ook docs/design-decisions.md):
 *
 * - **De komende zeven dagen, niet verder.** Het venster is vandaag plus zes
 *   kalenderdagen. Wat daarbuiten valt, staat er niet, ook niet wanneer het
 *   weekend er rijen uit haalt: op zaterdag eindigt het op vrijdag, en de
 *   maandag erna komt er pas dinsdag bij. Een venster dat doorschoof tot er zes
 *   rijen stonden, toonde op zaterdag al de maandag van volgende week, en dat
 *   las als "deze week" terwijl het dat niet was.
 * - **Zaterdag valt weg.** VTK organiseert er nooit iets, dus een zaterdagkolom
 *   is een lege kolom. Staat er toch iets op een zaterdag, dan valt het uit het
 *   overzicht; het blijft wel gewoon in de kalender staan.
 * - **Een lege zondag valt ook weg.** Op zondag gebeurt er soms iets (de
 *   Onthaaldagen beginnen er), maar meestal niet, en dan is het net zo goed een
 *   lege rij. Zonder evenement wordt hij overgeslagen zoals zaterdag; met een
 *   evenement staat hij er gewoon. Een lege weekdag blijft wel staan: dat er
 *   dinsdag niets is, is ook iets om te weten.
 * - **Het venster rolt mee.** Een vaste week (maandag tot zondag) staat op
 *   vrijdagavond zo goed als leeg, terwijl er dan net het meest te beleven valt.
 * - **Vandaag staat bovenaan en wordt volledig getoond.** Wie op de homepage
 *   kijkt, kijkt in de eerste plaats naar vandaag: dat die dag onderaan zijn
 *   derde evenement afkapt terwijl er volgende week nog rijen vrij zijn, is de
 *   omgekeerde wereld. De rijen worden daarom verdeeld in de volgorde vandaag,
 *   morgen, overmorgen, ... en gisteren als laatste. Vandaag en morgen kennen
 *   geen dagkap; loopt het totaal vol, dan geeft de laatste dag van het venster
 *   zijn rijen af.
 * - **Gisteren blijft staan zolang er iets was en er plaats is.** Anders
 *   verdwijnt een cantus van gisteren om middernacht van de homepage, terwijl de
 *   halve kring er de dag erna nog over praat. Maar gisteren is wel het minst
 *   belangrijke: hij komt er enkel bij wanneer de dagen vanaf vandaag het
 *   overzicht niet vol krijgen, en dan in de plaats die het weekend vrijliet of
 *   in die van een lege laatste dag. Meer dan zes dagen worden het nooit.
 * - **Bij een rustige week toont het de eerstvolgende evenementen.** Zes dagen
 *   met twee dingen erin leest als een lege kring; dan is een korte lijst met wat
 *   er wél aankomt eerlijker, ook al is dat pas over drie weken. Hoeveel die
 *   lijst maximaal toont, komt uit de Frontpage-instelling.
 * - **Hoogstens drie per dag en tien in totaal.** De hero staat naast de titel en
 *   mag niet met de drukte meegroeien tot een scherm vol. Vandaag en morgen
 *   vallen buiten die dagkap (zie hierboven); het totaal van tien geldt wel voor
 *   iedereen, want dat is de hoogte van het blok.
 * - **Een evenement over meerdere dagen staat op elke dag.** Met dezelfde
 *   dagregels als het kalenderrooster (zie `heroWeekEventRange`). Voor de drempel
 *   van vier telt het één keer.
 * - **Een evenement met losse momenten staat op de dagen van zijn momenten.** Een
 *   loopweek met elke dag een loopje is één evenement, maar geen blok dat een week
 *   lang doorloopt: het staat enkel op de dagen waarop er echt iets is, telkens
 *   met het uur van dat moment. Zie `CalendarEventMoment`.
 * - **Een eerste rij gaat voor op een herhaling.** De kappen bewaken de hoogte van
 *   het blok, dus ze blijven gelden; maar een evenement dat zes dagen duurt, mag de
 *   andere evenementen van de week niet van de homepage duwen. Daarom worden eerst
 *   alle eerste rijen verdeeld en pas daarna de herhalingen.
 */

import { NIGHT_EVENT_MAX_MS, type EventMoment } from "./moments";

export const HERO_WEEK_TIME_ZONE = "Europe/Brussels";

/**
 * Aantal kalenderdagen in het venster, vandaag inbegrepen. Zaterdag en een lege
 * zondag vallen er daarna uit, dus er staan er meestal vijf of zes.
 */
export const HERO_WEEK_DAYS = 7;

/**
 * Hoogstens zoveel evenementen per dag; de rest wordt "+n meer".
 *
 * Vandaag en morgen zijn hiervan uitgezonderd: die willen we volledig tonen, en
 * enkel het totaal hieronder houdt ze tegen.
 */
export const HERO_WEEK_MAX_PER_DAY = 3;

/** Hoogstens zoveel rijen in het hele overzicht. */
export const HERO_WEEK_MAX_TOTAL = 10;

/**
 * Vanaf zoveel evenementen in het venster toont de hero het venster zelf.
 * Daaronder wordt het de lijst met de eerstvolgende evenementen, en dan zijn dit
 * er ook precies zoveel.
 */
export const HERO_WEEK_MIN_FOR_WINDOW = 4;

/**
 * De rustige-weeklijst vult de ruimte naast de herotekst tot aan de feitenlijn.
 * Zeven rijen met de gewone ademruimte passen daar op desktop; meer zou de lijn
 * voorbij lopen.
 * Een redacteur kan het aantal verlagen in Admin → Website → Frontpage.
 */
export const HERO_WEEK_NEXT_LIMIT_DEFAULT = 7;
export const HERO_WEEK_NEXT_LIMIT_MIN = HERO_WEEK_MIN_FOR_WINDOW;
export const HERO_WEEK_NEXT_LIMIT_MAX = 7;

/** Zie de gelijknamige enum in schema.prisma. */
export type HeroWeekPlacement = "AUTO" | "PINNED" | "HIDDEN";

/** Eén moment van een evenement; zie `CalendarEventMoment` in het schema. */
export type HeroWeekMoment = EventMoment;

/** Het minimum dat een evenement moet dragen om ingedeeld te kunnen worden. */
export type HeroWeekInput = {
  id: string;
  start: Date;
  /** Bij een heledagevenement is de einddag inclusief; zie `heroWeekEventRange`. */
  end: Date;
  allDay: boolean;
  heroWeek: HeroWeekPlacement;
  /**
   * De losse momenten, wanneer het evenement er meer dan één heeft. Leeg of
   * afwezig = het evenement loopt van `start` tot `end` door, zoals altijd.
   */
  moments?: readonly HeroWeekMoment[];
};

/** Eén evenement op één dag van het overzicht. */
export type HeroWeekEntry<T> = {
  event: T;
  /** De hoeveelste dag van het evenement dit is, vanaf 1. */
  day: number;
  /** Over hoeveel dagen het evenement loopt; 1 voor een gewoon evenement. */
  days: number;
  /**
   * Of hetzelfde evenement al op een eerdere rij van dit overzicht staat. Een
   * evenement over drie dagen blijft één evenement.
   */
  repeat: boolean;
  /**
   * Het moment dat op deze dag doorgaat, bij een evenement met losse momenten.
   * `null` bij een gewoon evenement: dan staat het uur op het evenement zelf.
   * Hiermee toont elke rij het uur van díé dag in plaats van "dag 3 van 7".
   */
  moment: HeroWeekMoment | null;
};

export type HeroWeekDay<T> = {
  /** "2026-09-13", de dag in Brussel. Ook de React-key van de rij. */
  key: string;
  /** Middag UTC op die dag, puur om te formatteren; nooit om mee te rekenen. */
  date: Date;
  events: Array<HeroWeekEntry<T>>;
  /** Hoeveel er die dag niet getoond worden, door de kap per dag of het totaal. */
  more: number;
};

export type HeroWeekSelection<T> = {
  /** `window` = de rollende dagen, `next` = de eerstvolgende evenementen. */
  mode: "window" | "next";
  days: Array<HeroWeekDay<T>>;
  /** Aantal getoonde rijen, na beide kappen. Drie dagen van één evenement zijn drie rijen. */
  total: number;
};

/**
 * De kalenderdag in Brussel als "YYYY-MM-DD".
 *
 * Via `Intl` en niet via `getDate()`: de server draait niet noodzakelijk in
 * dezelfde zone als de kring, en dan zou een evenement van 00:30 op de vorige
 * dag belanden. Dezelfde reden waarom lib/ticketing/time.ts bestaat.
 */
export function heroWeekDayKey(date: Date, timeZone = HERO_WEEK_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Een dagsleutel als `Date` op middag UTC.
 *
 * Middag en niet middernacht: op middernacht ligt de datum in Brussel bij een
 * zomeruurwissel net op de rand, en dan formatteert dezelfde sleutel als de dag
 * ervoor. Deze datum dient enkel om een dagnaam en een dagnummer uit te lezen.
 */
export function heroWeekDayDate(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

function shiftDayKey(key: string, days: number): string {
  const date = heroWeekDayDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Zaterdag, in de zin van "de dag waarop de kring nooit iets doet". */
export function isHeroWeekSkippedDay(key: string): boolean {
  return heroWeekDayDate(key).getUTCDay() === 6;
}

/** Zondag: die staat enkel in het overzicht wanneer er die dag iets gepland is. */
export function isHeroWeekSunday(key: string): boolean {
  return heroWeekDayDate(key).getUTCDay() === 0;
}

/**
 * De eerste en de laatste dag van een evenement in Brussel, als dagsleutels.
 *
 * Dezelfde regels als het kalenderrooster, zodat een evenement in de hero op
 * dezelfde dagen staat als op /kalender:
 *
 * - Bij een heledagevenement is de einddag **inclusief**: Onthaaldagen van 13 tot
 *   15 september staan ook op de 15de. De ICS-feed telt er om dezelfde reden een
 *   dag bij.
 * - Een evenement met uren eindigt **exclusief**: wat om middernacht stopt, staat
 *   niet ook op de dag erna.
 * - Een nachtactiviteit van hoogstens twaalf uur (een cantus tot drie uur) hoort
 *   enkel bij haar startdag, anders staat ze de ochtend erna nog eens in het
 *   overzicht.
 */
export function heroWeekEventRange(
  event: Pick<HeroWeekInput, "start" | "end" | "allDay">,
  timeZone = HERO_WEEK_TIME_ZONE,
): { first: string; last: string } {
  const first = heroWeekDayKey(event.start, timeZone);
  let last = first;
  if (event.allDay) {
    last = heroWeekDayKey(event.end, timeZone);
  } else if (event.end.getTime() - event.start.getTime() > NIGHT_EVENT_MAX_MS) {
    last = heroWeekDayKey(new Date(event.end.getTime() - 1), timeZone);
  }
  // Een einde vóór de start is een invoerfout; dan telt enkel de startdag.
  return { first, last: last < first ? first : last };
}

/**
 * De dagen van het venster, in volgorde.
 *
 * Zeven kalenderdagen vanaf vandaag, of vanaf gisteren wanneer daar iets stond.
 * Zaterdagen vallen eruit, ook als startdag: wie op zaterdag langskomt, ziet het
 * venster vanaf zondag. Het venster schuift niet verder om dat goed te maken:
 * op zaterdag loopt het tot en met vrijdag.
 *
 * Een zondag telt enkel mee wanneer `keepSunday` zegt dat er die dag iets is.
 * Zonder die functie blijft elke zondag staan: deze functie kent de evenementen
 * niet, dat doet de oproeper.
 */
export function heroWeekDayKeys(
  now: Date,
  options: {
    includeYesterday?: boolean;
    timeZone?: string;
    keepSunday?: (key: string) => boolean;
  } = {},
): string[] {
  const timeZone = options.timeZone ?? HERO_WEEK_TIME_ZONE;
  const keepSunday = options.keepSunday ?? (() => true);
  const skipped = (key: string) =>
    isHeroWeekSkippedDay(key) || (isHeroWeekSunday(key) && !keepSunday(key));
  const today = heroWeekDayKey(now, timeZone);
  const yesterday = shiftDayKey(today, -1);

  // Gisteren als startdag heeft alleen zin wanneer die dag zelf getoond kan
  // worden. Was gisteren een zaterdag of een lege zondag, dan valt hij weg.
  const start = options.includeYesterday && !skipped(yesterday) ? yesterday : today;

  const keys: string[] = [];
  for (let offset = 0; offset < HERO_WEEK_DAYS; offset += 1) {
    const cursor = shiftDayKey(start, offset);
    if (!skipped(cursor)) keys.push(cursor);
  }
  return keys;
}

/**
 * Alle dagen waarop een evenement in het overzicht hoort, in volgorde.
 *
 * Zonder momenten is dat de reeks van `heroWeekEventRange`: elke dag van de
 * eerste tot en met de laatste. Met momenten zijn het enkel de dagen waarop er
 * echt iets is, en dat is precies het verschil tussen een loopweek en een
 * evenement dat een week lang doorloopt. Elk moment volgt daarbij dezelfde
 * dagregels als een evenement, dus een nachtloop van 22u tot 2u hoort bij de dag
 * waarop hij vertrekt.
 */
export function heroWeekEventDays(
  event: Pick<HeroWeekInput, "start" | "end" | "allDay" | "moments">,
  timeZone = HERO_WEEK_TIME_ZONE,
): string[] {
  const ranges = event.moments?.length
    ? event.moments.map((moment) =>
        heroWeekEventRange({ start: moment.start, end: moment.end, allDay: false }, timeZone),
      )
    : [heroWeekEventRange(event, timeZone)];

  const keys = new Set<string>();
  for (const { first, last } of ranges) {
    for (let cursor = first; cursor <= last; cursor = shiftDayKey(cursor, 1)) keys.add(cursor);
  }
  return [...keys].sort();
}

/** Een evenement met de dagen waarop het staat erbij. */
type Ranged<T> = { event: T; days: string[] };

function occursOn<T>(item: Ranged<T>, key: string): boolean {
  return item.days.includes(key);
}

/**
 * Het moment dat op deze dag doorgaat. `null` bij een evenement zonder momenten,
 * en ook wanneer een moment over middernacht loopt en deze dag dus enkel zijn
 * staart is: het uur van gisteravond hoort niet als begin van vandaag te lezen.
 */
function momentOn<T extends HeroWeekInput>(
  event: T,
  key: string,
  timeZone: string,
): HeroWeekMoment | null {
  if (!event.moments?.length) return null;
  return (
    event.moments.find((moment) => heroWeekDayKey(moment.start, timeZone) === key) ?? null
  );
}

function entryOn<T extends HeroWeekInput>(
  item: Ranged<T>,
  key: string,
  repeat: boolean,
  timeZone: string,
): HeroWeekEntry<T> {
  return {
    event: item.event,
    day: item.days.indexOf(key) + 1,
    days: item.days.length,
    repeat,
    moment: momentOn(item.event, key, timeZone),
  };
}

/**
 * Uitgelicht eerst, daarna gewoon op uur. Gelijke uren houden hun volgorde.
 *
 * Bij een evenement met momenten telt het uur van het moment op díé dag: anders
 * zou een loopweek die maandag begon, de hele week bovenaan elke dag staan omdat
 * zijn eerste moment het vroegste is.
 */
function byPlacementThenStart<T extends HeroWeekInput>(
  key: string,
  timeZone: string,
): (a: Ranged<T>, b: Ranged<T>) => number {
  const startOn = (item: Ranged<T>) =>
    (momentOn(item.event, key, timeZone) ?? item.event).start.getTime();
  return (a, b) => {
    if (a.event.heroWeek !== b.event.heroWeek) {
      if (a.event.heroWeek === "PINNED") return -1;
      if (b.event.heroWeek === "PINNED") return 1;
    }
    return startOn(a) - startOn(b);
  };
}

/**
 * Wat de hero toont, uit een lijst evenementen die al op zichtbaarheid en
 * doelgroep gefilterd is.
 *
 * De oproeper geeft alles mee wat na het begin van gisteren eindigt, op start
 * gesorteerd. Deze functie beslist de rest: welke dagen, welke evenementen, en
 * of het venster überhaupt genoeg te tonen heeft.
 */
export function selectHeroWeek<T extends HeroWeekInput>(
  events: readonly T[],
  now: Date,
  options: { timeZone?: string; nextLimit?: number } = {},
): HeroWeekSelection<T> {
  const timeZone = options.timeZone ?? HERO_WEEK_TIME_ZONE;
  const requestedNextLimit = Math.floor(
    options.nextLimit ?? HERO_WEEK_NEXT_LIMIT_DEFAULT,
  );
  const nextLimit = Number.isFinite(requestedNextLimit)
    ? Math.min(
        HERO_WEEK_NEXT_LIMIT_MAX,
        Math.max(HERO_WEEK_NEXT_LIMIT_MIN, requestedNextLimit),
      )
    : HERO_WEEK_NEXT_LIMIT_DEFAULT;
  const visible: Array<Ranged<T>> = events
    .filter((event) => event.heroWeek !== "HIDDEN")
    .map((event) => ({ event, days: heroWeekEventDays(event, timeZone) }));
  const today = heroWeekDayKey(now, timeZone);
  const yesterday = shiftDayKey(today, -1);

  // Het venster begint vandaag; gisteren komt er pas achteraf bij, wanneer
  // blijkt dat er plaats over is. Een zondag zonder evenement valt weg; het
  // venster loopt daarom niet verder dan zeven dagen.
  const futureKeys = heroWeekDayKeys(now, {
    includeYesterday: false,
    timeZone,
    keepSunday: (key) => visible.some((item) => occursOn(item, key)),
  });

  // Gisteren telt enkel voor wat er gisteren ophield. Wat vandaag nog loopt,
  // staat vandaag al in het overzicht; zonder die uitzondering zou een
  // tentoonstelling van een maand het venster elke dag laten terugkijken.
  const yesterdayFits =
    !isHeroWeekSkippedDay(yesterday) && visible.some((item) => item.days.at(-1) === yesterday);
  const windowKeys = yesterdayFits ? [yesterday, ...futureKeys] : futureKeys;

  // Per evenement en niet per rij: Onthaaldagen over drie dagen is één
  // evenement, en drie rijen ervan maken nog geen drukke week.
  const inWindow = visible.filter((item) =>
    windowKeys.some((key) => occursOn(item, key)),
  ).length;

  // Precies vier is genoeg om het venster te vullen; pas daaronder wordt het de
  // lijst. Het aantal rijen in die lijst is apart instelbaar: de drempel beslist
  // over de vorm, de limiet enkel over hoeveel komende evenementen erin passen.
  if (inWindow < HERO_WEEK_MIN_FOR_WINDOW) {
    // Wat nog loopt, hoort erbij en staat op vandaag: een evenement dat zondag
    // begon en tot dinsdag duurt, is op maandag geen verleden. Bij een evenement
    // met momenten is dat de dag van het eerstvolgende moment; de dagen ertussen
    // zijn dan leeg en hebben hier niets te zoeken.
    const next = visible
      .filter((item) => item.days.at(-1)! >= today)
      .map((item) => ({ item, key: item.days.find((day) => day >= today) ?? item.days[0]! }))
      .sort(
        (a, b) =>
          a.key.localeCompare(b.key) ||
          (momentOn(a.item.event, a.key, timeZone) ?? a.item.event).start.getTime() -
            (momentOn(b.item.event, b.key, timeZone) ?? b.item.event).start.getTime(),
      )
      .slice(0, nextLimit);

    const days: Array<HeroWeekDay<T>> = [];
    for (const { item, key } of next) {
      const entry = entryOn(item, key, false, timeZone);
      const last = days[days.length - 1];
      if (last && last.key === key) last.events.push(entry);
      else days.push({ key, date: heroWeekDayDate(key), events: [entry], more: 0 });
    }
    return { mode: "next", days, total: next.length };
  }

  // Wat er die dag te kiezen valt, in de volgorde waarin het getoond wordt.
  const candidates = new Map<string, Array<Ranged<T>>>(
    windowKeys.map((key) => [
      key,
      visible.filter((item) => occursOn(item, key)).sort(byPlacementThenStart(key, timeZone)),
    ]),
  );
  const chosen = new Map<string, Set<string>>(windowKeys.map((key) => [key, new Set<string>()]));

  let budget = HERO_WEEK_MAX_TOTAL;
  const anchored = new Set<string>();

  /**
   * Vult één dag met wat er nog in het budget past.
   *
   * Twee rondes, en dat is de hele reden dat dit geen lus is: eerst krijgt elk
   * evenement zijn eerste rij, daarna vullen de herhalingen aan met wat er
   * overblijft. Anders neemt een evenement dat zes dagen duurt in één ronde zes
   * van de tien rijen en verdwijnt de rest van de week van de homepage.
   */
  const fill = (key: string, pass: "first" | "repeat", cap: number) => {
    const picked = chosen.get(key)!;
    for (const item of candidates.get(key)!) {
      if (budget <= 0) return;
      if (picked.size >= cap) return;
      const id = item.event.id;
      if (picked.has(id)) continue;
      if (pass === "first" ? anchored.has(id) : !anchored.has(id)) continue;
      picked.add(id);
      anchored.add(id);
      budget -= 1;
    }
  };

  // Vandaag en morgen eerst, en allebei in één keer volledig: zij zijn waarvoor
  // iemand het overzicht leest. De dagkap geldt hier niet, het totaal wel.
  const [todayKey, tomorrowKey, ...laterKeys] = futureKeys;
  for (const key of [todayKey, tomorrowKey]) {
    if (!key) continue;
    fill(key, "first", Number.POSITIVE_INFINITY);
    fill(key, "repeat", Number.POSITIVE_INFINITY);
  }
  // Wat overblijft gaat naar de dagen erna, van dichtbij naar veraf: loopt het
  // totaal vol, dan is het de laatste dag van het venster die rijen mist.
  for (const pass of ["first", "repeat"] as const) {
    for (const key of laterKeys) {
      if (budget <= 0) break;
      fill(key, pass, HERO_WEEK_MAX_PER_DAY);
    }
  }

  // En pas dan gisteren, en enkel wanneer hij niets verdringt: er moet nog een
  // rij over zijn, en ofwel liet het weekend een dag vrij (minder dan zes
  // dagen), ofwel staat de laatste dag van het venster leeg en geeft die zijn
  // plaats af. Zo wordt het blok nooit hoger dan zes dagen.
  let keys = futureKeys;
  const lastKey = futureKeys[futureKeys.length - 1];
  const spareDay = futureKeys.length < HERO_WEEK_DAYS - 1;
  const emptyLast = Boolean(lastKey) && chosen.get(lastKey!)!.size === 0;
  if (yesterdayFits && budget > 0 && (spareDay || emptyLast)) {
    fill(yesterday, "first", HERO_WEEK_MAX_PER_DAY);
    fill(yesterday, "repeat", HERO_WEEK_MAX_PER_DAY);
    if (chosen.get(yesterday)!.size > 0) {
      keys = spareDay ? [yesterday, ...futureKeys] : [yesterday, ...futureKeys.slice(0, -1)];
    }
  }

  const shownIds = new Set<string>();
  const days = keys.map((key) => {
    const all = candidates.get(key)!;
    const picked = chosen.get(key)!;
    const shown = all.filter((item) => picked.has(item.event.id));
    return {
      key,
      date: heroWeekDayDate(key),
      // Een herhaling is pas een herhaling als de vorige rij ook echt getoond
      // werd; viel de eerste dag weg door de kap, dan is de volgende de eerste.
      events: shown.map((item) => {
        const entry = entryOn(item, key, shownIds.has(item.event.id), timeZone);
        shownIds.add(item.event.id);
        return entry;
      }),
      more: all.length - shown.length,
    };
  });

  return { mode: "window", days, total: HERO_WEEK_MAX_TOTAL - budget };
}
