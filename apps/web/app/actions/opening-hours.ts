"use server";

import { isMemberOfGroup } from "@vtk/auth";
import { prisma } from "@vtk/db";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import {
  OPENING_HOURS_SERVICE_CONFIG,
  readOpeningHoursSetting,
  type OpeningHoursEntry,
  type OpeningHoursService,
} from "@/lib/openingHoursSettings";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { requirePermission } from "@/lib/session";

function serviceFrom(value: FormDataEntryValue | null): OpeningHoursService | null {
  return value === "theokot" || value === "cursusdienst" || value === "elixir" ? value : null;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveOpeningHoursAction(
  _previous: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const service = serviceFrom(formData.get("service"));
  if (!service) return saveError("INVALID_SERVICE");

  const session = await requirePermission("openingHours.manageOwn");
  const config = OPENING_HOURS_SERVICE_CONFIG[service];
  if (!session.user.isSuperAdmin && !isMemberOfGroup(session, config.groupCode)) {
    return saveError("FORBIDDEN");
  }

  const existing = await prisma.setting.findUnique({ where: { key: config.settingKey } });
  const previous = readOpeningHoursSetting(existing?.value, service);
  const entries: OpeningHoursEntry[] = service === "cursusdienst"
    ? []
    : config.days.map((day, index) => ({
        dayNl: day.dayNl,
        dayEn: day.dayEn,
        hours: field(formData, `hours-${index}`) || "Gesloten",
      }));

  const value = {
    titleNl: field(formData, "titleNl") || previous.titleNl,
    titleEn: field(formData, "titleEn") || previous.titleEn,
    subtitleNl: field(formData, "subtitleNl"),
    subtitleEn: field(formData, "subtitleEn"),
    noteNl: field(formData, "noteNl"),
    noteEn: field(formData, "noteEn"),
    ...(service === "cursusdienst" ? {} : { entries }),
  };

  await prisma.setting.upsert({
    where: { key: config.settingKey },
    update: { value },
    create: { key: config.settingKey, value },
  });
  await logAudit({
    action: "update",
    entity: "home",
    target: `Openingsuren ${service}`,
    summary: service === "cursusdienst" ? "toelichting bewerkt" : `${entries.length} dagen bewerkt`,
  });

  for (const path of ["/", "/en", "/aanbod", "/en/aanbod", "/admin/openingsuren", "/en/admin/openingsuren"]) {
    revalidatePath(path);
  }
  return saveOk();
}
