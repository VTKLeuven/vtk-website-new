"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireSession } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { runStorageCleanup, setCleanupDeleteEnabled } from "@/lib/storage-cleanup";

/** Superadmin-only, net als /admin/it/storage zelf. */
async function requireSuperAdmin() {
  const session = await requireSession();
  if (!session.user.isSuperAdmin) throw new Error("FORBIDDEN");
  return session;
}

function revalidateStorage() {
  revalidatePath("/[locale]/admin/it/storage", "page");
  revalidatePath("/[locale]/admin/it/storage/cleanup", "page");
}

const NUMBER = new Intl.NumberFormat("en-BE");
const MEGABYTES = new Intl.NumberFormat("en-BE", { maximumFractionDigits: 1 });

/**
 * Een scan met de hand, om na een wijziging niet tot de nacht te moeten
 * wachten. Markeert en geeft vrij, maar verwijdert nooit: dat doet enkel de
 * nachtelijke ronde.
 */
export async function scanStorageNowAction(): Promise<SaveState> {
  await requireSuperAdmin();
  let summary;
  try {
    summary = await runStorageCleanup({ trigger: "manual", allowDelete: false });
  } catch (error) {
    revalidateStorage();
    return saveError(
      "SCAN_FAILED",
      `Scan failed, nothing was marked: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  revalidateStorage();
  if (summary.status === "skipped") return saveError("S3_NOT_CONFIGURED");
  if (summary.status !== "ok") return saveError("SCAN_FAILED");
  return saveOk(
    `Scan finished: ${NUMBER.format(summary.orphans)} unreferenced ${summary.orphans === 1 ? "file" : "files"} ` +
      `(${MEGABYTES.format(summary.orphanBytes / 1024 / 1024)} MB) out of ${NUMBER.format(summary.checked)} checked.`,
  );
}

/** Zet het verwijderen aan of uit. Uit laat de wezen staan en blijft tellen. */
export async function setStorageCleanupDeletionAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireSuperAdmin();
  const enabled = formData.get("enabled") === "1";
  await setCleanupDeleteEnabled(enabled);
  await logAudit({
    action: "update",
    entity: "storageCleanup",
    target: "Opruiming van de bucket",
    summary: enabled ? "verwijderen aangezet" : "verwijderen uitgezet, enkel nog rapporteren",
  });
  revalidateStorage();
  return saveOk(
    enabled
      ? "Deletion is on: the nightly run deletes files that stayed unreferenced for 30 days."
      : "Deletion is off: files stay in the bucket and are only reported.",
  );
}
