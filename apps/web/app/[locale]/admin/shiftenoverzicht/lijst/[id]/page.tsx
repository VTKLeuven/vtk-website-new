import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Locale } from "@vtk/i18n";
import { prisma } from "@vtk/db";
import Link from "@/components/ui/Link";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
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
import { NamesForm, type NameRowData } from "./NamesForm";
import { ListSettingsForm } from "./ListSettingsForm";
import { ListResult, type ListResultMember } from "./ListResult";
import { ConfirmListForm, ReplaceFileForm } from "./ListFileActions";

function shortDay(date: Date | null, locale: Locale): string {
  if (!date) return "";
  return date.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default async function PraesidiumShiftListPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: localeParam, id } = await params;
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

  const settings = (
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
  );

  const namesForm = (
    <NamesForm
      locale={locale}
      listId={list.id}
      draft={draft}
      rows={nameRows}
      roster={roster.map((m) => ({ userId: m.userId, name: m.name, posts: m.posts }))}
      hiddenNames={hiddenNames}
      errorMessages={messages}
    />
  );

  const facts: { label: string; value: string; hint?: string }[] = [
    { label: nl ? "Meetellende shiften" : "Counted shifts", value: formatCount(summary.counted, locale) },
    { label: nl ? "Door praesidium" : "By praesidium", value: formatCount(summary.praesidium, locale) },
    {
      label: nl ? "Door anderen" : "By others",
      value: formatCount(summary.others, locale),
      hint: nl ? "werkgroepen, andere kringen" : "werkgroepen, other associations",
    },
    { label: nl ? "Zonder keuze" : "Without a choice", value: formatCount(summary.unresolvedShifts, locale) },
    ...(summary.skipped > 0 || skippedUsers.size > 0
      ? [
          {
            label: nl ? "Overgeslagen" : "Skipped",
            value: formatCount(summary.skipped, locale),
            hint: nl ? `${skippedUsers.size} ${skippedUsers.size === 1 ? "lid" : "leden"}` : `${skippedUsers.size} members`,
          },
        ]
      : []),
    { label: nl ? "Gemiddeld per lid" : "Average per member", value: formatCount(average, locale) },
  ];
  if (list.kind === "EVENT") {
    facts.push({
      label: nl ? "Richtlijn gehaald" : "Target reached",
      value: metTarget !== null ? `${metTarget}/${countedMembers.length}` : nl ? "geen richtlijn" : "no target",
    });
    facts.push({ label: nl ? "Nog open voor VTK" : "Still open for VTK", value: openSlots !== null ? String(openSlots) : "?" });
  }

  const result = (
    <Section title={nl ? "Resultaat" : "Result"}>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-vtk-blue/10 bg-vtk-blue/10 sm:grid-cols-4 lg:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="bg-vtk-surface-elevated px-3 py-2.5">
            <dt className="text-xs text-vtk-muted">{fact.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{fact.value}</dd>
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
          listId={list.id}
          members={resultMembers}
          expected={list.expectedPerMember}
          average={average}
          posts={posts.map((p) => ({ id: p.id, name: nl ? p.nameNl : p.nameEn, members: p._count.memberships }))}
          errorMessages={messages}
        />
      ) : (
        <p className="text-sm text-vtk-muted">
          {nl
            ? `Er staat in ${formatWorkingYear(list.year)} niemand in een praesidiumpost, dus er is niemand om te tellen.`
            : `Nobody holds a praesidium post in ${formatWorkingYear(list.year)}, so there is nobody to count.`}
        </p>
      )}
    </Section>
  );

  const fileBlock = (
    <ReplaceFileForm locale={locale} listId={list.id} fileName={list.fileName} errorMessages={messages} />
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href={tabHref} className="text-sm text-vtk-muted hover:text-vtk-ink">
          {"← "}
          {list.kind === "WEEKLY" ? (nl ? "Praesidiumshiften" : "Praesidium shifts") : nl ? "Shiftenlijsten" : "Shift lists"}
        </Link>
        <h1 className="text-2xl font-semibold">{list.name}</h1>
        <p className="text-sm text-vtk-muted">
          {[
            list.kind === "WEEKLY" ? (nl ? "Rooster praesidiumshiften" : "Praesidium shift schedule") : nl ? "Shiftenlijst" : "Shift list",
            list.eventDate
              ? list.eventDate.toLocaleDateString(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
              : null,
            `${nl ? "werkingsjaar" : "working year"} ${formatWorkingYear(list.year)}`,
            list.fileName,
            list.uploadedBy ? `${nl ? "opgeladen door" : "uploaded by"} ${list.uploadedBy.name}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {draft && (
        <div className="space-y-3 rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-5 shadow-[inset_3px_0_0_var(--color-vtk-yellow)]">
          <p className="text-sm text-vtk-body">
            <strong className="font-semibold text-vtk-ink">{nl ? "Nog niet bevestigd." : "Not confirmed yet."}</strong>{" "}
            {nl
              ? "Deze lijst telt pas mee in het overzicht nadat je ze bevestigt. Kijk eerst na welke tabbladen en kleuren meetellen, en wie elke naam is."
              : "This list only counts in the overview after you confirm it. First check which tabs and colours count, and who every name is."}
            {unresolved > 0 &&
              (nl
                ? ` ${unresolved} ${unresolved === 1 ? "naam wacht" : "namen wachten"} op een keuze.`
                : ` ${unresolved} names wait for a choice.`)}
          </p>
          <ConfirmListForm locale={locale} listId={list.id} unresolved={unresolved} errorMessages={messages} />
        </div>
      )}

      {draft ? (
        <>
          <Section title={nl ? "Wat telt er" : "What counts"}>{settings}</Section>
          <Section title={nl ? "Namen" : "Names"}>{namesForm}</Section>
          {result}
          <Section title={nl ? "Bestand" : "File"}>{fileBlock}</Section>
        </>
      ) : (
        <>
          {result}
          <Section title={nl ? "Namen" : "Names"}>{namesForm}</Section>
          <AdminDisclosure
            summary={
              <span>
                <span className="block font-semibold text-vtk-ink">{nl ? "Wat telt er" : "What counts"}</span>
                <span className="block text-sm text-vtk-muted">
                  {[
                    `${stats.sheets.filter((s) => s.counted).length}/${stats.sheets.filter((s) => s.kind === "SHIFTS" || s.kind === "SCHEDULE").length} ${nl ? "tabbladen" : "tabs"}`,
                    list.kind === "EVENT" && stats.colors.length > 1
                      ? `${stats.colors.filter((c) => c.counted).length}/${stats.colors.length} ${nl ? "kleuren" : "colours"}`
                      : null,
                    list.kind === "EVENT"
                      ? list.countMode === "BY_DURATION"
                        ? nl
                          ? `naar duur, ${formatCount(list.hoursPerShift, locale)} uur per shift`
                          : `by duration, ${formatCount(list.hoursPerShift, locale)} hours per shift`
                        : nl
                          ? "elke naam is één shift"
                          : "every name is one shift"
                      : null,
                    list.expectedPerMember !== null
                      ? `${nl ? "richtlijn" : "target"} ${formatCount(list.expectedPerMember, locale)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            }
          >
            {settings}
          </AdminDisclosure>
          <AdminDisclosure
            summary={
              <span>
                <span className="block font-semibold text-vtk-ink">{nl ? "Nieuwe versie opladen" : "Upload a new version"}</span>
                <span className="block text-sm text-vtk-muted">{list.fileName}</span>
              </span>
            }
          >
            {fileBlock}
          </AdminDisclosure>
        </>
      )}

      <div className="border-t border-vtk-blue/10 pt-5">
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
      </div>
    </div>
  );
}
