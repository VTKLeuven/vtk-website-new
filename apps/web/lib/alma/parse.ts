/**
 * Een restaurantpagina van Alma (alma.be) lezen.
 *
 * Alma heeft geen API. De pagina wordt op hun server opgebouwd (Craft CMS) en
 * bevat alles wat de app nodig heeft: het menu van één dag, de dagen waarvoor er
 * een menu is, de uren van de komende week en het adres. Dit bestand haalt dat
 * eruit met gewone reguliere uitdrukkingen op de klassen en tags die Alma
 * gebruikt. Er is bewust geen DOM-parser bij gekomen: het zijn een handvol vaste
 * patronen, en een wijziging aan hun opmaak breekt een parser even hard.
 *
 * **Faalt het, dan stil maar zichtbaar.** Elke functie geeft bij onbekende opmaak
 * een lege lijst of `null` terug; `lib/alma/index.ts` zet een restaurant waar
 * niets uit kwam op `unavailable`, zodat de app "niet beschikbaar" toont in plaats
 * van "gesloten". De tests in `test/alma.test.ts` dragen een stuk van de echte
 * opmaak mee; wijzigt Alma die, dan is dat de eerste plek om te kijken.
 *
 * Geen `server-only`: alles hier is puur en testbaar zonder netwerk.
 */

export type AlmaWindow = { start: number; end: number };

export type AlmaHoursKind = {
  /** "Warme maaltijden", "Snacks & sandwiches", zoals Alma het schrijft. */
  kind: string;
  days: { date: string; windows: AlmaWindow[] }[];
};

export type AlmaDiet = "vegan" | "vegetarian" | "meat";
export type AlmaClimate = "very-low" | "low" | "medium" | "high";

export type AlmaDish = {
  id: string;
  name: string;
  /** In eurocent; `null` waar die prijs niet vermeld staat. Gratis is 0. */
  prices: { kuleuven: number | null; student: number | null; other: number | null };
  diet: AlmaDiet | null;
  protein: string | null;
  climate: AlmaClimate | null;
  imageUrl: string | null;
};

export type AlmaMenuSection = {
  title: string;
  groups: { title: string | null; dishes: AlmaDish[] }[];
};

export type AlmaPage = {
  /** De dag waarvan het menu op de pagina staat, of `null` zonder menu. */
  menuDate: string | null;
  /** Alle dagen waarvoor Alma een menu heeft, oplopend. */
  dates: string[];
  menu: AlmaMenuSection[];
  hours: AlmaHoursKind[];
  address: string | null;
  location: { lat: number; lng: number } | null;
};

const ORIGIN = "https://www.alma.be";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  euro: "€",
  ndash: "–",
  mdash: "\u2014",
  rsquo: "’",
  lsquo: "‘",
  eacute: "é",
  egrave: "è",
  euml: "ë",
  iuml: "ï",
  ccedil: "ç",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Tags weg, entiteiten vertaald, witruimte samengetrokken. */
function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function absolute(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? decodeEntities(match[1]) : null;
}

// -----------------------------------------------------------------------------
// Dagen
// -----------------------------------------------------------------------------

/**
 * `data-dates` op de datumkiezer. **Het eerste element is de dag die getoond
 * wordt**, de rest volgt oplopend; met `?date=2026-11-25` staat de 25e vooraan.
 */
export function parseMenuDates(html: string): { shown: string | null; dates: string[] } {
  const match = /data-dates="([^"]*)"/.exec(html);
  if (!match) return { shown: null, dates: [] };
  try {
    const parsed: unknown = JSON.parse(decodeEntities(match[1]));
    if (!Array.isArray(parsed)) return { shown: null, dates: [] };
    const dates = parsed.filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
    return { shown: dates[0] ?? null, dates: [...new Set(dates)].sort() };
  } catch {
    return { shown: null, dates: [] };
  }
}

// -----------------------------------------------------------------------------
// Menu
// -----------------------------------------------------------------------------

const DIET: Record<string, AlmaDiet> = {
  vegan: "vegan",
  "vegetarisch (niet-vegan)": "vegetarian",
  vegetarisch: "vegetarian",
  "vegetarian (non-vegan)": "vegetarian",
  vegetarian: "vegetarian",
  "niet-vegetarisch": "meat",
  "non-vegetarian": "meat",
  // Zo staat het op alma.be/en, met de tikfout.
  "non-vegatarian": "meat",
};

const CLIMATE: Record<string, AlmaClimate> = {
  "heel laag": "very-low",
  "very low": "very-low",
  laag: "low",
  low: "low",
  gemiddeld: "medium",
  medium: "medium",
  average: "medium",
  hoog: "high",
  high: "high",
};

const PROTEIN = new Set([
  "gevogelte",
  "rund",
  "varken",
  "vis",
  "mix vlees en vis",
  "vlees overige",
  "poultry",
  "beef",
  "pork",
  "fish",
  "meat and fish",
  "other meat",
]);

function price(card: string, type: "kul" | "notKul" | "other"): number | null {
  const match = new RegExp(
    `data-type="${type}"[\\s\\S]*?(?:&euro;|€)\\s*(\\d+)[\\s\\S]*?menuprice[^>]*>\\s*[.,](\\d{2})`,
  ).exec(card);
  return match ? Number(match[1]) * 100 + Number(match[2]) : null;
}

/**
 * De afbeelding van een gerecht: de 375 pixels brede uit de `srcset`, want dat is
 * wat een telefoon toont. Zonder `srcset` de eerste echte `src`.
 */
function image(card: string): string | null {
  const tag = /<img\b[^>]*\bsrcset="[^"]*"[^>]*>/.exec(card)?.[0];
  if (tag) {
    const candidates = (attribute(tag, "srcset") ?? "")
      .split(",")
      .map((part) => part.trim().split(/\s+/))
      .filter((part) => part[0]);
    const pick = candidates.find((part) => part[1] === "375w") ?? candidates[0];
    if (pick) return absolute(pick[0]);
  }
  return null;
}

function parseDish(id: string, card: string): AlmaDish | null {
  const nameMatch = /<h4\b[^>]*>([\s\S]*?)<\/h4>/.exec(card);
  if (!nameMatch) return null;
  const name = text(nameMatch[1]);
  if (!name) return null;

  const free = /<div class="[^"]*font-semibold[^"]*">\s*(Gratis|Free)\s*<\/div>/i.test(card);
  const prices = free
    ? { kuleuven: 0, student: 0, other: 0 }
    : { kuleuven: price(card, "kul"), student: price(card, "notKul"), other: price(card, "other") };

  let diet: AlmaDiet | null = null;
  let climate: AlmaClimate | null = null;
  let protein: string | null = null;
  for (const match of card.matchAll(/<img\b[^>]*\balt="([^"]*)"/g)) {
    const alt = decodeEntities(match[1]).trim();
    const key = alt.toLowerCase();
    if (!diet && DIET[key]) diet = DIET[key];
    else if (!climate && CLIMATE[key]) climate = CLIMATE[key];
    else if (!protein && PROTEIN.has(key)) protein = alt;
  }

  return { id, name, prices, diet, protein, climate, imageUrl: image(card) };
}

/**
 * Het menu van de getoonde dag, in de volgorde van de pagina: secties ("Warm
 * buffet", "Soep", ...), daarin groepen ("Maaltijd I", "Optioneel"), daarin
 * gerechten. Een gerecht zonder groep valt in een groep zonder titel.
 */
export function parseMenu(html: string): AlmaMenuSection[] {
  const token =
    /<div id="(\d+)" class="mt-8 font-normal[^"]*"[^>]*>\s*<div>\s*([^<]*?)\s*\(\d+\)|<div class="text-lg font-normal text-primary-hover">([^<]*)<\/div>|<div id="(\d+)"\s+class="[^"]*\bmenucard\b[^"]*"/g;

  const sections: AlmaMenuSection[] = [];
  let section: AlmaMenuSection | null = null;
  let group: AlmaMenuSection["groups"][number] | null = null;

  for (const match of html.matchAll(token)) {
    if (match[2] !== undefined) {
      section = { title: text(match[2]), groups: [] };
      sections.push(section);
      group = null;
      continue;
    }
    if (!section) continue;
    if (match[3] !== undefined) {
      group = { title: text(match[3]) || null, dishes: [] };
      section.groups.push(group);
      continue;
    }
    const id = match[4];
    const start = match.index ?? 0;
    // Een kaart loopt tot haar eigen modal (`menuContent-<id>`), die er altijd
    // achter staat; zonder die markering hooguit een paar duizend tekens.
    const end = html.indexOf(`id="menuContent-${id}"`, start);
    const card = html.slice(start, end > start ? end : start + 6000);
    const dish = parseDish(id, card);
    if (!dish) continue;
    if (!group) {
      group = { title: null, dishes: [] };
      section.groups.push(group);
    }
    group.dishes.push(dish);
  }

  return sections
    .map((entry) => ({ ...entry, groups: entry.groups.filter((candidate) => candidate.dishes.length > 0) }))
    .filter((entry) => entry.groups.length > 0);
}

// -----------------------------------------------------------------------------
// Uren
// -----------------------------------------------------------------------------

/**
 * Het jaar bij "Di 24/11": het jaar waarin die dag het dichtst bij vandaag ligt.
 * Rond nieuwjaar staat "Ma 4/1" zo in het volgende jaar en niet bijna twaalf
 * maanden terug.
 */
function withYear(day: number, month: number, today: string): string {
  const [year] = today.split("-").map(Number);
  const reference = Date.parse(`${today}T12:00:00Z`);
  let best = "";
  let distance = Infinity;
  for (const candidate of [year - 1, year, year + 1]) {
    const key = `${candidate}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const gap = Math.abs(Date.parse(`${key}T12:00:00Z`) - reference);
    if (gap < distance) {
      distance = gap;
      best = key;
    }
  }
  return best;
}

/**
 * "Openingsdagen en openingsuren" onderaan de pagina: per soort aanbod de
 * komende zeven dagen. Een dag zonder uren is gesloten (Alma schrijft
 * "gesloten"); vensters staan als `11:30–14:00`, soms twee na elkaar met "en".
 *
 * `today` is de datum in Brussel als `YYYY-MM-DD`, om het jaar in te vullen.
 */
export function parseHours(html: string, today: string): AlmaHoursKind[] {
  const anchor = html.search(/Openingsdagen en openingsuren|Opening days and hours/);
  if (anchor < 0) return [];
  const region = html.slice(anchor, anchor + 30_000);

  const kinds: AlmaHoursKind[] = [];
  for (const block of region.matchAll(/<strong class="uppercase[^"]*">([^<]*)<\/strong>[\s\S]*?<dl\b[^>]*>([\s\S]*?)<\/dl>/g)) {
    const days: AlmaHoursKind["days"] = [];
    for (const row of block[2].matchAll(/<dt\b[^>]*>\s*[^<\d]*?(\d{1,2})\/(\d{1,2})\s*<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g)) {
      const windows: AlmaWindow[] = [];
      for (const range of row[3].matchAll(/(\d{1,2})[:.](\d{2})\s*[–-]\s*(\d{1,2})[:.](\d{2})/g)) {
        const start = Number(range[1]) * 60 + Number(range[2]);
        let end = Number(range[3]) * 60 + Number(range[4]);
        if (end <= start) end += 24 * 60;
        windows.push({ start, end });
      }
      days.push({ date: withYear(Number(row[1]), Number(row[2]), today), windows });
    }
    const kind = text(block[1]);
    if (kind && days.length > 0) kinds.push({ kind, days });
  }
  return kinds;
}

// -----------------------------------------------------------------------------
// Adres
// -----------------------------------------------------------------------------

export function parseAddress(html: string): Pick<AlmaPage, "address" | "location"> {
  const block = /<div class="not-italic[^"]*">([\s\S]*?)<\/div>\s*<\/div>/.exec(html);
  const address = block ? text(block[1].replace(/<\/div>\s*<div[^>]*>/g, ", ")).replace(/\s+,/g, ",") || null : null;
  const maps = /destination=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(html);
  const location = maps ? { lat: Number(maps[1]), lng: Number(maps[2]) } : null;
  return { address, location };
}

export function parseAlmaPage(html: string, today: string): AlmaPage {
  const { shown, dates } = parseMenuDates(html);
  const menu = parseMenu(html);
  return {
    menuDate: menu.length > 0 ? shown : null,
    dates,
    menu,
    hours: parseHours(html, today),
    ...parseAddress(html),
  };
}
