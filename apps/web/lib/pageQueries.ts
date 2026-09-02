import { cache } from "react";
import { prisma } from "@vtk/db";
import { getDefaultEventImage } from "@/lib/defaultEventImage";

/**
 * De queries die een publieke route twee keer nodig heeft: één keer voor
 * `generateMetadata` en één keer voor de pagina zelf.
 *
 * Ze staan hier in `cache()` van React, waardoor beide aanroepen binnen dezelfde
 * render dezelfde query delen. Zonder dat kost elke titel in de `<head>` een
 * tweede databasecall; met een losse tweede query loop je bovendien het risico
 * dat de metadata iets anders beschrijft dan wat de pagina rendert.
 */

/** Een contentpagina met haar bijlagen en categorie (`/p/[slug]`, `/[tab]/[pagina]`). */
export const loadPageBySlug = cache(async (slug: string) =>
  prisma.page.findUnique({
    where: { slug },
    include: {
      assets: { orderBy: { order: "asc" } },
      headerTab: true,
      // Enkel de slug: het formulier zelf wordt met al zijn velden geladen via
      // `loadPublicForm`, en dan alleen wanneer de pagina er echt een heeft.
      form: { select: { slug: true } },
    },
  }),
);

/** De categorie achter een headerslug, zonder haar pagina's. */
export const loadHeaderTab = cache(async (slug: string) =>
  prisma.headerTab.findUnique({ where: { slug } }),
);

/** Dezelfde categorie mét de gepubliceerde kaarten voor de categoriepagina. */
export const loadHeaderTabWithPages = cache(async (slug: string) =>
  prisma.headerTab.findUnique({
    where: { slug },
    include: {
      pages: {
        where: { visibleOnCategoryPage: true, publishedAt: { not: null } },
        orderBy: [{ order: "asc" }, { titleNl: "asc" }],
      },
      // Ook vaste menu-items die naar een app of een andere site wijzen horen
      // als kaart op de categoriepagina (piano, uitleendienst, cudi-webshop).
      links: { orderBy: { order: "asc" } },
    },
  }),
);

export type CalendarCategory = {
  slug: string;
  nameNl: string;
  nameEn: string;
  descriptionNl: string | null;
  descriptionEn: string | null;
};

/** De kalendercategorie achter een slug, of null als die slug geen categorie is. */
export const loadCalendarCategory = cache(
  async (slug: string): Promise<CalendarCategory | null> =>
    prisma.calendarCategory.findUnique({
      where: { slug },
      select: { slug: true, nameNl: true, nameEn: true, descriptionNl: true, descriptionEn: true },
    }),
);

/**
 * Eén kalenderevenement, met alles wat de detailpagina toont.
 *
 * Zoekt op URL-naam en op id. De id is de oude vorm van de URL
 * (`/kalender/<cuid>`) en blijft bereikbaar, want hij staat in gedeelde berichten
 * en in agenda's die al een uitnodiging binnenkregen; de pagina stuurt zo'n
 * adres permanent door naar de slug.
 */
export const loadCalendarEvent = cache(async (slugOrId: string) =>
  prisma.calendarEvent.findFirst({
    where: { publishedAt: { not: null }, OR: [{ slug: slugOrId }, { id: slugOrId }] },
    include: {
      group: true,
      ticketEvent: { select: { slug: true, status: true } },
      form: { select: { slug: true, status: true, opensAt: true, closesAt: true } },
      categories: {
        select: {
          category: {
            select: { slug: true, nameNl: true, nameEn: true, colour: true, audience: true },
          },
        },
        orderBy: { category: { order: "asc" } },
      },
    },
  }),
);

/** De standaardfoto voor evenementen zonder eigen cover; komt uit /admin/home. */
export const loadDefaultEventImage = cache(getDefaultEventImage);
