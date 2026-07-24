import { HEADER_TABS, prisma } from "@vtk/db";

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
};

/**
 * Header tabs from the CMS. When the table is empty (e.g. production DB never
 * seeded), fall back to the static defaults so the main nav still renders.
 */
export async function getVisibleHeaderTabsForNav(): Promise<NavHeaderTab[]> {
  const tabs = await prisma.headerTab.findMany({
    where: { visible: true },
    orderBy: { order: "asc" },
  });
  if (tabs.length > 0) return tabs;
  return HEADER_TABS.map((t) => ({
    id: t.code,
    slug: t.slug,
    labelNl: t.labelNl,
    labelEn: t.labelEn,
    imageKey: null,
    externalUrl: t.externalUrl ?? null,
  }));
}
