import { notFound } from "next/navigation";
import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import { currentWorkingYear } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { getGoogleStatus } from "@/lib/google/config";
import { canSeeMailGroups, mailGroupAccess } from "@/lib/google/access";
import {
  MAIL_GROUP_SELECT,
  type MailGroupForSync,
  desiredFor,
  isArchivedYear,
  loadDesiredContext,
} from "@/lib/google/desired";
import {
  MAIL_GROUP_KINDS,
  type MailGroupKind,
  isMailGroupKind,
  mailGroupKind,
  mailGroupKindLabel,
} from "@/lib/google/kinds";
import { SOURCE_NAME_SELECT, sourceName } from "@/lib/google/labels";
import { loadMailGroupActivity } from "@/lib/google/activityData";
import { formatWorkingYear } from "@/lib/workingYear";
import { MailGroupsToolbar } from "./MailGroupsToolbar";
import { type CategoryNode, MailGroupCategories } from "./MailGroupCategories";
import { type MailGroupRow, MailGroupTable, type TableSection } from "./MailGroupTable";
import { NewMailGroup } from "./NewMailGroup";

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

  const year = currentWorkingYear();
  const where: Prisma.MailGroupWhereInput = access.manageAll
    ? {}
    : { ownerGroupId: { in: [...access.werkgroepIds] } };

  const [mailGroups, status, pendingRequests, werkgroepen, categoryRows] = await Promise.all([
    prisma.mailGroup.findMany({
      where,
      orderBy: { email: "asc" },
      select: {
        ...MAIL_GROUP_SELECT,
        lastSyncAt: true,
        lastError: true,
        lastMemberCount: true,
        ownerGroup: { select: { nameNl: true, nameEn: true } },
        categoryId: true,
        sources: {
          select: { ...MAIL_GROUP_SELECT.sources.select, ...SOURCE_NAME_SELECT },
        },
      },
    }),
    getGoogleStatus(),
    access.approveAccounts
      ? prisma.werkgroepAccount.count({ where: { status: "REQUESTED" } })
      : Promise.resolve(0),
    prisma.group.findMany({
      where: access.manageAll
        ? { type: "WERKGROEP", active: true }
        : { id: { in: [...access.werkgroepIds] } },
      select: { id: true, nameNl: true, nameEn: true, mailPrefix: true },
      orderBy: { nameNl: "asc" },
    }),
    access.manageAll
      ? prisma.mailGroupCategory.findMany({
          select: { id: true, name: true, parentId: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const ctx = await loadDesiredContext(mailGroups as unknown as MailGroupForSync[], year);
  const activity = await loadMailGroupActivity(mailGroups as unknown as MailGroupForSync[], ctx);

  // Categorieën: hoofdcategorie met haar subcategorieën, alfabetisch.
  const categoryById = new Map(categoryRows.map((c) => [c.id, c]));
  const categoryLabel = (id: string | null): string | null => {
    const c = id ? categoryById.get(id) : undefined;
    if (!c) return null;
    const parent = c.parentId ? categoryById.get(c.parentId) : undefined;
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };
  const topOf = (id: string | null): string | null => {
    const c = id ? categoryById.get(id) : undefined;
    return c ? (c.parentId ?? c.id) : null;
  };

  const rows = mailGroups.map((g) => {
    const kind = mailGroupKind({
      ...g,
      sources: g.sources.map((s) => ({ ...s, groupKind: s.group?.type ?? null })),
    });
    const archived = isArchivedYear(g, year);
    const computed = archived ? null : desiredFor(g as unknown as MailGroupForSync, ctx);
    return {
      id: g.id,
      email: g.email,
      name: g.name,
      kind,
      archived,
      enabled: g.enabled,
      memberCount: computed ? computed.emails.length : g.lastMemberCount,
      unlinked: computed?.unlinked.length ?? 0,
      summary: [
        ...g.sources.map((s) => sourceName(s, nl)),
        ...(g.extras.length
          ? [nl ? `${g.extras.length} los` : `${g.extras.length} loose`]
          : []),
        ...(g.children.some((c) => c.year === year)
          ? [nl ? "jaargroep van dit jaar" : "this year's group"]
          : []),
      ].join(", "),
      owner: g.ownerGroup ? (nl ? g.ownerGroup.nameNl : g.ownerGroup.nameEn) : null,
      year: g.year,
      lastSyncAt: g.lastSyncAt,
      lastError: g.lastError,
      existsInGoogle: Boolean(g.googleId),
      categoryId: g.categoryId,
      activity: activity.get(g.id)?.activity ?? { total: 0, active: 0, unknown: 0, lastYear: null, thisYear: false },
    };
  });

  const kind: MailGroupKind | null = isMailGroupKind(filters.soort) ? filters.soort : null;
  const showArchive = filters.archief === "1";
  const q = normalizeSearchText((filters.q ?? "").trim());
  // `geen` = zonder categorie; een hoofdcategorie toont ook haar subcategorieën.
  const categoryFilter =
    filters.categorie === "geen" || (filters.categorie && categoryById.has(filters.categorie))
      ? filters.categorie
      : null;
  const cleanup = filters.opruimen === "inactief" || filters.opruimen === "leeg" ? filters.opruimen : null;
  const isEmpty = (row: (typeof rows)[number]) => row.memberCount === 0;
  const isInactive = (row: (typeof rows)[number]) =>
    row.memberCount > 0 && row.activity.active === 0 && !row.activity.thisYear;
  const inCategory = (row: (typeof rows)[number]) =>
    !categoryFilter ||
    (categoryFilter === "geen"
      ? !row.categoryId
      : row.categoryId === categoryFilter || topOf(row.categoryId) === categoryFilter);

  const base0 = rows.filter((row) => showArchive || !row.archived);
  const visible = base0.filter(
    (row) =>
      (!kind || row.kind === kind) &&
      inCategory(row) &&
      (!cleanup || (cleanup === "leeg" ? isEmpty(row) : isInactive(row))) &&
      (!q ||
        normalizeSearchText(`${row.email} ${row.name} ${row.summary} ${categoryLabel(row.categoryId) ?? ""}`).includes(q)),
  );
  const counts = new Map<MailGroupKind, number>();
  for (const row of base0) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  const archivedCount = rows.filter((row) => row.archived).length;
  const inactiveCount = base0.filter(isInactive).length;
  const emptyCount = base0.filter(isEmpty).length;

  // Per categorie: wat er rechtstreeks in zit, en voor een hoofdcategorie ook
  // wat in haar subcategorieën zit (dat toont de chip).
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
  const withChildren = (c: CategoryNode) => c.count + c.children.reduce((n, s) => n + s.count, 0);
  const uncategorised = base0.filter((row) => !row.categoryId).length;
  const openTop = categoryFilter && categoryFilter !== "geen" ? topOf(categoryFilter) : null;
  const openNode = tree.find((c) => c.id === openTop) ?? null;

  const href = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const next = {
      categorie: categoryFilter,
      soort: kind,
      opruimen: cleanup,
      q: filters.q ?? null,
      archief: showArchive ? "1" : null,
      ...patch,
    };
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    const query = params.toString();
    return `${base}${query ? `?${query}` : ""}`;
  };

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const tableRows: MailGroupRow[] = visible.map((row) => ({
    id: row.id,
    categoryId: row.categoryId,
    unknown: row.activity.unknown,
    thisYear: row.activity.thisYear,
    email: row.email,
    name: row.name,
    category: categoryLabel(row.categoryId),
    summary: row.summary,
    owner: row.owner,
    archived: row.archived,
    enabled: row.enabled,
    memberCount: row.memberCount,
    unlinked: row.unlinked,
    active: row.activity.active,
    lastYear:
      row.activity.active === 0 && row.activity.lastYear !== null
        ? formatWorkingYear(row.activity.lastYear)
        : null,
    lastSync: row.lastSyncAt ? dateFmt.format(row.lastSyncAt) : nl ? "nog niet" : "not yet",
    notInGoogle: !row.existsInGoogle,
    lastError: row.lastError,
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

  const ownPrefixes = werkgroepen
    .filter((g) => g.mailPrefix)
    .map((g) => ({ id: g.id, name: nl ? g.nameNl : g.nameEn, prefix: g.mailPrefix as string }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-vtk-ink">
          {nl ? "Groepsadressen" : "Group addresses"}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          {access.manageAll
            ? nl
              ? "Alle Google-groepen van de kring. Een adres beschrijft wie erin hoort: posten, een kiesploeg, een POC of losse leden. De leden worden bij elke synchronisatie herberekend; wat hier staat, staat binnen de vijf minuten in Google."
              : "All Google groups of the association. An address describes who belongs in it: posts, a kiesploeg, a POC or loose members. Members are recalculated on every synchronisation; what is here is in Google within five minutes."
            : nl
              ? "De groepsadressen van je werkgroep. Je zet hier zelf leden in en uit, maakt een nieuw adres met het voorvoegsel van je werkgroep, en vraagt accounts aan."
              : "Your work group's addresses. Add and remove members yourself, create a new address with your work group's prefix, and request accounts."}
        </p>
        {!status.configured && (
          <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {nl
              ? "Google Workspace is nog niet ingesteld (Admin > IT). Je kan de lijsten hier al opbouwen; er wordt nog niets naar Google geschreven."
              : "Google Workspace is not set up yet (Admin > IT). You can already build the lists here; nothing is written to Google yet."}
          </p>
        )}
      </div>

      <MailGroupsToolbar
        nl={nl}
        base={base}
        manageAll={access.manageAll}
        approveAccounts={access.approveAccounts}
        pendingRequests={pendingRequests}
        canRequestAccounts={ownPrefixes.length > 0}
      />

      {access.manageAll && <MailGroupCategories nl={nl} categories={tree} />}

      {access.manageAll && (
        <div className="space-y-2">
          <nav className="flex flex-wrap items-center gap-2" aria-label={nl ? "Categorie" : "Category"}>
            <FilterChip href={href({ categorie: null })} active={!categoryFilter}>
              {nl ? "Alle" : "All"} <span className="tabular-nums">{base0.length}</span>
            </FilterChip>
            {tree.map((c) => (
              <FilterChip key={c.id} href={href({ categorie: c.id })} active={openTop === c.id}>
                {c.name} <span className="tabular-nums">{withChildren(c)}</span>
              </FilterChip>
            ))}
            {tree.length > 0 && (
              <FilterChip href={href({ categorie: "geen" })} active={categoryFilter === "geen"}>
                {nl ? "Zonder categorie" : "No category"} <span className="tabular-nums">{uncategorised}</span>
              </FilterChip>
            )}
          </nav>
          {openNode && openNode.children.length > 0 && (
            <nav
              className="flex flex-wrap items-center gap-2 border-l-2 border-vtk-yellow pl-3"
              aria-label={nl ? `Subcategorie van ${openNode.name}` : `Subcategory of ${openNode.name}`}
            >
              <FilterChip href={href({ categorie: openNode.id })} active={categoryFilter === openNode.id} small>
                {nl ? `Alles in ${openNode.name}` : `All of ${openNode.name}`}
              </FilterChip>
              {openNode.children.map((sub) => (
                <FilterChip key={sub.id} href={href({ categorie: sub.id })} active={categoryFilter === sub.id} small>
                  {sub.name} <span className="tabular-nums">{sub.count}</span>
                </FilterChip>
              ))}
            </nav>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {MAIL_GROUP_KINDS.filter((k) => k !== "overig" && counts.get(k)).map((k) => (
              <FilterChip key={k} href={href({ soort: kind === k ? null : k })} active={kind === k} small>
                {mailGroupKindLabel(k, nl)} <span className="tabular-nums">{counts.get(k)}</span>
              </FilterChip>
            ))}
            {inactiveCount > 0 && (
              <FilterChip
                href={href({ opruimen: cleanup === "inactief" ? null : "inactief" })}
                active={cleanup === "inactief"}
                small
              >
                {nl ? "Niemand meer actief" : "Nobody active"} <span className="tabular-nums">{inactiveCount}</span>
              </FilterChip>
            )}
            {emptyCount > 0 && (
              <FilterChip href={href({ opruimen: cleanup === "leeg" ? null : "leeg" })} active={cleanup === "leeg"} small>
                {nl ? "Leeg" : "Empty"} <span className="tabular-nums">{emptyCount}</span>
              </FilterChip>
            )}
            {archivedCount > 0 && (
              <Link href={href({ archief: showArchive ? null : "1" })} className="vtk-link ml-1 text-sm">
                {showArchive
                  ? nl
                    ? "Archief verbergen"
                    : "Hide archive"
                  : nl
                    ? `Archief tonen (${archivedCount})`
                    : `Show archive (${archivedCount})`}
              </Link>
            )}
            <form action={base} className="ml-auto">
              {categoryFilter && <input type="hidden" name="categorie" value={categoryFilter} />}
              {kind && <input type="hidden" name="soort" value={kind} />}
              {cleanup && <input type="hidden" name="opruimen" value={cleanup} />}
              {showArchive && <input type="hidden" name="archief" value="1" />}
              <input
                type="search"
                name="q"
                defaultValue={filters.q ?? ""}
                placeholder={nl ? "Zoek, bv. activiteiten_" : "Search, e.g. activiteiten_"}
                aria-label={nl ? "Zoek een adres" : "Search an address"}
                className="h-9 w-56 rounded-full border border-vtk-blue/15 bg-white px-4 text-sm"
              />
            </form>
          </div>
          {cleanup === "inactief" && (
            <p className="max-w-3xl text-sm text-zinc-500">
              {nl
                ? "Groepen waarin niemand nog actief is: geen post of werkgroep dit werkingsjaar, geen studie bevestigd dit academiejaar, en geen groep met actieve leden. Klik op \"niemand\" om te zien wie erin zit; vink aan wat weg mag."
                : "Groups where nobody is active anymore: no post or work group this working year, no studies confirmed this academic year, and no group with active members. Click \"nobody\" to see who is in it; select what can go."}
            </p>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {rows.length === 0
            ? nl
              ? "Nog geen groepsadressen."
              : "No group addresses yet."
            : nl
              ? "Geen adressen voor deze filter."
              : "No addresses for this filter."}
        </p>
      ) : (
        <MailGroupTable
          // Een andere filter is een nieuwe lijst: selectie en open blokken beginnen opnieuw.
          key={`${categoryFilter}|${kind}|${cleanup}|${filters.q ?? ""}|${showArchive}`}
          sections={sections}
          sectionsOpen={Boolean(kind || cleanup || q)}
          nl={nl}
          base={base}
          manageAll={access.manageAll}
          rows={tableRows}
          categoryOptions={tree.flatMap((c) => [
            // Per hoofdcategorie één kop, met de hoofdcategorie zelf bovenaan.
            { value: c.id, label: c.name, hint: nl ? "hoofdcategorie" : "main category", group: c.name },
            ...c.children.map((sub) => ({ value: sub.id, label: sub.name, group: c.name })),
          ])}
        />
      )}

      <NewMailGroup
        nl={nl}
        domain={status.domain ?? "vtk.be"}
        manageAll={access.manageAll}
        werkgroepen={ownPrefixes}
      />
    </div>
  );
}

/** Zonder accenten en hoofdletters; `admin-table` is een clientmodule. */
function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function FilterChip({
  href,
  active,
  small = false,
  children,
}: {
  href: string;
  active: boolean;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border text-sm",
        small ? "h-7 px-2.5 text-[13px]" : "h-8 px-3",
        active
          ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
          : "border-vtk-blue/15 bg-white text-vtk-ink hover:border-vtk-blue/30",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
