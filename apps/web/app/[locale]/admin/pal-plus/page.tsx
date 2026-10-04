import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { palPlusAskerCount, palPlusCourseLabel, palPlusRequestCourseLabel } from "@/lib/palPlus";
import { CoursesCard, type PalPlusCourseView } from "./CoursesCard";
import { RequestsBoard, type PalPlusRequestView } from "./RequestsBoard";

import "@/app/design/vtk-palplus.css";

/**
 * Beheer van PAL+ door VTK Onderwijs: het werkbakje met wat nog beslist moet
 * worden, wat al afgehandeld is, en de vakkenlijst. De sessies en de tutors
 * komen er als tabs bij. Zie docs/design-decisions.md ("PAL+").
 */

const TABS = ["aanvragen", "verwerkt", "vakken"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, { nl: string; en: string }> = {
  aanvragen: { nl: "Aanvragen", en: "Requests" },
  verwerkt: { nl: "Verwerkt", en: "Processed" },
  vakken: { nl: "Vakken", en: "Courses" },
};

export default async function AdminPalPlusPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  await requirePermission("pal.manage");

  const { tab: tabParam } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "aanvragen";

  const [courseRows, queueCount] = await Promise.all([
    prisma.palPlusCourse.findMany({
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
    }),
    prisma.palPlusRequest.count({ where: { status: { in: ["PENDING", "OPEN"] } } }),
  ]);

  const tabHref = (next: Tab) => `${base}/admin/pal-plus${next === "aanvragen" ? "" : `?tab=${next}`}`;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">PAL+</h1>

      <nav className="flex flex-wrap gap-2" aria-label={nl ? "Onderdelen" : "Sections"}>
        {TABS.map((value) => (
          <Link
            key={value}
            href={tabHref(value)}
            aria-current={value === tab ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              value === tab
                ? "border-vtk-ink bg-vtk-ink text-white"
                : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
            }`}
          >
            {TAB_LABELS[value][nl ? "nl" : "en"]}
            {value === "aanvragen" && queueCount > 0 ? ` (${queueCount})` : ""}
          </Link>
        ))}
      </nav>

      {tab === "vakken" ? (
        <CoursesCard
          nl={nl}
          courses={courseRows.map(({ _count, ...course }): PalPlusCourseView => ({
            ...course,
            requestCount: _count.requests,
            sessionCount: _count.sessions,
          }))}
        />
      ) : (
        <RequestsBoard
          nl={nl}
          base={base}
          mode={tab === "verwerkt" ? "processed" : "queue"}
          requests={await loadRequests(tab === "verwerkt" ? "processed" : "queue", locale)}
          courses={courseRows.map((course) => ({
            id: course.id,
            label: palPlusCourseLabel(course, locale),
            active: course.active,
          }))}
        />
      )}
    </div>
  );
}

/**
 * De aanvragen van één tab, klaar voor de client: datums al opgemaakt in
 * Brusselse tijd, zodat de browser van de beheerder er niets aan herrekent.
 */
async function loadRequests(mode: "queue" | "processed", locale: Locale): Promise<PalPlusRequestView[]> {
  const nl = locale === "nl";
  const courseSelect = { code: true, nameNl: true, nameEn: true } as const;

  const rows = await prisma.palPlusRequest.findMany({
    where:
      mode === "queue"
        ? { status: { in: ["PENDING", "OPEN"] } }
        : { status: { in: ["PLANNED", "CLOSED", "WITHDRAWN"] } },
    // Open werk: wat het langst wacht bovenaan. Verwerkt: het recentste eerst.
    orderBy: { createdAt: mode === "queue" ? "asc" : "desc" },
    take: 300,
    select: {
      id: true,
      kind: true,
      status: true,
      courseId: true,
      courseOther: true,
      description: true,
      proposedStartsAt: true,
      proposedEndsAt: true,
      preferredPeriod: true,
      reviewNote: true,
      reviewedAt: true,
      createdAt: true,
      course: { select: courseSelect },
      user: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true } },
      respondsTo: { select: { courseOther: true, description: true, course: { select: courseSelect } } },
      responses: {
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, createdAt: true, user: { select: { name: true } } },
      },
      backers: { orderBy: { createdAt: "asc" }, select: { user: { select: { name: true } } } },
    },
  });

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Brussels",
  });
  const dayFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Brussels",
  });
  const timeFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  });

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    courseId: row.courseId,
    courseLabel: palPlusRequestCourseLabel(row, locale),
    courseTyped: row.courseOther,
    description: row.description,
    submitterName: row.user.name,
    submitterEmail: row.user.email,
    submittedLabel: dateFmt.format(row.createdAt),
    momentLabel:
      row.proposedStartsAt && row.proposedEndsAt
        ? `${dayFmt.format(row.proposedStartsAt)}, ${timeFmt.format(row.proposedStartsAt)} - ${timeFmt.format(row.proposedEndsAt)}`
        : null,
    preferredPeriod: row.preferredPeriod,
    askers: palPlusAskerCount(row.backers.length),
    backerNames: row.backers.map((backer) => backer.user.name),
    respondsTo: row.respondsTo
      ? { courseLabel: palPlusRequestCourseLabel(row.respondsTo, locale), description: row.respondsTo.description }
      : null,
    responses: row.responses.map((response) => ({
      id: response.id,
      name: response.user.name,
      status: response.status,
      submittedLabel: dateFmt.format(response.createdAt),
    })),
    reviewNote: row.reviewNote,
    reviewedLabel:
      row.reviewedAt && row.reviewedBy
        ? nl
          ? `Door ${row.reviewedBy.name} op ${dateFmt.format(row.reviewedAt)}`
          : `By ${row.reviewedBy.name} on ${dateFmt.format(row.reviewedAt)}`
        : null,
  }));
}
