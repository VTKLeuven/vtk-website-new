import { notFound } from "next/navigation";
import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { getGoogleStatus } from "@/lib/google/config";
import { canEditMembers, mailGroupAccess } from "@/lib/google/access";
import {
  MAIL_GROUP_SELECT,
  type MailGroupForSync,
  desiredFor,
  isArchivedYear,
  loadDesiredContext,
} from "@/lib/google/desired";
import { memberAddress, normaliseEmail } from "@/lib/google/members";
import { renderAddress, yearVars } from "@/lib/google/addresses";
import { IMPORTED_NOTE } from "@/lib/google/import";
import { SOURCE_NAME_SELECT, sourceName } from "@/lib/google/labels";
import { loadMailGroupActivity } from "@/lib/google/activityData";
import { toStatusView } from "@/lib/google/activityLabels";
import { loadCategoryOptions, loadSourceOptions, type SourceOptionGroup } from "@/lib/google/mailGroupOptions";
import { MailGroupDetail, type MemberRow } from "./MailGroupDetail";
import { OverviewBackLink } from "../OverviewBackLink";

/**
 * Eén groepsadres: wie erin zit en waarom, de bronnen, de losse leden, de
 * jaargroepen en de instellingen.
 *
 * De ledenlijst bovenaan is berekend, niet uit Google gelezen: dezelfde
 * berekening als de sync (`lib/google/desired.ts`), dus wat hier staat, staat
 * binnen de vijf minuten in Google.
 */
export default async function MailGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ locale: localeParam, id }, { tab }] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = `${nl ? "" : "/en"}/admin/groepsadressen`;

  const access = await mailGroupAccess();
  const row = await prisma.mailGroup.findUnique({
    where: { id },
    select: {
      ...MAIL_GROUP_SELECT,
      lastSyncAt: true,
      lastError: true,
      importedAt: true,
      categoryId: true,
      category: { select: { name: true, parent: { select: { name: true } } } },
      ownerGroup: { select: { id: true, nameNl: true, nameEn: true, mailPrefix: true } },
      parent: { select: { id: true, email: true } },
      yearlyGroup: { select: { nameNl: true, nameEn: true } },
      sources: {
        select: { id: true, ...MAIL_GROUP_SELECT.sources.select, ...SOURCE_NAME_SELECT },
      },
      extras: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          email: true,
          kind: true,
          note: true,
          user: { select: MAIL_GROUP_SELECT.extras.select.user.select },
        },
      },
      children: {
        orderBy: { year: "desc" },
        select: { id: true, email: true, year: true, enabled: true, lastMemberCount: true },
      },
    },
  });
  if (!row) notFound();
  if (!canEditMembers(access, row)) throw new Error("FORBIDDEN");

  const year = currentWorkingYear();
  const status = await getGoogleStatus();
  const domain = status.domain ?? "vtk.be";
  const archived = isArchivedYear(row, year);
  const syncRow = row as unknown as MailGroupForSync;
  const ctx = await loadDesiredContext([syncRow], year);
  const computed = desiredFor(syncRow, ctx);
  const activity = (await loadMailGroupActivity([syncRow], ctx)).get(row.id);

  // Wie bij welk adres hoort, om de berekende lijst met namen te tonen.
  const names = new Map<string, string>();
  const remember = (user: { name: string; googleEmail: string | null; siteEmail?: string | null; werkgroepEmails?: Record<string, string> }) => {
    for (const address of [user.googleEmail, user.siteEmail, ...Object.values(user.werkgroepEmails ?? {})]) {
      if (address) names.set(normaliseEmail(address), user.name);
    }
  };
  for (const m of ctx.memberships) remember(m.user);
  for (const m of ctx.kiesploeg) remember(m.user);
  for (const r of ctx.pocRepresentatives) remember(r.user);
  for (const extra of row.extras) {
    if (extra.user) {
      remember({
        name: extra.user.name,
        googleEmail: extra.user.googleEmail,
        werkgroepEmails: Object.fromEntries(extra.user.werkgroepAccounts.map((a) => [a.groupId, a.email])),
      });
    }
  }
  for (const child of row.children) names.set(child.email, nl ? "jaargroep" : "yearly group");

  const [groups, werkgroepen, ownMembers, categoryOptions] = await Promise.all([
    access.manageAll
      ? prisma.group.findMany({
          where: { active: true },
          select: { id: true, nameNl: true, nameEn: true, type: true },
          orderBy: { nameNl: "asc" },
        })
      : [],
    access.manageAll
      ? prisma.group.findMany({
          where: { type: "WERKGROEP", active: true },
          select: { id: true, nameNl: true, nameEn: true, mailPrefix: true },
          orderBy: { nameNl: "asc" },
        })
      : [],
    // Een werkgroep kiest leden uit haar eigen ploeg van dit jaar.
    row.ownerGroupId
      ? prisma.groupMembership.findMany({
          where: { groupId: row.ownerGroupId, year, user: { active: true, deletedAt: null } },
          select: { user: { select: { id: true, name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : [],
    access.manageAll ? loadCategoryOptions(nl) : [],
  ]);

  const g = (x: { nameNl: string; nameEn: string }) => (nl ? x.nameNl : x.nameEn);
  const sourceOptions: SourceOptionGroup[] = access.manageAll
    ? await loadSourceOptions(nl)
    : row.ownerGroup
      ? [
          {
            label: nl ? "Werkgroep" : "Work group",
            options: [{ value: `group:${row.ownerGroup.id}`, label: g(row.ownerGroup) }],
          },
        ]
      : [];

  const ownerId = row.ownerGroupId;
  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Eén rij per adres in de lijst, met waarom het erin zit; daarna de regels
  // die geen adres opleveren (uitsluitingen, leden zonder account).
  const extraAddress = (e: (typeof row.extras)[number]): string | null =>
    e.user
      ? memberAddress(
          {
            id: e.user.id,
            name: e.user.name,
            googleEmail: e.user.googleEmail,
            werkgroepEmails: Object.fromEntries(e.user.werkgroepAccounts.map((a) => [a.groupId, a.email])),
          },
          ownerId,
        )
      : e.email
        ? normaliseEmail(e.email)
        : null;
  const includeByAddress = new Map<string, (typeof row.extras)[number]>();
  for (const e of row.extras) {
    const address = extraAddress(e);
    if (e.kind === "INCLUDE" && address) includeByAddress.set(address, e);
  }
  const childEmails = new Set(row.children.map((c) => c.email));
  const nestedEmails = (activity?.members ?? []).filter((m) => m.status.kind === "group").map((m) => m.email);
  const nestedIds = new Map(
    (nestedEmails.length
      ? await prisma.mailGroup.findMany({ where: { email: { in: nestedEmails } }, select: { id: true, email: true } })
      : []
    ).map((g) => [g.email, g.id]),
  );
  const memberRows: MemberRow[] = (activity?.members ?? []).map(({ email, status }) => {
    const extra = includeByAddress.get(email);
    return {
      key: `m:${email}`,
      address: email,
      groupId: nestedIds.get(email) ?? null,
      name: ("name" in status ? status.name : null) ?? names.get(email) ?? null,
      via: extra ? "loose" : childEmails.has(email) ? "yearly" : "source",
      extraId: extra?.id ?? null,
      note: extra?.note && extra.note !== IMPORTED_NOTE ? extra.note : null,
      status: toStatusView(status),
    };
  });
  for (const e of row.extras) {
    const address = extraAddress(e);
    if (e.kind === "EXCLUDE") {
      memberRows.push({
        key: `x:${e.id}`,
        address,
        groupId: null,
        name: e.user?.name ?? null,
        via: "excluded",
        extraId: e.id,
        note: e.note && e.note !== IMPORTED_NOTE ? e.note : null,
        status: null,
      });
    } else if (!address) {
      memberRows.push({
        key: `x:${e.id}`,
        address: null,
        groupId: null,
        name: e.user?.name ?? null,
        via: "loose",
        extraId: e.id,
        note: e.note && e.note !== IMPORTED_NOTE ? e.note : null,
        status: null,
      });
    }
  }

  const categoryName = row.category
    ? row.category.parent
      ? `${row.category.parent.name} › ${row.category.name}`
      : row.category.name
    : null;

  const importedLeft = row.extras.filter(
    (e) => e.note === IMPORTED_NOTE && e.kind === "INCLUDE" && !e.user,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <OverviewBackLink base={base} label={nl ? "Groepsadressen" : "Group addresses"} />
        <h2 className="text-lg font-semibold text-vtk-ink">{row.email}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {row.name}
          {categoryName && <> · {categoryName}</>}
          {row.description && <> · {row.description}</>}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {nl ? "Laatste sync" : "Last sync"}:{" "}
          {row.lastSyncAt ? dateFmt.format(row.lastSyncAt) : nl ? "nog niet" : "not yet"}
          {!row.googleId && <> · {nl ? "nog niet in Google" : "not in Google yet"}</>}
          {row.importedAt && <> · {nl ? "overgenomen op" : "taken over on"} {dateFmt.format(row.importedAt)}</>}
          {!row.enabled && <> · {nl ? "de site beheert dit adres niet meer" : "the site no longer manages this address"}</>}
        </p>
        {row.lastError && (
          <p className="mt-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
            {row.lastError}
          </p>
        )}
        {archived && (
          <p className="mt-2 rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/40 px-3 py-2 text-sm">
            {nl
              ? `Jaargroep van ${row.year}-${(row.year ?? 0) + 1}: archief. De sync zet er niemand meer in en haalt er niemand meer uit.`
              : `Yearly group of ${row.year}-${(row.year ?? 0) + 1}: archive. The sync no longer adds or removes anyone.`}
          </p>
        )}
        {row.parent && (
          <p className="mt-2 text-sm text-zinc-600">
            {nl ? "Jaargroep van " : "Yearly group of "}
            <Link href={`${base}/${row.parent.id}`} className="vtk-link">
              {row.parent.email}
            </Link>
            {row.year === year
              ? nl
                ? "; hangt daar dit werkingsjaar in."
                : "; sits in it this working year."
              : row.year !== null && row.year > year
                ? nl
                  ? "; komt daar op 15 juli in."
                  : "; goes into it on 15 July."
                : "."}
          </p>
        )}
      </div>

      <MailGroupDetail
        nl={nl}
        locale={locale}
        initialTab={tab}
        manageAll={access.manageAll}
        archived={archived}
        group={{
          id: row.id,
          email: row.email,
          name: row.name,
          description: row.description,
          enabled: row.enabled,
          allowExternalSenders: row.allowExternalSenders,
          ownerGroupId: row.ownerGroupId,
          categoryId: row.categoryId,
          isYearly: row.year !== null,
          yearlyTemplate: row.yearlyTemplate,
          yearlyGroupId: row.yearlyGroupId,
        }}
        members={memberRows}
        activeCount={activity?.activity.active ?? 0}
        unlinked={computed.unlinked.map((u) => u.name)}
        sources={row.sources.map((s) => ({
          id: s.id,
          name: sourceName(s, nl),
          // Een werkgroep mag enkel haar eigen werkgroep als bron weghalen.
          removable: access.manageAll || s.groupId === ownerId,
        }))}
        sourceOptions={sourceOptions}
        importedLeft={importedLeft}
        ownMembers={ownMembers.map((m) => ({ id: m.user.id, name: m.user.name }))}
        werkgroepen={werkgroepen.map((w) => ({
          id: w.id,
          name: g(w),
          prefix: w.mailPrefix,
        }))}
        praesidiumPosts={groups
          .filter((x) => x.type === "PRAESIDIUM")
          .map((x) => ({ id: x.id, name: g(x) }))}
        categoryOptions={categoryOptions}
        showYearly={
          access.manageAll &&
          (Boolean(row.yearlyTemplate) ||
            // Jaargroepen horen bij een postenlijst, niet bij een lijst van een
            // werkgroep, een POC of een kiesploeg.
            (row.year === null &&
              !row.ownerGroupId &&
              row.sources.every((s) => !s.pocId && !s.kiesploegId && !s.kiesploegPostId)))
        }
        yearlyPreview={
          row.yearlyTemplate
            ? renderAddress(row.yearlyTemplate, yearVars(year), domain)
            : null
        }
        yearlyGroups={row.children.map((c) => ({
          id: c.id,
          email: c.email,
          year: c.year,
          current: c.year === year,
          members: c.lastMemberCount,
        }))}
        domain={domain}
        base={base}
      />
    </div>
  );
}
