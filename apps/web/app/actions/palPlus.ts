"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { toSingleLine } from "@/lib/contactForm";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { palPlusCourseLabel, parsePalPlusCourse } from "@/lib/palPlus";

/**
 * Server actions van PAL+. Alles hier hercontroleert `pal.manage`; de regels
 * zelf staan in `lib/palPlus.ts`.
 */

const ADMIN_PATHS = ["/admin/pal-plus", "/en/admin/pal-plus"];

/** De beheerlijst moet mee verversen, anders blijft staan wat je net wijzigde. */
function revalidatePalPlusAdmin() {
  for (const path of ADMIN_PATHS) revalidatePath(path);
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
