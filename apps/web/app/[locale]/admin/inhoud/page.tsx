import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { ContentManager, type TabNode, type PageNode, type RoleOption } from "./ContentManager";

/**
 * Beheer van de navigatiestructuur: welke categorieën in de header staan, welke
 * pagina's daaronder hangen, en de metadata van die pagina's (titels, slug,
 * publicatie, bewerkrollen). De INHOUD, de bijlagen en het verwijderen van een
 * pagina horen in /admin/paginas; elke pagina heeft daarvoor een snelkoppeling.
 */
export default async function AdminContent({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;

  await requirePermission("pages.manage");

  const [tabs, pages, roles] = await Promise.all([
    prisma.headerTab.findMany({ orderBy: { order: "asc" } }),
    // Enkel de pagina's die in de boom staan (losse pagina's hangen per definitie
    // nergens onder), en enkel de velden die de inspector toont. De markdown en
    // de bijlagen blijven bewust ongelezen: die zijn groot en worden hier niet
    // bewerkt.
    prisma.page.findMany({
      where: { headerTabId: { not: null } },
      select: {
        id: true,
        slug: true,
        headerTabId: true,
        visibleInHeader: true,
        titleNl: true,
        titleEn: true,
        excerptNl: true,
        excerptEn: true,
        publishedAt: true,
        needsYearlyEdit: true,
        order: true,
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

  return (
    <ContentManager
      locale={locale}
      tabs={tabNodes}
      roles={roleOptions}
      usingDefaults={tabs.length === 0}
    />
  );
}
