import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { brusselsYMD, ymdKey } from "@/lib/brussels";
import {
  palPlusAskerCount,
  palPlusAvailabilityGrid,
  palPlusCourseLabel,
  readPalPlusAvailability,
  palPlusRequestCourseLabel,
  palPlusRoomLabel,
  palPlusSessionState,
  palPlusWallClockFields,
  PAL_PLUS_STATUS_LABELS,
} from "@/lib/palPlus";
import { CoursesCard, type PalPlusCourseView } from "./CoursesCard";
import { DaypartsCard, TagsCard } from "./ListsCards";
import { RequestsBoard, type OpenFollowRequest, type PalPlusRequestView } from "./RequestsBoard";
import { SessionsBoard, type PalPlusSessionView } from "./SessionsBoard";
import { TutorsBoard, type TutorView } from "./TutorsBoard";
import { workingYearOf } from "@vtk/auth";
import { earnedPalPlusReward } from "@/lib/shift/rewards";
import { praesidiumYears } from "@/lib/shift/voucherEligibility";
import {
  currentWorkingYear,
  formatWorkingYear,
  parseWorkingYear,
  workingYearStart,
  workingYearTabs,
} from "@/lib/workingYear";
import type { RoomGroup } from "./SessionForm";

import "@/app/design/vtk-palplus.css";
// Het maandraster van de agenda is dat van de Theokot-verhuur
// (`components/theokot/RentalMonthGrid`), met zijn stijl.
import "@/app/design/vtk-theokot-verhuur.css";

/**
 * Beheer van PAL+ door VTK Onderwijs: het werkbakje met wat nog beslist moet
 * worden, de sessies, de tutors, wat al afgehandeld is, en de lijsten die
 * Onderwijs bijhoudt (vakken, snelle tags, dagdelen). Zie
 * docs/design-decisions.md ("PAL+").
 */

const TABS = ["aanvragen", "sessies", "tutors", "verwerkt", "vakken"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, { nl: string; en: string }> = {
  aanvragen: { nl: "Aanvragen", en: "Requests" },
  sessies: { nl: "Sessies", en: "Sessions" },
  tutors: { nl: "Tutors", en: "Tutors" },
  verwerkt: { nl: "Verwerkt", en: "Processed" },
  vakken: { nl: "Lijsten", en: "Lists" },
};

/** Hoe ver terug de tab Sessies kijkt; ouder zit in de tutorlijst per werkingsjaar. */
const PAST_SESSIONS = 60;

export default async function AdminPalPlusPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; jaar?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  await requirePermission("pal.manage");

  const { tab: tabParam, jaar } = await searchParams;
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

      {tab === "tutors" ? (
        <TutorsTab nl={nl} base={base} locale={locale} year={parseWorkingYear(jaar)} />
      ) : tab === "sessies" ? (
        <SessionsBoard
          nl={nl}
          todayKey={ymdKey(brusselsYMD(new Date()))}
          {...await loadSessions(locale)}
          courses={sessionCourses}
          rooms={await loadRooms()}
          tags={await loadTagSuggestions()}
        />
      ) : tab === "vakken" ? (
        <div className="space-y-5">
          <CoursesCard
            nl={nl}
            courses={courseRows.map(({ _count, ...course }): PalPlusCourseView => ({
              ...course,
              requestCount: _count.requests,
              sessionCount: _count.sessions,
            }))}
          />
          <TagsCard
            nl={nl}
            tags={await prisma.palPlusTag.findMany({
              orderBy: [{ active: "desc" }, { createdAt: "asc" }],
              select: { id: true, label: true, active: true },
            })}
          />
          <DaypartsCard
            nl={nl}
            dayparts={await prisma.palPlusDaypart.findMany({
              orderBy: [{ active: "desc" }, { startMinutes: "asc" }],
              select: { id: true, labelNl: true, labelEn: true, startMinutes: true, endMinutes: true, active: true },
            })}
          />
        </div>
      ) : (
        <RequestsBoard
          nl={nl}
          base={base}
          mode={tab === "verwerkt" ? "processed" : "queue"}
          requests={await loadRequests(tab === "verwerkt" ? "processed" : "queue", locale)}
          courses={sessionCourses}
          rooms={tab === "aanvragen" ? await loadRooms() : []}
          openFollow={tab === "aanvragen" ? await loadOpenFollow(locale) : []}
          tags={tab === "aanvragen" ? await loadTagSuggestions() : { presets: [], byCourse: {} }}
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
      tags: true,
      availability: true,
      availabilityNote: true,
      preferredPeriod: true,
      reviewNote: true,
      reviewedAt: true,
      createdAt: true,
      coTutorStatus: true,
      course: { select: courseSelect },
      user: { select: { id: true, name: true, email: true } },
      coTutor: { select: { id: true, name: true } },
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
    tags: row.tags,
    availability: palPlusAvailabilityGrid(readPalPlusAvailability(row.availability)),
    availabilityNote: row.availabilityNote,
    coTutor:
      row.coTutor && row.coTutorStatus
        ? { id: row.coTutor.id, name: row.coTutor.name, status: row.coTutorStatus }
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
    // Bij een gesloten aanvraag: wie sloot. Bij een vraag die online staat of
    // gepland is: wie ze nakeek en online zette.
    reviewedLabel:
      row.reviewedAt && row.reviewedBy
        ? nl
          ? `${row.status === "CLOSED" ? "Door" : "Online gezet door"} ${row.reviewedBy.name} op ${dateFmt.format(row.reviewedAt)}`
          : `${row.status === "CLOSED" ? "By" : "Published by"} ${row.reviewedBy.name} on ${dateFmt.format(row.reviewedAt)}`
        : null,
  }));
}

/**
 * De tags voor het sessieformulier: de snelle tags, en per vak de tags die er al
 * gebruikt werden, de meest gebruikte eerst. In het beheer mogen ook die van
 * aanvragen die nog niet nagekeken zijn mee: enkel Onderwijs ziet ze.
 */
async function loadTagSuggestions(): Promise<{ presets: string[]; byCourse: Record<string, string[]> }> {
  const [presets, requests, sessions] = await Promise.all([
    prisma.palPlusTag.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { label: true } }),
    prisma.palPlusRequest.findMany({
      where: { courseId: { not: null }, NOT: { tags: { isEmpty: true } } },
      select: { courseId: true, tags: true },
      take: 1000,
    }),
    prisma.palPlusSession.findMany({
      where: { NOT: { tags: { isEmpty: true } } },
      select: { courseId: true, tags: true },
      take: 1000,
    }),
  ]);
  const counts = new Map<string, Map<string, number>>();
  for (const row of [...requests, ...sessions]) {
    if (!row.courseId) continue;
    const perCourse = counts.get(row.courseId) ?? new Map<string, number>();
    for (const tag of row.tags) perCourse.set(tag, (perCourse.get(tag) ?? 0) + 1);
    counts.set(row.courseId, perCourse);
  }
  const byCourse: Record<string, string[]> = {};
  for (const [courseId, perCourse] of counts) {
    byCourse[courseId] = [...perCourse.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([tag]) => tag);
  }
  return { presets: presets.map((preset) => preset.label), byCourse };
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

/**
 * De hulpvragen die nog op een sessie wachten, om bij het plannen mee te nemen
 * in dezelfde sessie. Ook een vraag die nog niet nagekeken is: een sessie voor
 * die vraag plannen is een sterkere beslissing dan ze online zetten.
 */
async function loadOpenFollow(locale: Locale): Promise<OpenFollowRequest[]> {
  const rows = await prisma.palPlusRequest.findMany({
    where: { kind: "FOLLOW", status: { in: ["PENDING", "OPEN"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
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
        ? `Hulpvraag van ${row.user.name} (${row.status === "PENDING" ? "nog niet online" : `${askers} ${askers === 1 ? "zoekt" : "zoeken"} dit`}): ${short}`
        : `Help request from ${row.user.name} (${row.status === "PENDING" ? "not online yet" : `${askers} need this`}): ${short}`,
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
    tags: true,
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
      select: { reward: true, rewardPaid: true, user: { select: { id: true, name: true } } },
    },
    attendees: {
      orderBy: { createdAt: "asc" },
      select: { userId: true, attended: true, user: { select: { name: true } } },
    },
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
  // Een praesidiumlid verdient geen bonnetjes; dat staat er dan bij in plaats
  // van een beloning die nooit in het saldo komt.
  const praesidium = await praesidiumYears([
    ...new Set([...upcomingRows, ...pastRows].flatMap((row) => row.tutors.map((tutor) => tutor.user.id))),
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
      tags: row.tags,
      dayKey: ymdKey(brusselsYMD(row.startsAt)),
      timeLabel: timeFmt.format(row.startsAt),
      whenLabel: `${dayFmt.format(row.startsAt)}, ${timeFmt.format(row.startsAt)} - ${timeFmt.format(row.endsAt)}`,
      state: palPlusSessionState(row, now),
      roomLabel: palPlusRoomLabel(row.room, row.roomText),
      tutors: row.tutors.map((tutor) => {
        const earned = earnedPalPlusReward(
          { userId: tutor.user.id, reward: tutor.reward, startsAt: row.startsAt, cancelledAt: null },
          praesidium,
        );
        return {
          id: tutor.user.id,
          name: tutor.user.name,
          rewardLabel:
            earned === 0 && tutor.reward > 0 ? (nl ? "praesidium, geen bonnetjes" : "praesidium, no vouchers") : vouchers(earned),
        };
      }),
      spentVouchers: row.tutors.reduce((total, tutor) => total + tutor.rewardPaid, 0),
      attendees: row.attendees.map((attendee) => ({
        userId: attendee.userId,
        name: attendee.user.name,
        attended: attendee.attended,
      })),
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
        tags: row.tags,
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

/** De tab Tutors: de werkingsjaren als knoppen, en de lijst van het gekozen jaar. */
async function TutorsTab({
  nl,
  base,
  locale,
  year,
}: {
  nl: boolean;
  base: string;
  locale: Locale;
  year: number;
}) {
  const [tutors, sessionStarts] = await Promise.all([
    loadTutors(year, locale),
    prisma.palPlusSession.findMany({ select: { startsAt: true } }),
  ]);
  const years = workingYearTabs([...new Set(sessionStarts.map((row) => workingYearOf(row.startsAt)))]);

  return (
    <div className="space-y-4">
      {years.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label={nl ? "Werkingsjaar" : "Working year"}>
          {years.map((value) => (
            <Link
              key={value}
              href={`${base}/admin/pal-plus?tab=tutors${value === currentWorkingYear() ? "" : `&jaar=${value}`}`}
              aria-current={value === year ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                value === year
                  ? "border-vtk-ink bg-vtk-blue-soft text-vtk-ink"
                  : "border-vtk-blue/15 text-vtk-muted hover:bg-vtk-blue-soft/60"
              }`}
            >
              {formatWorkingYear(value)}
            </Link>
          ))}
        </nav>
      )}
      <TutorsBoard nl={nl} tutors={tutors} />
    </div>
  );
}

/**
 * Wie in één werkingsjaar (15 juli tot 15 juli) sessies gaf, met per sessie de
 * beloning volgens dezelfde regels als het saldo (`earnedPalPlusReward`).
 */
async function loadTutors(year: number, locale: Locale): Promise<TutorView[]> {
  const nl = locale === "nl";
  const now = new Date();
  const rows = await prisma.palPlusSessionTutor.findMany({
    where: { session: { startsAt: { gte: workingYearStart(year), lt: workingYearStart(year + 1) } } },
    orderBy: { session: { startsAt: "asc" } },
    select: {
      userId: true,
      reward: true,
      rewardPaid: true,
      rewardCorrectedAt: true,
      rewardNote: true,
      rewardCorrectedBy: { select: { name: true } },
      user: { select: { name: true, email: true } },
      session: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          cancelledAt: true,
          course: { select: { code: true, nameNl: true, nameEn: true } },
          attendees: { select: { attended: true } },
        },
      },
    },
  });
  const praesidium = await praesidiumYears([...new Set(rows.map((row) => row.userId))]);

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
  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Brussels",
  });

  const byUser = new Map<string, TutorView>();
  for (const row of rows) {
    const session = row.session;
    const state = palPlusSessionState(session, now);
    const earned = earnedPalPlusReward(
      { userId: row.userId, reward: row.reward, startsAt: session.startsAt, cancelledAt: session.cancelledAt },
      praesidium,
    );
    const hours = (session.endsAt.getTime() - session.startsAt.getTime()) / 3_600_000;
    const attendance = {
      came: session.attendees.filter((attendee) => attendee.attended === true).length,
      notCame: session.attendees.filter((attendee) => attendee.attended === false).length,
      open: session.attendees.filter((attendee) => attendee.attended === null).length,
      total: session.attendees.length,
    };

    const tutor =
      byUser.get(row.userId) ??
      ({
        userId: row.userId,
        name: row.user.name,
        email: row.user.email,
        given: 0,
        upcoming: 0,
        hours: 0,
        earned: 0,
        paid: 0,
        praesidium: false,
        attendance: { came: 0, open: 0, total: 0 },
        sessions: [],
      } satisfies TutorView);

    if (state === "past") {
      tutor.given += 1;
      tutor.hours += hours;
      tutor.earned += earned;
      tutor.attendance.came += attendance.came;
      tutor.attendance.open += attendance.open;
      tutor.attendance.total += attendance.total;
      if (earned === 0 && row.reward > 0) tutor.praesidium = true;
    } else if (state !== "cancelled") {
      tutor.upcoming += 1;
    }
    tutor.paid += row.rewardPaid;
    tutor.sessions.push({
      sessionId: session.id,
      courseLabel: palPlusCourseLabel(session.course, locale),
      whenLabel: `${dayFmt.format(session.startsAt)}, ${timeFmt.format(session.startsAt)} - ${timeFmt.format(session.endsAt)}`,
      state,
      hours,
      reward: row.reward,
      earned: state === "cancelled" ? 0 : earned,
      rewardPaid: row.rewardPaid,
      correction: row.rewardCorrectedAt
        ? {
            note: row.rewardNote,
            label: nl
              ? `Gecorrigeerd${row.rewardCorrectedBy ? ` door ${row.rewardCorrectedBy.name}` : ""} op ${dateFmt.format(row.rewardCorrectedAt)}`
              : `Corrected${row.rewardCorrectedBy ? ` by ${row.rewardCorrectedBy.name}` : ""} on ${dateFmt.format(row.rewardCorrectedAt)}`,
          }
        : null,
      attendance,
    });
    byUser.set(row.userId, tutor);
  }

  return [...byUser.values()].sort((a, b) => b.given - a.given || a.name.localeCompare(b.name, nl ? "nl" : "en"));
}
