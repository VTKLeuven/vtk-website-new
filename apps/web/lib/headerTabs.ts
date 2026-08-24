import { HEADER_TABS, prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { isExternalUrl } from "@/lib/href";

/** Eén item in het uitklapmenu van een tab. */
export type NavHeaderTabChild = {
  id: string;
  labelNl: string;
  labelEn: string;
  /** Intern pad zonder taalprefix (`/info/theokot`) of een volledige externe URL. */
  href: string;
  external: boolean;
};

export type NavHeaderTab = {
  id: string;
  slug: string;
  labelNl: string;
  labelEn: string;
  /** Storage-key van de foto op de homepage-aanbodkaart (via /admin/home). */
  imageKey: string | null;
  /**
   * Externe site voor deze tab (bv. career.vtk.be). Is die gezet, dan gaat de
   * headerknop daar rechtstreeks naartoe in plaats van naar /<slug>.
   */
  externalUrl: string | null;
  /**
   * Wat er onder de tab uitklapt: de pagina's die onder deze categorie hangen,
   * gevolgd door de extra (externe) menu-items. Leeg = gewone link zonder menu.
   */
  children: NavHeaderTabChild[];
};

/**
 * Header tabs from the CMS. When the table is empty (e.g. production DB never
 * seeded), fall back to the static defaults so the main nav still renders.
 */
export async function getVisibleHeaderTabsForNav(locale: Locale = "nl"): Promise<NavHeaderTab[]> {
  const isEn = locale === "en";
  const tabs = await prisma.headerTab.findMany({
    where: {
      visible: true,
      ...(isEn ? { visibleEn: true } : { visibleNl: true }),
    },
    orderBy: { order: "asc" },
    include: {
      // Dezelfde selectie als de categoriepagina toont, zodat het menu en die
      // pagina niet uit elkaar lopen.
      pages: {
        where: { visibleInHeader: true, publishedAt: { not: null } },
        orderBy: [{ order: "asc" }, { titleNl: "asc" }],
        select: { id: true, slug: true, titleNl: true, titleEn: true, order: true },
      },
      links: { orderBy: { order: "asc" } },
    },
  });

  if (tabs.length > 0) {
    return tabs.map((tab) => {
      const children: (NavHeaderTabChild & { order: number })[] = [
        ...tab.pages.map((page) => ({
          id: page.id,
          labelNl: page.titleNl,
          labelEn: page.titleEn ?? page.titleNl,
          href: `/${tab.slug}/${page.slug}`,
          external: false,
          order: page.order,
        })),
        ...tab.links.map((link) => ({
          id: link.id,
          labelNl: link.labelNl,
          labelEn: link.labelEn,
          href: link.url,
          external: isExternalUrl(link.url),
          order: link.order,
        })),
      ].sort((a, b) => a.order - b.order);

      return {
        id: tab.id,
        slug: tab.slug,
        labelNl: tab.labelNl,
        labelEn: tab.labelEn,
        imageKey: tab.imageKey,
        externalUrl: tab.externalUrl,
        children: children.map(({ order: _, ...child }) => child),
      };
    });
  }

  return HEADER_TABS.filter((t) => (t.visible !== false) && (isEn ? (t.visibleEn !== false) : (t.visibleNl !== false))).map((t) => ({
    id: t.code,
    slug: t.slug,
    labelNl: t.labelNl,
    labelEn: t.labelEn,
    imageKey: null,
    externalUrl: t.externalUrl ?? null,
    children: (t.links ?? []).map((link) => ({
      id: `${t.code}-${link.url}`,
      labelNl: link.labelNl,
      labelEn: link.labelEn,
      href: link.url,
      external: isExternalUrl(link.url),
    })),
  }));
}
