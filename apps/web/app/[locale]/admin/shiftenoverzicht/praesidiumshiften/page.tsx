import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { brusselsYMD, shiftYMD, ymdKey } from "@/lib/brussels";
import { parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { buildOverview } from "@/lib/praesidiumShifts/overview";
import { loadYearLists, toStatsList, yearsWithData } from "@/lib/praesidiumShifts/server";
import { entryCounts, entryUser, formatCount, nameIndex } from "@/lib/praesidiumShifts/stats";
import { OverviewHeader } from "../OverviewHeader";
import { UploadListForm } from "../UploadListForm";
import { ListStatus } from "../ListStatus";
import { overviewErrorMessages } from "../messages";
import { WeeklyTable, type WeeklyMember } from "./WeeklyTable";

function dayLabel(key: string, locale: Locale): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default async function PraesidiumWeeklyShifts({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("shift.praesidium");

  const { jaar } = await searchParams;
  const year = parseWorkingYear(jaar);
  const [overview, years, weekly] = await Promise.all([
    buildOverview(year, locale),
    yearsWithData(),
    loadYearLists(year, "WEEKLY"),
  ]);
  const todayKey = ymdKey(brusselsYMD(new Date()));

  const members: WeeklyMember[] = overview.members.map((m) => {
    const next = m.weekly.find((e) => e.date && e.date >= todayKey) ?? null;
    const perTask: Record<string, number> = {};
    for (const e of m.weekly) perTask[e.role ?? "?"] = (perTask[e.role ?? "?"] ?? 0) + e.weight;
    return {
      userId: m.userId,
      name: m.name,
      posts: m.posts,
      phone: m.phone,
      past: m.weeklyPast,
      upcoming: m.weeklyUpcoming,
      expected: m.expectedWeekly,
      next: next ? { date: next.date!, role: next.role } : null,
      perTask,
    };
  });

  // De komende zeven dagen, met iedereen die op het rooster staat, ook wie nog
  // niet gekoppeld is: wie moet er deze week kuisen?
  const lastKey = ymdKey(shiftYMD(brusselsYMD(new Date()), 6));
  const active = weekly.lists.filter((l) => l.status === "ACTIVE");
  const stats = new Map(active.map((l) => [l.id, toStatsList(l)]));
  const index = nameIndex(weekly.names);
  const memberName = new Map(overview.roster.map((m) => [m.userId, m.name]));
  const labels = new Map(weekly.names.map((n) => [`${n.listId}\u0000${n.nameKey}`, n.label]));
  const days = new Map<string, Map<string, { name: string; linked: boolean; slot: string | null }[]>>();
  const dayNotes = new Map<string, string>();
  for (const entry of weekly.entries) {
    const list = stats.get(entry.listId);
    if (!list || !entry.date || !entryCounts(list, entry)) continue;
    const key = entry.date.toISOString().slice(0, 10);
    if (key < todayKey || key > lastKey) continue;
    const userId = entryUser(index, entry);
    const tasks = days.get(key) ?? new Map();
    const people = tasks.get(entry.role ?? "") ?? [];
    people.push({
      name: userId ? memberName.get(userId) ?? "" : labels.get(`${entry.listId}\u0000${entry.nameKey}`) ?? entry.rawName,
      linked: Boolean(userId),
      slot: entry.slot,
    });
    tasks.set(entry.role ?? "", people);
    days.set(key, tasks);
    if (entry.note) dayNotes.set(key, entry.note);
  }
  const upcomingDays = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  const pending = overview.weeklyLists.filter((l) => l.status === "DRAFT" || l.unresolvedNames > 0);

  return (
    <div className="space-y-8">
      <OverviewHeader
        nl={nl}
        active="praesidiumshiften"
        year={year}
        years={workingYearTabs(years)}
        subtitle={
          nl
            ? "De wekelijkse praesidiumshiften (fak kuisen, stewarden, containerpark, bekers afwassen) uit het rooster in Google Sheets. Wat voorbij is, telt als gedaan; de rest is ingepland."
            : "The weekly praesidium shifts (cleaning the fak, stewarding, the recycling park, washing cups) from the schedule in Google Sheets. What is past counts as done; the rest is planned."
        }
      />

      {pending.length > 0 && (
        <ul className="space-y-2">
          {pending.map((list) => (
            <li
              key={list.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated px-4 py-3 text-sm shadow-[inset_3px_0_0_var(--color-vtk-yellow)]"
            >
              <span>
                <strong className="font-semibold">{list.name}</strong>{" "}
                {list.status === "DRAFT"
                  ? nl
                    ? "is opgeladen maar nog niet bevestigd; het telt nog niet mee."
                    : "is uploaded but not confirmed yet; it does not count yet."
                  : nl
                    ? `heeft ${list.unresolvedNames} ${list.unresolvedNames === 1 ? "naam" : "namen"} zonder keuze.`
                    : `has ${list.unresolvedNames} names without a choice.`}
              </span>
              <Link
                href={`${base}/admin/shiftenoverzicht/lijst/${list.id}`}
                className="rounded-full border border-vtk-blue/15 px-3 py-1 text-xs font-medium hover:bg-vtk-blue-soft/60"
              >
                {list.status === "DRAFT" ? (nl ? "Nakijken" : "Review") : nl ? "Namen kiezen" : "Choose names"}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{nl ? "De komende zeven dagen" : "The next seven days"}</h2>
          {upcomingDays.length === 0 ? (
            <p className="text-sm text-vtk-muted">{nl ? "Niets ingepland deze week." : "Nothing planned this week."}</p>
          ) : (
            <ul className="divide-y divide-vtk-blue/5 rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
              {upcomingDays.map(([key, tasks]) => (
                <li key={key} className="grid gap-2 px-4 py-3 sm:grid-cols-[11rem_1fr]">
                  <div className="text-sm font-semibold first-letter:uppercase">
                    {dayLabel(key, locale)}
                    {key === todayKey && <span className="ml-1.5 rounded-full bg-vtk-yellow px-1.5 py-0.5 text-[10px] font-semibold uppercase">{nl ? "vandaag" : "today"}</span>}
                  </div>
                  <dl className="space-y-1 text-sm">
                    {[...tasks.entries()].map(([task, people]) => (
                      <div key={task} className="grid gap-x-3 sm:grid-cols-[12rem_1fr]">
                        <dt className="text-vtk-muted">{task}</dt>
                        <dd>
                          {people.map((p, i) => (
                            <span key={i}>
                              {i > 0 && ", "}
                              <span className={p.linked ? "" : "text-[var(--low-ink)]"} title={p.linked ? undefined : nl ? "Nog niet gekoppeld" : "Not linked yet"}>
                                {p.name}
                              </span>
                              {p.slot && <span className="text-xs text-vtk-muted"> {p.slot}</span>}
                            </span>
                          ))}
                        </dd>
                      </div>
                    ))}
                    {dayNotes.get(key) && <p className="text-xs text-vtk-muted">{dayNotes.get(key)}</p>}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {overview.roster.length > 0 && active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{nl ? "Per praesidiumlid" : "Per praesidium member"}</h2>
          <WeeklyTable locale={locale} members={members} average={overview.averages.weekly} />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{nl ? "Roosters" : "Schedules"}</h2>
          <UploadListForm locale={locale} kind="WEEKLY" year={year} errorMessages={overviewErrorMessages(locale)} />
        </div>
        {overview.weeklyLists.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-vtk-blue/20 p-6 text-sm text-vtk-muted">
            {nl
              ? "Nog geen rooster voor dit werkingsjaar. Laad de export van de Google Sheet met de praesidiumshiften op; per semester één rooster werkt het best, en een nieuwe export van hetzelfde rooster laad je op bij dat rooster zelf."
              : "No schedule for this working year yet. Upload the export of the Google Sheet with the praesidium shifts; one schedule per semester works best, and a new export of the same schedule goes onto that schedule itself."}
          </p>
        ) : (
          <div className="relative overflow-x-auto rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-vtk-muted">
                <tr>
                  <th className="px-4 py-2.5">{nl ? "Rooster" : "Schedule"}</th>
                  <th className="px-2 py-2.5 text-right!">{nl ? "Shiften" : "Shifts"}</th>
                  <th className="px-2 py-2.5 text-right!">{nl ? "Gem. per lid" : "Avg. per member"}</th>
                  <th className="px-4 py-2.5">{nl ? "Status" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {overview.weeklyLists.map((list) => (
                  <LinkedRow
                    key={list.id}
                    href={`${base}/admin/shiftenoverzicht/lijst/${list.id}`}
                    className="cursor-pointer border-b border-vtk-blue/5 last:border-0 hover:bg-vtk-blue-soft/30"
                  >
                    <td className="px-4 py-2.5">
                      <Link href={`${base}/admin/shiftenoverzicht/lijst/${list.id}`} className="font-medium hover:underline">
                        {list.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatCount(list.counted, locale)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatCount(list.average, locale)}</td>
                    <td className="px-4 py-2.5">
                      <ListStatus list={list} nl={nl} />
                    </td>
                  </LinkedRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
