/*
 * Namen uit een shiftenlijst herkennen en aan een praesidiumlid koppelen.
 *
 * Op een shiftenlijst staat zelden een volledige naam. Het is "Mekkie" (een
 * bijnaam), "Jarne P" (er zijn twee Jarnes, dus voornaam plus het begin van de
 * achternaam), "kato" of "Lore B.". Deze module beslist voor elke schrijfwijze
 * wat ze waarschijnlijk is; de vice kijkt dat na in het beheer, en wat hij daar
 * kiest, wint altijd. Zie docs/design-decisions.md, "Shiftenoverzicht
 * praesidium".
 */

// ---------------------------------------------------------------------------
// Opkuisen
// ---------------------------------------------------------------------------

/**
 * Een tijdsbereik zoals de lijsten het schrijven: "13u00–14u30", "8:00 - 10:00",
 * "21h-23h", "19-21h", "22u00-einde", "12-3u". Minstens één kant draagt een
 * u, h of dubbelpunt (of het eind heet "einde"), zodat een datum als "12-10"
 * geen uur wordt.
 */
const TIME_RANGE =
  /(?<![\d])(\d{1,2})(?:\s*([uh:.])\s*(\d{2})?)?\s*[-\u2013\u2014]\s*(?:(\d{1,2})(?:\s*([uh:.])\s*(\d{2})?)?|(einde|eind|end|sluiting|close))(?![\d])/i;

export type TimeRange = {
  /** Het bereik zoals het er stond. */
  label: string;
  /** Minuten na middernacht; `end` kan voorbij 24u lopen bij een nachtshift. */
  start: number;
  end: number | null;
};

/** Haalt het eerste tijdsbereik uit een tekst, of null. */
export function parseTimeRange(text: string): TimeRange | null {
  const match = TIME_RANGE.exec(text);
  if (!match) return null;
  const [label, h1, sep1, m1, h2, sep2, m2, endWord] = match;
  const marked = Boolean(sep1 && sep1 !== ".") || Boolean(sep2 && sep2 !== ".") || Boolean(endWord);
  if (!marked) return null;
  const startHour = Number(h1);
  if (startHour > 24) return null;
  let start = startHour * 60 + Number(m1 ?? 0);
  if (endWord) return { label: label.trim(), start, end: null };
  const endHour = Number(h2);
  if (endHour > 24) return null;
  let end = endHour * 60 + Number(m2 ?? 0);
  if (end <= start) end += 24 * 60;
  // "12-3u" en "12u-1u" betekenen middernacht tot drie uur, niet twaalf uur 's
  // middags tot drie uur 's nachts: niemand schrijft een shift van vijftien uur.
  if (end - start > 12 * 60 && start >= 12 * 60) {
    start -= 12 * 60;
    if (end - start > 24 * 60) end -= 24 * 60;
  }
  return { label: label.trim(), start, end };
}

/** Duur in uren, of null wanneer het einde open is ("tot einde"). */
export function rangeHours(range: TimeRange | null): number | null {
  if (!range || range.end === null) return null;
  return (range.end - range.start) / 60;
}

/** "23u-1u: Maxime" -> tijd "23u-1u" en naam "Maxime". */
export function splitTimePrefix(text: string): { range: TimeRange | null; rest: string } {
  const match = /^\s*([^:]{2,20}?)\s*:\s*(.+)$/s.exec(text);
  if (match) {
    const range = parseTimeRange(match[1]);
    if (range && range.label.length >= match[1].trim().length - 1) return { range, rest: match[2] };
  }
  return { range: null, rest: text };
}

/** Wat tussen haakjes staat, is een opmerking ("Lore J (pno tot 18.30)"). */
function stripNotes(text: string): string {
  return text.replace(/\([^)]*\)?/g, " ").replace(/\[[^\]]*\]?/g, " ");
}

/** De naam zoals hij getoond wordt: opgekuist, maar met hoofdletters en accenten. */
export function cleanLabel(raw: string): string {
  return stripNotes(splitTimePrefix(raw).rest)
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:/*-]+|[\s,;:/*-]+$/g, "")
    .trim();
}

/**
 * De sleutel waarop namen vergeleken worden: kleine letters, zonder accenten,
 * leestekens of opmerkingen. "Lore B." en "lore b" zijn dezelfde schrijfwijze,
 * "Amélie" en "Amelie" ook.
 */
export function nameKey(raw: string): string {
  return cleanLabel(raw)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** Meerdere namen in één vakje: onder elkaar, of met &, + of een komma. */
export function splitNames(text: string): string[] {
  return text
    .split(/\r?\n|\s*&\s*|\s+\+\s+|\s*,\s*|\s+\/\s+|\s*;\s*/)
    .map((piece) => piece.trim())
    .filter(Boolean);
}

/** Woorden die in een naam niet voorkomen, wel in een opmerking. */
const FUNCTION_WORDS = new Set([
  "met", "tot", "voor", "op", "aan", "en", "het", "een", "is", "zijn", "niet", "wel", "ook", "nog",
  "bij", "naar", "uit", "om", "als", "dan", "maar", "per", "zie", "and", "the", "with", "for", "to",
  "if", "all", "only", "fill", "are", "be", "will", "shift", "shiften", "shifts", "uur", "min",
]);

/** Vakjes die geen persoon zijn, maar wel op een naam lijken. */
const NOT_A_NAME = new Set([
  "driver", "co driver", "codriver", "chauffeur", "bijrijder", "gecanceled", "gecanceld", "geannuleerd",
  "cancelled", "canceled", "vrij", "open", "leeg", "nvt", "tbd", "tba", "x", "xx", "xxx", "niemand",
  "iemand", "reserve", "praesidium", "logi", "wg", "steward", "stewards", "true", "false", "ja", "nee",
  "done", "extra", "totaal", "opmerkingen", "opmerking", "info", "naam", "namen", "name", "kring",
  "verantwoordelijke", "superintendent", "filled", "to go", "total", "how to scaff",
]);

/**
 * Is dit stuk tekst een naam? Liever een naam te veel dan te weinig: wat hier
 * doorglipt, staat in het beheer als "niet herkend" en wordt één keer genegeerd
 * (en dat onthouden). Een gemiste naam ziet niemand.
 */
export function looksLikeName(raw: string): boolean {
  const label = cleanLabel(raw);
  if (label.length < 2 || label.length > 40) return false;
  if (/\d/.test(label)) return false;
  if (!/^[\p{L}][\p{L}\p{M}\s.'’`-]*$/u.test(label)) return false;
  const key = nameKey(label);
  if (!key || NOT_A_NAME.has(key)) return false;
  const words = key.split(" ");
  if (words.length > 5) return false;
  if (words.some((word) => FUNCTION_WORDS.has(word))) return false;
  // "HOW TO SCAFF": een titel in hoofdletters, geen persoon.
  const letters = label.replace(/[^\p{L}]/gu, "");
  if (words.length >= 3 && letters === letters.toUpperCase()) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Koppelen aan een praesidiumlid
// ---------------------------------------------------------------------------

export type RosterPerson = {
  userId: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
};

type IndexedPerson = RosterPerson & {
  full: string;
  first: string;
  last: string;
  lastWords: string[];
};

/** Splitst een weergavenaam in voor- en achternaam wanneer die niet apart staan. */
function indexPerson(person: RosterPerson): IndexedPerson {
  const fallback = nameKey(person.name).split(" ");
  const first = person.firstName ? nameKey(person.firstName) : (fallback[0] ?? "");
  const last = person.lastName ? nameKey(person.lastName) : fallback.slice(1).join(" ");
  return {
    ...person,
    full: [first, last].filter(Boolean).join(" "),
    first,
    last,
    lastWords: last.split(" ").filter(Boolean),
  };
}

/** Levenshtein, met een bovengrens zodat lange namen niet traag worden. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export type MatchSource =
  | "ALIAS"
  | "FULL_NAME"
  | "FIRST_NAME"
  | "INITIAL"
  | "FUZZY"
  | "MANUAL"
  | "OTHER_KRING"
  | "NOT_PRAESIDIUM"
  | "NONE";

export type MatchStatus = "MATCHED" | "IGNORED" | "UNRESOLVED" | "NOT_A_NAME";

export type Proposal = {
  status: MatchStatus;
  source: MatchSource;
  userId: string | null;
  /** Bij twijfel: wie het zou kunnen zijn (twee Jarnes). */
  candidates: string[];
  /** Extra uitleg voor het scherm, zoals de kring uit het overzicht. */
  detail?: string;
};

/** `userId` leeg: geen praesidium, of met `notAName` geen persoon maar een post of taak. */
export type AliasTarget = { userId: string | null; notAName?: boolean };

/**
 * Stelt een koppeling voor op basis van de bijnamen, het overzichtstabblad en
 * de namen van wie dit werkingsjaar in het praesidium zit. In deze volgorde:
 *
 * 1. een onthouden bijnaam wint altijd, ook "negeren" en "geen naam";
 * 2. staat de naam in het overzicht bij een andere kring, dan is het geen VTK;
 * 3. voluit en exact (ook achternaam eerst, of met een tikfout);
 * 4. enkel een voornaam: telt alleen als er één praesidiumlid zo heet;
 * 5. voornaam plus het begin van de achternaam ("Jarne P", "Lore B.");
 * 6. een volledige naam die bij niemand past, is geen praesidium. Eén los woord
 *    dat bij niemand past, is een bijnaam en wacht op de vice.
 */
export function proposeMatch(
  key: string,
  roster: RosterPerson[],
  aliases: ReadonlyMap<string, AliasTarget>,
  otherKring: ReadonlyMap<string, string> = new Map(),
): Proposal {
  const alias = aliases.get(key);
  if (alias) {
    if (alias.userId) return { status: "MATCHED", source: "ALIAS", userId: alias.userId, candidates: [] };
    return { status: alias.notAName ? "NOT_A_NAME" : "IGNORED", source: "ALIAS", userId: null, candidates: [] };
  }
  const kring = otherKring.get(key);
  if (kring) return { status: "IGNORED", source: "OTHER_KRING", userId: null, candidates: [], detail: kring };

  const people = roster.map(indexPerson);
  const words = key.split(" ").filter(Boolean);
  if (words.length === 0) return { status: "UNRESOLVED", source: "NONE", userId: null, candidates: [] };

  const unique = (list: IndexedPerson[], source: MatchSource): Proposal | null => {
    if (list.length === 1) return { status: "MATCHED", source, userId: list[0].userId, candidates: [] };
    if (list.length > 1) {
      return { status: "UNRESOLVED", source: "NONE", userId: null, candidates: list.map((p) => p.userId) };
    }
    return null;
  };

  const exact = people.filter((p) => p.full === key || `${p.last} ${p.first}` === key);
  const exactHit = unique(exact, "FULL_NAME");
  if (exactHit) return exactHit;

  if (words.length === 1) {
    const [word] = words;
    const byFirst = unique(people.filter((p) => p.first === word || p.first.split(" ")[0] === word), "FIRST_NAME");
    if (byFirst) return byFirst;
    const byLast = unique(people.filter((p) => p.last === word), "FIRST_NAME");
    if (byLast) return byLast;
    if (word.length >= 5) {
      const fuzzy = unique(people.filter((p) => editDistance(p.first, word, 1) <= 1), "FUZZY");
      if (fuzzy) return fuzzy;
    }
    return { status: "UNRESOLVED", source: "NONE", userId: null, candidates: [] };
  }

  // Voornaam (één of twee woorden) plus het begin van de achternaam.
  for (let split = Math.min(2, words.length - 1); split >= 1; split -= 1) {
    const first = words.slice(0, split).join(" ");
    const rest = words.slice(split).join(" ");
    const sameFirst = people.filter((p) => p.first === first);
    if (sameFirst.length === 0) continue;
    const prefix = sameFirst.filter(
      (p) => p.last.startsWith(rest) || p.last.replace(/ /g, "").startsWith(rest.replace(/ /g, "")) || p.lastWords.some((w) => w.startsWith(rest)),
    );
    const hit = unique(prefix, rest.length > 3 && prefix[0]?.last === rest ? "FULL_NAME" : "INITIAL");
    if (hit) return hit;
  }

  // Een tikfout in een volledige naam ("Victor Chistiaens").
  if (key.length >= 8) {
    const fuzzy = people.filter((p) => p.full && editDistance(p.full, key, 2) <= 2);
    const hit = unique(fuzzy, "FUZZY");
    if (hit) return hit;
  }

  return { status: "IGNORED", source: "NOT_PRAESIDIUM", userId: null, candidates: [] };
}

/**
 * Of een schrijfwijze meer dan één praesidiumlid kan zijn op voornaam alleen.
 * Zo'n keuze ("Jarne" is deze keer Jarne P) geldt voor die ene lijst en wordt
 * standaard niet als bijnaam onthouden: de volgende lijst kan de andere Jarne
 * bedoelen.
 */
export function isAmbiguousFirstName(key: string, roster: RosterPerson[]): boolean {
  if (key.includes(" ")) return false;
  return roster.map(indexPerson).filter((p) => p.first === key || p.first.split(" ")[0] === key).length > 1;
}

/** "Shiftenlijst 24UL '26-'27.xlsx" -> "24UL". */
export function suggestListName(fileName: string): string {
  const base = fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\b(shiftenlijst|shiftlijst|shiften|shifts?|lijst)\b/gi, " ")
    .replace(/'?\d{2}\s*-\s*'?\d{2}\b/g, " ")
    .replace(/\b20\d{2}(\s*-\s*20\d{2})?\b/g, " ")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–:]+|[\s\-–:]+$/g, "")
    .trim();
  return base || fileName.replace(/\.[a-z0-9]+$/i, "");
}
