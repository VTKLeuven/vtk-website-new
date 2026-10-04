"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { getCurrentSession, requirePermission } from "@/lib/session";
import { withSerializableTransaction } from "@/lib/ticketing/transactions";
import { settlePalPlusOverspend, ShiftRewardConflictError } from "@/lib/shift/rewards.server";
import { toMessageText, toSingleLine } from "@/lib/contactForm";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import {
  initialPalPlusStatus,
  palPlusCourseLabel,
  palPlusRequestCourseLabel,
  palPlusReward,
  palPlusSessionState,
  palPlusSignupBlock,
  palPlusWallClockFields,
  parsePalPlusCourse,
  parsePalPlusRequest,
  parsePalPlusRewardAmount,
  parsePalPlusSession,
  reopenedPalPlusStatus,
  PAL_PLUS_LIMITS,
  PAL_PLUS_MAX_ACTIVE_REQUESTS,
} from "@/lib/palPlus";

/**
 * Server actions van PAL+. Bovenaan wat een lid zelf doet (aanvragen, steunen,
 * intrekken), daaronder het beheer, dat telkens `pal.manage` hercontroleert. De
 * regels zelf staan in `lib/palPlus.ts`.
 */

const ADMIN_PATHS = ["/admin/pal-plus", "/en/admin/pal-plus"];
const PUBLIC_PATHS = ["/pal-plus", "/en/pal-plus"];

/** De beheerlijst moet mee verversen, anders blijft staan wat je net wijzigde. */
function revalidatePalPlusAdmin() {
  for (const path of ADMIN_PATHS) revalidatePath(path);
}

/** Een aanvraag staat op de publieke pagina én in het werkbakje van Onderwijs. */
function revalidatePalPlusEverywhere() {
  for (const path of [...PUBLIC_PATHS, ...ADMIN_PATHS]) revalidatePath(path);
}

const ACTIVE_STATUSES = ["PENDING", "OPEN"] as const;

// -----------------------------------------------------------------------------
// Leden: aanbieden, hulp vragen, steunen en intrekken
// -----------------------------------------------------------------------------

/**
 * "Ik wil een sessie geven" of "ik zoek hulp". Iedereen die kan inloggen mag
 * dat, ook zonder lidmaatschap. Een aanbod wacht op Onderwijs; een vraag staat
 * meteen publiek, zonder naam.
 */
export async function submitPalPlusRequestAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await getCurrentSession();
  if (!session) return saveError("LOGIN_REQUIRED");
  const userId = session.user.id;

  const parsed = parsePalPlusRequest(
    {
      kind: toSingleLine(formData.get("kind")),
      courseId: toSingleLine(formData.get("courseId")),
      courseOther: toSingleLine(formData.get("courseOther")),
      description: toMessageText(formData.get("description")),
      date: toSingleLine(formData.get("date")),
      startTime: toSingleLine(formData.get("startTime")),
      endTime: toSingleLine(formData.get("endTime")),
      preferredPeriod: toSingleLine(formData.get("preferredPeriod")),
    },
    new Date(),
  );
  if (!parsed.ok) return saveError(parsed.error);
  const { request } = parsed;

  if (request.courseId) {
    const course = await prisma.palPlusCourse.findFirst({
      where: { id: request.courseId, active: true },
      select: { id: true },
    });
    if (!course) return saveError("COURSE_UNKNOWN");
  }

  // "Ik kan dit geven" bij een vraag. Staat die vraag ondertussen niet meer
  // open, dan blijft het aanbod even waardevol voor Onderwijs; de koppeling
  // blijft dan als uitleg staan. Enkel een onbestaande vraag valt weg.
  let respondsToId: string | null = null;
  const rawRespondsTo = toSingleLine(formData.get("respondsToId"));
  if (request.kind === "GIVE" && rawRespondsTo) {
    const target = await prisma.palPlusRequest.findFirst({
      where: { id: rawRespondsTo, kind: "FOLLOW" },
      select: { id: true },
    });
    respondsToId = target?.id ?? null;
  }

  const active = await prisma.palPlusRequest.count({
    where: { userId, status: { in: [...ACTIVE_STATUSES] } },
  });
  if (active >= PAL_PLUS_MAX_ACTIVE_REQUESTS) return saveError("TOO_MANY_ACTIVE");

  await prisma.palPlusRequest.create({
    data: {
      kind: request.kind,
      status: initialPalPlusStatus(request.kind),
      userId,
      courseId: request.courseId,
      courseOther: request.courseOther,
      description: request.description,
      ...(request.kind === "GIVE"
        ? {
            proposedStartsAt: request.proposedStartsAt,
            proposedEndsAt: request.proposedEndsAt,
            respondsToId,
          }
        : { preferredPeriod: request.preferredPeriod }),
    },
  });

  revalidatePalPlusEverywhere();
  return saveOk();
}

/** De indiener trekt een aanvraag in die Onderwijs nog niet afhandelde. */
export async function withdrawPalPlusRequestAction(formData: FormData): Promise<SaveState> {
  const session = await getCurrentSession();
  if (!session) return saveError("LOGIN_REQUIRED");
  const id = toSingleLine(formData.get("id"));

  const result = await prisma.palPlusRequest.updateMany({
    where: { id, userId: session.user.id, status: { in: [...ACTIVE_STATUSES] } },
    data: { status: "WITHDRAWN" },
  });
  if (result.count === 0) return saveError("NOT_WITHDRAWABLE");

  revalidatePalPlusEverywhere();
  return saveOk();
}

/**
 * "Ik zoek dit ook", of die steun weer intrekken. De client zegt welke van de
 * twee (`intent`), zodat twee snelle klikken niet elkaar opheffen.
 */
export async function setPalPlusBackingAction(formData: FormData): Promise<SaveState> {
  const session = await getCurrentSession();
  if (!session) return saveError("LOGIN_REQUIRED");
  const userId = session.user.id;
  const requestId = toSingleLine(formData.get("requestId"));
  const back = formData.get("intent") === "back";

  if (!back) {
    await prisma.palPlusRequestBacker.deleteMany({ where: { requestId, userId } });
    revalidatePalPlusEverywhere();
    return saveOk();
  }

  const request = await prisma.palPlusRequest.findUnique({
    where: { id: requestId },
    select: { kind: true, status: true, userId: true },
  });
  if (!request || request.kind !== "FOLLOW" || request.status !== "OPEN") {
    return saveError("REQUEST_NOT_OPEN");
  }
  if (request.userId === userId) return saveError("OWN_REQUEST");

  try {
    await prisma.palPlusRequestBacker.create({ data: { requestId, userId } });
  } catch (err) {
    // Al gesteund (een dubbele klik): dat is precies wat er gevraagd werd.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }

  revalidatePalPlusEverywhere();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Beheer: aanvragen
// -----------------------------------------------------------------------------

async function requestForAudit(id: string) {
  const request = await prisma.palPlusRequest.findUnique({
    where: { id },
    select: {
      kind: true,
      courseOther: true,
      course: { select: { code: true, nameNl: true, nameEn: true } },
      user: { select: { name: true } },
    },
  });
  if (!request) return null;
  const kind = request.kind === "GIVE" ? "aanbod" : "hulpvraag";
  return {
    kind: request.kind,
    target: `${palPlusRequestCourseLabel(request, "nl")} (${kind} van ${request.user.name})`,
  };
}

/** Onderwijs sluit een aanvraag zonder sessie, met een reden voor de indiener. */
export async function closePalPlusRequestAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("pal.manage");
  const id = toSingleLine(formData.get("id"));
  const reason = toMessageText(formData.get("reason"));
  if (!reason) return saveError("REASON_REQUIRED");
  if (reason.length > PAL_PLUS_LIMITS.reviewNote) return saveError("REASON_TOO_LONG");

  const result = await prisma.palPlusRequest.updateMany({
    where: { id, status: { in: [...ACTIVE_STATUSES] } },
    data: {
      status: "CLOSED",
      reviewNote: reason,
      reviewedById: session.user.id,
      reviewedAt: new Date(),
    },
  });
  if (result.count === 0) return saveError("NOT_ACTIVE");

  const audit = await requestForAudit(id);
  if (audit) {
    await logAudit({
      action: "update",
      entity: "palPlusRequest",
      entityId: id,
      target: audit.target,
      summary: `gesloten: ${reason}`,
    });
  }
  revalidatePalPlusEverywhere();
  return saveOk();
}

/** Een per vergissing gesloten aanvraag terug open zetten. */
export async function reopenPalPlusRequestAction(formData: FormData): Promise<SaveState> {
  await requirePermission("pal.manage");
  const id = toSingleLine(formData.get("id"));

  const request = await prisma.palPlusRequest.findUnique({
    where: { id },
    select: { kind: true, status: true },
  });
  if (!request || request.status !== "CLOSED") return saveError("NOT_CLOSED");

  await prisma.palPlusRequest.update({
    where: { id },
    data: {
      status: reopenedPalPlusStatus(request.kind),
      reviewNote: null,
      reviewedById: null,
      reviewedAt: null,
    },
  });

  const audit = await requestForAudit(id);
  if (audit) {
    await logAudit({
      action: "update",
      entity: "palPlusRequest",
      entityId: id,
      target: audit.target,
      summary: "heropend",
    });
  }
  revalidatePalPlusEverywhere();
  return saveOk();
}

/**
 * Hangt een aanvraag aan een vak uit de lijst, bv. wanneer de indiener het vak
 * zelf intikte. Wat er ingetikt werd, blijft staan als uitleg.
 */
export async function assignPalPlusRequestCourseAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("pal.manage");
  const id = toSingleLine(formData.get("id"));
  const courseId = toSingleLine(formData.get("courseId"));

  const course = courseId
    ? await prisma.palPlusCourse.findUnique({
        where: { id: courseId },
        select: { code: true, nameNl: true, nameEn: true },
      })
    : null;
  if (!course) return saveError("COURSE_UNKNOWN");

  await prisma.palPlusRequest.update({ where: { id }, data: { courseId } });

  const audit = await requestForAudit(id);
  if (audit) {
    await logAudit({
      action: "update",
      entity: "palPlusRequest",
      entityId: id,
      target: audit.target,
      summary: `vak: ${palPlusCourseLabel(course, "nl")}`,
    });
  }
  revalidatePalPlusEverywhere();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Beheer: vakken
// -----------------------------------------------------------------------------

export async function savePalPlusCourseAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("pal.manage");

  const parsed = parsePalPlusCourse({
    code: toSingleLine(formData.get("code")),
    nameNl: toSingleLine(formData.get("nameNl")),
    nameEn: toSingleLine(formData.get("nameEn")),
    active: formData.get("active") === "on",
  });
  if (!parsed.ok) return saveError(parsed.error);

  const { course } = parsed;
  const id = toSingleLine(formData.get("id"));
  const target = palPlusCourseLabel(course, "nl");

  try {
    if (id) {
      await prisma.palPlusCourse.update({ where: { id }, data: course });
      await logAudit({ action: "update", entity: "palPlusCourse", entityId: id, target });
    } else {
      const created = await prisma.palPlusCourse.create({ data: course, select: { id: true } });
      await logAudit({ action: "create", entity: "palPlusCourse", entityId: created.id, target });
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return saveError("COURSE_CODE_TAKEN");
    }
    throw err;
  }

  revalidatePalPlusAdmin();
  return saveOk();
}

/**
 * Verwijdert een vak. Kan enkel zolang er niets aan hangt: een sessie of een
 * aanvraag van vorig jaar mag haar vak niet verliezen omdat iemand de lijst
 * opruimt. Wie een vak uit het formulier wil, zet het uit.
 */
export async function deletePalPlusCourseAction(formData: FormData): Promise<SaveState> {
  await requirePermission("pal.manage");
  const id = toSingleLine(formData.get("id"));
  if (!id) return saveOk();

  const course = await prisma.palPlusCourse.findUnique({
    where: { id },
    select: {
      code: true,
      nameNl: true,
      nameEn: true,
      _count: { select: { requests: true, sessions: true } },
    },
  });
  if (!course) return saveOk();
  if (course._count.requests > 0 || course._count.sessions > 0) {
    return saveError("COURSE_IN_USE");
  }

  try {
    await prisma.palPlusCourse.delete({ where: { id } });
  } catch (err) {
    // Tussen het tellen en het verwijderen kwam er toch een aanvraag bij; de
    // foreign key houdt het vak dan tegen.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return saveError("COURSE_IN_USE");
    }
    throw err;
  }
  await logAudit({
    action: "delete",
    entity: "palPlusCourse",
    entityId: id,
    target: palPlusCourseLabel(course, "nl"),
  });
  revalidatePalPlusAdmin();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Leden: inschrijven voor een sessie
// -----------------------------------------------------------------------------

/**
 * Inschrijven voor een sessie. Iedereen die kan inloggen mag dat, tot de
 * sessie begint, zolang ze niet vol is.
 *
 * Het maximum wordt hier geteld en niet vergrendeld: twee mensen die op
 * dezelfde seconde de laatste plaats nemen, kunnen er samen één over gaan. Dat
 * is aanvaard; het maximum is bij PAL+ een richtlijn voor de grootte van het
 * lokaal, geen verkochte plaats.
 */
export async function signUpPalPlusSessionAction(formData: FormData): Promise<SaveState> {
  const session = await getCurrentSession();
  if (!session) return saveError("LOGIN_REQUIRED");
  const userId = session.user.id;
  const sessionId = toSingleLine(formData.get("sessionId"));

  const row = await prisma.palPlusSession.findUnique({
    where: { id: sessionId },
    select: {
      startsAt: true,
      endsAt: true,
      cancelledAt: true,
      maxParticipants: true,
      tutors: { where: { userId }, select: { userId: true } },
      attendees: { where: { userId }, select: { userId: true } },
      _count: { select: { attendees: true } },
    },
  });
  if (!row) return saveError("SESSION_GONE");
  // Al ingeschreven (een dubbele klik): dat is wat er gevraagd werd.
  if (row.attendees.length > 0) return saveOk();

  const block = palPlusSignupBlock(row, {
    attendeeCount: row._count.attendees,
    isTutor: row.tutors.length > 0,
    now: new Date(),
  });
  if (block) return saveError(block);

  try {
    await prisma.palPlusSessionAttendee.create({ data: { sessionId, userId } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }

  revalidatePalPlusEverywhere();
  return saveOk();
}

/** Uitschrijven, tot de sessie begint. */
export async function leavePalPlusSessionAction(formData: FormData): Promise<SaveState> {
  const session = await getCurrentSession();
  if (!session) return saveError("LOGIN_REQUIRED");
  const sessionId = toSingleLine(formData.get("sessionId"));

  const row = await prisma.palPlusSession.findUnique({
    where: { id: sessionId },
    select: { startsAt: true, endsAt: true, cancelledAt: true },
  });
  if (!row) return saveError("SESSION_GONE");
  const state = palPlusSessionState(row, new Date());
  if (state === "running" || state === "past") return saveError("STARTED");

  await prisma.palPlusSessionAttendee.deleteMany({ where: { sessionId, userId: session.user.id } });
  revalidatePalPlusEverywhere();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Beheer: sessies
// -----------------------------------------------------------------------------

/**
 * Iemand zoeken om als tutor op een sessie te zetten, op naam, e-mail of
 * r-nummer. Een eigen zoekactie achter `pal.manage`, zodat wie PAL+ beheert
 * daarvoor niet ook `users.search` nodig heeft.
 */
export async function searchPalPlusPeopleAction(
  query: string,
): Promise<{ id: string; name: string; email: string }[]> {
  await requirePermission("pal.manage");
  const needle = query.trim().slice(0, 80);
  if (needle.length < 2) return [];
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: needle, mode: "insensitive" } },
        { email: { contains: needle, mode: "insensitive" } },
        { rNumber: { contains: needle, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: 8,
    select: { id: true, name: true, email: true },
  });
}

function sessionAuditTarget(
  course: { code: string | null; nameNl: string; nameEn: string | null },
  startsAt: Date,
): string {
  const { date, time } = palPlusWallClockFields(startsAt);
  return `${palPlusCourseLabel(course, "nl")} op ${date} ${time}`;
}

/**
 * Een sessie plannen of aanpassen. Bij het plannen vanuit een aanvraag gaan de
 * aangevinkte aanvragen mee naar "Sessie gepland".
 *
 * De bonnetjes van een tutor zijn een momentopname van het geplande moment.
 * Verschuift het moment, dan schuift de beloning mee, behalve bij een tutor
 * wiens beloning Onderwijs met de hand corrigeerde.
 */
export async function savePalPlusSessionAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const actor = await requirePermission("pal.manage");

  const parsed = parsePalPlusSession({
    courseId: toSingleLine(formData.get("courseId")),
    description: toMessageText(formData.get("description")),
    date: toSingleLine(formData.get("date")),
    startTime: toSingleLine(formData.get("startTime")),
    endTime: toSingleLine(formData.get("endTime")),
    maxParticipants: toSingleLine(formData.get("maxParticipants")),
    roomId: toSingleLine(formData.get("roomId")),
    roomText: toSingleLine(formData.get("roomText")),
    tutorIds: formData.getAll("tutorId").map((value) => toSingleLine(value)),
  });
  if (!parsed.ok) return saveError(parsed.error);
  const data = parsed.session;
  const id = toSingleLine(formData.get("id"));
  const requestIds = formData
    .getAll("requestId")
    .map((value) => toSingleLine(value))
    .filter(Boolean);

  const [course, room, tutorCount] = await Promise.all([
    prisma.palPlusCourse.findUnique({
      where: { id: data.courseId },
      select: { code: true, nameNl: true, nameEn: true },
    }),
    data.roomId ? prisma.room.findUnique({ where: { id: data.roomId }, select: { id: true } }) : null,
    prisma.user.count({ where: { id: { in: data.tutorIds } } }),
  ]);
  if (!course) return saveError("COURSE_UNKNOWN");
  if (data.roomId && !room) return saveError("ROOM_UNKNOWN");
  if (tutorCount !== data.tutorIds.length) return saveError("TUTOR_UNKNOWN");

  const reward = palPlusReward(data.startsAt, data.endsAt);
  const fields = {
    courseId: data.courseId,
    description: data.description,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    maxParticipants: data.maxParticipants,
    roomId: data.roomId,
    roomText: data.roomText,
  };
  if (id) {
    const existing = await prisma.palPlusSession.findUnique({
      where: { id },
      select: {
        startsAt: true,
        endsAt: true,
        cancelledAt: true,
        tutors: { select: { userId: true, rewardPaid: true } },
        _count: { select: { attendees: true } },
      },
    });
    if (!existing) return saveError("SESSION_GONE");
    if (existing.cancelledAt) return saveError("SESSION_CANCELLED");
    if (data.maxParticipants !== null && data.maxParticipants < existing._count.attendees) {
      return saveError("MAX_BELOW_SIGNUPS");
    }
    const removed = existing.tutors.filter((tutor) => !data.tutorIds.includes(tutor.userId));
    if (removed.some((tutor) => tutor.rewardPaid > 0)) return saveError("TUTOR_HAS_PAID");
    const current = new Set(existing.tutors.map((tutor) => tutor.userId));
    const timesChanged =
      existing.startsAt.getTime() !== data.startsAt.getTime() ||
      existing.endsAt.getTime() !== data.endsAt.getTime();

    try {
      await withSerializableTransaction(async (tx) => {
        await tx.palPlusSession.update({ where: { id }, data: fields });
        await tx.palPlusSessionTutor.deleteMany({
          where: { sessionId: id, userId: { in: removed.map((tutor) => tutor.userId) } },
        });
        for (const userId of data.tutorIds.filter((tutorId) => !current.has(tutorId))) {
          await tx.palPlusSessionTutor.create({ data: { sessionId: id, userId, reward } });
        }
        if (timesChanged) {
          // De beloning volgt het nieuwe moment, behalve na een correctie met
          // de hand. Zakt ze onder wat een tutor al uitgaf (een ingekorte
          // sessie), dan komt het verschil uit zijn andere bonnetjes.
          const followers = await tx.palPlusSessionTutor.findMany({
            where: { sessionId: id, rewardCorrectedAt: null },
            select: { userId: true },
          });
          await tx.palPlusSessionTutor.updateMany({
            where: { sessionId: id, rewardCorrectedAt: null },
            data: { reward },
          });
          for (const follower of followers) {
            await settlePalPlusOverspend(tx, { sessionId: id, userId: follower.userId, ceiling: reward });
          }
        }
        await tx.palPlusRequest.updateMany({
          where: { id: { in: requestIds }, status: { in: [...ACTIVE_STATUSES] } },
          data: { status: "PLANNED", sessionId: id },
        });
      });
    } catch (err) {
      if (err instanceof ShiftRewardConflictError) return saveError("REWARD_CONFLICT");
      throw err;
    }
    await logAudit({
      action: "update",
      entity: "palPlusSession",
      entityId: id,
      target: sessionAuditTarget(course, data.startsAt),
    });
  } else {
    const created = await prisma.$transaction(async (tx) => {
      const session = await tx.palPlusSession.create({
        data: {
          ...fields,
          createdById: actor.user.id,
          tutors: { create: data.tutorIds.map((userId) => ({ userId, reward })) },
        },
        select: { id: true },
      });
      await tx.palPlusRequest.updateMany({
        where: { id: { in: requestIds }, status: { in: [...ACTIVE_STATUSES] } },
        data: { status: "PLANNED", sessionId: session.id },
      });
      return session;
    });
    await logAudit({
      action: "create",
      entity: "palPlusSession",
      entityId: created.id,
      target: sessionAuditTarget(course, data.startsAt),
    });
  }

  revalidatePalPlusEverywhere();
  return saveOk();
}

/**
 * Een sessie annuleren, ook achteraf wanneer ze niet doorging: dan telt ze
 * niet mee en levert ze niets op.
 *
 * De hulpvragen die ze beantwoordde, staan daarna weer open: de vraag is er
 * nog. Het aanbod van de tutor blijft aan de sessie hangen, als historiek van
 * wie aanbood. Een annulering is niet ongedaan te maken; een nieuwe sessie
 * plannen kan altijd.
 */
export async function cancelPalPlusSessionAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("pal.manage");
  const id = toSingleLine(formData.get("id"));
  const reason = toMessageText(formData.get("reason"));
  if (!reason) return saveError("CANCEL_REASON_REQUIRED");
  if (reason.length > PAL_PLUS_LIMITS.cancelReason) return saveError("CANCEL_REASON_TOO_LONG");

  const existing = await prisma.palPlusSession.findUnique({
    where: { id },
    select: {
      cancelledAt: true,
      startsAt: true,
      course: { select: { code: true, nameNl: true, nameEn: true } },
      tutors: { select: { userId: true, rewardPaid: true } },
    },
  });
  if (!existing) return saveError("SESSION_GONE");
  if (existing.cancelledAt) return saveError("SESSION_CANCELLED");

  let forgiven = 0;
  try {
    forgiven = await withSerializableTransaction(async (tx) => {
      await tx.palPlusSession.update({
        where: { id },
        data: { cancelledAt: new Date(), cancelReason: reason },
      });
      await tx.palPlusRequest.updateMany({
        where: { sessionId: id, kind: "FOLLOW", status: "PLANNED" },
        data: { status: "OPEN", sessionId: null },
      });
      // Ging de sessie achteraf niet door, dan levert ze niets op. Wat een tutor
      // er al van uitgaf, komt uit zijn andere openstaande bonnetjes; wat daar
      // niet in past, vervalt.
      let lost = 0;
      for (const tutor of existing.tutors) {
        if (tutor.rewardPaid <= 0) continue;
        lost += (await settlePalPlusOverspend(tx, { sessionId: id, userId: tutor.userId, ceiling: 0 })).forgiven;
      }
      return lost;
    });
  } catch (err) {
    if (err instanceof ShiftRewardConflictError) return saveError("REWARD_CONFLICT");
    throw err;
  }

  await logAudit({
    action: "cancel",
    entity: "palPlusSession",
    entityId: id,
    target: sessionAuditTarget(existing.course, existing.startsAt),
    summary: forgiven > 0 ? `${reason} (${forgiven} uitgegeven bonnetje(s) kwijtgescholden)` : reason,
  });
  revalidatePalPlusEverywhere();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Beheer: beloning corrigeren
// -----------------------------------------------------------------------------

/**
 * De beloning van één tutor voor één sessie met de hand aanpassen (een tutor die
 * er niet was, een sessie die veel korter duurde). Ging een sessie helemaal niet
 * door, dan annuleer je ze; dat is iets anders.
 *
 * Zakt de beloning onder wat de tutor al uitgaf, dan komt het verschil uit zijn
 * andere openstaande bonnetjes en vervalt wat daar niet in past: een saldo gaat
 * nooit onder nul. De melding zegt wat er gebeurde.
 */
export async function correctPalPlusRewardAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const actor = await requirePermission("pal.manage");
  const sessionId = toSingleLine(formData.get("sessionId"));
  const userId = toSingleLine(formData.get("userId"));
  const nl = formData.get("locale") !== "en";
  const amount = parsePalPlusRewardAmount(toSingleLine(formData.get("amount")));
  if (amount === null) return saveError("AMOUNT_INVALID");
  const note = toMessageText(formData.get("note"));
  if (!note) return saveError("NOTE_REQUIRED");
  if (note.length > PAL_PLUS_LIMITS.reviewNote) return saveError("NOTE_TOO_LONG");

  const row = await prisma.palPlusSessionTutor.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: {
      reward: true,
      user: { select: { name: true } },
      session: { select: { startsAt: true, course: { select: { code: true, nameNl: true, nameEn: true } } } },
    },
  });
  if (!row) return saveError("TUTOR_GONE");

  let result: { moved: number; forgiven: number };
  try {
    result = await withSerializableTransaction(async (tx) => {
      await tx.palPlusSessionTutor.update({
        where: { sessionId_userId: { sessionId, userId } },
        data: {
          reward: amount,
          rewardCorrectedAt: new Date(),
          rewardCorrectedById: actor.user.id,
          rewardNote: note,
        },
      });
      return settlePalPlusOverspend(tx, { sessionId, userId, ceiling: amount });
    });
  } catch (err) {
    if (err instanceof ShiftRewardConflictError) return saveError("REWARD_CONFLICT");
    throw err;
  }

  const summary = [
    `beloning ${row.user.name}: ${row.reward} -> ${amount}`,
    result.moved > 0 ? `${result.moved} uit andere bonnetjes` : null,
    result.forgiven > 0 ? `${result.forgiven} kwijtgescholden` : null,
    note,
  ]
    .filter(Boolean)
    .join("; ");
  await logAudit({
    action: "update",
    entity: "palPlusSession",
    entityId: sessionId,
    target: sessionAuditTarget(row.session.course, row.session.startsAt),
    summary,
  });
  revalidatePalPlusEverywhere();

  if (result.moved === 0 && result.forgiven === 0) return saveOk();
  const vouchers = (value: number) =>
    nl ? `${value.toLocaleString("nl-BE")} ${value === 1 ? "bonnetje" : "bonnetjes"}` : `${value.toLocaleString("en-GB")} ${value === 1 ? "voucher" : "vouchers"}`;
  const parts = nl
    ? [
        "Beloning aangepast.",
        result.moved > 0 ? `${vouchers(result.moved)} kwam uit andere openstaande bonnetjes.` : null,
        result.forgiven > 0 ? `${vouchers(result.forgiven)} was al uitgegeven en vervalt; het saldo staat op nul.` : null,
      ]
    : [
        "Reward corrected.",
        result.moved > 0 ? `${vouchers(result.moved)} came out of other outstanding vouchers.` : null,
        result.forgiven > 0 ? `${vouchers(result.forgiven)} was already spent and is written off; the balance is at zero.` : null,
      ];
  return saveOk(parts.filter(Boolean).join(" "));
}

// -----------------------------------------------------------------------------
// Aanwezigheid
// -----------------------------------------------------------------------------

/**
 * Aanduiden of iemand echt kwam: door een tutor van die sessie of door
 * Onderwijs, zodra de sessie begonnen is. Puur informatie voor Onderwijs; het
 * raakt de bonnetjes van de tutor niet.
 */
export async function setPalPlusAttendanceAction(formData: FormData): Promise<SaveState> {
  const session = await getCurrentSession();
  if (!session) return saveError("LOGIN_REQUIRED");
  const sessionId = toSingleLine(formData.get("sessionId"));
  const attendeeId = toSingleLine(formData.get("userId"));
  const raw = toSingleLine(formData.get("attended"));
  const attended = raw === "yes" ? true : raw === "no" ? false : null;

  const row = await prisma.palPlusSession.findUnique({
    where: { id: sessionId },
    select: {
      startsAt: true,
      endsAt: true,
      cancelledAt: true,
      tutors: { where: { userId: session.user.id }, select: { userId: true } },
    },
  });
  if (!row) return saveError("SESSION_GONE");
  if (row.tutors.length === 0 && !hasPermission(session, "pal.manage")) return saveError("NOT_ALLOWED");
  const state = palPlusSessionState(row, new Date());
  if (state === "cancelled") return saveError("CANCELLED");
  if (state === "upcoming") return saveError("NOT_STARTED");

  const updated = await prisma.palPlusSessionAttendee.updateMany({
    where: { sessionId, userId: attendeeId },
    data: { attended },
  });
  if (updated.count === 0) return saveError("SESSION_GONE");

  revalidatePalPlusEverywhere();
  return saveOk();
}
