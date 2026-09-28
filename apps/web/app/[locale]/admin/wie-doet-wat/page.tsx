import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { publicUrl } from "@/lib/storage";
import {
  currentWorkingYear,
  formatWorkingYear,
  parseWorkingYear,
  workingYearStart,
  workingYearTabs,
} from "@/lib/workingYear";
import { canEditTasksOf, taskEditScope } from "@/lib/tasks/access";
import type { RegisterPost, RegisterTask } from "@/lib/tasks/register";
import { taskErrorMessages } from "./messages";
import { TaskRegister } from "./TaskRegister";

export default async function AdminTasks({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale: localeParam } = await params;
  const { jaar } = await searchParams;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requireAnyPermission(["tasks.view", "tasks.manageOwn", "tasks.manage"]);

  const year = parseWorkingYear(jaar);
  // Verdelen kan enkel in het werkingsjaar van nu; een vorig jaar is historiek.
  const editableYear = year === currentWorkingYear();
  const scope = taskEditScope(session);

  const [groups, tasks, distinctYears] = await Promise.all([
    prisma.group.findMany({
      where: { type: "PRAESIDIUM", active: true },
      orderBy: { orderInPraesidium: "asc" },
      select: {
        id: true,
        nameNl: true,
        nameEn: true,
        memberships: {
          where: { year },
          select: { id: true, role: true, user: { select: { name: true, avatarKey: true } } },
        },
      },
    }),
    prisma.groupTask.findMany({
      // Een taak die pas na dit werkingsjaar bestond, hoort niet in zijn register.
      where: { group: { type: "PRAESIDIUM", active: true }, createdAt: { lt: workingYearStart(year + 1) } },
      select: {
        id: true,
        groupId: true,
        forGroupId: true,
        name: true,
        description: true,
        keywords: true,
        assignments: {
          where: { membership: { year: { in: [year, year - 1] } } },
          select: {
            kind: true,
            membershipId: true,
            membership: { select: { year: true, user: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.groupMembership.findMany({
      where: { group: { type: "PRAESIDIUM" } },
      distinct: ["year"],
      select: { year: true },
    }),
  ]);

  const posts: RegisterPost[] = groups.map((group) => ({
    id: group.id,
    name: nl ? group.nameNl : group.nameEn,
    canEdit: editableYear && canEditTasksOf(scope, group.id),
    members: [...group.memberships]
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === "LEAD" ? -1 : 1;
        return a.user.name.localeCompare(b.user.name, locale);
      })
      .map((m) => ({
        membershipId: m.id,
        name: m.user.name,
        avatarUrl: publicUrl(m.user.avatarKey),
        lead: m.role === "LEAD",
      })),
  }));

  const registerTasks: RegisterTask[] = tasks.map((task) => {
    const now = task.assignments.filter((a) => a.membership.year === year);
    return {
      id: task.id,
      groupId: task.groupId,
      forGroupId: task.forGroupId,
      name: task.name,
      description: task.description,
      keywords: task.keywords,
      holders: now.filter((a) => a.kind === "HOLDER").map((a) => a.membershipId),
      backup: now.find((a) => a.kind === "BACKUP")?.membershipId ?? null,
      previous: task.assignments
        .filter((a) => a.membership.year === year - 1 && a.kind === "HOLDER")
        .map((a) => a.membership.user.name),
    };
  });

  const tabs = workingYearTabs(distinctYears.map((r) => r.year));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "Wie doet wat" : "Who does what"}</h1>
        <p className="mt-1 text-sm text-[#5c667f]">
          {nl
            ? "Waarvoor je bij wie terecht kan, per post. Zoek op wat je nodig hebt, of klik een taak open. Een taak blijft bij haar post staan; wie ze opneemt, geldt per werkingsjaar en begint op 15 juli opnieuw."
            : "Who to turn to for what, per post. Search for what you need, or open a task. A task stays with its post; who takes it on applies per working year and starts over on 15 July."}
        </p>
      </div>

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {tabs.map((y) => {
            const active = y === year;
            return (
              <Link
                key={y}
                href={`${base}/admin/wie-doet-wat?jaar=${y}`}
                className={
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition " +
                  (active
                    ? "border-vtk-ink bg-vtk-ink text-white"
                    : "border-vtk-blue/20 bg-white text-vtk-ink hover:bg-vtk-blue-soft/50")
                }
              >
                {formatWorkingYear(y)}
              </Link>
            );
          })}
        </div>
      )}

      <TaskRegister
        posts={posts}
        tasks={registerTasks}
        locale={locale}
        yearLabel={formatWorkingYear(year)}
        previousYearLabel={formatWorkingYear(year - 1)}
        editableYear={editableYear}
        saveLabels={{
          submitLabel: nl ? "Opslaan" : "Save",
          savingLabel: nl ? "Bezig..." : "Saving...",
          savedMessage: nl ? "Taak opgeslagen" : "Task saved",
          fallbackErrorMessage: nl ? "Er ging iets mis bij het opslaan." : "Something went wrong while saving.",
          errorMessages: taskErrorMessages(locale),
        }}
      />
    </div>
  );
}
