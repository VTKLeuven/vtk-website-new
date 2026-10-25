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
import { parseLapsCsv } from "@/lib/urenloop/laps";
import { importUrenloopLaps } from "@/lib/urenloop/runnerStats";
import { prisma } from "@vtk/db";

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

/** Ruim boven een volledige race (1100 rondes is zo'n 200 kB). */
const MAX_LAPS_FILE_BYTES = 5 * 1024 * 1024;

function revalidateRunnerStats() {
  revalidatePath("/admin/24urenloop");
  revalidatePath("/en/admin/24urenloop");
  revalidatePath("/account");
  revalidatePath("/en/account");
  revalidatePath("/account/24urenloop");
  revalidatePath("/en/account/24urenloop");
}

/**
 * Laadt `laps.csv` uit de export van de telapp op. Vervangt de rondes van dat
 * jaar; een ander jaar blijft staan. Lopers zien ze meteen in hun account.
 */
export async function uploadUrenloopLapsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("urenloop.manage");
  const nl = formData.get("locale") !== "en";

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return saveError("NO_FILE");
  if (/\.zip$/i.test(file.name)) return saveError("ZIP_FILE");
  if (file.size > MAX_LAPS_FILE_BYTES) return saveError("FILE_TOO_LARGE");

  const parsed = parseLapsCsv(await file.text());
  if (!parsed.ok) {
    return saveError(
      parsed.code,
      parsed.line
        ? nl
          ? `Regel ${parsed.line} van ${file.name} is niet te lezen; er is niets opgeladen.`
          : `Line ${parsed.line} of ${file.name} cannot be read; nothing was uploaded.`
        : undefined,
    );
  }

  const { year, laps } = parsed.file;
  const { replaced } = await importUrenloopLaps(parsed.file, {
    fileName: file.name,
    importedById: session.user.id,
  });
  const runners = new Set(laps.filter((lap) => lap.rNumber).map((lap) => lap.rNumber)).size;

  await logAudit({
    action: replaced ? "update" : "create",
    entity: "urenloop",
    target: `24 urenloop ${year}`,
    summary: `${laps.length} rondes opgeladen uit ${file.name}`,
  });

  revalidateRunnerStats();
  return saveOk(
    nl
      ? `${laps.length} rondes van ${year} ${replaced ? "vervangen" : "opgeladen"}, van ${runners} lopers met een r-nummer.`
      : `${laps.length} laps of ${year} ${replaced ? "replaced" : "uploaded"}, from ${runners} runners with an r-number.`,
  );
}

export async function deleteUrenloopEditionAction(formData: FormData): Promise<void> {
  await requirePermission("urenloop.manage");
  const year = Number(formData.get("year"));
  if (!Number.isInteger(year)) throw new Error("INVALID_YEAR");
  await prisma.urenloopEdition.delete({ where: { year } });
  await logAudit({
    action: "delete",
    entity: "urenloop",
    target: `24 urenloop ${year}`,
    summary: "rondes per loper verwijderd",
  });
  revalidateRunnerStats();
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
