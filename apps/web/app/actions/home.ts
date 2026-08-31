"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { deleteObject } from "@vtk/storage";
import { requirePermission } from "@/lib/session";
import { readImageField, resolveImageKey } from "@/lib/imageField";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { DEFAULT_EVENT_IMAGE_SETTING } from "@/lib/defaultEventImage";
import { logAudit } from "@/lib/audit";

/** Tekstveld uit het formulier: leeg betekent "terug naar de standaardzin". */
function readOptionalText(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value === "" ? null : value;
}

/** Foto en tekstje op één kaart in de homepage-sectie "Wat we doen". */
export async function saveHomepageCardAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("home.edit");
  const id = formData.get("id");
  const image = readImageField(formData);

  if (typeof id !== "string" || !id || image.kind === "invalid") {
    return saveError("INVALID_INPUT");
  }

  const existing = await prisma.headerTab.findUnique({
    where: { id },
    select: { imageKey: true, labelNl: true, homeBodyNl: true, homeBodyEn: true },
  });
  if (!existing) return saveError("INVALID_INPUT");

  const imageKey = resolveImageKey(image, existing.imageKey);
  const homeBodyNl = readOptionalText(formData, "homeBodyNl");
  const homeBodyEn = readOptionalText(formData, "homeBodyEn");

  await prisma.headerTab.update({
    where: { id },
    data: { imageKey, homeBodyNl, homeBodyEn },
  });

  const photoChanged = imageKey !== existing.imageKey;
  const textChanged =
    homeBodyNl !== existing.homeBodyNl || homeBodyEn !== existing.homeBodyEn;

  if (photoChanged || textChanged) {
    const changes = [
      photoChanged ? (imageKey ? "foto vervangen" : "foto verwijderd") : null,
      textChanged
        ? homeBodyNl || homeBodyEn
          ? "tekst aangepast"
          : "tekst teruggezet op de standaardzin"
        : null,
    ].filter((part): part is string => part !== null);
    await logAudit({
      action: "update",
      entity: "home",
      entityId: id,
      target: `Wat we doen: ${existing.labelNl}`,
      summary: changes.join(", "),
    });
  }

  if (existing.imageKey && existing.imageKey !== imageKey) {
    try {
      await deleteObject(existing.imageKey);
    } catch {
      /* De databasewijziging blijft geldig als storage-opruiming tijdelijk faalt. */
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/home");
  return saveOk();
}

/** Standaardfoto voor evenementen zonder eigen cover. */
export async function saveDefaultEventImageAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("home.edit");
  const image = readImageField(formData);
  if (image.kind === "invalid") return saveError("INVALID_INPUT");

  const row = await prisma.setting.findUnique({ where: { key: DEFAULT_EVENT_IMAGE_SETTING } });
  const existingKey = (row?.value as { imageKey?: string | null } | undefined)?.imageKey ?? null;
  const imageKey = resolveImageKey(image, existingKey);

  const value = { imageKey };
  await prisma.setting.upsert({
    where: { key: DEFAULT_EVENT_IMAGE_SETTING },
    update: { value },
    create: { key: DEFAULT_EVENT_IMAGE_SETTING, value },
  });

  if (existingKey && existingKey !== imageKey) {
    try {
      await deleteObject(existingKey);
    } catch {
      /* De databasewijziging blijft geldig als storage-opruiming tijdelijk faalt. */
    }
  }

  if (imageKey !== existingKey) {
    await logAudit({
      action: "update",
      entity: "home",
      target: "Standaardfoto voor evenementen",
      summary: imageKey ? "vervangen" : "verwijderd",
    });
  }

  // Elke eventpagina en de homepage kunnen deze foto tonen.
  revalidatePath("/", "layout");
  revalidatePath("/admin/home");
  return saveOk();
}

export async function saveCareerAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("home.edit");
  const value = {
    titleNl: formData.get("titleNl") as string,
    titleEn: formData.get("titleEn") as string,
    bodyNl: formData.get("bodyNl") as string,
    bodyEn: formData.get("bodyEn") as string,
    ctaLabelNl: (formData.get("ctaLabelNl") as string) || "",
    ctaLabelEn: (formData.get("ctaLabelEn") as string) || "",
    ctaUrl: (formData.get("ctaUrl") as string) || "",
  };
  await prisma.setting.upsert({
    where: { key: "home.career" },
    update: { value },
    create: { key: "home.career", value },
  });
  await logAudit({
    action: "update",
    entity: "home",
    target: "VTK Career-blok",
    summary: "tekst of knop van het careerblok op de homepage bewerkt",
  });
  revalidatePath("/");
  revalidatePath("/admin/home");
  return saveOk();
}

export async function saveAftermoviesAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("home.edit");
  const titleNl = formData.get("titleNl") as string;
  const titleEn = formData.get("titleEn") as string;
  const items: Array<{
    id: string;
    type: "video" | "image";
    url: string;
    titleNl?: string;
    titleEn?: string;
    posterUrl?: string;
    publishedAt?: string;
  }> = [];
  for (let i = 0; i < 10; i += 1) {
    const url = (formData.get(`url-${i}`) as string | null)?.trim();
    if (!url) continue;
    const savedId = (formData.get(`id-${i}`) as string | null)?.trim();
    const id = savedId && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(savedId)
      ? savedId
      : `video-${i + 1}`;
    const type = formData.get(`type-${i}`) === "image" ? "image" : "video";
    const posterUrl = (formData.get(`posterUrl-${i}`) as string | null)?.trim();
    const publishedAt = (formData.get(`publishedAt-${i}`) as string | null)?.trim();
    items.push({
      id,
      type,
      url,
      titleNl: (formData.get(`titleNl-${i}`) as string)?.trim() || undefined,
      titleEn: (formData.get(`titleEn-${i}`) as string)?.trim() || undefined,
      ...(posterUrl ? { posterUrl } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    });
  }
  await prisma.setting.upsert({
    where: { key: "media.aftermovies" },
    update: { value: { titleNl, titleEn, items } },
    create: { key: "media.aftermovies", value: { titleNl, titleEn, items } },
  });
  await logAudit({
    action: "update",
    entity: "home",
    target: "Aftermovies",
    summary: `${items.length} item(s) in het aftermovieblok`,
  });
  revalidatePath("/");
  revalidatePath("/media");
  revalidatePath("/en/media");
  revalidatePath("/admin/home");
  return saveOk();
}
