"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { localDateTimeToUtc } from "@/lib/ticketing/time";
import { logAudit } from "@/lib/audit";
import {
  clearUrenloopStats,
  saveUrenloopConfig,
  URENLOOP_TAG,
} from "@/lib/urenloop/server";

function parseMoment(
  value: FormDataEntryValue | null,
): { ok: true; date: Date | null } | { ok: false } {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: true, date: null };
  }
  try {
    return { ok: true, date: localDateTimeToUtc(value) };
  } catch {
    return { ok: false };
  }
}

function revalidate() {
  updateTag(URENLOOP_TAG);
  revalidatePath("/", "layout");
  revalidatePath("/admin/24urenloop");
  revalidatePath("/en/admin/24urenloop");
}

export async function saveUrenloopConfigAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("urenloop.manage");

  const startParsed = parseMoment(formData.get("startsAt"));
  const endParsed = parseMoment(formData.get("endsAt"));
  const untilParsed = parseMoment(formData.get("showResultsUntil"));

  if (!startParsed.ok || !endParsed.ok || !untilParsed.ok) {
    return saveError("INVALID_DATE");
  }

  const startsAt = startParsed.date;
  const endsAt = endParsed.date;
  const showResultsUntil = untilParsed.date;

  if (startsAt && endsAt && endsAt <= startsAt) {
    return saveError("ENDS_BEFORE_START");
  }
  if (endsAt && showResultsUntil && showResultsUntil <= endsAt) {
    return saveError("RESULTS_BEFORE_END");
  }
  if (startsAt && showResultsUntil && showResultsUntil <= startsAt) {
    return saveError("RESULTS_BEFORE_END");
  }

  await saveUrenloopConfig({
    startsAt: startsAt ? startsAt.toISOString() : null,
    endsAt: endsAt ? endsAt.toISOString() : null,
    showResultsUntil: showResultsUntil ? showResultsUntil.toISOString() : null,
  });

  await logAudit({
    action: "update",
    entity: "urenloop",
    target: "24 urenloop",
    summary: startsAt
      ? `start ${startsAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
      : "data gewist",
  });

  revalidate();
  return saveOk();
}

export async function clearUrenloopStatsAction(): Promise<void> {
  await requirePermission("urenloop.manage");
  await clearUrenloopStats();
  await logAudit({
    action: "delete",
    entity: "urenloop",
    target: "24 urenloop tussenstand",
    summary: "ontvangen tussenstand gewist",
  });
  revalidate();
}
