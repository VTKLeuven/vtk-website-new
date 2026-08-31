import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import {
  ContentManager,
  type TabNode,
  type PageNode,
  type RoleOption,
} from "../inhoud/ContentManager";

/**
 * Beheer van de navigatiestructuur en headercategorieën: welke categorieën in
 * de header staan, taalafhankelijke zichtbaarheid (NL/EN), welke pagina's en
 * vaste links daaronder hangen, en de metadata en categoriekaartfoto's van die
 * items. De inhoud en de bijlagen horen in /admin/paginas.
 */
export default async function AdminHeaderPage({
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
    prisma.headerTab.findMany({
      orderBy: { order: "asc" },
      include: { links: { orderBy: { order: "asc" } } },
    }),
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
        visibleOnCategoryPage: true,
        titleNl: true,
        titleEn: true,
        excerptNl: true,
        excerptEn: true,
        imageKey: true,
        ctaLabelNl: true,
        ctaLabelEn: true,
        ctaUrl: true,
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
    visibleOnCategoryPage: p.visibleOnCategoryPage,
    titleNl: p.titleNl,
    titleEn: p.titleEn,
    excerptNl: p.excerptNl,
    excerptEn: p.excerptEn,
    imageKey: p.imageKey,
    ctaLabelNl: p.ctaLabelNl,
    ctaLabelEn: p.ctaLabelEn,
    ctaUrl: p.ctaUrl,
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
    visibleNl: t.visibleNl,
    visibleEn: t.visibleEn,
    externalUrl: t.externalUrl,
    links: t.links.map((link) => ({
      id: link.id,
      labelNl: link.labelNl,
      labelEn: link.labelEn,
      url: link.url,
      imageKey: link.imageKey,
      order: link.order,
    })),
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
      canDeletePages={canDeletePages}
    />
  );
}
