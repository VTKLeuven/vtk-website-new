import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { prisma } from "@vtk/db";
import Link from "@/components/ui/Link";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { formatWorkingYear } from "@/lib/workingYear";
import { isAmbiguousFirstName, proposeMatch } from "@/lib/praesidiumShifts/names";
import { LIST_SELECT, listPhones, loadAliasMap, loadRoster, toStatsList } from "@/lib/praesidiumShifts/server";
import {
  detectedOpenSlots,
  entryCounts,
  entryWeight,
  formatCount,
  summarizeList,
  type SlotStat,
} from "@/lib/praesidiumShifts/stats";
import { deletePraesidiumShiftListAction } from "@/app/actions/praesidiumShifts";
import { overviewErrorMessages } from "../../messages";
import { NamesPanel, type NameRowData } from "./NamesForm";
import { SkipPanel } from "./SkipPanel";
import { ListSettingsForm } from "./ListSettingsForm";
import { ListResult, type ListResultMember } from "./ListResult";
import { ConfirmListForm, ReplaceFileForm } from "./ListFileActions";

function shortDay(date: Date | null, locale: Locale): string {
  if (!date) return "";
  return date.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });
}

type Tab = "namen" | "telt" | "stand" | "overslaan" | "bestand";
const TABS: Tab[] = ["namen", "telt", "stand", "overslaan", "bestand"];

export default async function PraesidiumShiftListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale: localeParam, id } = await params;
  const { tab: tabParam } = await searchParams;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("shift.praesidium");

  const list = await prisma.praesidiumShiftList.findUnique({
    where: { id },
    select: { ...LIST_SELECT, uploadedBy: { select: { name: true } } },
  });
  if (!list) notFound();

  const [entries, names, contacts, roster, aliases, skips, posts] = await Promise.all([
    prisma.praesidiumShiftEntry.findMany({
      where: { listId: id },
      orderBy: [{ date: "asc" }, { sheet: "asc" }],
      select: { listId: true, nameKey: true, sheet: true, color: true, hours: true, excluded: true, date: true, slot: true, role: true },
    }),
    prisma.praesidiumShiftListName.findMany({
      where: { listId: id },
      orderBy: { label: "asc" },
      select: { listId: true, nameKey: true, label: true, status: true, source: true, userId: true },
    }),
    prisma.praesidiumShiftContact.findMany({ where: { listId: id }, select: { nameKey: true, kring: true } }),
    loadRoster(list.year, locale),
    loadAliasMap(),
    prisma.praesidiumShiftExemption.findMany({ where: { listId: id }, select: { userId: true, reason: true } }),
    prisma.group.findMany({
      where: { type: "PRAESIDIUM", memberships: { some: { year: list.year } } },
      orderBy: { orderInPraesidium: "asc" },
      select: { id: true, nameNl: true, nameEn: true, _count: { select: { memberships: { where: { year: list.year } } } } },
    }),
  ]);
  const skipReason = new Map(skips.map((s) => [s.userId, s.reason]));
  const skippedUsers = new Set(skipReason.keys());
  const phones = await listPhones(roster.filter((m) => !m.phone).map((m) => m.userId));

  const stats = toStatsList(list);
  const summary = summarizeList(stats, entries, names, skippedUsers);
  const allCounts = summarizeList(stats, entries, names).perUser;
  const messages = overviewErrorMessages(locale);
  const draft = list.status === "DRAFT";
  const tabHref = `${base}/admin/shiftenoverzicht${list.kind === "WEEKLY" ? "/praesidiumshiften" : ""}?jaar=${list.year}`;

  const where = (entry: (typeof entries)[number]) =>
    [entry.date ? shortDay(entry.date, locale) : entry.sheet, entry.slot].filter(Boolean).join(" ");

  // De namen: enkel wie op een meetellend tabblad en in een meetellende kleur staat.
  let hiddenNames = 0;
  const nameRows: NameRowData[] = [];
  for (const name of names) {
    const own = entries.filter((e) => e.nameKey === name.nameKey && entryCounts(stats, e));
    if (own.length === 0) {
      hiddenNames += 1;
      continue;
    }
    const status = name.status === "MATCHED" && !name.userId ? "UNRESOLVED" : name.status;
    nameRows.push({
      nameKey: name.nameKey,
      label: name.label,
      status,
      source: name.source,
      userId: name.userId,
      shifts: own.reduce((sum, e) => sum + entryWeight(stats, e), 0),
      where: own.slice(0, 2).map(where).join(", ") + (own.length > 2 ? ", ..." : ""),
      candidates: status === "UNRESOLVED" ? proposeMatch(name.nameKey, roster, new Map()).candidates : [],
      kring: contacts.find((c) => c.nameKey === name.nameKey)?.kring ?? null,
      hasAlias: aliases.has(name.nameKey),
      ambiguous: isAmbiguousFirstName(name.nameKey, roster),
    });
  }
  const unresolved = nameRows.filter((r) => r.status === "UNRESOLVED").length;

  const nameUser = new Map(names.filter((n) => n.status === "MATCHED" && n.userId).map((n) => [n.nameKey, n.userId!]));
  const resultMembers: ListResultMember[] = roster.map((member) => ({
    userId: member.userId,
    name: member.name,
    posts: member.posts,
    phone: member.phone ?? phones.get(member.userId) ?? null,
    count: allCounts.get(member.userId) ?? 0,
    slots: entries
      .filter((e) => nameUser.get(e.nameKey) === member.userId && entryCounts(stats, e))
      .map((e) => where(e)),
    skipped: skippedUsers.has(member.userId),
    skipReason: skipReason.get(member.userId) ?? null,
  }));
  const countedMembers = resultMembers.filter((m) => !m.skipped);
  const average = countedMembers.length
    ? countedMembers.reduce((s, m) => s + m.count, 0) / countedMembers.length
    : 0;
  const detectedOpen = detectedOpenSlots(stats, (list.slots ?? []) as SlotStat[]);
  const openSlots = list.openSlots ?? detectedOpen;
  const metTarget =
    list.expectedPerMember !== null ? countedMembers.filter((m) => m.count >= (list.expectedPerMember ?? 0)).length : null;
  const excludedCount = entries.filter((e) => e.excluded).length;

  const tab: Tab = TABS.includes(tabParam as Tab)
    ? (tabParam as Tab)
    : draft || unresolved > 0
      ? "namen"
      : "stand";
  const tabUrl = (t: Tab) => `${base}/admin/shiftenoverzicht/lijst/${list.id}?tab=${t}`;
  const countedSheets = stats.sheets.filter((s) => s.counted);
  const tabLabels: Record<Tab, string> = {
    namen: nl ? "Namen" : "Names",
    telt: nl ? "Wat telt" : "What counts",
    stand: nl ? "Stand" : "Standings",
    overslaan: nl ? "Overslaan" : "Skip",
    bestand: nl ? "Bestand" : "File",
  };

  const facts: { label: string; value: string; hint?: string }[] = [
    { label: nl ? "Meetellende shiften" : "Counted shifts", value: formatCount(summary.counted, locale) },
    { label: nl ? "Door praesidium" : "By praesidium", value: formatCount(summary.praesidium, locale) },
    {
      label: nl ? "Door anderen" : "By others",
      value: formatCount(summary.others, locale),
      hint: nl ? "werkgroepen, andere kringen" : "werkgroepen, other associations",
    },
    { label: nl ? "Gemiddeld per lid" : "Average per member", value: formatCount(average, locale) },
  ];
  if (list.kind === "EVENT") {
    facts.push({
      label: nl ? "Richtlijn gehaald" : "Target reached",
      value: metTarget !== null ? `${metTarget}/${countedMembers.length}` : nl ? "geen richtlijn" : "no target",
    });
    facts.push({ label: nl ? "Nog open voor VTK" : "Still open for VTK", value: openSlots !== null ? String(openSlots) : "?" });
  }
  if (summary.unresolvedShifts > 0) {
    facts.push({ label: nl ? "Zonder keuze" : "Without a choice", value: formatCount(summary.unresolvedShifts, locale) });
  }
  if (summary.skipped > 0) {
    facts.push({
      label: nl ? "Overgeslagen" : "Skipped",
      value: formatCount(summary.skipped, locale),
      hint: nl ? `${skippedUsers.size} ${skippedUsers.size === 1 ? "lid" : "leden"}` : `${skippedUsers.size} members`,
    });
  }

  const statusChip = draft
    ? { text: nl ? "Concept" : "Draft", tone: "bg-[var(--low-bg)] text-[var(--low-ink)]" }
    : unresolved > 0
      ? { text: nl ? `${unresolved} ${unresolved === 1 ? "naam" : "namen"} open` : `${unresolved} open`, tone: "bg-[var(--low-bg)] text-[var(--low-ink)]" }
      : { text: nl ? "Bevestigd" : "Confirmed", tone: "bg-[var(--paper-2)] text-vtk-body" };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={tabHref} className="text-sm text-vtk-muted hover:text-vtk-ink">
          {"\u2190 "}
          {list.kind === "WEEKLY" ? (nl ? "Praesidiumshiften" : "Praesidium shifts") : nl ? "Shiftenlijsten" : "Shift lists"}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-bold tracking-tight">{list.name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusChip.tone}`}>{statusChip.text}</span>
          </div>
          {draft ? (
            <div className="flex flex-wrap items-center gap-3">
              {unresolved > 0 && (
                <span className="text-xs text-vtk-muted">
                  {nl ? `nog ${unresolved} ${unresolved === 1 ? "naam" : "namen"}` : `${unresolved} names left`}
                </span>
              )}
              <ConfirmListForm locale={locale} listId={list.id} unresolved={unresolved} errorMessages={messages} />
            </div>
          ) : (
            <Link
              href={tabUrl("bestand")}
              className="rounded-full border border-vtk-navy/20 px-4 py-2 text-sm font-semibold text-vtk-ink hover:bg-vtk-blue-soft/60"
            >
              {nl ? "Nieuwe versie opladen" : "Upload a new version"}
            </Link>
          )}
        </div>
        <p className="text-sm text-vtk-muted">
          {[
            list.eventDate
              ? list.eventDate.toLocaleDateString(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
              : null,
            nl
              ? `${formatCount(summary.counted, locale)} shiften gelezen op ${countedSheets.length} ${countedSheets.length === 1 ? "tabblad" : "tabbladen"}`
              : `${formatCount(summary.counted, "en")} shifts read on ${countedSheets.length} tabs`,
            list.expectedPerMember !== null
              ? nl
                ? `richtlijn ${formatCount(list.expectedPerMember, locale)} per lid`
                : `target ${formatCount(list.expectedPerMember, "en")} per member`
              : null,
            `${nl ? "werkingsjaar" : "working year"} ${formatWorkingYear(list.year)}`,
          ]
            .filter(Boolean)
            .join(" \u00b7 ")}
        </p>
        {draft && (
          <p className="text-sm text-vtk-body">
            {nl
              ? "Deze lijst telt pas mee nadat je ze bevestigt. Kijk na wie elke naam is en wat er meetelt."
              : "This list only counts after you confirm it. Check who every name is and what counts."}
          </p>
        )}
      </div>

      <nav className="vtk-psl-tabs" aria-label={nl ? "Onderdelen van de lijst" : "List sections"}>
        {TABS.map((t) => (
          <Link key={t} href={tabUrl(t)} aria-current={t === tab ? "page" : undefined}>
            {tabLabels[t]}
            {t === "namen" && unresolved > 0 && (
              <span className="rounded-full bg-[var(--low-bg)] px-1.5 text-[11px] font-semibold text-[var(--low-ink)]">{unresolved}</span>
            )}
            {t === "overslaan" && skippedUsers.size > 0 && (
              <span className="rounded-full bg-[var(--paper-2)] px-1.5 text-[11px] font-semibold text-vtk-body">{skippedUsers.size}</span>
            )}
          </Link>
        ))}
      </nav>

      {tab === "namen" && (
        <NamesPanel
          locale={locale}
          listId={list.id}
          rows={nameRows}
          roster={roster.map((m) => ({ userId: m.userId, name: m.name, posts: m.posts }))}
          hiddenNames={hiddenNames}
          errorMessages={messages}
        />
      )}

      {tab === "telt" && (
        <section className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-5">
          <ListSettingsForm
            locale={locale}
            detectedOpen={detectedOpen}
            errorMessages={messages}
            list={{
              id: list.id,
              kind: list.kind,
              name: list.name,
              eventDate: list.eventDate ? list.eventDate.toISOString().slice(0, 10) : null,
              expectedPerMember: list.expectedPerMember,
              countMode: list.countMode,
              hoursPerShift: list.hoursPerShift,
              openSlots: list.openSlots,
              sheets: stats.sheets,
              colors: stats.colors,
            }}
          />
        </section>
      )}

      {tab === "stand" && (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-vtk-blue/10 bg-vtk-blue/10 sm:grid-cols-3 lg:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="bg-vtk-surface-elevated px-4 py-3">
                <dt className="text-xs text-vtk-muted">{fact.label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{fact.value}</dd>
                {fact.hint && <dd className="text-[11px] text-vtk-muted">{fact.hint}</dd>}
              </div>
            ))}
          </dl>
          {excludedCount > 0 && (
            <p className="text-xs text-vtk-muted">
              {nl
                ? `${excludedCount} ${excludedCount === 1 ? "vakje telt" : "vakjes tellen"} niet mee omdat de lijst er zelf "telt niet mee" naast zet.`
                : `${excludedCount} cells do not count because the list itself marks them "does not count".`}
            </p>
          )}
          {roster.length > 0 ? (
            <ListResult
              locale={locale}
              members={resultMembers}
              expected={list.expectedPerMember}
              average={average}
              skipHref={tabUrl("overslaan")}
            />
          ) : (
            <p className="text-sm text-vtk-muted">
              {nl
                ? `Er staat in ${formatWorkingYear(list.year)} niemand in een praesidiumpost, dus er is niemand om te tellen.`
                : `Nobody holds a praesidium post in ${formatWorkingYear(list.year)}, so there is nobody to count.`}
            </p>
          )}
        </div>
      )}

      {tab === "overslaan" && (
        <SkipPanel
          locale={locale}
          listId={list.id}
          members={resultMembers}
          posts={posts.map((p) => ({ id: p.id, name: nl ? p.nameNl : p.nameEn, members: p._count.memberships }))}
          errorMessages={messages}
        />
      )}

      {tab === "bestand" && (
        <div className="space-y-4">
          <section className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-5">
            <ReplaceFileForm locale={locale} listId={list.id} fileName={list.fileName} errorMessages={messages} />
          </section>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-5">
            <p className="text-sm text-vtk-muted">
              {[
                list.uploadedBy ? `${nl ? "Opgeladen door" : "Uploaded by"} ${list.uploadedBy.name}` : null,
                list.createdAt.toLocaleDateString(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "long", year: "numeric" }),
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            <DeleteButton
              action={deletePraesidiumShiftListAction}
              fields={{ listId: list.id, locale }}
              title={nl ? `${list.name} verwijderen?` : `Delete ${list.name}?`}
              description={
                nl
                  ? `De lijst en haar ${entries.length} ingelezen vakjes verdwijnen uit het overzicht; wie erop stond, verliest die shiften in de telling. De bijnamen die je hier onthield, blijven bestaan, net als de shiften op /shift en de andere lijsten.`
                  : `The list and its ${entries.length} cells disappear from the overview; whoever was on it loses those shifts in the count. Nicknames you remembered here stay, as do the shifts on /shift and the other lists.`
              }
              confirmLabel={nl ? "Verwijderen" : "Delete"}
              cancelLabel={nl ? "Annuleren" : "Cancel"}
              errorMessages={messages}
            >
              {nl ? "Lijst verwijderen" : "Delete list"}
            </DeleteButton>
          </section>
        </div>
      )}
    </div>
  );
}
