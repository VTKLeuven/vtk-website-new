import "server-only";

import { Prisma, type CalendarAudience } from "@prisma/client";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { audienceFilter } from "@/lib/calendar/audience";
import { eventDateLine } from "@/lib/pageMetadata";
import {
  HEADLINE_OPTIONS,
  RESULT_LIMIT,
  eventResultHref,
  isUsableQuery,
  normalizeQuery,
  pageResultHref,
  prefixTsQuery,
  snippetParts,
  sortResults,
  textSearchConfig,
  type SearchResult,
} from "@/lib/search";
import {
  buildDestinations,
  matchDestinations,
  type DestinationTab,
} from "@/lib/searchDestinations";

/**
 * De zoekopdracht zelf.
 *
 * Twee stappen per soort, en dat is opzet:
 *
 * 1. Postgres rangschikt met `websearch_to_tsquery` tegen de tsvector-kolom en
 *    levert kandidaat-ids met hun rang en hun fragment.
 * 2. Prisma haalt daaruit de rijen op **met dezelfde where-regels als de rest
 *    van de site**: `publishedAt` voor een pagina, en voor een evenement
 *    `visibility: "PUBLIC"` plus `audienceFilter()` uit
 *    `lib/calendar/audience.ts`, precies zoals `/api/calendar/events` en de
 *    ics-feeds die gebruiken.
 *
 * Die tweede stap in Prisma houden in plaats van de regels in SQL over te
 * schrijven is de hele reden voor de opsplitsing: een tweede, met de hand
 * nagebouwde zichtbaarheidsregel loopt vroeg of laat uiteen met de eerste, en
 * dan lekt er een intern evenement in de zoekresultaten.
 */

/**
 * Hoeveel rijen stap 1 aanlevert. Ruim boven wat de pagina toont, want stap 2
 * gooit er nog uit; ruim onder wat een trage query zou opleveren.
 */
const CANDIDATE_LIMIT = 200;

type Candidate = { id: string; rank: number; headline: string | null };

/** De kandidaten uit stap 1, met hun rang, op id. */
type CandidateMap = Map<string, Candidate>;

function byId(rows: Candidate[]): CandidateMap {
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Stap 1 voor pagina's.
 *
 * De zoekterm gaat als parameter mee, nooit als stuk SQL, en de configuratie
 * (`dutch`/`english`) net zo: een `text` die Postgres zelf naar `regconfig`
 * cast. Wat wél als SQL-fragment wisselt is de kolomnaam, en die komt uit de
 * `Locale`-union en niet uit de invoer van de bezoeker.
 */
/**
 * De tsquery zelf. `websearch_to_tsquery` is de eerste poging: die begrijpt
 * aanhalingstekens, `or` en `-`, en zoekt op hele woorden via de stammer. Wie
 * halverwege een woord stopt met typen (`uitleen`) vindt daarmee niets, en dan
 * is `to_tsquery` met `:*` de tweede poging.
 */
function tsQuery(query: string, config: string, prefix: string | null): Prisma.Sql {
  return prefix === null
    ? Prisma.sql`websearch_to_tsquery(${config}::regconfig, ${query})`
    : Prisma.sql`to_tsquery(${config}::regconfig, ${prefix})`;
}

async function pageCandidates(
  query: string,
  locale: Locale,
  prefix: string | null = null,
): Promise<Candidate[]> {
  const config = textSearchConfig(locale);
  const vector = locale === "en" ? Prisma.sql`p."searchEn"` : Prisma.sql`p."searchNl"`;
  // Het fragment komt uit de tekst en niet uit de titel: de titel staat er in het
  // resultaat al boven, en twee keer hetzelfde lezen helpt niemand.
  const body =
    locale === "en"
      ? Prisma.sql`concat_ws(' ', coalesce(nullif(p."excerptEn", ''), p."excerptNl"), coalesce(nullif(p."contentMdEn", ''), p."contentMdNl"))`
      : Prisma.sql`concat_ws(' ', p."excerptNl", p."contentMdNl")`;

  return prisma.$queryRaw<Candidate[]>`
    SELECT p."id",
           ts_rank(${vector}, q.query) AS "rank",
           ts_headline(${config}::regconfig, ${body}, q.query, ${HEADLINE_OPTIONS}) AS headline
    FROM "Page" p, ${tsQuery(query, config, prefix)} AS q(query)
    WHERE p."publishedAt" IS NOT NULL
      AND ${vector} @@ q.query
    ORDER BY "rank" DESC
    LIMIT ${CANDIDATE_LIMIT}
  `;
}

async function eventCandidates(
  query: string,
  locale: Locale,
  prefix: string | null = null,
): Promise<Candidate[]> {
  const config = textSearchConfig(locale);
  const vector = locale === "en" ? Prisma.sql`e."searchEn"` : Prisma.sql`e."searchNl"`;
  const body =
    locale === "en"
      ? Prisma.sql`concat_ws(' ', e."location", coalesce(nullif(e."descriptionEn", ''), e."descriptionNl"))`
      : Prisma.sql`concat_ws(' ', e."location", e."descriptionNl")`;

  // `visibility` staat hier al in de WHERE en niet pas in stap 2. Dat scheelt
  // niet alleen werk: zo berekent Postgres ook geen fragment van een
  // ledenexclusief evenement dat toch weggegooid wordt.
  return prisma.$queryRaw<Candidate[]>`
    SELECT e."id",
           ts_rank(${vector}, q.query) AS "rank",
           ts_headline(${config}::regconfig, ${body}, q.query, ${HEADLINE_OPTIONS}) AS headline
    FROM "CalendarEvent" e, ${tsQuery(query, config, prefix)} AS q(query)
    WHERE e."visibility" = 'PUBLIC'
      AND ${vector} @@ q.query
    ORDER BY "rank" DESC
    LIMIT ${CANDIDATE_LIMIT}
  `;
}

async function pageResults(
  candidates: CandidateMap,
  locale: Locale,
): Promise<SearchResult[]> {
  if (candidates.size === 0) return [];

  const pages = await prisma.page.findMany({
    // Nog eens `publishedAt`, ook al stond het in stap 1: dit is de query waar de
    // zichtbaarheid van afhangt, dus de regel hoort hier te staan en niet enkel
    // in de ruwe SQL erboven.
    where: { id: { in: [...candidates.keys()] }, publishedAt: { not: null } },
    select: {
      id: true,
      slug: true,
      titleNl: true,
      titleEn: true,
      headerTab: { select: { slug: true, labelNl: true, labelEn: true } },
    },
  });

  return pages.map((page) => {
    const candidate = candidates.get(page.id)!;
    return {
      kind: "page" as const,
      id: page.id,
      href: pageResultHref({ slug: page.slug, headerTabSlug: page.headerTab?.slug ?? null }, locale),
      title: pick(page.titleNl, page.titleEn, locale),
      meta: page.headerTab ? pick(page.headerTab.labelNl, page.headerTab.labelEn, locale) : null,
      rank: candidate.rank,
      snippet: snippetParts(candidate.headline),
    };
  });
}

async function eventResults(
  candidates: CandidateMap,
  locale: Locale,
  audiences: CalendarAudience[],
): Promise<SearchResult[]> {
  if (candidates.size === 0) return [];

  const events = await prisma.calendarEvent.findMany({
    where: {
      id: { in: [...candidates.keys()] },
      visibility: "PUBLIC",
      ...audienceFilter(audiences),
    },
    select: {
      id: true,
      titleNl: true,
      titleEn: true,
      descriptionNl: true,
      descriptionEn: true,
      start: true,
      end: true,
      allDay: true,
      updatedAt: true,
    },
  });

  return events.map((event) => {
    const candidate = candidates.get(event.id)!;
    return {
      kind: "event" as const,
      id: event.id,
      href: eventResultHref(event.id, locale),
      title: pick(event.titleNl, event.titleEn, locale),
      // De datum en niet de categorie: bij een activiteit is "wanneer" het eerste
      // wat iemand wil weten. Zelfde regel als in de deelvoorbeelden.
      meta: eventDateLine(event, locale),
      rank: candidate.rank,
      snippet: snippetParts(candidate.headline),
    };
  });
}

export type SearchInput = {
  /** Ruwe invoer van de bezoeker; wordt hier genormaliseerd. */
  query: string | null | undefined;
  locale: Locale;
  /**
   * De doelgroepen van de kijker, uit `viewerAudiences()`. Bewust een parameter
   * en geen sessielezing hierbinnen, zodat deze functie zonder request te testen
   * valt: een test die de kalenderzichtbaarheid bewijst, moet de doelgroep zelf
   * kunnen kiezen.
   */
  audiences: CalendarAudience[];
  limit?: number;
};

export type SearchOutcome = {
  /** De opgeschoonde zoekterm, zoals ze in het invoerveld hoort te staan. */
  query: string;
  /** `false` wanneer er te weinig getypt is om mee te zoeken. */
  searched: boolean;
  results: SearchResult[];
};

/**
 * De categorieën met hun menu-items, als voer voor de bestemmingenlijst.
 * Dezelfde selectie als de header toont, zodat wat vindbaar is en wat in het
 * menu staat niet uiteenlopen.
 */
async function destinationTabs(): Promise<DestinationTab[]> {
  return prisma.headerTab.findMany({
    where: { visible: true },
    orderBy: { order: "asc" },
    select: {
      slug: true,
      labelNl: true,
      labelEn: true,
      introNl: true,
      introEn: true,
      externalUrl: true,
      visible: true,
      links: {
        orderBy: { order: "asc" },
        select: { id: true, labelNl: true, labelEn: true, url: true },
      },
    },
  });
}

export async function searchSite(input: SearchInput): Promise<SearchOutcome> {
  const query = normalizeQuery(input.query);
  if (!isUsableQuery(query)) return { query, searched: false, results: [] };

  const [pages, events, tabs] = await Promise.all([
    pageCandidates(query, input.locale),
    eventCandidates(query, input.locale),
    destinationTabs(),
  ]);

  // Tweede poging op woordbegin, en enkel wanneer de eerste niets opleverde: zo
  // blijft `"job fair"` een exacte zin en vindt `uitleen` toch de uitleendienst.
  const prefix = pages.length === 0 && events.length === 0 ? prefixTsQuery(query) : null;
  const [fallbackPages, fallbackEvents] =
    prefix === null
      ? [[], []]
      : await Promise.all([
          pageCandidates(query, input.locale, prefix),
          eventCandidates(query, input.locale, prefix),
        ]);

  const [pageRows, eventRows] = await Promise.all([
    pageResults(byId(prefix === null ? pages : fallbackPages), input.locale),
    eventResults(byId(prefix === null ? events : fallbackEvents), input.locale, input.audiences),
  ]);

  const destinationRows = matchDestinations(
    buildDestinations(tabs, input.locale),
    query,
    input.locale,
  );

  // Een bestemming kan hetzelfde adres hebben als een gevonden pagina (een
  // categorie met een pagina eronder deelt dat niet, maar een menu-item dat naar
  // /info/shiften wijst wel). Twee keer dezelfde link onder elkaar leest als een
  // fout; de best scorende wint.
  const seen = new Map<string, SearchResult>();
  for (const result of [...destinationRows, ...pageRows, ...eventRows]) {
    const existing = seen.get(result.href);
    if (!existing || result.rank > existing.rank) seen.set(result.href, result);
  }

  return {
    query,
    searched: true,
    results: sortResults([...seen.values()]).slice(0, input.limit ?? RESULT_LIMIT),
  };
}
