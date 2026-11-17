import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import Link from "@/components/ui/Link";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { getGoogleStatus } from "@/lib/google/config";
import { canSeeMailGroups, mailGroupAccess } from "@/lib/google/access";
import { MAIL_GROUP_KINDS, type MailGroupKind, mailGroupKindLabel } from "@/lib/google/kinds";
import { isEmptyRow, loadMailGroupOverview, normalizeSearchText } from "@/lib/google/overview";
import { type CategoryNode, MailGroupCategories } from "./MailGroupCategories";
import { type MailGroupRow, MailGroupTable, type TableSection } from "./MailGroupTable";
import { type OverviewChip, OverviewFilters } from "./OverviewFilters";

/**
 * Groepsadressen: alle Google-groepen van de kring, beheerd vanuit de site in
 * plaats van de Admin console.
 *
 * Een lijst is een regel (posten, een kiesploeg, een POC, losse leden), en het
 * scherm berekent de leden zelf, los van wat er in Google staat. Zo zie je
 * meteen wie een regel oplevert, ook voor de eerste sync.
 *
 * Bewust iets anders dan /admin/mailinglijsten: dat zijn de opt-in
 * nieuwsbrieven naar studenten. Zie docs/design-decisions.md.
 *
 * Een werkgroep met een voorvoegsel ziet hier enkel haar eigen lijsten; zie
 * `lib/google/access.ts`.
 */
export default async function AdminMailGroups({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    soort?: string;
    q?: string;
    archief?: string;
    categorie?: string;
    opruimen?: string;
  }>;
}) {
  const [{ locale: localeParam }, filters] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/groepsadressen`;

  const access = await mailGroupAccess();
  if (!canSeeMailGroups(access)) throw new Error("FORBIDDEN");

  // De zoekterm filtert in de browser (`MailGroupTable`), niet hier: zo blijft
  // ze staan wanneer je een adres opent en terugkeert, zonder elke letter een
  // volledige render van zevenhonderd groepen.
  const [overview, status] = await Promise.all([
    loadMailGroupOverview({ access, nl, search: { ...filters, q: undefined } }),
    getGoogleStatus(),
  ]);
  const { rows, base0, visible, categoryRows, categoryLabel } = overview;
  const { kind, showArchive, categoryFilter, cleanup } = overview.filter;

  const counts = new Map<MailGroupKind, number>();
  for (const row of base0) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  const archivedCount = rows.filter((row) => row.archived).length;
  const emptyCount = base0.filter(isEmptyRow).length;
  const toDeleteCount = base0.filter((row) => row.reviewDecision === "DELETE").length;

  // Per categorie: wat er rechtstreeks in zit.
  const direct = new Map<string, number>();
  for (const row of base0) if (row.categoryId) direct.set(row.categoryId, (direct.get(row.categoryId) ?? 0) + 1);
  const tree: CategoryNode[] = categoryRows
    .filter((c) => !c.parentId)
    .map((c) => ({
      id: c.id,
      name: c.name,
      count: direct.get(c.id) ?? 0,
      children: categoryRows
        .filter((s) => s.parentId === c.id)
        .map((s) => ({ id: s.id, name: s.name, count: direct.get(s.id) ?? 0 })),
    }));
  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const tableRows: MailGroupRow[] = visible.map((row) => ({
    id: row.id,
    categoryId: row.categoryId,
    decision: row.reviewDecision,
    internalOnly: !row.allowExternalSenders,
    email: row.email,
    name: row.name,
    category: categoryLabel(row.categoryId),
    summary: row.summary,
    owner: row.owner,
    archived: row.archived,
    enabled: row.enabled,
    memberCount: row.memberCount,
    active: row.activity.active,
    lastSync: row.lastSyncAt ? dateFmt.format(row.lastSyncAt) : nl ? "nog niet" : "not yet",
    notInGoogle: !row.existsInGoogle,
    lastError: row.lastError,
    search: normalizeSearchText(
      [row.email, row.name, row.summary, row.owner ?? "", categoryLabel(row.categoryId) ?? ""].join(" "),
    ),
  }));

  // Zonder gekozen categorie: per categorie een blok dat dichtklapt, met de
  // subcategorieën eronder en "Zonder categorie" als laatste. Lege blokken vallen weg.
  const idsIn = (categoryId: string | null) =>
    tableRows.filter((r) => r.categoryId === categoryId).map((r) => r.id);
  const sections: TableSection[] | null =
    access.manageAll && !categoryFilter && tree.length > 0
      ? [
          ...tree.map((c) => ({
            key: c.id,
            label: c.name,
            rowIds: idsIn(c.id),
            children: c.children
              .map((sub) => ({ key: sub.id, label: sub.name, rowIds: idsIn(sub.id) }))
              .filter((sub) => sub.rowIds.length > 0),
          })),
          { key: "geen", label: nl ? "Zonder categorie" : "No category", rowIds: idsIn(null), children: [] },
        ].filter((s) => s.rowIds.length > 0 || s.children.length > 0)
      : null;

  const chips: OverviewChip[] = [
    ...MAIL_GROUP_KINDS.filter((k) => k !== "overig" && counts.get(k)).map((k) => ({
      param: "soort",
      value: k,
      label: mailGroupKindLabel(k, nl),
      count: counts.get(k) ?? 0,
      active: kind === k,
    })),
    ...(emptyCount > 0
      ? [{ param: "opruimen", value: "leeg", label: nl ? "Leeg" : "Empty", count: emptyCount, active: cleanup === "leeg" }]
      : []),
    ...(toDeleteCount > 0
      ? [
          {
            param: "opruimen",
            value: "verwijderen",
            label: nl ? "Te verwijderen" : "To delete",
            count: toDeleteCount,
            active: cleanup === "verwijderen",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-zinc-500">
          {access.manageAll
            ? nl
              ? "Alle Google-groepen van de kring. Een adres beschrijft wie erin hoort: posten, een kiesploeg, een POC of losse leden; wat hier staat, staat binnen de vijf minuten in Google."
              : "All Google groups of the association. An address describes who belongs in it: posts, a kiesploeg, a POC or loose members; what is here is in Google within five minutes."
            : nl
              ? "De groepsadressen van je werkgroep. Je zet hier zelf leden in en uit en maakt een nieuw adres met het voorvoegsel van je werkgroep."
              : "Your work group's addresses. Add and remove members yourself and create a new address with your work group's prefix."}
        </p>
        {(access.manageAll || access.werkgroepIds.size > 0) && (
          <Link
            href={`${base}/nieuw`}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-vtk-ink px-4 text-sm font-medium text-vtk-surface no-underline hover:opacity-90"
          >
            <Plus aria-hidden="true" size={16} />
            {nl ? "Nieuw groepsadres" : "New group address"}
          </Link>
        )}
      </div>

      {!status.configured && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {nl
            ? "Google Workspace is nog niet ingesteld (Admin > IT). Je kan de lijsten hier al opbouwen; er wordt nog niets naar Google geschreven."
            : "Google Workspace is not set up yet (Admin > IT). You can already build the lists here; nothing is written to Google yet."}
        </p>
      )}

      {access.manageAll && (chips.length > 0 || archivedCount > 0) && (
        <OverviewFilters
          nl={nl}
          chips={chips}
          archivedCount={archivedCount}
          showArchive={showArchive}
          note={
            cleanup === "verwijderen"
              ? nl
                ? "Wat je in de nakijkmodus op \"weg\" zette. Er is nog niets verwijderd: vink alles aan en kies \"Verwijderen uit Google\"."
                : "What you marked \"remove\" in review mode. Nothing has been deleted yet: select all and choose \"Delete from Google\"."
              : null
          }
        />
      )}

      <MailGroupTable
        // Een andere filter is een nieuwe lijst: selectie en open blokken beginnen opnieuw.
        key={`${categoryFilter}|${kind}|${cleanup}|${showArchive}`}
        sections={sections}
        sectionsOpen={Boolean(kind || cleanup)}
        nl={nl}
        base={base}
        manageAll={access.manageAll}
        canSync={access.manageAll}
        rows={tableRows}
        categoryOptions={tree.flatMap((c) => [
          // Per hoofdcategorie één kop, met de hoofdcategorie zelf bovenaan.
          { value: c.id, label: c.name, hint: nl ? "hoofdcategorie" : "main category", group: c.name },
          ...c.children.map((sub) => ({ value: sub.id, label: sub.name, group: c.name })),
        ])}
      />

      {rows.length === 0 && (
        <p className="text-sm text-zinc-500">{nl ? "Nog geen groepsadressen." : "No group addresses yet."}</p>
      )}

      {access.manageAll && <MailGroupCategories nl={nl} categories={tree} />}
    </div>
  );
}
