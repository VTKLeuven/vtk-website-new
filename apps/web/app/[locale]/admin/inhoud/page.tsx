import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import { publicUrl } from "@/lib/storage";
import type { Locale } from "@vtk/i18n";
import { ContentManager, type TabNode, type PageNode } from "./ContentManager";

/**
 * Beheer van de navigatiestructuur en alle CMS-pagina's op één scherm: welke
 * categorieën in de header staan, wat er op die categoriepagina's komt, en de
 * inhoud van de pagina's eronder. Vervangt de losse /admin/header en
 * /admin/paginas.
 */
export default async function AdminContent({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;

  const session = await requireAnyPermission(["pages.edit", "header.manage"]);
  const canEditPages = hasPermission(session, "pages.edit");
  const canDeletePages = hasPermission(session, "pages.delete");
  const canManageHeader = hasPermission(session, "header.manage");

  const [tabs, pages] = await Promise.all([
    prisma.headerTab.findMany({ orderBy: { order: "asc" } }),
    prisma.page.findMany({
      include: { assets: { orderBy: { order: "asc" } } },
      orderBy: [{ order: "asc" }, { titleNl: "asc" }],
    }),
  ]);

  const toPageNode = (p: (typeof pages)[number]): PageNode => ({
    id: p.id,
    slug: p.slug,
    headerTabId: p.headerTabId,
    visibleInHeader: p.visibleInHeader,
    titleNl: p.titleNl,
    titleEn: p.titleEn,
    excerptNl: p.excerptNl,
    excerptEn: p.excerptEn,
    contentJsonNl: p.contentJsonNl,
    contentJsonEn: p.contentJsonEn,
    published: Boolean(p.publishedAt),
    order: p.order,
    assets: p.assets.map((a) => ({
      id: a.id,
      labelNl: a.labelNl,
      kind: a.kind,
      storageKey: a.storageKey,
      url: publicUrl(a.storageKey),
    })),
  });

  const tabNodes: TabNode[] = tabs.map((t) => ({
    id: t.id,
    code: t.code,
    slug: t.slug,
    labelNl: t.labelNl,
    labelEn: t.labelEn,
    visible: t.visible,
    introNl: t.introNl,
    introEn: t.introEn,
    ctaLabelNl: t.ctaLabelNl,
    ctaLabelEn: t.ctaLabelEn,
    ctaUrl: t.ctaUrl,
    pages: pages.filter((p) => p.headerTabId === t.id).map(toPageNode),
  }));

  const unlinked = pages.filter((p) => p.headerTabId === null).map(toPageNode);

  return (
    <ContentManager
      locale={locale}
      tabs={tabNodes}
      unlinked={unlinked}
      canEditPages={canEditPages}
      canDeletePages={canDeletePages}
      canManageHeader={canManageHeader}
      usingDefaults={tabs.length === 0}
    />
  );
}
