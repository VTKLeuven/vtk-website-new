import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import {
  palPlusAskerCount,
  palPlusCourseLabel,
  palPlusRequestCourseLabel,
  palPlusRoomLabel,
  palPlusSessionState,
  palPlusWallClockFields,
  PAL_PLUS_STATUS_LABELS,
} from "@/lib/palPlus";
import { CoursesCard, type PalPlusCourseView } from "./CoursesCard";
import { RequestsBoard, type OpenFollowRequest, type PalPlusRequestView } from "./RequestsBoard";
import { SessionsBoard, type PalPlusSessionView } from "./SessionsBoard";
import type { RoomGroup } from "./SessionForm";

import "@/app/design/vtk-palplus.css";

/**
 * Beheer van PAL+ door VTK Onderwijs: het werkbakje met wat nog beslist moet
 * worden, de sessies, wat al afgehandeld is, en de vakkenlijst. De tutors
 * komen er als tab bij. Zie docs/design-decisions.md ("PAL+").
 */

const TABS = ["aanvragen", "sessies", "verwerkt", "vakken"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, { nl: string; en: string }> = {
  aanvragen: { nl: "Aanvragen", en: "Requests" },
  sessies: { nl: "Sessies", en: "Sessions" },
  verwerkt: { nl: "Verwerkt", en: "Processed" },
  vakken: { nl: "Vakken", en: "Courses" },
};

/** Hoe ver terug de tab Sessies kijkt; ouder zit in de tutorlijst per werkingsjaar. */
const PAST_SESSIONS = 60;

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

  const [courseRows, queueCount, roomPendingCount] = await Promise.all([
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
    prisma.palPlusSession.count({
      where: { cancelledAt: null, startsAt: { gt: new Date() }, roomId: null, roomText: null },
    }),
  ]);

  const sessionCourses = courseRows.map((course) => ({
    id: course.id,
    label: palPlusCourseLabel(course, locale),
    active: course.active,
  }));

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
            {value === "sessies" && roomPendingCount > 0
              ? nl
                ? ` (${roomPendingCount} zonder lokaal)`
                : ` (${roomPendingCount} without room)`
              : ""}
          </Link>
        ))}
      </nav>

      {tab === "sessies" ? (
        <SessionsBoard nl={nl} {...await loadSessions(locale)} courses={sessionCourses} rooms={await loadRooms()} />
      ) : tab === "vakken" ? (
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
          courses={sessionCourses}
          rooms={tab === "aanvragen" ? await loadRooms() : []}
          openFollow={tab === "aanvragen" ? await loadOpenFollow(locale) : []}
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
      user: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { name: true } },
      respondsTo: {
        select: { id: true, status: true, courseOther: true, description: true, course: { select: courseSelect } },
      },
      responses: {
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, createdAt: true, user: { select: { id: true, name: true } } },
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
    submitterId: row.user.id,
    submitterName: row.user.name,
    submitterEmail: row.user.email,
    submittedLabel: dateFmt.format(row.createdAt),
    momentLabel:
      row.proposedStartsAt && row.proposedEndsAt
        ? `${dayFmt.format(row.proposedStartsAt)}, ${timeFmt.format(row.proposedStartsAt)} - ${timeFmt.format(row.proposedEndsAt)}`
        : null,
    proposed:
      row.proposedStartsAt && row.proposedEndsAt
        ? {
            date: palPlusWallClockFields(row.proposedStartsAt).date,
            startTime: palPlusWallClockFields(row.proposedStartsAt).time,
            endTime: palPlusWallClockFields(row.proposedEndsAt).time,
          }
        : null,
    preferredPeriod: row.preferredPeriod,
    askers: palPlusAskerCount(row.backers.length),
    backerNames: row.backers.map((backer) => backer.user.name),
    respondsTo: row.respondsTo
      ? {
          id: row.respondsTo.id,
          status: row.respondsTo.status,
          courseLabel: palPlusRequestCourseLabel(row.respondsTo, locale),
          description: row.respondsTo.description,
        }
      : null,
    responses: row.responses.map((response) => ({
      id: response.id,
      userId: response.user.id,
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

/**
 * De lokalen uit de lokalenlijst, per gebouw, zoals een student ze in een
 * uurrooster ziet ("200K 00.06"). Het zijn er een kleine tweehonderd: alles in
 * één keuzelijst is sneller dan een zoekveld.
 */
async function loadRooms(): Promise<RoomGroup[]> {
  const buildings = await prisma.building.findMany({
    where: { rooms: { some: {} } },
    orderBy: [{ shortCode: "asc" }, { name: "asc" }],
    select: {
      name: true,
      shortCode: true,
      rooms: { orderBy: [{ floor: "asc" }, { code: "asc" }], select: { id: true, code: true, name: true } },
    },
  });
  return buildings.map((building) => ({
    building: building.shortCode ? `${building.shortCode} (${building.name})` : building.name,
    rooms: building.rooms.map((room) => ({
      id: room.id,
      label: palPlusRoomLabel({ ...room, building: { shortCode: building.shortCode } }, null) ?? room.name,
    })),
  }));
}

/** De open hulpvragen, om bij het plannen mee te nemen in dezelfde sessie. */
async function loadOpenFollow(locale: Locale): Promise<OpenFollowRequest[]> {
  const rows = await prisma.palPlusRequest.findMany({
    where: { kind: "FOLLOW", status: "OPEN" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      courseId: true,
      courseOther: true,
      description: true,
      course: { select: { code: true, nameNl: true, nameEn: true } },
      user: { select: { name: true } },
      _count: { select: { backers: true } },
    },
  });
  const nl = locale === "nl";
  return rows.map((row) => {
    const askers = palPlusAskerCount(row._count.backers);
    const short = row.description.length > 70 ? `${row.description.slice(0, 70)}…` : row.description;
    return {
      id: row.id,
      courseId: row.courseId,
      label: nl
        ? `Hulpvraag van ${row.user.name} (${askers} ${askers === 1 ? "zoekt" : "zoeken"} dit): ${short}`
        : `Help request from ${row.user.name} (${askers} need this): ${short}`,
    };
  });
}

/**
 * De sessies voor de tab Sessies: alles wat nog komt, en de laatste die voorbij
 * zijn. Datums al opgemaakt in Brusselse tijd.
 */
async function loadSessions(locale: Locale): Promise<{ upcoming: PalPlusSessionView[]; past: PalPlusSessionView[] }> {
  const nl = locale === "nl";
  const now = new Date();
  const select = {
    id: true,
    courseId: true,
    description: true,
    startsAt: true,
    endsAt: true,
    maxParticipants: true,
    roomId: true,
    roomText: true,
    cancelledAt: true,
    cancelReason: true,
    course: { select: { code: true, nameNl: true, nameEn: true } },
    room: { select: { code: true, name: true, building: { select: { shortCode: true } } } },
    tutors: {
      orderBy: { createdAt: "asc" },
      select: { reward: true, user: { select: { id: true, name: true } } },
    },
    attendees: { orderBy: { createdAt: "asc" }, select: { user: { select: { name: true } } } },
    requests: {
      select: { kind: true, status: true, user: { select: { name: true } } },
    },
  } as const;

  const [upcomingRows, pastRows] = await Promise.all([
    prisma.palPlusSession.findMany({
      where: { endsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      select,
    }),
    prisma.palPlusSession.findMany({
      where: { endsAt: { lte: now } },
      orderBy: { startsAt: "desc" },
      take: PAST_SESSIONS,
      select,
    }),
  ]);

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
  const vouchers = (amount: number) =>
    nl
      ? `${amount.toLocaleString("nl-BE")} ${amount === 1 ? "bonnetje" : "bonnetjes"}`
      : `${amount.toLocaleString("en-GB")} ${amount === 1 ? "voucher" : "vouchers"}`;

  const toView = (row: (typeof upcomingRows)[number]): PalPlusSessionView => {
    const start = palPlusWallClockFields(row.startsAt);
    const end = palPlusWallClockFields(row.endsAt);
    return {
      id: row.id,
      courseLabel: palPlusCourseLabel(row.course, locale),
      description: row.description,
      whenLabel: `${dayFmt.format(row.startsAt)}, ${timeFmt.format(row.startsAt)} - ${timeFmt.format(row.endsAt)}`,
      state: palPlusSessionState(row, now),
      roomLabel: palPlusRoomLabel(row.room, row.roomText),
      tutors: row.tutors.map((tutor) => ({
        id: tutor.user.id,
        name: tutor.user.name,
        rewardLabel: vouchers(tutor.reward),
      })),
      attendees: row.attendees.map((attendee) => attendee.user.name),
      attendeeCount: row.attendees.length,
      maxParticipants: row.maxParticipants,
      cancelReason: row.cancelReason,
      requestLabels: row.requests.map(
        (request) =>
          `${request.kind === "GIVE" ? (nl ? "Aanbod van" : "Offer from") : nl ? "Hulpvraag van" : "Help request from"} ${request.user.name} (${PAL_PLUS_STATUS_LABELS[request.status][nl ? "nl" : "en"].toLowerCase()})`,
      ),
      form: {
        id: row.id,
        courseId: row.courseId,
        description: row.description,
        date: start.date,
        startTime: start.time,
        endTime: end.time,
        maxParticipants: row.maxParticipants === null ? "" : String(row.maxParticipants),
        roomId: row.roomId ?? "",
        roomText: row.roomText ?? "",
        tutors: row.tutors.map((tutor) => ({ id: tutor.user.id, name: tutor.user.name })),
      },
    };
  };

  return { upcoming: upcomingRows.map(toView), past: pastRows.map(toView) };
}
