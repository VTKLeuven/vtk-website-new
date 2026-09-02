import type { MetadataRoute } from "next";
import { HEADER_TABS, prisma } from "@vtk/db";
import { buildSitemapEntries, type SitemapHeaderTab } from "@/lib/sitemap";

/**
 * De sitemap draait per verzoek en niet bij het builden. Een sitemap is een
 * route handler die Next standaard cachet; dan komt hij uit de build-container,
 * waar noch de database noch `VTK_MAIN_URL` beschikbaar is en elke URL dus op
 * localhost zou wijzen. Crawlers halen dit bestand zelden op, dus de kost valt weg.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [pages, headerTabs, events] = await Promise.all([
    prisma.page.findMany({
      where: { publishedAt: { not: null } },
      select: {
        slug: true,
        publishedAt: true,
        contentEditedAt: true,
        updatedAt: true,
        headerTab: { select: { slug: true } },
      },
    }),
    prisma.headerTab.findMany({
      select: { slug: true, visible: true, externalUrl: true },
      orderBy: { order: "asc" },
    }),
    prisma.calendarEvent.findMany({
      where: { publishedAt: { not: null } },
      select: { slug: true, publishedAt: true, updatedAt: true },
    }),
  ]);

  // Zoals de navigatie: is de tabel nooit geseed, val dan terug op de statische
  // categorieën, anders mist de sitemap de halve site.
  const tabs: SitemapHeaderTab[] =
    headerTabs.length > 0
      ? headerTabs
      : HEADER_TABS.map((tab) => ({
          slug: tab.slug,
          visible: true,
          externalUrl: tab.externalUrl ?? null,
        }));

  return buildSitemapEntries({
    pages: pages.map((page) => ({
      slug: page.slug,
      headerTabSlug: page.headerTab?.slug ?? null,
      publishedAt: page.publishedAt,
      contentEditedAt: page.contentEditedAt,
      updatedAt: page.updatedAt,
    })),
    headerTabs: tabs,
    events,
  });
}
