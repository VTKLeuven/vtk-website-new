import type { MetadataRoute } from "next";
import { hreflangAlternates, localizedUrl } from "@/lib/seo";

/**
 * De sitemap zonder database ertussen.
 *
 * `app/sitemap.ts` doet de queries en geeft de rijen hier binnen; alles wat
 * beslist wát er in de sitemap komt (concept weglaten, welke URL-vorm canoniek
 * is, welke datum als `lastModified` telt) staat hier, zodat het te testen valt.
 */

/**
 * Vaste publieke routes. Bewust een expliciete lijst en geen scan van de
 * bestandsboom: `app/[locale]` bevat ook schermen die niemand mag indexeren
 * (account, onboarding, bestellingen), en die vergissing wil je niet automatisch
 * maken.
 */
export const STATIC_ROUTES = [
  "/",
  "/kalender",
  "/media",
  "/praesidium",
  "/werkgroepen",
  "/pocs",
  "/theokot",
  "/shift",
  "/piano",
  "/tickets",
  "/privacy",
  "/cookies",
] as const;

export type SitemapPage = {
  slug: string;
  /** Slug van de categorie waar de pagina onder hangt, of `null` voor een losse pagina. */
  headerTabSlug: string | null;
  publishedAt: Date | null;
  /** Laatste inhoudelijke bewerking; valt terug op `updatedAt`. */
  contentEditedAt: Date | null;
  updatedAt: Date;
};

export type SitemapHeaderTab = {
  slug: string;
  visible: boolean;
  /** Wijst de tab naar een andere site (career.vtk.be), dan hoort ze hier niet thuis. */
  externalUrl: string | null;
};

export type SitemapEvent = {
  id: string;
  visibility: "PUBLIC" | "MEMBERS";
  updatedAt: Date;
};

export type SitemapInput = {
  pages: SitemapPage[];
  headerTabs: SitemapHeaderTab[];
  events: SitemapEvent[];
  /** `lastModified` van de vaste routes; standaard "nu". */
  now?: Date;
};

/**
 * De canonieke URL van een pagina. Een pagina onder een categorie is bereikbaar
 * via twee paden (`/info/theokot` en `/p/theokot`); de categorievorm is de
 * canonieke, want dat is de weg die de navigatie aanbiedt.
 */
export function pagePath(page: Pick<SitemapPage, "slug" | "headerTabSlug">): string {
  return page.headerTabSlug ? `/${page.headerTabSlug}/${page.slug}` : `/p/${page.slug}`;
}

function entry(path: string, lastModified: Date, priority: number): MetadataRoute.Sitemap[number] {
  return {
    url: localizedUrl(path, "nl"),
    lastModified,
    priority,
    alternates: { languages: hreflangAlternates(path) },
  };
}

export function buildSitemapEntries(input: SitemapInput): MetadataRoute.Sitemap {
  const now = input.now ?? new Date();

  const staticEntries = STATIC_ROUTES.map((path) => entry(path, now, path === "/" ? 1 : 0.8));

  // Een categorie die naar een externe site wijst heeft geen eigen pagina, en een
  // onzichtbare categorie hoort niet in de navigatie; geen van beide in de sitemap.
  const tabEntries = input.headerTabs
    .filter((tab) => tab.visible && !tab.externalUrl)
    .map((tab) => entry(`/${tab.slug}`, now, 0.7));

  const pageEntries = input.pages
    .filter((page) => page.publishedAt !== null)
    .map((page) => entry(pagePath(page), page.contentEditedAt ?? page.updatedAt, 0.6));

  // Ledenexclusieve evenementen staan achter een login; ze mogen niet eens als
  // titel in een zoekresultaat opduiken.
  const eventEntries = input.events
    .filter((event) => event.visibility === "PUBLIC")
    .map((event) => entry(`/kalender/${event.id}`, event.updatedAt, 0.5));

  // Ontdubbelen, want de lijsten overlappen elkaar echt: `/theokot`, `/shift` en
  // `/media` staan zowel in STATIC_ROUTES (het zijn eigen routes met eigen
  // functionaliteit) als in de headertabs (ze zijn óók een categorie). Dezelfde
  // URL twee keer in een sitemap is een fout die Search Console meldt.
  //
  // De eerste wint, en de volgorde hierboven is daarop afgestemd: een vaste route
  // draagt een hogere `priority` dan dezelfde URL als categorie.
  const all = [...staticEntries, ...tabEntries, ...pageEntries, ...eventEntries];
  const seen = new Set<string>();
  return all.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}
