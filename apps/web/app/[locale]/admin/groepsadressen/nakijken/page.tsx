import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { mailGroupAccess } from "@/lib/google/access";
import { mailGroupKindLabel } from "@/lib/google/kinds";
import { type OverviewSearch, loadMailGroupOverview, overviewQuery } from "@/lib/google/overview";
import { formatWorkingYear } from "@/lib/workingYear";
import { type ReviewItem, ReviewMode } from "./ReviewMode";

/**
 * De nakijkmodus: de groepen van de huidige filter op het overzicht, één voor
 * één, met wie erin zit en drie knoppen (houden, weg, overslaan). Een
 * beslissing wordt bewaard, zodat zevenhonderd groepen in meerdere keren kunnen.
 * "Weg" verwijdert nog niets: de lijst te verwijderen groepen bevestig je in één
 * keer. Zie docs/design-decisions.md, "Nakijken, één voor één".
 */
export default async function ReviewMailGroups({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<OverviewSearch & { alles?: string }>;
}) {
  const [{ locale: localeParam }, search] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/groepsadressen`;

  const access = await mailGroupAccess();
  if (!access.manageAll) throw new Error("FORBIDDEN");

  const overview = await loadMailGroupOverview({ access, nl, search });
  const { visible, base0, categoryRows, categoryLabel } = overview;
  const { kind, cleanup, categoryFilter, q } = overview.filter;

  const items: ReviewItem[] = visible.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    category: categoryLabel(row.categoryId),
    categoryId: row.categoryId,
    summary: row.summary,
    memberCount: row.memberCount,
    active: row.activity.active,
    unknown: row.activity.unknown,
    thisYear: row.activity.thisYear,
    lastYear:
      row.activity.active === 0 && row.activity.lastYear !== null ? formatWorkingYear(row.activity.lastYear) : null,
    decision: row.reviewDecision,
  }));
  const visibleIds = new Set(visible.map((r) => r.id));
  const deleteElsewhere = base0.filter((r) => r.reviewDecision === "DELETE" && !visibleIds.has(r.id)).length;

  // Wat de filter is, in woorden, bovenaan de nakijkmodus.
  const describe = [
    categoryFilter === "geen"
      ? nl
        ? "zonder categorie"
        : "no category"
      : categoryFilter
        ? (categoryLabel(categoryFilter) ?? null)
        : null,
    kind ? mailGroupKindLabel(kind, nl).toLowerCase() : null,
    cleanup === "inactief"
      ? nl
        ? "niemand meer actief"
        : "nobody active"
      : cleanup === "leeg"
        ? nl
          ? "leeg"
          : "empty"
        : cleanup === "verwijderen"
          ? nl
            ? "te verwijderen"
            : "to delete"
          : null,
    q ? `${nl ? "zoek" : "search"}: ${search.q}` : null,
  ].filter(Boolean) as string[];

  const tree = categoryRows.filter((c) => !c.parentId);
  const categoryOptions = tree.flatMap((c) => [
    { value: c.id, label: c.name, hint: nl ? "hoofdcategorie" : "main category", group: c.name },
    ...categoryRows.filter((s) => s.parentId === c.id).map((s) => ({ value: s.id, label: s.name, group: c.name })),
  ]);

  return (
    <ReviewMode
      // Een andere filter is een andere stapel.
      key={overviewQuery(overview.filter, search.q)}
      nl={nl}
      base={base}
      backHref={`${base}${overviewQuery(overview.filter, search.q)}`}
      filterLabel={describe.join(" · ")}
      items={items}
      startWithAll={search.alles === "1"}
      deleteElsewhere={deleteElsewhere}
      categoryOptions={categoryOptions}
    />
  );
}
