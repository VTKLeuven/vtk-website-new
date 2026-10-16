import "server-only";

import { prisma } from "@vtk/db";
import type { FormReviewStatus } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { logFormAudit } from "./audit";

/**
 * De beoordeling van één inzending bijwerken, met haar regel in het
 * formulierlogboek en in het adminlogboek.
 *
 * Gedeeld door het detail van een inzending (status, notitie, beoordelaar) en
 * door de statuskeuze per rij op /admin/commu-aanvragen, zodat een wijziging
 * via de ene weg er in het logboek hetzelfde uitziet als via de andere.
 * `internalNote` en `reviewerId` weglaten laat ze ongemoeid.
 */
export async function updateEntryReview(input: {
  formId: string;
  entryId: string;
  actorUserId: string;
  reviewStatus: FormReviewStatus;
  internalNote?: string | null;
  reviewerId?: string | null;
}): Promise<void> {
  const entry = await prisma.formEntry.findFirst({
    where: { id: input.entryId, formId: input.formId },
    select: { id: true, reviewStatus: true, form: { select: { titleNl: true } } },
  });
  if (!entry) throw new Error("ENTRY_NOT_FOUND");

  await prisma.$transaction(async (tx) => {
    await tx.formEntry.update({
      where: { id: entry.id },
      data: {
        reviewStatus: input.reviewStatus,
        ...(input.internalNote !== undefined ? { internalNote: input.internalNote } : {}),
        ...(input.reviewerId !== undefined ? { reviewerId: input.reviewerId } : {}),
      },
    });
    await logFormAudit(tx, {
      formId: input.formId,
      actorUserId: input.actorUserId,
      action: "FORM_ENTRY_REVIEWED",
      entityType: "FormEntry",
      entityId: entry.id,
      metadata: { from: entry.reviewStatus, to: input.reviewStatus },
    });
  });

  await logAudit({
    action: "update",
    entity: "formEntry",
    entityId: entry.id,
    target: entry.form.titleNl,
    summary: `inzending beoordeeld: ${entry.reviewStatus} naar ${input.reviewStatus}`,
  });
}
