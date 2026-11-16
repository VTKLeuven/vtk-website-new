import "server-only";

import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import { currentWorkingYear } from "@vtk/auth";
import type { MailGroupAccess } from "./access";
import { type GroupActivity } from "./activity";
import { loadMailGroupActivity } from "./activityData";
import {
  MAIL_GROUP_SELECT,
  type MailGroupForSync,
  desiredFor,
  isArchivedYear,
  loadDesiredContext,
} from "./desired";
import { type MailGroupKind, isMailGroupKind, mailGroupKind } from "./kinds";
import { SOURCE_NAME_SELECT, sourceName } from "./labels";

/**
 * De lijst van /admin/groepsadressen met haar filters, gedeeld door het
 * overzicht en de nakijkmodus (`/nakijken`). Eén plek, zodat "Niemand meer
 * actief" in de nakijkmodus exact dezelfde groepen oplevert als op het
 * overzicht waar je de knop aanklikte.
 */

export type OverviewSearch = {
  soort?: string;
  q?: string;
  archief?: string;
  categorie?: string;
  opruimen?: string;
};

/** "inactief", "leeg" of "verwijderen" (wat in de nakijkmodus op weg staat). */
export type Cleanup = "inactief" | "leeg" | "verwijderen";

export type OverviewRow = {
  id: string;
  email: string;
  name: string;
  kind: MailGroupKind;
  archived: boolean;
  enabled: boolean;
  memberCount: number;
  unlinked: number;
  summary: string;
  owner: string | null;
  year: number | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  existsInGoogle: boolean;
  categoryId: string | null;
  reviewDecision: "KEEP" | "DELETE" | null;
  activity: GroupActivity;
};

const NO_ACTIVITY: GroupActivity = { total: 0, active: 0, unknown: 0, lastYear: null, thisYear: false };

export function isEmptyRow(row: OverviewRow): boolean {
  return row.memberCount === 0;
}

/** Niemand meer actief, en geen groep die naar dit werkingsjaar heet. */
export function isInactiveRow(row: OverviewRow): boolean {
  return row.memberCount > 0 && row.activity.active === 0 && !row.activity.thisYear;
}

/** Zonder accenten en hoofdletters. */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export async function loadMailGroupOverview({
  access,
  nl,
  search,
}: {
  access: MailGroupAccess;
  nl: boolean;
  search: OverviewSearch;
}) {
  const year = currentWorkingYear();
  const where: Prisma.MailGroupWhereInput = access.manageAll
    ? {}
    : { ownerGroupId: { in: [...access.werkgroepIds] } };

  const [mailGroups, categoryRows] = await Promise.all([
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
        reviewDecision: true,
        sources: {
          select: { ...MAIL_GROUP_SELECT.sources.select, ...SOURCE_NAME_SELECT },
        },
      },
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

  const rows: OverviewRow[] = mailGroups.map((g) => {
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
        ...(g.extras.length ? [nl ? `${g.extras.length} los` : `${g.extras.length} loose`] : []),
        ...(g.children.some((c) => c.year === year) ? [nl ? "jaargroep van dit jaar" : "this year's group"] : []),
      ].join(", "),
      owner: g.ownerGroup ? (nl ? g.ownerGroup.nameNl : g.ownerGroup.nameEn) : null,
      year: g.year,
      lastSyncAt: g.lastSyncAt,
      lastError: g.lastError,
      existsInGoogle: Boolean(g.googleId),
      categoryId: g.categoryId,
      reviewDecision: g.reviewDecision,
      activity: activity.get(g.id)?.activity ?? NO_ACTIVITY,
    };
  });

  const kind: MailGroupKind | null = isMailGroupKind(search.soort) ? search.soort : null;
  const showArchive = search.archief === "1";
  const q = normalizeSearchText((search.q ?? "").trim());
  // `geen` = zonder categorie; een hoofdcategorie toont ook haar subcategorieën.
  const categoryFilter =
    search.categorie === "geen" || (search.categorie && categoryById.has(search.categorie))
      ? search.categorie
      : null;
  const cleanup: Cleanup | null =
    search.opruimen === "inactief" || search.opruimen === "leeg" || search.opruimen === "verwijderen"
      ? search.opruimen
      : null;
  const inCategory = (row: OverviewRow) =>
    !categoryFilter ||
    (categoryFilter === "geen"
      ? !row.categoryId
      : row.categoryId === categoryFilter || topOf(row.categoryId) === categoryFilter);
  const matchesCleanup = (row: OverviewRow) =>
    !cleanup ||
    (cleanup === "leeg"
      ? isEmptyRow(row)
      : cleanup === "inactief"
        ? isInactiveRow(row)
        : row.reviewDecision === "DELETE");

  const base0 = rows.filter((row) => showArchive || !row.archived);
  const visible = base0.filter(
    (row) =>
      (!kind || row.kind === kind) &&
      inCategory(row) &&
      matchesCleanup(row) &&
      (!q ||
        normalizeSearchText(`${row.email} ${row.name} ${row.summary} ${categoryLabel(row.categoryId) ?? ""}`).includes(q)),
  );

  return {
    rows,
    base0,
    visible,
    categoryRows,
    categoryLabel,
    topOf,
    filter: { kind, showArchive, q, categoryFilter, cleanup },
  };
}

/** De query van de huidige filter, om ze mee te geven aan een link. */
export function overviewQuery(
  filter: { kind: string | null; showArchive: boolean; categoryFilter: string | null; cleanup: string | null },
  rawQ: string | undefined,
  patch: Record<string, string | null> = {},
): string {
  const params = new URLSearchParams();
  const next: Record<string, string | null> = {
    categorie: filter.categoryFilter,
    soort: filter.kind,
    opruimen: filter.cleanup,
    q: rawQ ?? null,
    archief: filter.showArchive ? "1" : null,
    ...patch,
  };
  for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `?${query}` : "";
}
