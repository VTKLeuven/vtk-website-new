import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { needsYearlyReview } from "@/lib/pageAccess";
import { PagesTable, type PageRow } from "./PagesTable";

/**
 * Paginabeheer voor bewerkers: de pagina's waarvan de gebruiker de inhoud mag
 * bewerken (via een paginarol, of allemaal met pages.editAll/superadmin).
 * Jaarlijks na te kijken pagina's die dit werkingsjaar nog niet bewerkt zijn,
 * staan bovenaan met een gele markering. Structuur en metadata (slug, categorie,
 * rollen, publicatie) beheer je in /admin/inhoud.
 */
export default async function AdminPages({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";

  const session = await requireAnyPermission(["pages.edit", "pages.editAll"]);
  const canEditAll = hasPermission(session, "pages.editAll");

  const pages = await prisma.page.findMany({
    where: canEditAll
      ? {}
      : { editorRoles: { some: { roleId: { in: session.roleIds } } } },
    include: {
      headerTab: true,
      editorRoles: { include: { role: true } },
    },
    orderBy: [{ titleNl: "asc" }],
  });

  // Datum server-side formatteren: dan tonen server en client exact hetzelfde
  // (geen hydration-verschil door tijdzone of ICU-versie).
  const dateFormat = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Brussels",
  });

  const rows: PageRow[] = pages.map((p) => ({
    id: p.id,
    title: nl ? p.titleNl : (p.titleEn ?? p.titleNl),
    slug: p.slug,
    category: p.headerTab ? (nl ? p.headerTab.labelNl : p.headerTab.labelEn) : null,
    hasEnglish: Boolean(p.contentMdEn ?? p.contentJsonEn),
    published: p.publishedAt !== null,
    needsYearlyEdit: p.needsYearlyEdit,
    needsReview: needsYearlyReview(p),
    contentEditedAt: p.contentEditedAt ? p.contentEditedAt.toISOString() : null,
    contentEditedLabel: p.contentEditedAt ? dateFormat.format(p.contentEditedAt) : null,
    roleNames: p.editorRoles.map((r) => (nl ? r.role.nameNl : r.role.nameEn)),
  }));

  // Na te kijken pagina's bovenaan; daarbinnen en daaronder alfabetisch.
  rows.sort((a, b) => Number(b.needsReview) - Number(a.needsReview));

  return <PagesTable locale={locale} rows={rows} />;
}
