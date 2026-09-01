/**
 * Welke dagen en welke evenementen het weekoverzicht in de hero toont.
 *
 * Bewust een pure module zonder database en zonder React: dit zijn de regels van
 * de kring, en die wil je kunnen testen zonder een homepage te renderen. De
 * lezing zelf gebeurt in `HomeEditorial`, het tekenen in `DefaultFrontpage`.
 *
 * De regels, en waarom ze zo zijn (zie ook docs/design-decisions.md):
 *
 * - **Zaterdag valt weg.** VTK organiseert er nooit iets, dus een zaterdagkolom
 *   is een lege kolom. Staat er toch iets op een zaterdag, dan valt het uit het
 *   overzicht; het blijft wel gewoon in de kalender staan.
 * - **Het venster rolt mee.** Een vaste week (maandag tot zondag) staat op
 *   vrijdagavond zo goed als leeg, terwijl er dan net het meest te beleven valt.
 * - **Gisteren blijft staan zolang er iets was.** Anders verdwijnt een cantus van
 *   gisteren om middernacht van de homepage, terwijl de halve kring er de dag
 *   erna nog over praat. Was er gisteren niets, dan begint het venster vandaag en
 *   kijkt het een dag verder vooruit.
 * - **Bij een rustige week toont het de eerstvolgende evenementen.** Zes dagen
 *   met twee dingen erin leest als een lege kring; dan is een korte lijst met wat
 *   er wél aankomt eerlijker, ook al is dat pas over drie weken. Hoeveel die
 *   lijst maximaal toont, komt uit de Frontpage-instelling.
 * - **Hoogstens drie per dag en tien in totaal.** De hero staat naast de titel en
 *   mag niet met de drukte meegroeien tot een scherm vol.
 */

export const HERO_WEEK_TIME_ZONE = "Europe/Brussels";

/** Aantal dagen in het venster, zaterdagen niet meegeteld. */
export const HERO_WEEK_DAYS = 6;

/** Hoogstens zoveel evenementen per dag; de rest wordt "+n meer". */
export const HERO_WEEK_MAX_PER_DAY = 3;

/** Hoogstens zoveel evenementen in het hele overzicht. */
export const HERO_WEEK_MAX_TOTAL = 10;

/**
 * Vanaf zoveel evenementen in het venster toont de hero het venster zelf.
 * Daaronder wordt het de lijst met de eerstvolgende evenementen, en dan zijn dit
 * er ook precies zoveel.
 */
export const HERO_WEEK_MIN_FOR_WINDOW = 4;

/**
 * De rustige-weeklijst vult de ruimte naast de herotekst tot aan de feitenlijn.
 * Acht compacte rijen passen daar op desktop; meer zou de lijn voorbij lopen.
 * Een redacteur kan het aantal verlagen in Admin → Website → Frontpage.
 */
export const HERO_WEEK_NEXT_LIMIT_DEFAULT = 8;
export const HERO_WEEK_NEXT_LIMIT_MIN = HERO_WEEK_MIN_FOR_WINDOW;
export const HERO_WEEK_NEXT_LIMIT_MAX = 8;

/** Zie de gelijknamige enum in schema.prisma. */
export type HeroWeekPlacement = "AUTO" | "PINNED" | "HIDDEN";

/** Het minimum dat een evenement moet dragen om ingedeeld te kunnen worden. */
export type HeroWeekInput = {
  id: string;
  start: Date;
  heroWeek: HeroWeekPlacement;
};

export type HeroWeekDay<T> = {
  /** "2026-09-13", de dag in Brussel. Ook de React-key van de rij. */
  key: string;
  /** Middag UTC op die dag, puur om te formatteren; nooit om mee te rekenen. */
  date: Date;
  events: T[];
  /** Hoeveel er die dag niet getoond worden, door de kap per dag of het totaal. */
  more: number;
};

export type HeroWeekSelection<T> = {
  /** `window` = de rollende dagen, `next` = de eerstvolgende evenementen. */
  mode: "window" | "next";
  days: Array<HeroWeekDay<T>>;
  /** Aantal getoonde evenementen, na beide kappen. */
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

/**
 * De dagen van het venster, in volgorde.
 *
 * Begint gisteren wanneer daar iets stond, anders vandaag, en telt vooruit tot
 * er zes dagen zijn. Zaterdagen worden overgeslagen en tellen dus niet mee, ook
 * niet als startdag: wie op zaterdag langskomt, ziet het venster van zondag.
 */
export function heroWeekDayKeys(
  now: Date,
  options: { includeYesterday?: boolean; timeZone?: string } = {},
): string[] {
  const timeZone = options.timeZone ?? HERO_WEEK_TIME_ZONE;
  const today = heroWeekDayKey(now, timeZone);
  const yesterday = shiftDayKey(today, -1);

  // Gisteren als startdag heeft alleen zin wanneer die dag zelf getoond kan
  // worden. Was gisteren een zaterdag, dan valt hij hoe dan ook weg.
  const start =
    options.includeYesterday && !isHeroWeekSkippedDay(yesterday) ? yesterday : today;

  const keys: string[] = [];
  for (let cursor = start; keys.length < HERO_WEEK_DAYS; cursor = shiftDayKey(cursor, 1)) {
    if (!isHeroWeekSkippedDay(cursor)) keys.push(cursor);
  }
  return keys;
}

/** Uitgelicht eerst, daarna gewoon op uur. Gelijke uren houden hun volgorde. */
function byPlacementThenStart<T extends HeroWeekInput>(a: T, b: T): number {
  if (a.heroWeek !== b.heroWeek) {
    if (a.heroWeek === "PINNED") return -1;
    if (b.heroWeek === "PINNED") return 1;
  }
  return a.start.getTime() - b.start.getTime();
}

/**
 * Wat de hero toont, uit een lijst evenementen die al op zichtbaarheid en
 * doelgroep gefilterd is.
 *
 * De oproeper geeft alles mee vanaf het begin van gisteren, chronologisch. Deze
 * functie beslist de rest: welke dagen, welke evenementen, en of het venster
 * überhaupt genoeg te tonen heeft.
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
  const visible = events.filter((event) => event.heroWeek !== "HIDDEN");
  const today = heroWeekDayKey(now, timeZone);
  const yesterday = shiftDayKey(today, -1);

  const byDay = new Map<string, T[]>();
  for (const event of visible) {
    const key = heroWeekDayKey(event.start, timeZone);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(event);
    else byDay.set(key, [event]);
  }

  const keys = heroWeekDayKeys(now, {
    includeYesterday: (byDay.get(yesterday)?.length ?? 0) > 0,
    timeZone,
  });

  const inWindow = keys.reduce((sum, key) => sum + (byDay.get(key)?.length ?? 0), 0);

  // Precies vier is genoeg om het venster te vullen; pas daaronder wordt het de
  // lijst. Het aantal rijen in die lijst is apart instelbaar: de drempel beslist
  // over de vorm, de limiet enkel over hoeveel komende evenementen erin passen.
  if (inWindow < HERO_WEEK_MIN_FOR_WINDOW) {
    const next = visible
      .filter((event) => heroWeekDayKey(event.start, timeZone) >= today)
      .slice()
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, nextLimit);

    const days: Array<HeroWeekDay<T>> = [];
    for (const event of next) {
      const key = heroWeekDayKey(event.start, timeZone);
      const last = days[days.length - 1];
      if (last && last.key === key) last.events.push(event);
      else days.push({ key, date: heroWeekDayDate(key), events: [event], more: 0 });
    }
    return { mode: "next", days, total: next.length };
  }

  let budget = HERO_WEEK_MAX_TOTAL;
  const days = keys.map((key) => {
    const all = (byDay.get(key) ?? []).slice().sort(byPlacementThenStart);
    // Eerst de kap per dag, dan pas het totaal: zo raakt een drukke maandag nooit
    // de vrijdag kwijt, en houdt het totaal de dagen in volgorde.
    const room = Math.min(HERO_WEEK_MAX_PER_DAY, budget);
    const shown = all.slice(0, Math.max(room, 0));
    budget -= shown.length;
    return {
      key,
      date: heroWeekDayDate(key),
      events: shown,
      more: all.length - shown.length,
    };
  });

  return { mode: "window", days, total: HERO_WEEK_MAX_TOTAL - budget };
}
