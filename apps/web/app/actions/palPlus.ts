"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { getCurrentSession, requirePermission } from "@/lib/session";
import { toMessageText, toSingleLine } from "@/lib/contactForm";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import {
  initialPalPlusStatus,
  palPlusCourseLabel,
  palPlusRequestCourseLabel,
  parsePalPlusCourse,
  parsePalPlusRequest,
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
