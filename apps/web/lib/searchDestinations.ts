import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { isExternalUrl } from "@/lib/href";
import type { SeoKey } from "@/lib/pageMetadata";
import { normalizeForMatch, type SearchResult } from "@/lib/search";
import { localizedPath } from "@/lib/seo";

/**
 * De plekken waar je op deze site naartoe kan, als doorzoekbare lijst.
 *
 * Waarom dit naast de zoekopdracht in Postgres bestaat: die doorzoekt `Page` en
 * `CalendarEvent`, en de helft van de site staat in geen van beide. `/piano`,
 * `/tickets`, `/kalender` en `/praesidium` zijn eigen routes met eigen code, de
 * categorieën staan in `HeaderTab`, en de menu-items in `HeaderTabLink`. Wie
 * "piano" intypte kreeg daarom niets, terwijl de pianopagina gewoon bestaat.
 *
 * Het zijn er enkele tientallen, dus ze worden hier in het geheugen gematcht in
 * plaats van in de database geïndexeerd. Dat scheelt niet alleen een migratie:
 * het laat ook toe om op woordbegin te matchen, en dat is precies wat je van een
 * korte titel verwacht ("pian" hoort "Piano reserveren" te vinden).
 *
 * Titels en beschrijvingen komen uit de `seo`-woordenlijst, dezelfde die de
 * `<title>` van die routes zet. Zo staat er nooit een tweede, afwijkende naam
 * voor dezelfde pagina.
 */

/**
 * De vaste routes die mee doorzocht worden, met hun sleutel in de woordenlijst.
 * Enkel publieke routes: `/account` en de onboarding horen hier niet, die
 * bestaan alleen achter een login en zeggen een uitgelogde bezoeker niets.
 *
 * `test/searchDestinations.test.ts` bewaakt dat elke route uit `STATIC_ROUTES`
 * (de sitemap) hier ook staat: wat Google mag vinden, hoort de bezoeker zelf
 * ook te kunnen vinden.
 */
export const SEARCHABLE_ROUTES: ReadonlyArray<{ path: string; seoKey: SeoKey }> = [
  { path: "/", seoKey: "home" },
  { path: "/kalender", seoKey: "kalender" },
  { path: "/tickets", seoKey: "tickets" },
  { path: "/media", seoKey: "media" },
  { path: "/praesidium", seoKey: "praesidium" },
  { path: "/werkgroepen", seoKey: "werkgroepen" },
  { path: "/pocs", seoKey: "pocs" },
  { path: "/theokot", seoKey: "theokot" },
  { path: "/shift", seoKey: "shift" },
  { path: "/piano", seoKey: "piano" },
  { path: "/privacy", seoKey: "privacy" },
  { path: "/cookies", seoKey: "cookies" },
];

/** Een categorie uit de header, met wat eronder in het menu hangt. */
export type DestinationTab = {
  slug: string;
  labelNl: string;
  labelEn: string;
  introNl: string | null;
  introEn: string | null;
  externalUrl: string | null;
  visible: boolean;
  links: Array<{ id: string; labelNl: string; labelEn: string; url: string }>;
};

export type SearchDestination = {
  /** Stabiel over herladingen heen: het adres zelf. */
  id: string;
  /** Pad zonder taalvoorvoegsel, of een volledige URL naar een andere site. */
  href: string;
  title: string;
  description: string | null;
  external: boolean;
};

/**
 * De volledige lijst: eerst de vaste routes, dan de categorieën, dan de
 * menu-items. Die volgorde bepaalt ook wie een dubbel adres wint, en dat is
 * bewust: een vaste route draagt een beschrijving uit de woordenlijst, een
 * menu-item enkel zijn label. `/piano` staat in allebei.
 */
export function buildDestinations(tabs: DestinationTab[], locale: Locale): SearchDestination[] {
  const seo = getDictionary(locale).seo;
  const found: SearchDestination[] = [];

  for (const route of SEARCHABLE_ROUTES) {
    const entry = seo[route.seoKey];
    found.push({
      id: route.path,
      href: route.path,
      title: entry.title,
      description: entry.description,
      external: false,
    });
  }

  for (const tab of tabs) {
    if (!tab.visible) continue;
    // Een categorie die naar een andere site wijst, heeft hier geen eigen
    // pagina; het is die site die je zoekt.
    const href = tab.externalUrl ?? `/${tab.slug}`;
    found.push({
      id: href,
      href,
      title: pick(tab.labelNl, tab.labelEn, locale),
      description: pick(tab.introNl ?? "", tab.introEn ?? "", locale) || null,
      external: tab.externalUrl !== null,
    });

    for (const link of tab.links) {
      found.push({
        id: link.url,
        href: link.url,
        title: pick(link.labelNl, link.labelEn, locale),
        description: null,
        external: isExternalUrl(link.url),
      });
    }
  }

  const seen = new Set<string>();
  return found.filter((destination) => {
    if (seen.has(destination.id)) return false;
    seen.add(destination.id);
    return true;
  });
}

/**
 * Staat `term` aan het begin van een woord in `haystack`? Allebei genormaliseerd.
 *
 * Bewust geen losse `includes`: dan matcht `in` op "Printer" en `co` op zowat
 * alles, en staat de lijst vol ruis. Op woordbegin matchen geeft precies wat
 * iemand bedoelt die halverwege een woord stopt met typen.
 */
function startsWord(haystack: string, term: string): boolean {
  return haystack === term || haystack.startsWith(`${term} `) || haystack.includes(` ${term}`);
}

/**
 * Hoe goed een bestemming bij de zoekterm past, op dezelfde schaal als
 * `ts_rank` (0 tot 1). Een exacte titel wint van eender welke tekstpagina: wie
 * "piano" typt, wil de pianopagina en niet het verslag waarin het woord staat.
 *
 * `0` betekent: geen treffer.
 */
export function scoreDestination(destination: SearchDestination, query: string): number {
  const q = normalizeForMatch(query);
  if (q === "") return 0;

  const title = normalizeForMatch(destination.title);
  const haystack = `${title} ${normalizeForMatch(destination.description ?? "")}`.trim();
  const terms = q.split(" ");

  if (title === q) return 1;
  if (title.startsWith(q)) return 0.92;
  if (startsWord(title, q)) return 0.85;
  if (terms.every((term) => startsWord(title, term))) return 0.8;
  if (terms.every((term) => startsWord(haystack, term))) return 0.45;
  return 0;
}

/** De bestemmingen die bij de zoekterm passen, als gewone zoekresultaten. */
export function matchDestinations(
  destinations: SearchDestination[],
  query: string,
  locale: Locale,
): SearchResult[] {
  const results: SearchResult[] = [];

  for (const destination of destinations) {
    const rank = scoreDestination(destination, query);
    if (rank === 0) continue;

    results.push({
      kind: destination.external ? "link" : "page",
      id: destination.id,
      href: destination.external ? destination.href : localizedPath(destination.href, locale),
      title: destination.title,
      meta: null,
      rank,
      // Bewust geen fragment met markering: de beschrijving is één zin die de
      // pagina samenvat, niet een stuk tekst waar de zoekterm toevallig in staat.
      snippet: destination.description
        ? [{ text: destination.description, highlight: false }]
        : [],
    });
  }

  return results;
}
