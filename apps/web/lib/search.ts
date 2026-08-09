import type { Locale } from "@vtk/i18n";
import { markdownToPlainText } from "@/lib/markdown";
import { localizedPath } from "@/lib/seo";
import { pagePath } from "@/lib/sitemap";

/**
 * Het pure deel van de zoekfunctie: alles wat er met de zoekterm en met een
 * gevonden fragment gebeurt, zonder database ertussen. `lib/search-server.ts`
 * doet de queries en gebruikt wat hier staat.
 */

/**
 * Zoektermen worden hier afgekapt. Boven deze lengte gaat het niet meer om
 * zoeken maar om een geplakt tekstblok, en `websearch_to_tsquery` maakt daar een
 * query van met tientallen AND-termen die per definitie niets oplevert. Afkappen
 * is dan vriendelijker dan een lege resultatenlijst.
 */
export const MAX_QUERY_LENGTH = 120;

/**
 * Onder de twee tekens zoeken we niet. Eén letter matcht in het Nederlands zo
 * ongeveer alles, en de bezoeker is op dat moment meestal nog aan het typen.
 */
export const MIN_QUERY_LENGTH = 2;

/** Hoeveel resultaten per soort de pagina toont. */
export const RESULT_LIMIT = 20;

/**
 * De markering die `ts_headline` rond een gevonden woord zet. Bewust twee
 * controltekens en geen `<mark>`: de fragmenttekst komt rechtstreeks uit door
 * leden beheerde inhoud, dus die als HTML renderen zou een injectiegat zijn. Nu
 * splitst {@link snippetParts} het fragment op en zet React zelf de
 * `<mark>`-elementen. Controltekens komen bovendien niet in echte inhoud voor,
 * en {@link normalizeQuery} houdt ze ook uit de zoekterm zelf.
 */
export const HIGHLIGHT_OPEN = "\u0001";
export const HIGHLIGHT_CLOSE = "\u0002";

/**
 * De opties voor `ts_headline`. Gaan als queryparameter mee, niet als stuk SQL.
 * `MaxFragments=2` geeft twee losse stukjes rond de treffers in plaats van de
 * eerste alinea van de pagina; `HighlightAll=FALSE` houdt het bij die stukjes.
 */
export const HEADLINE_OPTIONS = [
  `StartSel=${HIGHLIGHT_OPEN}`,
  `StopSel=${HIGHLIGHT_CLOSE}`,
  "MaxWords=28",
  "MinWords=12",
  "ShortWord=2",
  "MaxFragments=2",
  "FragmentDelimiter= … ",
  "HighlightAll=FALSE",
].join(", ");

/** De tekstzoekconfiguratie die bij de taal van de bezoeker hoort. */
export function textSearchConfig(locale: Locale): "dutch" | "english" {
  return locale === "en" ? "english" : "dutch";
}

/**
 * Maakt van ruwe invoer een zoekterm: controltekens eruit (waaronder de NUL die
 * Postgres niet in een `text` accepteert en de twee sentinels hierboven), één
 * spatie tussen de woorden, en afgekapt op een woordgrens.
 *
 * Verder blijft de invoer staan: aanhalingstekens, `or` en `-` zijn betekenisvol
 * voor `websearch_to_tsquery`, en dat is precies de functie die met rommelige
 * invoer om kan. Zelf tekens wegpoetsen zou zoeken op `"job fair"` kapotmaken
 * zonder iets veiliger te maken; de invoer gaat sowieso als parameter mee en
 * nooit als stuk SQL.
 */
export function normalizeQuery(raw: string | null | undefined): string {
  const clean = (raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length <= MAX_QUERY_LENGTH) return clean;

  const cut = clean.slice(0, MAX_QUERY_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Is er genoeg getypt om mee te zoeken? */
export function isUsableQuery(query: string): boolean {
  return query.length >= MIN_QUERY_LENGTH;
}

/**
 * De vorm waarin we tekst met tekst vergelijken: accenten weg, kleine letters,
 * en alles wat geen letter of cijfer is wordt een spatie.
 *
 * Dat laatste is wat "POC's" vindbaar maakt met `pocs` en "'t ElixIr" met
 * `elixir`. Het maakt de uitkomst meteen ook veilig om als `to_tsquery` mee te
 * geven: `&`, `|` en `!` zijn operatoren in die taal, en een bezoeker die ze
 * intypt hoort geen databasefout te krijgen.
 */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    // De combining marks die NFD losmaakt van hun letter (é -> e + accent).
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // De apostrof valt weg in plaats van een woordgrens te worden: "POC's" moet
    // "pocs" geven, want zo typt iemand het in. De rechte en de gekrulde vorm
    // allebei; van die tweede maakt een tekstverwerker er ongevraagd een.
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Een tsquery die op woordbegin matcht: `uitleen` vindt zo "uitleendienst".
 *
 * `websearch_to_tsquery` doet dat niet, en dat is meestal juist: het zoekt op
 * hele woorden via de stammer. Maar wie halverwege een woord stopt met typen,
 * krijgt daardoor niets. Deze query is de tweede poging, niet de eerste, want
 * ze verliest de betekenis van aanhalingstekens, `or` en `-`.
 *
 * Termen van één letter vallen weg: `a:*` matcht zowat elke rij.
 * `null` betekent dat er niets bruikbaars overblijft om mee te zoeken.
 */
export function prefixTsQuery(query: string): string | null {
  const terms = normalizeForMatch(query)
    .split(" ")
    .filter((term) => term.length >= MIN_QUERY_LENGTH);
  if (terms.length === 0) return null;
  return terms.map((term) => `${term}:*`).join(" & ");
}

export type SnippetPart = { text: string; highlight: boolean };

/**
 * Het fragment leesbaar maken. De tekst van een pagina staat als Markdown in de
 * database, dus zonder deze stap staan er `##`, `**` en `[label](/pad)` in het
 * zoekresultaat. De sentinels overleven de opschoning: het zijn geen
 * markdown-tekens.
 */
function cleanSnippet(raw: string): string {
  return markdownToPlainText(raw)
    // Wat er van de opmaak overblijft omdat een fragment midden in een regel kan
    // beginnen: een half opmaakteken hoort niet in een zoekresultaat.
    .replace(/[*_`]+/g, "")
    .replace(/(^|\s)#{1,6}(?=\s)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splitst het fragment van `ts_headline` in stukken tekst met en zonder
 * markering. Een sentinel zonder tegenhanger (een fragment kan middenin een
 * gemarkeerd woord afgekapt zijn) laat de markering gewoon doorlopen of stoppen;
 * hij mag nooit als teken op het scherm belanden.
 */
export function snippetParts(headline: string | null | undefined): SnippetPart[] {
  const cleaned = cleanSnippet(headline ?? "");
  if (!cleaned) return [];

  const parts: SnippetPart[] = [];
  let highlight = false;

  for (const token of cleaned.split(/([\u0001\u0002])/)) {
    if (token === HIGHLIGHT_OPEN) {
      highlight = true;
      continue;
    }
    if (token === HIGHLIGHT_CLOSE) {
      highlight = false;
      continue;
    }
    if (token === "") continue;

    const last = parts[parts.length - 1];
    if (last && last.highlight === highlight) last.text += token;
    else parts.push({ text: token, highlight });
  }

  if (parts.length > 0) {
    parts[0].text = parts[0].text.replace(/^\s+/, "");
    parts[parts.length - 1].text = parts[parts.length - 1].text.replace(/\s+$/, "");
  }
  return parts.filter((part) => part.text !== "");
}

/**
 * Wat een resultaat is, in de woorden van de bezoeker en niet in die van de
 * database. Een vaste route (`/piano`) en een CMS-pagina zijn allebei gewoon
 * "een pagina"; dat de ene uit een tabel komt en de andere niet, is voor wie
 * zoekt een detail. `link` is het enige echte onderscheid: dat opent een andere
 * site, en dat hoor je te weten voor je klikt.
 */
export type SearchResultKind = "page" | "event" | "link";

/** Voor gelijke rang: eerst een pagina, dan een externe link, dan een activiteit. */
const KIND_ORDER: Record<SearchResultKind, number> = { page: 0, link: 1, event: 2 };

export type SearchResult = {
  kind: SearchResultKind;
  id: string;
  /** Pad inclusief taalvoorvoegsel, klaar voor een `<Link>`; of een volledige URL. */
  href: string;
  title: string;
  /** Eén regel context: de categorie van een pagina, de datum van een evenement. */
  meta: string | null;
  rank: number;
  snippet: SnippetPart[];
};

/**
 * De volgorde van de resultatenlijst. Rang eerst, maar `ts_rank` levert veel
 * gelijke waarden op (twee pagina's met de term één keer in de titel krijgen
 * exact hetzelfde getal), dus de rest van deze regel bepaalt wat de bezoeker
 * werkelijk ziet:
 *
 * - een pagina gaat voor een evenement: wie een term intypt zoekt meestal de
 *   uitleg, niet de zoveelste editie van een activiteit;
 * - daarna alfabetisch op titel, en ten slotte op id. Dat laatste is geen
 *   inhoudelijke keuze maar een garantie: zonder eindtiebreak wisselt de
 *   volgorde bij elke herlading en lijkt de zoekfunctie kapot.
 */
export function compareResults(a: SearchResult, b: SearchResult): number {
  if (b.rank !== a.rank) return b.rank - a.rank;
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];

  const byTitle = a.title.localeCompare(b.title, "nl");
  if (byTitle !== 0) return byTitle;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Sorteert de samengevoegde lijst; muteert de invoer niet. */
export function sortResults(results: SearchResult[]): SearchResult[] {
  return [...results].sort(compareResults);
}

/**
 * Het adres van een gevonden pagina. Loopt via `pagePath` uit `lib/sitemap.ts`,
 * dezelfde functie die de canonieke URL van een pagina bepaalt: een
 * zoekresultaat dat naar de niet-canonieke vorm linkt, stuurt bezoekers naar een
 * adres dat de sitemap niet aanbiedt.
 */
export function pageResultHref(
  page: { slug: string; headerTabSlug: string | null },
  locale: Locale,
): string {
  return localizedPath(pagePath(page), locale);
}

export function eventResultHref(id: string, locale: Locale): string {
  return localizedPath(`/kalender/${id}`, locale);
}
