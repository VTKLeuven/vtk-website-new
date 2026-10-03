"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { deleteObject } from "@vtk/storage";
import { logAudit } from "@/lib/audit";
import { FEEDBACK_LIMITS, isFeedbackStatus } from "@/lib/feedback";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { requirePermission } from "@/lib/session";

/**
 * Websitefeedback: de meldingen die leden tot oktober 2026 via de site zelf
 * deden. Nieuwe feedback gaat naar Dopl (zie `components/site/FeedbackDialog`);
 * hier blijft enkel het afhandelen van wat er al lag.
 */

const ADMIN_PATH = "/[locale]/admin/it/feedback";

export async function updateFeedbackAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("feedback.manage");

  const id = String(formData.get("id") ?? "");
  const status = formData.get("status");
  if (!isFeedbackStatus(status)) return saveError("STATUS_INVALID");

  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, FEEDBACK_LIMITS.note);
  if (status === "DISMISSED" && note === "") return saveError("NOTE_REQUIRED");

  const existing = await prisma.websiteFeedback.findUnique({
    where: { id },
    select: { id: true, kind: true, status: true },
  });
  if (!existing) return saveError("FEEDBACK_MISSING");

  // Terug naar "Nieuw" zetten is een melding heropenen: dan hoort er ook geen
  // behandelaar meer op te staan, anders leest de lijst alsof iemand er al iets
  // mee deed.
  const handled = status !== "NEW";

  await prisma.websiteFeedback.update({
    where: { id },
    data: {
      status,
      handlingNote: note || null,
      handledById: handled ? session.user.id : null,
      handledAt: handled ? new Date() : null,
    },
  });

  await logAudit({
    action: "update",
    entity: "websiteFeedback",
    entityId: id,
    target: `Feedback (${existing.kind})`,
    summary: `status ${existing.status} → ${status}`,
  });

  revalidatePath(ADMIN_PATH, "page");
  return saveOk();
}

/**
 * Een melding definitief weggooien. Voor spam en dubbels; de gewone weg is
 * afsluiten met een status, zodat de historiek leesbaar blijft.
 *
 * Geeft `void` terug omdat `DeleteIconButton` de bevestiging en de toast al
 * doet (zie CLAUDE.md > UX-conventies).
 */
export async function deleteFeedbackAction(formData: FormData): Promise<void> {
  await requirePermission("feedback.manage");

  const id = String(formData.get("id") ?? "");
  const existing = await prisma.websiteFeedback.findUnique({
    where: { id },
    select: { id: true, kind: true, imageKey: true },
  });
  if (!existing) return;

  // Eerst de rij, dan het bestand: een wees in de objectopslag is minder erg
  // dan een rij die naar een screenshot wijst die er niet meer is.
  await prisma.websiteFeedback.delete({ where: { id } });
  if (existing.imageKey) {
    await deleteObject(existing.imageKey).catch((error) => {
      console.error("[feedback] screenshot verwijderen mislukt", error);
    });
  }

  await logAudit({
    action: "delete",
    entity: "websiteFeedback",
    entityId: id,
    target: `Feedback (${existing.kind})`,
  });

  revalidatePath(ADMIN_PATH, "page");
}
