/**
 * De tegels op een categoriepagina (`/info`, `/cursusdienst`, ...).
 *
 * Een categorie bestaat uit twee soorten items: pagina's die op deze site staan,
 * en menu-items die ergens anders naartoe wijzen (de piano-reservatie, de
 * webshop van de cursusdienst, de uitleendienst). Het uitklapmenu in de header
 * toont die allebei, de categoriepagina toonde lang enkel de pagina's. Wie het
 * menu dichtklapte en op de categorie klikte, zag daardoor minder dan daarnet.
 *
 * De volgorde is dezelfde als in het menu (`lib/headerTabs.ts`): eerst de
 * pagina's, dan de menu-items. Zo staan de twee lijsten niet in een andere
 * volgorde naast elkaar op hetzelfde scherm.
 */

import { isExternalUrl } from "./href";

/** Een item dat als kaart op de categoriepagina komt. */
export type CategoryTile = {
  /** Uniek binnen één categorie; bruikbaar als React-key. */
  key: string;
  labelNl: string;
  labelEn: string;
  /** Intern pad zonder taalprefix (`/info/shiften`) of een volledig adres. */
  href: string;
  external: boolean;
  /** Enkel pagina's hebben een korte beschrijving; menu-items niet. */
  excerptNl: string | null;
  excerptEn: string | null;
};

type TilePage = {
  id: string;
  slug: string;
  titleNl: string;
  titleEn: string | null;
  excerptNl: string | null;
  excerptEn: string | null;
};

type TileLink = {
  id: string;
  labelNl: string;
  labelEn: string;
  url: string;
};

export function categoryTiles(tab: {
  slug: string;
  pages: TilePage[];
  links: TileLink[];
}): CategoryTile[] {
  return [
    ...tab.pages.map((page) => ({
      key: `page:${page.id}`,
      labelNl: page.titleNl,
      labelEn: page.titleEn ?? page.titleNl,
      href: `/${tab.slug}/${page.slug}`,
      external: false,
      excerptNl: page.excerptNl,
      excerptEn: page.excerptEn,
    })),
    ...tab.links.map((link) => ({
      key: `link:${link.id}`,
      labelNl: link.labelNl,
      labelEn: link.labelEn,
      href: link.url,
      external: isExternalUrl(link.url),
      excerptNl: null,
      excerptEn: null,
    })),
  ];
}
