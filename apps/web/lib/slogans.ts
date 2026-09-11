import type { Locale } from "@vtk/i18n";
import { brusselsMinutesOfDay } from "@/lib/brussels";

/**
 * De slogans in de hero van de homepage.
 *
 * Eén lijst, één tekstveld per taal. Het gele accent staat als `*sterretjes*`
 * midden in de zin en een echte regelafbreking is een nieuwe regel in het veld:
 *
 *     Ingenieurs zijn *superieur*.
 *     Waar is de beste sfeer?
 *     *V-T-K!*
 *
 * Dat verving drie velden per taal (`title`, `accent`, `tail`) waarin het accent
 * altijd in het midden stond en de regelafbreking vastlag in de component. Een
 * accent vooraan, twee accenten of een slogan van één regel waren daarin niet te
 * schrijven, terwijl de kreten die we echt gebruiken precies dat vragen.
 *
 * De persoonlijke begroeting is geen apart soort ding meer maar een gewone
 * slogan met `audience: "members"` en `opener: true`. Ze opent de reeks één keer
 * en komt daarna niet meer terug, want een begroeting is waar bij aankomst en
 * niet elke acht seconden opnieuw. Daarmee verdween ook het kanspercentage: een
 * dobbelsteen die niemand kan nakijken, gevoed door de seconden van de
 * serverklok, was voor een redacteur niet te testen en niet uit te leggen.
 */

export const SLOGAN_AUDIENCES = ["all", "members", "guests"] as const;
export type SloganAudience = (typeof SLOGAN_AUDIENCES)[number];

/**
 * Wanneer op de dag een slogan mag verschijnen, op de Brusselse klok. "any" is
 * altijd. Bedoeld voor de begroetingen ("Goeiemorgen"), maar elke slogan mag het
 * gebruiken; zo blijft het één begrip in het beheer.
 */
export const SLOGAN_WINDOWS = ["any", "morning", "afternoon", "evening", "night"] as const;
export type SloganWindow = (typeof SLOGAN_WINDOWS)[number];

export type Slogan = {
  id: string;
  /** De volledige zin, met `*accent*` en desnoods een regelafbreking. */
  nl: string;
  /** Leeg = de Nederlandse zin, zoals overal elders op de site. */
  en?: string;
  audience: SloganAudience;
  /** Opent de reeks en valt daarna uit de rotatie. */
  opener: boolean;
  window: SloganWindow;
};

export type SlogansConfig = {
  items: Slogan[];
  /** Wisseltijd in seconden. 0 = niet roteren, enkel de eerste tonen. */
  intervalSeconds: number;
};

/** Eén stuk tekst binnen een regel; `accent` wordt geel en schuin. */
export type SloganSegment = { text: string; accent: boolean };
export type SloganLine = SloganSegment[];

export type DisplaySlogan = {
  id: string;
  lines: SloganLine[];
  /** Dezelfde zin zonder opmaak, voor tooltips en voorbeelden. */
  text: string;
  opener: boolean;
};

/**
 * Hoe groot de hero de titel zet. Zie `sloganSizeTier`.
 */
export type SloganSize = "l" | "m" | "s";

export type ResolvedSlogans = {
  /** De begroeting (indien er een past) voorop, daarna de roterende slogans. */
  items: DisplaySlogan[];
  /** 1 wanneer `items[0]` een begroeting is; de rotatie start daarna. */
  openerCount: 0 | 1;
  intervalSeconds: number;
  size: SloganSize;
};

export const SLOGAN_INTERVAL_DEFAULT = 8;
export const SLOGAN_INTERVAL_MAX = 60;

/**
 * De slogans waarmee een verse database start. Vanaf de eerste bewerking in
 * /admin/slogans is dit enkel nog zaaigoed: de instelling is dan de bron, en
 * deze lijst mag afdrijven zonder dat iemand dat op de site merkt.
 */
export const DEFAULT_SLOGAN_ITEMS: Slogan[] = [
  // De begroetingen staan vooraan omdat de eerste passende opener wint.
  {
    id: "opener-ochtend",
    nl: "Goeiemorgen, *{firstName}*.",
    en: "Good morning, *{firstName}*.",
    audience: "members",
    opener: true,
    window: "morning",
  },
  {
    id: "opener-middag",
    nl: "Welkom terug, *{firstName}*.",
    en: "Welcome back, *{firstName}*.",
    audience: "members",
    opener: true,
    window: "afternoon",
  },
  {
    id: "opener-avond",
    nl: "Goeieavond, *{firstName}*.",
    en: "Good evening, *{firstName}*.",
    audience: "members",
    opener: true,
    window: "evening",
  },
  {
    id: "opener-nacht",
    nl: "Nog laat bezig, *{firstName}*?",
    en: "Still up, *{firstName}*?",
    audience: "members",
    opener: true,
    window: "night",
  },
  {
    id: "slogan-thuis",
    nl: "De thuis voor *ingenieurs* in Leuven.",
    en: "The home for *engineers* in Leuven.",
    audience: "all",
    opener: false,
    window: "any",
  },
  {
    id: "slogan-glory",
    nl: "Glory, glory, *wij zijn VTK!*",
    en: "Glory, glory, *we are VTK!*",
    audience: "all",
    opener: false,
    window: "any",
  },
  {
    id: "slogan-superieur",
    nl: "Ingenieurs zijn *superieur*.",
    en: "Engineers are *superior*.",
    audience: "all",
    opener: false,
    window: "any",
  },
  {
    id: "slogan-verstand",
    nl: "Het verstand zit aan *deze kant*.",
    en: "The brains are on *this side*.",
    audience: "all",
    opener: false,
    window: "any",
  },
  {
    id: "slogan-staal",
    nl: "Wij zijn machines, *wij zijn van staal*.",
    en: "We are machines, *we are made of steel*.",
    audience: "all",
    opener: false,
    window: "any",
  },
  {
    id: "slogan-100jaar",
    nl: "Al meer dan 100 jaar *thuis* in Leuven.",
    en: "For over 100 years *at home* in Leuven.",
    audience: "all",
    opener: false,
    window: "any",
  },
  {
    id: "slogan-aula-fakbar",
    nl: "Van aula tot fakbar, *jouw kring*.",
    en: "From lecture hall to fakbar, *your society*.",
    audience: "all",
    opener: false,
    window: "any",
  },
  {
    id: "slogan-hoofden-benen",
    nl: "Met slimme hoofden en *snelle benen*.",
    en: "With sharp minds and *fast legs*.",
    audience: "all",
    opener: false,
    window: "any",
  },
  {
    id: "slogan-sfeer",
    nl: "Waar is de beste sfeer?\n*V-T-K!*",
    en: "Where is the best vibe?\n*V-T-K!*",
    audience: "all",
    opener: false,
    window: "any",
  },
  {
    id: "slogan-studeren-fuiven",
    nl: "Studeren, fuiven, lopen: *zonder ons hard te forceren*.",
    en: "Study, party, run: *without breaking a sweat*.",
    audience: "all",
    opener: false,
    window: "any",
  },
  {
    id: "slogan-winnen-feesten",
    nl: "Winnen doen we gauw, *feesten doen we trouw*.",
    en: "Quick to win, *loyal to the party*.",
    audience: "all",
    opener: false,
    window: "any",
  },
];

export const DEFAULT_SLOGANS_CONFIG: SlogansConfig = {
  items: DEFAULT_SLOGAN_ITEMS,
  intervalSeconds: SLOGAN_INTERVAL_DEFAULT,
};

/** Vervangt `{name}` door de volledige naam en `{firstName}` door de voornaam. */
export function interpolateName(
  template: string | null | undefined,
  name: string | null,
  firstName: string | null,
): string {
  if (!template) return "";
  let result = template;
  if (firstName) {
    result = result.replaceAll("{firstName}", firstName);
  } else if (name) {
    result = result.replaceAll("{firstName}", name);
  }
  if (name) {
    result = result.replaceAll("{name}", name);
  } else if (firstName) {
    result = result.replaceAll("{name}", firstName);
  }
  return result;
}

function parseLine(line: string): SloganLine {
  const segments: SloganLine = [];
  const push = (text: string, accent: boolean) => {
    if (text) segments.push({ text, accent });
  };

  let rest = line;
  while (rest.length > 0) {
    const open = rest.indexOf("*");
    // Een los sterretje is gewoon een sterretje: een halfgetypte slogan hoort
    // niet stuk te gaan terwijl de redacteur nog bezig is.
    if (open === -1) {
      push(rest, false);
      break;
    }
    const close = rest.indexOf("*", open + 1);
    if (close === -1) {
      push(rest, false);
      break;
    }
    push(rest.slice(0, open), false);
    push(rest.slice(open + 1, close), true);
    rest = rest.slice(close + 1);
  }

  return segments;
}

/**
 * Zet de ingetypte zin om in regels met accentstukken. Lege regels vallen weg,
 * zodat een extra enter onderaan geen gat in de hero slaat.
 */
export function parseSlogan(text: string): SloganLine[] {
  return text
    .split("\n")
    .map((line) => parseLine(line.trim()))
    .filter((line) => line.length > 0);
}

/** Dezelfde zin zonder de sterretjes. */
export function sloganPlainText(lines: SloganLine[]): string {
  return lines.map((line) => line.map((segment) => segment.text).join("")).join(" ");
}

/** In welk dagdeel we zitten, op de Brusselse klok (dus juist in zomeruur). */
export function sloganWindowAt(now: Date): Exclude<SloganWindow, "any"> {
  const minutes = brusselsMinutesOfDay(now);
  if (minutes < 6 * 60) return "night";
  if (minutes < 12 * 60) return "morning";
  if (minutes < 18 * 60) return "afternoon";
  return "evening";
}

function cleanString(val: unknown): string {
  return typeof val === "string" ? val.trim() : "";
}

function pickFrom<T extends readonly string[]>(
  val: unknown,
  options: T,
  fallback: T[number],
): T[number] {
  return typeof val === "string" && (options as readonly string[]).includes(val)
    ? (val as T[number])
    : fallback;
}

/**
 * De oude vorm (`titleNl` + `accentNl` + `tailNl`) naar één zin.
 *
 * De component brak de regel vast af: met staart tussen accent en staart, zonder
 * staart tussen titel en accent. Dat zetten we hier letterlijk om, zodat een
 * hero die al jaren zo staat er na deze migratie identiek uitziet.
 */
function composeLegacy(title: string, accent: string, tail: string): string {
  const head = accent ? `${title ? `${title} ` : ""}*${accent}*` : title;
  if (!head) return tail;
  if (!tail) return title && accent ? `${title}\n*${accent}*` : head;
  return `${head}\n${tail}`;
}

function readLegacyItem(raw: Record<string, unknown>, idx: number): Slogan | null {
  const nl = composeLegacy(
    cleanString(raw.titleNl),
    cleanString(raw.accentNl),
    cleanString(raw.tailNl),
  );
  const en = composeLegacy(
    cleanString(raw.titleEn),
    cleanString(raw.accentEn),
    cleanString(raw.tailEn),
  );
  if (!nl && !en) return null;
  return {
    id: cleanString(raw.id) || `slogan-${idx + 1}`,
    nl: nl || en,
    en: en || undefined,
    audience: "all",
    opener: false,
    window: "any",
  };
}

function readItem(raw: unknown, idx: number): Slogan | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  // De oude vorm heeft geen `nl` maar wel losse titel/accent/staart-velden.
  if (typeof obj.nl !== "string" && ("titleNl" in obj || "accentNl" in obj || "titleEn" in obj)) {
    return readLegacyItem(obj, idx);
  }

  const nl = cleanString(obj.nl);
  const en = cleanString(obj.en);
  if (!nl && !en) return null;

  return {
    id: cleanString(obj.id) || `slogan-${idx + 1}`,
    nl: nl || en,
    en: en || undefined,
    audience: pickFrom(obj.audience, SLOGAN_AUDIENCES, "all"),
    opener: obj.opener === true,
    window: pickFrom(obj.window, SLOGAN_WINDOWS, "any"),
  };
}

/** De oude losse `personal`-blok naar een gewone slogan met een publiek. */
function readLegacyPersonal(raw: unknown): Slogan | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.enabled !== true) return null;
  const item = readLegacyItem(obj, 0);
  if (!item) return null;
  return { ...item, id: "opener-welkom", audience: "members", opener: true };
}

/**
 * Leest en valideert de `home.slogans`-instelling, inclusief de oude vorm.
 *
 * Een lege lijst valt terug op de zaailijst: de hero heeft een titel nodig en
 * een h1 die verdwijnt omdat iemand het laatste item wiste, is geen keuze maar
 * een kapotte pagina. Het beheer laat het laatste item dan ook niet verwijderen.
 */
export function readSlogansSetting(raw: unknown): SlogansConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_SLOGANS_CONFIG;
  }
  const obj = raw as Record<string, unknown>;

  const items = Array.isArray(obj.items)
    ? obj.items.flatMap((item, idx) => {
        const parsed = readItem(item, idx);
        return parsed ? [parsed] : [];
      })
    : [];

  const legacyOpener = readLegacyPersonal(obj.personal);
  const all = legacyOpener ? [legacyOpener, ...items] : items;

  const rawInterval = Number(obj.intervalSeconds);
  const intervalSeconds = Number.isFinite(rawInterval)
    ? Math.max(0, Math.min(SLOGAN_INTERVAL_MAX, Math.round(rawInterval)))
    : SLOGAN_INTERVAL_DEFAULT;

  return {
    items: all.length > 0 ? all : DEFAULT_SLOGAN_ITEMS,
    intervalSeconds,
  };
}

/**
 * De volgende slogan in de reeks. Na de laatste keert ze terug naar de eerste
 * *na* de begroeting: die opent één keer en komt niet meer terug.
 * De hero en het voorbeeld in het beheer draaien allebei op deze regel.
 */
export function nextSloganIndex(index: number, length: number, openerCount: number): number {
  if (length <= 0) return 0;
  return index + 1 >= length ? Math.min(openerCount, length - 1) : index + 1;
}

/**
 * Eén tekengrootte voor de hele reeks, afgeleid van de langste regel.
 *
 * De hero is getekend voor een titel van een handvol woorden op 80px. Een kreet
 * als "Studeren, fuiven, lopen: zonder ons hard te forceren" loopt daar over
 * vijf regels, en omdat de hoogte op de langste slogan staat, zou de hele hero
 * daarnaar groeien; een kortere slogan hangt dan in een gat. Daarom zakt de
 * grootte mee met wat er in de lijst staat.
 *
 * Bewust voor de hele reeks tegelijk en niet per slogan: een titel die bij elke
 * wissel van grootte verspringt, leest als een fout.
 */
export function sloganSizeTier(items: DisplaySlogan[]): SloganSize {
  const longest = items.reduce(
    (max, item) =>
      item.lines.reduce(
        (lineMax, line) =>
          Math.max(lineMax, line.reduce((sum, segment) => sum + segment.text.length, 0)),
        max,
      ),
    0,
  );
  if (longest <= 30) return "l";
  if (longest <= 46) return "m";
  return "s";
}

function matchesAudience(
  audience: SloganAudience,
  user: { name: string; firstName: string | null } | null | undefined,
): boolean {
  if (audience === "members") return Boolean(user);
  if (audience === "guests") return !user;
  return true;
}

function toDisplay(
  item: Slogan,
  locale: Locale,
  user: { name: string; firstName: string | null } | null | undefined,
): DisplaySlogan | null {
  const raw = locale === "nl" ? item.nl : item.en || item.nl;
  const text = user ? interpolateName(raw, user.name, user.firstName) : raw;
  const lines = parseSlogan(text);
  if (lines.length === 0) return null;
  return { id: item.id, lines, text: sloganPlainText(lines), opener: item.opener };
}

/**
 * Welke slogans deze bezoeker op dit moment te zien krijgt, in de volgorde
 * waarin de hero ze toont.
 *
 * De regel is één zin: de eerste opener in de lijst die bij het publiek en het
 * dagdeel past, opent de reeks; daarna roteren de overige passende slogans en
 * komt die opener niet meer terug. Geen kans, geen klokgestuurde ruis, dus
 * voorspelbaar in het beheer en identiek op de server en in de browser.
 */
export function resolveSlogans({
  config,
  locale,
  user,
  now,
  fallback,
}: {
  config: SlogansConfig | null | undefined;
  locale: Locale;
  user?: { name: string; firstName: string | null } | null;
  now: Date;
  /** De hero-tekst van vóór deze lijst; enkel gebruikt als er niets overblijft. */
  fallback?: { nl: string; en?: string } | null;
}): ResolvedSlogans {
  const cfg = config ?? DEFAULT_SLOGANS_CONFIG;
  const window = sloganWindowAt(now);

  const eligible = cfg.items.filter(
    (item) =>
      matchesAudience(item.audience, user) &&
      (item.window === "any" || item.window === window),
  );

  const opener = eligible.find((item) => item.opener);
  const rotation = eligible.filter((item) => !item.opener);

  const items = [...(opener ? [opener] : []), ...rotation]
    .map((item) => toDisplay(item, locale, user))
    .filter((item): item is DisplaySlogan => item !== null);

  if (items.length === 0) {
    const raw = fallback
      ? locale === "nl"
        ? fallback.nl
        : fallback.en || fallback.nl
      : "";
    const lines = parseSlogan(
      raw ||
        (locale === "nl"
          ? "De thuis voor *ingenieurs* in Leuven."
          : "The home for *engineers* in Leuven."),
    );
    const only = [{ id: "fallback", lines, text: sloganPlainText(lines), opener: false }];
    return {
      items: only,
      openerCount: 0,
      intervalSeconds: cfg.intervalSeconds,
      size: sloganSizeTier(only),
    };
  }

  return {
    items,
    openerCount: items[0]!.opener ? 1 : 0,
    intervalSeconds: cfg.intervalSeconds,
    size: sloganSizeTier(items),
  };
}
