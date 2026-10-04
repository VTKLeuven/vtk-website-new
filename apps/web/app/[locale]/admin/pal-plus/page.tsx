import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { CoursesCard, type PalPlusCourseView } from "./CoursesCard";

import "@/app/design/vtk-palplus.css";

/**
 * Beheer van PAL+ door VTK Onderwijs. Voorlopig enkel de vakkenlijst; de
 * aanvragen, de sessies en de tutors komen er als tabs bij. Zie
 * docs/design-decisions.md ("PAL+").
 */
export default async function AdminPalPlusPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";

  await requirePermission("pal.manage");

  const rows = await prisma.palPlusCourse.findMany({
    // Wat nog te kiezen is bovenaan; wat uit staat, zakt naar onder.
    orderBy: [{ active: "desc" }, { nameNl: "asc" }],
    select: {
      id: true,
      code: true,
      nameNl: true,
      nameEn: true,
      active: true,
      _count: { select: { requests: true, sessions: true } },
    },
  });

  const courses: PalPlusCourseView[] = rows.map(({ _count, ...course }) => ({
    ...course,
    requestCount: _count.requests,
    sessionCount: _count.sessions,
  }));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">PAL+</h1>
      <CoursesCard nl={nl} courses={courses} />
    </div>
  );
}
