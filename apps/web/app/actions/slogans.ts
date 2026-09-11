"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";
import {
  readSlogansSetting,
  type SlogansConfig,
  type SloganItem,
} from "@/lib/slogans";

function parseText(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export async function saveSlogansAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("home.edit");

  let config: SlogansConfig;

  const rawJson = formData.get("slogansData");
  if (typeof rawJson === "string" && rawJson.trim() !== "") {
    try {
      const parsed = JSON.parse(rawJson);
      config = readSlogansSetting(parsed);
    } catch {
      return saveError("INVALID_INPUT");
    }
  } else {
    // Fallback: lees individuele formuliervelden
    const intervalRaw = Number(formData.get("intervalSeconds"));
    const intervalSeconds = Number.isFinite(intervalRaw) ? Math.max(0, Math.min(60, intervalRaw)) : 8;
    const randomizeOnReload = formData.get("randomizeOnReload") === "on" || formData.get("randomizeOnReload") === "true";

    const personalEnabled = formData.get("personalEnabled") === "on" || formData.get("personalEnabled") === "true";
    const personal = {
      enabled: personalEnabled,
      titleNl: parseText(formData.get("personalTitleNl")),
      accentNl: parseText(formData.get("personalAccentNl")),
      tailNl: parseText(formData.get("personalTailNl")) || undefined,
      titleEn: parseText(formData.get("personalTitleEn")) || undefined,
      accentEn: parseText(formData.get("personalAccentEn")) || undefined,
      tailEn: parseText(formData.get("personalTailEn")) || undefined,
    };

    const count = Number(formData.get("itemsCount")) || 0;
    const items: SloganItem[] = [];
    for (let i = 0; i < count; i += 1) {
      const titleNl = parseText(formData.get(`titleNl-${i}`));
      const accentNl = parseText(formData.get(`accentNl-${i}`));
      const tailNl = parseText(formData.get(`tailNl-${i}`));
      const titleEn = parseText(formData.get(`titleEn-${i}`));
      const accentEn = parseText(formData.get(`accentEn-${i}`));
      const tailEn = parseText(formData.get(`tailEn-${i}`));
      const id = parseText(formData.get(`id-${i}`)) || `slogan-${i + 1}`;

      if (titleNl || accentNl || tailNl || titleEn || accentEn || tailEn) {
        items.push({
          id,
          titleNl,
          accentNl,
          tailNl: tailNl || undefined,
          titleEn: titleEn || undefined,
          accentEn: accentEn || undefined,
          tailEn: tailEn || undefined,
        });
      }
    }

    config = {
      items,
      personal,
      intervalSeconds,
      randomizeOnReload,
    };
  }

  await prisma.setting.upsert({
    where: { key: "home.slogans" },
    update: { value: config },
    create: { key: "home.slogans", value: config },
  });

  await logAudit({
    action: "update",
    entity: "home",
    target: "Landing page slogans",
    summary: `${config.items.length} slogan(s), persoonlijke slogan ${config.personal?.enabled ? "actief" : "uit"}`,
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin/slogans");
  revalidatePath("/admin/home");
  revalidatePath("/admin/frontpage");

  return saveOk();
}
