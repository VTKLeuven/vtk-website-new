"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import {
  grantManualShifts,
  deleteManualShiftGrant,
  ManualShiftValidationError,
} from "@/lib/shift/manual";

export type GrantManualShiftsActionResult =
  | { success: true; grantId: string }
  | { success: false; error: string };

export async function grantManualShiftsAction(payload: {
  userId: string;
  count: number;
  post?: string | null;
  academicYear?: number;
  reason?: string;
  reward?: number;
  payedOut?: boolean;
  date?: string | null;
}): Promise<GrantManualShiftsActionResult> {
  const session = await requirePermission("shift.manual");

  try {
    const grant = await grantManualShifts({
      ...payload,
      actorId: session.user.id,
      actorName: session.user.name,
    });

    revalidatePath("/admin/shiften");
    revalidatePath("/shift");
    revalidatePath("/shift/history");

    return { success: true, grantId: grant.id };
  } catch (err) {
    if (err instanceof ManualShiftValidationError) {
      return { success: false, error: err.details.join(", ") };
    }
    console.error("[grantManualShiftsAction] unexpected error", err);
    return { success: false, error: "Er is een onverwachte fout opgetreden." };
  }
}

export type DeleteManualShiftGrantActionResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteManualShiftGrantAction(
  grantId: string,
): Promise<DeleteManualShiftGrantActionResult> {
  await requirePermission("shift.manual");

  try {
    const deleted = await deleteManualShiftGrant(grantId);
    if (!deleted) {
      return { success: false, error: "Toekenning niet gevonden" };
    }

    revalidatePath("/admin/shiften");
    revalidatePath("/shift");
    revalidatePath("/shift/history");

    return { success: true };
  } catch (err) {
    console.error("[deleteManualShiftGrantAction] unexpected error", err);
    return { success: false, error: "Kon toekenning niet verwijderen." };
  }
}
