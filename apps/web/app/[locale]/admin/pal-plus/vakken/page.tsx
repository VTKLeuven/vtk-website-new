import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { CoursesCard, type PalPlusCourseView } from "../CoursesCard";
import { TagsCard } from "../ListsCards";
import { loadCourses } from "../data";

/** Tabblad Lijsten: de vakken die studenten kunnen kiezen, en de snelle tags. */
export default async function AdminPalPlusListsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  await requirePermission("pal.manage");
  const [courses, tags] = await Promise.all([
    loadCourses(locale),
    prisma.palPlusTag.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
      select: { id: true, label: true, active: true },
    }),
  ]);
  return (
    <div className="space-y-5">
      <CoursesCard
        nl={nl}
        courses={courses.rows.map(({ _count, ...course }): PalPlusCourseView => ({
          ...course,
          requestCount: _count.requests,
          sessionCount: _count.sessions,
        }))}
      />
      <TagsCard nl={nl} tags={tags} />
    </div>
  );
}
