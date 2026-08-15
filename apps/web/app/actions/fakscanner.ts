"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { DEFAULT_FAKSCANNER_CONFIG } from "@/lib/fakscanner";
import { FAKSCANNER_SETTING_KEY } from "@/lib/fakscanner-server";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Revalidatie van de fakscanner-adminpagina in beide locales. */
function revalidateFakscannerAdmin() {
  revalidatePath("/admin/fakscanner");
  revalidatePath("/en/admin/fakscanner");
}

/**
 * Slaat de instellingen van de fakscanner op: het dubbeltelvenster, het aantal
 * punten per gratis pint en het uur waarop een nieuwe bardag begint.
 *
 * Verwachte invoerfouten komen als `saveError(code)` terug (rode toast) en niet
 * als throw: een leeg of scheef ingetikt uur is geen serverfout.
 */
export async function saveFakscannerConfigAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("fakscanner.manage");

  const doubleStart = String(formData.get("doubleStart") ?? "").trim();
  const doubleEnd = String(formData.get("doubleEnd") ?? "").trim();
  const doubleEnabled = formData.get("doubleEnabled") === "on";
  const rewardEvery = Number(formData.get("rewardEvery"));
  const dayRolloverHour = Number(formData.get("dayRolloverHour"));

  if (!HHMM.test(doubleStart) || !HHMM.test(doubleEnd)) return saveError("bad_time");
  // Een venster van 22:00 tot 22:00 zou "de klok rond" kunnen betekenen of "nooit";
  // die dubbelzinnigheid weigeren we liever dan ze stil te kiezen.
  if (doubleEnabled && doubleStart === doubleEnd) return saveError("empty_window");
  if (!Number.isInteger(rewardEvery) || rewardEvery < 1 || rewardEvery > 1000) {
    return saveError("bad_reward");
  }
  if (!Number.isInteger(dayRolloverHour) || dayRolloverHour < 0 || dayRolloverHour > 23) {
    return saveError("bad_rollover");
  }

  const value = {
    rewardEvery,
    doubleEnabled,
    doubleStart,
    doubleEnd,
    dayRolloverHour,
  } satisfies typeof DEFAULT_FAKSCANNER_CONFIG;

  await prisma.setting.upsert({
    where: { key: FAKSCANNER_SETTING_KEY },
    update: { value },
    create: { key: FAKSCANNER_SETTING_KEY, value },
  });

  revalidateFakscannerAdmin();
  return saveOk();
}
