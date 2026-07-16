import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import { publicUrl } from "@/lib/storage";
import type { Locale } from "@vtk/i18n";
import { ContentManager, type TabNode, type PageNode, type RoleOption } from "./ContentManager";

/**
 * Beheer van de navigatiestructuur: welke categorieën in de header staan, welke
 * pagina's daaronder hangen, en de metadata van die pagina's (slug, rollen,
 * publicatie, bijlagen). De INHOUD van een pagina bewerk je niet hier maar in
 * /admin/paginas; elke pagina heeft daarvoor een snelkoppeling.
 */
export default async function AdminContent({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;

  const session = await requirePermission("pages.manage");
  const canDeletePages = hasPermission(session, "pages.delete");

  const [tabs, pages, roles] = await Promise.all([
    prisma.headerTab.findMany({ orderBy: { order: "asc" } }),
    prisma.page.findMany({
      include: {
        assets: { orderBy: { order: "asc" } },
        editorRoles: { select: { roleId: true } },
      },
      orderBy: [{ order: "asc" }, { titleNl: "asc" }],
    }),
    prisma.role.findMany({ orderBy: [{ order: "asc" }, { nameNl: "asc" }] }),
  ]);

  const roleOptions: RoleOption[] = roles.map((r) => ({
    id: r.id,
    name: locale === "nl" ? r.nameNl : r.nameEn,
  }));

  const toPageNode = (p: (typeof pages)[number]): PageNode => ({
    id: p.id,
    slug: p.slug,
    headerTabId: p.headerTabId,
    visibleInHeader: p.visibleInHeader,
    titleNl: p.titleNl,
    titleEn: p.titleEn,
    excerptNl: p.excerptNl,
    excerptEn: p.excerptEn,
    published: Boolean(p.publishedAt),
    needsYearlyEdit: p.needsYearlyEdit,
    editorRoleIds: p.editorRoles.map((r) => r.roleId),
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
      roles={roleOptions}
      canDeletePages={canDeletePages}
      usingDefaults={tabs.length === 0}
    />
  );
}
