import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { brusselsYMD, shiftYMD, ymdKey } from "@/lib/brussels";
import { parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { buildOverview } from "@/lib/praesidiumShifts/overview";
import { loadYearLists, toStatsList, yearsWithData } from "@/lib/praesidiumShifts/server";
import { entryCounts, entryUser, nameIndex } from "@/lib/praesidiumShifts/stats";
import { OverviewHeader } from "../OverviewHeader";
import { UploadListForm } from "../UploadListForm";
import { ListCards, TodoCard, listTodos } from "../OverviewBlocks";
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

  return (
    <div className="space-y-7">
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

      <TodoCard items={listTodos(overview.weeklyLists, base, nl)} nl={nl} />

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
        <h2 className="text-lg font-semibold">{nl ? "Roosters" : "Schedules"}</h2>
        {overview.weeklyLists.length === 0 && (
          <p className="text-sm text-vtk-muted">
            {nl
              ? "Nog geen rooster voor dit werkingsjaar. Eén rooster per semester werkt het best; een nieuwe export van hetzelfde rooster laad je op bij dat rooster zelf."
              : "No schedule for this working year yet. One schedule per semester works best; a new export of the same schedule goes onto that schedule itself."}
          </p>
        )}
        <ListCards
          lists={[...overview.weeklyLists].reverse()}
          base={base}
          nl={nl}
          upload={<UploadListForm locale={locale} kind="WEEKLY" year={year} errorMessages={overviewErrorMessages(locale)} variant="card" />}
        />
      </section>
    </div>
  );
}
