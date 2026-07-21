"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { brevoEnabled } from "@/lib/brevo/client";
import { reconcileMailingLists } from "@/lib/brevo/sync";

/**
 * Manuele Brevo-sync vanuit de mailinglijst-tab. Draait dezelfde reconciliatie
 * als de cron-route: alle lijst-lidmaatschappen worden herberekend en in Brevo
 * rechtgezet. Handig om na een grote wijziging niet op de dagelijkse cron te
 * moeten wachten.
 */
export async function syncMailingListsAction(): Promise<SaveState> {
  await requirePermission("mailinglists.export");
  if (!brevoEnabled()) return saveError("BREVO_DISABLED");

  const result = await reconcileMailingLists();
  if ("skipped" in result) return saveError("BREVO_DISABLED");
  if (result.failed > 0) return saveError("BREVO_PARTIAL");

  revalidatePath("/admin/mailinglijsten");
  return saveOk();
}
