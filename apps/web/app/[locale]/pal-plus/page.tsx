import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import { getDictionary, type Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import { getCurrentSession } from "@/lib/session";
import { withdrawPalPlusRequestAction } from "@/app/actions/palPlus";
import { brusselsYMD, ymdKey } from "@/lib/brussels";
import {
  canAnswerPalPlusCoTutor,
  isActivePalPlusStatus,
  palPlusAskerCount,
  palPlusAvailabilityLines,
  palPlusCourseLabel,
  palPlusDaypartLabel,
  palPlusMinutesLabel,
  readPalPlusAvailability,
  palPlusRequestCourseLabel,
  palPlusRoomLabel,
  palPlusSessionState,
  palPlusSignupBlock,
  PAL_PLUS_STATUS_LABELS,
} from "@/lib/palPlus";
import { palPlusMemberErrors } from "@/lib/palPlusMessages";
import { PalPlusRequestForm, type OpenRequestHint } from "./PalPlusRequestForm";
import { BackingButton, type BackingCopy } from "./BackingButton";
import { SignupButton, type SignupCopy } from "./SignupButton";
import { CoTutorAnswer } from "./CoTutorAnswer";
import { PalPlusSearch } from "./PalPlusSearch";
import { AttendanceList, type AttendanceCopy, type AttendanceEntry } from "@/components/palPlus/AttendanceList";
import { earnedPalPlusReward } from "@/lib/shift/rewards";
import { praesidiumYears } from "@/lib/shift/voucherEligibility";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-palplus-page.css";
import "@/app/design/vtk-palplus-tags.css";

/**
 * `/pal-plus`: peer assisted learning op aanvraag.
 *
 * Bovenaan de twee dingen die je hier kan doen (hulp vragen, een sessie
 * aanbieden), daaronder je eigen aanvragen en de open vragen. Kijken mag
 * zonder account; meedoen vraagt een login, ook zonder lidmaatschap.
 *
 * De open vragen staan er zonder naam: wie hulp zoekt bij een vak, ziet enkel
 * Onderwijs. Het formulier staat in de URL (`?formulier=hulp|geven`), zodat
 * "ik kan dit geven" bij een vraag een gewone link is. Zie
 * docs/design-decisions.md ("PAL+").
 */

type Params = Promise<{ locale: string }>;

/** Hoe lang een gegeven sessie onder "Sessies die je gaf" blijft staan. */
const TUTORED_DAYS = 30;
type SearchParams = Promise<{ formulier?: string; vraag?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("palPlus", "/pal-plus", locale);
}

export default async function PalPlusPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const dictionary = getDictionary(locale);
  const t = dictionary.palPlus;

  const { formulier, vraag } = await searchParams;
  const formKind = formulier === "geven" ? "GIVE" : formulier === "hulp" ? "FOLLOW" : null;

  const session = await getCurrentSession();
  const userId = session?.user.id ?? null;

  const loginHref = (next: string) => `${base}/inloggen?next=${encodeURIComponent(next)}`;
  const formHref = (kind: "hulp" | "geven", requestId?: string) =>
    `${base}/pal-plus?formulier=${kind}${requestId ? `&vraag=${requestId}` : ""}#formulier`;

  // Een gedeelde link naar het formulier: eerst inloggen, dan terug naar hier.
  if (formKind && !userId) {
    redirect(loginHref(formHref(formKind === "GIVE" ? "geven" : "hulp", vraag).replace("#formulier", "")));
  }

  const courseSelect = { code: true, nameNl: true, nameEn: true } as const;
  const roomSelect = {
    code: true,
    name: true,
    building: { select: { shortCode: true, lat: true, lng: true } },
  } as const;
  const now = new Date();

  const [courseRows, openRows, mineRows, respondsToRow, sessionRows, coTutorRows] = await Promise.all([
    prisma.palPlusCourse.findMany({
      where: { active: true },
      orderBy: { nameNl: "asc" },
      select: { id: true, ...courseSelect },
    }),
    prisma.palPlusRequest.findMany({
      where: { kind: "FOLLOW", status: "OPEN" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        courseId: true,
        courseOther: true,
        description: true,
        preferredPeriod: true,
        tags: true,
        course: { select: courseSelect },
        _count: { select: { backers: true } },
        backers: userId ? { where: { userId }, select: { userId: true } } : false,
      },
    }),
    userId
      ? prisma.palPlusRequest.findMany({
          // Wat je zelf introk, weet je al; dat hoeft hier niet te blijven staan.
          where: { userId, status: { not: "WITHDRAWN" } },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            kind: true,
            status: true,
            courseOther: true,
            description: true,
            tags: true,
            availability: true,
            availabilityNote: true,
            preferredPeriod: true,
            reviewNote: true,
            createdAt: true,
            coTutorStatus: true,
            coTutor: { select: { name: true } },
            course: { select: courseSelect },
            _count: { select: { backers: true } },
            session: {
              select: {
                startsAt: true,
                endsAt: true,
                cancelledAt: true,
                roomText: true,
                room: { select: roomSelect },
              },
            },
          },
        })
      : Promise.resolve([]),
    formKind === "GIVE" && vraag
      ? prisma.palPlusRequest.findFirst({
          where: { id: vraag, kind: "FOLLOW" },
          select: {
            id: true,
            courseId: true,
            courseOther: true,
            description: true,
            tags: true,
            course: { select: courseSelect },
          },
        })
      : Promise.resolve(null),
    // Wat nog komt of bezig is. Een geannuleerde sessie blijft staan tot haar
    // begin, zodat wie ingeschreven was het hier ook ziet.
    prisma.palPlusSession.findMany({
      where: {
        endsAt: { gt: now },
        OR: [{ cancelledAt: null }, { startsAt: { gt: now } }],
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        description: true,
        tags: true,
        startsAt: true,
        endsAt: true,
        maxParticipants: true,
        cancelledAt: true,
        cancelReason: true,
        roomText: true,
        room: { select: roomSelect },
        course: { select: courseSelect },
        tutors: { orderBy: { createdAt: "asc" }, select: { userId: true, user: { select: { name: true } } } },
        _count: { select: { attendees: true } },
        // Enkel je eigen inschrijving; wie er verder komt, ziet enkel een tutor.
        attendees: userId ? { where: { userId }, select: { userId: true } } : false,
      },
    }),
    // Aanbiedingen waarin iemand jou opgaf als tweede tutor: een uitnodiging
    // zolang je niet antwoordde, daarna bij je eigen aanvragen.
    userId
      ? prisma.palPlusRequest.findMany({
          where: { coTutorId: userId, kind: "GIVE", status: { not: "WITHDRAWN" }, coTutorStatus: { not: "DECLINED" } },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            kind: true,
            status: true,
            coTutorStatus: true,
            courseOther: true,
            description: true,
            tags: true,
            availability: true,
            availabilityNote: true,
            createdAt: true,
            course: { select: courseSelect },
            user: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  // Enkel voor het formulier: de snelle tags, de dagdelen van het rooster, en
  // per vak de tags die er al gebruikt werden. Die voorstellen komen enkel uit
  // wat al publiek staat (open vragen en sessies): een tag uit een aanvraag die
  // Onderwijs nog niet nakeek, hoort niet bij een ander als voorstel te staan.
  const formLists =
    formKind && userId
      ? await Promise.all([
          prisma.palPlusTag.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { label: true } }),
          prisma.palPlusDaypart.findMany({
            where: { active: true },
            orderBy: { startMinutes: "asc" },
            select: { id: true, labelNl: true, labelEn: true, startMinutes: true, endMinutes: true },
          }),
          prisma.palPlusRequest.findMany({
            where: { kind: "FOLLOW", status: "OPEN", courseId: { not: null }, NOT: { tags: { isEmpty: true } } },
            select: { courseId: true, tags: true },
            take: 500,
          }),
          prisma.palPlusSession.findMany({
            where: { NOT: { tags: { isEmpty: true } } },
            orderBy: { startsAt: "desc" },
            select: { courseId: true, tags: true },
            take: 500,
          }),
        ])
      : null;
  const tagSuggestionsByCourse: Record<string, string[]> = {};
  if (formLists) {
    const counts = new Map<string, Map<string, number>>();
    for (const row of [...formLists[2], ...formLists[3]]) {
      if (!row.courseId) continue;
      const perCourse = counts.get(row.courseId) ?? new Map<string, number>();
      for (const tag of row.tags) perCourse.set(tag, (perCourse.get(tag) ?? 0) + 1);
      counts.set(row.courseId, perCourse);
    }
    for (const [courseId, perCourse] of counts) {
      tagSuggestionsByCourse[courseId] = [...perCourse.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 10)
        .map(([tag]) => tag);
    }
  }
  const invitations = coTutorRows.filter((row) => canAnswerPalPlusCoTutor(row));
  const coTutorAccepted = coTutorRows.filter((row) => row.coTutorStatus === "ACCEPTED");

  // Wie ingeschreven is, zien enkel de tutors van die sessie (en Onderwijs, in
  // het beheer). Die namen komen er dus enkel bij voor je eigen sessies.
  const teachingIds = userId
    ? sessionRows.filter((row) => row.tutors.some((tutor) => tutor.userId === userId)).map((row) => row.id)
    : [];
  // Wat een tutor de voorbije maand gaf: daar duidt de tutor aan wie er kwam en
  // staat wat het opleverde. De agenda hierboven toont enkel wat nog komt.
  const tutoredRows = userId
    ? await prisma.palPlusSession.findMany({
        where: {
          tutors: { some: { userId } },
          cancelledAt: null,
          endsAt: { lte: now, gt: new Date(now.getTime() - TUTORED_DAYS * 86_400_000) },
        },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          cancelledAt: true,
          course: { select: courseSelect },
          tutors: { where: { userId }, select: { reward: true } },
        },
      })
    : [];
  const praesidium = tutoredRows.length > 0 && userId ? await praesidiumYears([userId]) : new Map();

  const attendeesBySession = new Map<string, AttendanceEntry[]>();
  const attendeeSessionIds = [...teachingIds, ...tutoredRows.map((row) => row.id)];
  if (attendeeSessionIds.length > 0) {
    const rows = await prisma.palPlusSessionAttendee.findMany({
      where: { sessionId: { in: attendeeSessionIds } },
      orderBy: { createdAt: "asc" },
      select: { sessionId: true, userId: true, attended: true, user: { select: { name: true } } },
    });
    for (const row of rows) {
      attendeesBySession.set(row.sessionId, [
        ...(attendeesBySession.get(row.sessionId) ?? []),
        { userId: row.userId, name: row.user.name, attended: row.attended },
      ]);
    }
  }
  const attendeeNames = new Map(
    [...attendeesBySession].map(([sessionId, entries]) => [sessionId, entries.map((entry) => entry.name)]),
  );
  const attendanceCopy: AttendanceCopy = {
    came: t.sessions.came,
    didNotCome: t.sessions.didNotCome,
    summary: t.sessions.summary,
    notMarked: t.sessions.notMarked,
    errors: palPlusMemberErrors(nl),
    fallbackError: t.sessions.attendanceError,
  };

  const askersLabel = (count: number) =>
    count === 1 ? t.open.askersOne : t.open.askersMany.replace("{count}", String(count));

  // De meest gezochte vragen eerst: daar is een tutor het meest waard.
  const open = openRows
    .map((row) => ({
      id: row.id,
      courseId: row.courseId,
      courseLabel: palPlusRequestCourseLabel(row, locale),
      description: row.description,
      preferredPeriod: row.preferredPeriod,
      tags: row.tags,
      searchText: [palPlusRequestCourseLabel(row, locale), row.course?.nameNl, row.course?.nameEn, ...row.tags, row.description]
        .filter(Boolean)
        .join(" "),
      askers: palPlusAskerCount(row._count.backers),
      backedByMe: Array.isArray(row.backers) && row.backers.length > 0,
      mine: userId !== null && row.userId === userId,
    }))
    .sort((a, b) => b.askers - a.askers);

  const openByCourse: Record<string, OpenRequestHint[]> = {};
  for (const request of open) {
    if (!request.courseId) continue;
    (openByCourse[request.courseId] ??= []).push({
      id: request.id,
      description: request.description,
      askersLabel: askersLabel(request.askers),
      backedByMe: request.backedByMe,
      mine: request.mine,
    });
  }

  const signupCopy: SignupCopy = {
    signUp: t.sessions.signUp,
    leave: t.sessions.leave,
    signedUp: t.sessions.signedUp,
    signedUpToast: t.sessions.signedUpToast,
    leftToast: t.sessions.leftToast,
    errors: palPlusMemberErrors(nl),
    fallbackError: t.sessions.error,
  };

  const backingCopy: BackingCopy = {
    back: t.open.back,
    backed: t.open.backed,
    backedToast: t.open.backedToast,
    unbackedToast: t.open.unbackedToast,
    mine: t.open.mine,
    errors: palPlusMemberErrors(nl),
    fallbackError: t.open.backError,
  };

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
    month: "long",
    timeZone: "Europe/Brussels",
  });
  const moment = (start: Date, end: Date) =>
    `${dayFmt.format(start)}, ${timeFmt.format(start)} - ${timeFmt.format(end)}`;
  const longDayFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Brussels",
  });

  // De agenda per dag, in Brusselse tijd.
  const days: { key: string; label: string; sessions: typeof sessionRows }[] = [];
  for (const row of sessionRows) {
    const key = ymdKey(brusselsYMD(row.startsAt));
    const last = days[days.length - 1];
    if (last && last.key === key) last.sessions.push(row);
    else days.push({ key, label: longDayFmt.format(row.startsAt), sessions: [row] });
  }

  /** Een link naar het gebouw op de kaart, wanneer we zijn ligging kennen. */
  const mapHref = (room: { building: { lat: number | null; lng: number | null } } | null) =>
    room?.building.lat != null && room.building.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${room.building.lat},${room.building.lng}`
      : null;

  return (
    <div className="vtk-page pp-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{t.title}</h1>
          <p className="vtk-page-subtitle">{t.subtitle}</p>
        </div>
      </header>

      <div className="vtk-page-shell pp-shell">
        {formKind && userId ? (
          <PalPlusRequestForm
            kind={formKind}
            nl={nl}
            base={base}
            copy={t.form}
            backingCopy={backingCopy}
            courses={courseRows.map((course) => ({
              id: course.id,
              label: palPlusCourseLabel(course, locale),
            }))}
            openByCourse={openByCourse}
            respondsTo={
              respondsToRow
                ? {
                    id: respondsToRow.id,
                    courseId: respondsToRow.courseId,
                    courseLabel: palPlusRequestCourseLabel(respondsToRow, locale),
                    description: respondsToRow.description,
                    tags: respondsToRow.tags,
                  }
                : null
            }
            tagPresets={formLists?.[0].map((tag) => tag.label) ?? []}
            tagSuggestionsByCourse={tagSuggestionsByCourse}
            dayparts={(formLists?.[1] ?? []).map((daypart) => ({
              id: daypart.id,
              label: palPlusDaypartLabel(daypart, locale),
              hours: `${palPlusMinutesLabel(daypart.startMinutes)}-${palPlusMinutesLabel(daypart.endMinutes)}`,
            }))}
          />
        ) : (
          <>
            <div className="pp-actions">
              <section className="vtk-panel pp-action" aria-labelledby="pp-ask-title">
                <h2 id="pp-ask-title">{t.askTitle}</h2>
                <p>{t.askBody}</p>
                <Link
                  href={userId ? formHref("hulp") : loginHref(`${base}/pal-plus?formulier=hulp`)}
                  className="vtk-button vtk-button-primary"
                >
                  {userId ? t.askButton : t.loginButton}
                </Link>
              </section>
              <section className="vtk-panel pp-action" aria-labelledby="pp-give-title">
                <h2 id="pp-give-title">{t.giveTitle}</h2>
                <p>{t.giveBody}</p>
                <Link
                  href={userId ? formHref("geven") : loginHref(`${base}/pal-plus?formulier=geven`)}
                  className="vtk-button vtk-button-primary"
                >
                  {userId ? t.giveButton : t.loginButton}
                </Link>
              </section>
            </div>
            {!userId && <p className="pp-login-note">{t.loginNote}</p>}
          </>
        )}

        {invitations.length > 0 && (
          <section className="pp-section" id="uitnodigingen" aria-labelledby="pp-invite-title">
            <div className="pp-section-head">
              <h2 id="pp-invite-title" className="pp-section-title">
                {t.invitations.title}
              </h2>
              <p>{t.invitations.intro}</p>
            </div>
            <ul className="pp-mine">
              {invitations.map((row) => (
                <li key={row.id} className="vtk-panel pp-mine-item pp-invite">
                  <div className="pp-mine-head">
                    <span className="pp-kind">{t.invitations.from.replace("{name}", row.user.name)}</span>
                  </div>
                  <p className="pp-course">{palPlusRequestCourseLabel(row, locale)}</p>
                  <p className="pp-text">{row.description}</p>
                  <TagList tags={row.tags} />
                  <AvailabilitySummary
                    lines={palPlusAvailabilityLines(readPalPlusAvailability(row.availability), locale)}
                    note={row.availabilityNote}
                    label={t.mine.availability}
                    noteLabel={t.mine.availabilityNote}
                  />
                  <CoTutorAnswer requestId={row.id} inviterName={row.user.name} nl={nl} copy={t.invitations} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {(sessionRows.length > 0 || open.length > 0) && <PalPlusSearch copy={t.search} />}

        <section className="pp-section" aria-labelledby="pp-sessions-title">
          <div className="pp-section-head pp-section-head-row">
            <div>
              <h2 id="pp-sessions-title" className="pp-section-title">
                {t.sessions.title}
              </h2>
              {sessionRows.length > 0 && <p>{t.sessions.intro}</p>}
            </div>
            <a href={`/api/pal-plus/agenda.ics${nl ? "" : "?lang=en"}`} className="pp-subscribe">
              {t.sessions.subscribe}
            </a>
          </div>
          {days.length === 0 ? (
            <p className="pp-empty">{t.sessions.empty}</p>
          ) : (
            <div className="pp-agenda" data-pp-searchable>
              <p className="pp-empty" data-pp-noresults hidden />
              {days.map((day) => (
                <section key={day.key} className="pp-day" aria-label={day.label} data-pp-group>
                  <h3 className="pp-day-label">{day.label}</h3>
                  <ul className="pp-sessions">
                    {day.sessions.map((row) => {
                      const state = palPlusSessionState(row, now);
                      const isTutor = userId !== null && row.tutors.some((tutor) => tutor.userId === userId);
                      const signedUp = Array.isArray(row.attendees) && row.attendees.length > 0;
                      const block = palPlusSignupBlock(row, {
                        attendeeCount: row._count.attendees,
                        isTutor,
                        now,
                      });
                      const room = palPlusRoomLabel(row.room, row.roomText);
                      const map = mapHref(row.room);
                      const names = attendeeNames.get(row.id) ?? [];
                      return (
                        <li
                          key={row.id}
                          className="vtk-panel pp-session"
                          data-state={state}
                          data-pp-search={[
                            palPlusCourseLabel(row.course, locale),
                            row.course.nameNl,
                            row.course.nameEn,
                            ...row.tags,
                            row.description,
                            ...row.tutors.map((tutor) => tutor.user.name),
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <div className="pp-session-time">
                            {timeFmt.format(row.startsAt)} - {timeFmt.format(row.endsAt)}
                            {state === "cancelled" && <span className="pp-session-flag">{t.sessions.cancelled}</span>}
                            {state === "running" && <span className="pp-session-flag">{t.sessions.running}</span>}
                          </div>
                          <div className="pp-session-main">
                            <p className="pp-course">{palPlusCourseLabel(row.course, locale)}</p>
                            {row.description && <p className="pp-text">{row.description}</p>}
                            <TagList tags={row.tags} />
                            <dl className="pp-facts">
                              <div>
                                <dt>{t.sessions.room}</dt>
                                <dd>
                                  {room ?? <span className="pp-pending">{t.sessions.roomPending}</span>}
                                  {room && map && (
                                    <>
                                      {" "}
                                      <a href={map} className="pp-map" target="_blank" rel="noreferrer">
                                        {t.sessions.map}
                                      </a>
                                    </>
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt>{t.sessions.tutors}</dt>
                                <dd>{row.tutors.map((tutor) => tutor.user.name).join(", ")}</dd>
                              </div>
                              <div>
                                <dt>{t.sessions.attendance}</dt>
                                <dd className="pp-num">
                                  {row.maxParticipants !== null
                                    ? t.sessions.countMax
                                        .replace("{count}", String(row._count.attendees))
                                        .replace("{max}", String(row.maxParticipants))
                                    : t.sessions.countOpen.replace("{count}", String(row._count.attendees))}
                                </dd>
                              </div>
                            </dl>
                            {state === "cancelled" && row.cancelReason && (
                              <div className="pp-reason">
                                <p className="pp-reason-label">{t.sessions.cancelled}</p>
                                <p>{row.cancelReason}</p>
                              </div>
                            )}
                            {isTutor && state !== "cancelled" && (
                              <div className="pp-attendees">
                                <p className="pp-reason-label">{t.sessions.attendeesTitle}</p>
                                {names.length === 0 ? (
                                  <p className="pp-empty">{t.sessions.noAttendees}</p>
                                ) : state === "running" ? (
                                  <AttendanceList
                                    sessionId={row.id}
                                    attendees={attendeesBySession.get(row.id) ?? []}
                                    copy={attendanceCopy}
                                  />
                                ) : (
                                  <ul>
                                    {names.map((name, index) => (
                                      <li key={`${name}-${index}`}>{name}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                          {state !== "cancelled" && (
                            <div className="pp-session-actions">
                              {isTutor ? (
                                <span className="pp-signed">{t.sessions.youTeach}</span>
                              ) : !userId ? (
                                state === "upcoming" && (
                                  <Link href={loginHref(`${base}/pal-plus`)} className="pp-give-link">
                                    {t.sessions.loginToSignUp}
                                  </Link>
                                )
                              ) : signedUp && state === "upcoming" ? (
                                <SignupButton sessionId={row.id} signedUp copy={signupCopy} />
                              ) : signedUp ? (
                                <span className="pp-signed">
                                  <span aria-hidden="true">✓</span> {t.sessions.signedUp}
                                </span>
                              ) : block === "FULL" ? (
                                <span className="pp-full">{t.sessions.full}</span>
                              ) : block === null ? (
                                <SignupButton sessionId={row.id} signedUp={false} copy={signupCopy} />
                              ) : null}
                              <a
                                href={`/api/pal-plus/sessie/${row.id}${nl ? "" : "?lang=en"}`}
                                className="pp-calendar-link"
                              >
                                {t.sessions.addToCalendar}
                              </a>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>

        {tutoredRows.length > 0 && (
          <section className="pp-section" aria-labelledby="pp-tutored-title">
            <div className="pp-section-head">
              <h2 id="pp-tutored-title" className="pp-section-title">
                {t.sessions.tutoredTitle}
              </h2>
              <p>{t.sessions.tutoredIntro}</p>
            </div>
            <ul className="pp-mine">
              {tutoredRows.map((row) => {
                const earned = userId
                  ? earnedPalPlusReward(
                      {
                        userId,
                        reward: row.tutors[0]?.reward ?? 0,
                        startsAt: row.startsAt,
                        cancelledAt: row.cancelledAt,
                      },
                      praesidium,
                    )
                  : 0;
                const attendees = attendeesBySession.get(row.id) ?? [];
                return (
                  <li key={row.id} className="vtk-panel pp-mine-item">
                    <div className="pp-mine-head">
                      <span className="pp-kind">{moment(row.startsAt, row.endsAt)}</span>
                      <span className="pp-status" data-status={earned > 0 ? "PLANNED" : "CLOSED"}>
                        {earned === 0
                          ? t.sessions.rewardNone
                          : earned === 1
                            ? t.sessions.rewardOne
                            : t.sessions.rewardMany.replace("{amount}", earned.toLocaleString(nl ? "nl-BE" : "en-GB"))}
                      </span>
                    </div>
                    <p className="pp-course">{palPlusCourseLabel(row.course, locale)}</p>
                    {attendees.length === 0 ? (
                      <p className="pp-empty">{t.sessions.nobody}</p>
                    ) : (
                      <AttendanceList sessionId={row.id} attendees={attendees} copy={attendanceCopy} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {(mineRows.length > 0 || coTutorAccepted.length > 0) && (
          <section className="pp-section" id="jouw-aanvragen" aria-labelledby="pp-mine-title">
            <h2 id="pp-mine-title" className="pp-section-title">
              {t.mine.title}
            </h2>
            <ul className="pp-mine">
              {mineRows.map((request) => {
                const courseLabel = palPlusRequestCourseLabel(request, locale);
                return (
                  <li key={request.id} className="vtk-panel pp-mine-item">
                    <div className="pp-mine-head">
                      <span className="pp-kind">
                        {request.kind === "GIVE" ? t.mine.kindGive : t.mine.kindAsk}
                      </span>
                      {request.status === "PLANNED" && request.session?.cancelledAt ? (
                        <span className="pp-status" data-status="CLOSED">
                          {t.mine.sessionCancelledBadge}
                        </span>
                      ) : (
                        <span className="pp-status" data-status={request.status}>
                          {PAL_PLUS_STATUS_LABELS[request.status][nl ? "nl" : "en"]}
                        </span>
                      )}
                    </div>
                    <p className="pp-course">{courseLabel}</p>
                    <p className="pp-text">{request.description}</p>
                    <TagList tags={request.tags} />
                    {request.kind === "GIVE" && (
                      <AvailabilitySummary
                        lines={palPlusAvailabilityLines(readPalPlusAvailability(request.availability), locale)}
                        note={request.availabilityNote}
                        label={t.mine.availability}
                        noteLabel={t.mine.availabilityNote}
                      />
                    )}
                    <dl className="pp-facts">
                      {request.coTutor && request.coTutorStatus && (
                        <div>
                          <dt>{t.mine.withCoTutor}</dt>
                          <dd>
                            {request.coTutor.name} ({t.mine[`coTutor${request.coTutorStatus}`]})
                          </dd>
                        </div>
                      )}
                      {request.kind === "FOLLOW" && request.preferredPeriod && (
                        <div>
                          <dt>{t.mine.period}</dt>
                          <dd>{request.preferredPeriod}</dd>
                        </div>
                      )}
                      {request.status === "PLANNED" && request.session && !request.session.cancelledAt && (
                        <div>
                          <dt>{t.mine.session}</dt>
                          <dd>
                            {moment(request.session.startsAt, request.session.endsAt)}
                            <br />
                            {palPlusRoomLabel(request.session.room, request.session.roomText) ??
                              t.sessions.roomPending}
                          </dd>
                        </div>
                      )}
                      {/* Steunen kan pas wanneer de vraag online staat. */}
                      {request.kind === "FOLLOW" && request.status !== "PENDING" && (
                        <div>
                          <dt>{t.mine.askers}</dt>
                          <dd className="pp-num">{palPlusAskerCount(request._count.backers)}</dd>
                        </div>
                      )}
                      <div>
                        <dt>{t.mine.submitted}</dt>
                        <dd>{dateFmt.format(request.createdAt)}</dd>
                      </div>
                    </dl>
                    {request.status === "PLANNED" && request.session?.cancelledAt && (
                      <div className="pp-reason">
                        <p>{t.mine.sessionCancelled}</p>
                      </div>
                    )}
                    {request.status === "CLOSED" && request.reviewNote && (
                      <div className="pp-reason">
                        <p className="pp-reason-label">{t.mine.reason}</p>
                        <p>{request.reviewNote}</p>
                      </div>
                    )}
                    {isActivePalPlusStatus(request.status) && (
                      <div className="pp-mine-actions">
                        <DeleteButton
                          action={withdrawPalPlusRequestAction}
                          fields={{ id: request.id }}
                          title={t.mine.withdrawTitle}
                          description={`${courseLabel}: ${
                            request.kind === "GIVE" ? t.mine.withdrawGive : t.mine.withdrawAsk
                          }`}
                          confirmLabel={t.mine.withdrawYes}
                          cancelLabel={t.mine.withdrawNo}
                          successMessage={t.mine.withdrawn}
                          errorMessages={palPlusMemberErrors(nl)}
                          errorFallback={t.form.fallbackError}
                        >
                          {t.mine.withdraw}
                        </DeleteButton>
                      </div>
                    )}
                  </li>
                );
              })}
              {coTutorAccepted.map((row) => (
                <li key={row.id} className="vtk-panel pp-mine-item">
                  <div className="pp-mine-head">
                    <span className="pp-kind">{t.mine.coTutorOffer.replace("{name}", row.user.name)}</span>
                    <span className="pp-status" data-status={row.status}>
                      {PAL_PLUS_STATUS_LABELS[row.status][nl ? "nl" : "en"]}
                    </span>
                  </div>
                  <p className="pp-course">{palPlusRequestCourseLabel(row, locale)}</p>
                  <p className="pp-text">{row.description}</p>
                  <TagList tags={row.tags} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="pp-section" aria-labelledby="pp-open-title">
          <div className="pp-section-head">
            <h2 id="pp-open-title" className="pp-section-title">
              {t.open.title}
            </h2>
            {open.length > 0 && <p>{t.open.intro}</p>}
          </div>
          {open.length === 0 ? (
            <p className="pp-empty">{t.open.empty}</p>
          ) : (
            <ul className="pp-open" data-pp-searchable>
              <li className="pp-empty" data-pp-noresults hidden />
              {open.map((request) => (
                <li key={request.id} className="vtk-panel pp-open-item" data-pp-search={request.searchText}>
                  <p className="pp-course">{request.courseLabel}</p>
                  <p className="pp-text">{request.description}</p>
                  <TagList tags={request.tags} />
                  {request.preferredPeriod && (
                    <dl className="pp-facts">
                      <div>
                        <dt>{t.open.period}</dt>
                        <dd>{request.preferredPeriod}</dd>
                      </div>
                    </dl>
                  )}
                  <div className="pp-open-row">
                    <span className="pp-askers">{askersLabel(request.askers)}</span>
                    <div className="pp-open-actions">
                      {userId && (
                        <BackingButton
                          requestId={request.id}
                          backed={request.backedByMe}
                          mine={request.mine}
                          copy={backingCopy}
                        />
                      )}
                      {!request.mine && (
                        <Link
                          href={
                            userId
                              ? formHref("geven", request.id)
                              : loginHref(`${base}/pal-plus?formulier=geven&vraag=${request.id}`)
                          }
                          className="pp-give-link"
                        >
                          {t.open.canGive}
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** De tags van een vraag of een sessie, klein onder de tekst. */
function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="pp-taglist">
      {tags.map((tag) => (
        <li key={tag}>{tag}</li>
      ))}
    </ul>
  );
}

/** Wanneer een tutor kan, als tekst: een regel per dag, en de opmerking. */
function AvailabilitySummary({
  lines,
  note,
  label,
  noteLabel,
}: {
  lines: string[];
  note: string | null;
  label: string;
  noteLabel: string;
}) {
  if (lines.length === 0 && !note) return null;
  return (
    <dl className="pp-facts">
      {lines.length > 0 && (
        <div>
          <dt>{label}</dt>
          <dd>
            {lines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </dd>
        </div>
      )}
      {note && (
        <div>
          <dt>{noteLabel}</dt>
          <dd>{note}</dd>
        </div>
      )}
    </dl>
  );
}
