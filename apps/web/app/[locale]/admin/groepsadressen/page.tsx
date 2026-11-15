import { notFound } from "next/navigation";
import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import { currentWorkingYear } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { LinkedRow } from "@/components/ui/LinkedRow";
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
import { MailGroupsToolbar } from "./MailGroupsToolbar";
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
  searchParams: Promise<{ soort?: string; q?: string; archief?: string }>;
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

  const [mailGroups, status, pendingRequests, werkgroepen] = await Promise.all([
    prisma.mailGroup.findMany({
      where,
      orderBy: { email: "asc" },
      select: {
        ...MAIL_GROUP_SELECT,
        lastSyncAt: true,
        lastError: true,
        lastMemberCount: true,
        ownerGroup: { select: { nameNl: true, nameEn: true } },
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
  ]);

  const ctx = await loadDesiredContext(mailGroups as unknown as MailGroupForSync[], year);

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
    };
  });

  const kind: MailGroupKind | null = isMailGroupKind(filters.soort) ? filters.soort : null;
  const showArchive = filters.archief === "1";
  const q = normalizeSearchText((filters.q ?? "").trim());
  const visible = rows.filter(
    (row) =>
      (!kind || row.kind === kind) &&
      (showArchive || !row.archived) &&
      (!q || normalizeSearchText(`${row.email} ${row.name} ${row.summary}`).includes(q)),
  );
  const counts = new Map<MailGroupKind, number>();
  for (const row of rows) {
    if (!showArchive && row.archived) continue;
    counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  }
  const archivedCount = rows.filter((row) => row.archived).length;

  const href = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const next = { soort: kind, q: filters.q ?? null, archief: showArchive ? "1" : null, ...patch };
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

      {access.manageAll && (
        <nav className="flex flex-wrap items-center gap-2" aria-label={nl ? "Soort" : "Kind"}>
          <FilterChip href={href({ soort: null })} active={!kind}>
            {nl ? "Alle" : "All"} <span className="tabular-nums">{rows.filter((r) => showArchive || !r.archived).length}</span>
          </FilterChip>
          {MAIL_GROUP_KINDS.filter((k) => counts.get(k)).map((k) => (
            <FilterChip key={k} href={href({ soort: k })} active={kind === k}>
              {mailGroupKindLabel(k, nl)} <span className="tabular-nums">{counts.get(k)}</span>
            </FilterChip>
          ))}
          {archivedCount > 0 && (
            <Link href={href({ archief: showArchive ? null : "1" })} className="vtk-link ml-2 text-sm">
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
            {kind && <input type="hidden" name="soort" value={kind} />}
            {showArchive && <input type="hidden" name="archief" value="1" />}
            <input
              type="search"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder={nl ? "Zoek een adres" : "Search an address"}
              aria-label={nl ? "Zoek een adres" : "Search an address"}
              className="h-9 w-56 rounded-full border border-vtk-blue/15 bg-white px-4 text-sm"
            />
          </form>
        </nav>
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
        <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">{nl ? "Adres" : "Address"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "Wie erin zit" : "Who is in it"}</th>
                <th className="px-4 py-3 text-right font-medium">{nl ? "Leden" : "Members"}</th>
                <th className="px-4 py-3 font-medium">{nl ? "Laatste sync" : "Last sync"}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <LinkedRow
                  key={row.id}
                  href={`${base}/${row.id}`}
                  className="cursor-pointer border-b border-vtk-blue/5 last:border-0 hover:bg-vtk-blue-soft/30"
                >
                  <td className="px-4 py-3 align-top">
                    <Link href={`${base}/${row.id}`} className="font-medium text-vtk-ink">
                      {row.email}
                    </Link>
                    <span className="block text-xs text-zinc-500">
                      {row.name}
                      {row.owner && <> · {row.owner}</>}
                      {row.archived && <> · {nl ? "archief" : "archive"}</>}
                      {!row.enabled && <> · {nl ? "niet beheerd" : "not managed"}</>}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-zinc-600">{row.summary || "-"}</td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    {row.memberCount}
                    {row.unlinked > 0 && (
                      <span className="block text-xs text-amber-700">
                        {nl ? `${row.unlinked} zonder adres` : `${row.unlinked} without address`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-zinc-500">
                    {row.lastSyncAt ? dateFmt.format(row.lastSyncAt) : nl ? "nog niet" : "not yet"}
                    {!row.existsInGoogle && !row.archived && (
                      <span className="block">{nl ? "nog niet in Google" : "not in Google yet"}</span>
                    )}
                    {row.lastError && <span className="block text-red-700">{row.lastError}</span>}
                  </td>
                </LinkedRow>
              ))}
            </tbody>
          </table>
        </div>
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
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm",
        active
          ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
          : "border-vtk-blue/15 bg-white text-vtk-ink hover:border-vtk-blue/30",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
