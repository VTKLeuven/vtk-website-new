"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { commuRequestCapabilities, getCommuRequestForm } from "@/lib/commu/requests";
import { updateEntryReview } from "@/lib/forms/review";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

const statusSchema = z.enum(["NEW", "ACCEPTED", "REJECTED"]);

/**
 * De status van één aanvraag, vanuit de lijst op /admin/commu-aanvragen.
 * Notitie en beoordelaar blijven staan; die wijzig je in het detail.
 */
export async function setCommuRequestStatusAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireSession();
  const entryId = String(formData.get("entryId") ?? "");
  const status = statusSchema.safeParse(formData.get("reviewStatus"));
  if (!entryId || !status.success) return saveError("INVALID_INPUT");

  const form = await getCommuRequestForm();
  if (!form) return saveError("FORM_NOT_FOUND");
  if (!(await commuRequestCapabilities()).includes("MANAGE_ENTRIES")) return saveError("FORBIDDEN");

  try {
    await updateEntryReview({
      formId: form.id,
      entryId,
      actorUserId: session.user.id,
      reviewStatus: status.data,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ENTRY_NOT_FOUND") {
      return saveError("ENTRY_NOT_FOUND");
    }
    throw error;
  }

  for (const prefix of ["", "/en"]) {
    revalidatePath(`${prefix}/admin/commu-aanvragen`);
    revalidatePath(`${prefix}/admin/formulieren/${form.id}/inzendingen/${entryId}`);
  }
  return saveOk();
}
