"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { deleteObject } from "@vtk/storage";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

/** Foto op één kaart in de homepage-sectie "Wat we doen". */
export async function saveHomepageCardImageAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("home.edit");
  const id = formData.get("id");
  const rawImageKey = formData.get("imageKey");
  const imageKey = typeof rawImageKey === "string" && rawImageKey ? rawImageKey : null;

  if (
    typeof id !== "string" ||
    !id ||
    (imageKey !== null && !imageKey.startsWith("images/"))
  ) {
    return saveError("INVALID_INPUT");
  }

  const existing = await prisma.headerTab.findUnique({
    where: { id },
    select: { imageKey: true },
  });
  if (!existing) return saveError("INVALID_INPUT");

  await prisma.headerTab.update({
    where: { id },
    data: { imageKey },
  });

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

export async function saveOpeningHoursAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("home.edit");
  const key = formData.get("key") as string;
  const titleNl = formData.get("titleNl") as string;
  const titleEn = formData.get("titleEn") as string;
  const entries: Array<{ dayNl: string; dayEn: string; hours: string }> = [];
  for (let i = 0; i < 14; i += 1) {
    const dayNl = formData.get(`dayNl-${i}`) as string | null;
    const dayEn = formData.get(`dayEn-${i}`) as string | null;
    const hours = formData.get(`hours-${i}`) as string | null;
    if (!dayNl && !hours) continue;
    entries.push({ dayNl: dayNl ?? "", dayEn: dayEn ?? dayNl ?? "", hours: hours ?? "" });
  }
  await prisma.setting.upsert({
    where: { key },
    update: { value: { titleNl, titleEn, entries } },
    create: { key, value: { titleNl, titleEn, entries } },
  });
  revalidatePath("/");
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
  revalidatePath("/");
  revalidatePath("/media");
  revalidatePath("/en/media");
  revalidatePath("/admin/home");
  return saveOk();
}

export async function saveFeaturedAlbumsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("home.edit");
  const slugs = (formData.get("albumSlugs") as string)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await prisma.setting.upsert({
    where: { key: "home.featuredAlbums" },
    update: { value: { albumSlugs: slugs } },
    create: { key: "home.featuredAlbums", value: { albumSlugs: slugs } },
  });
  revalidatePath("/");
  revalidatePath("/admin/home");
  return saveOk();
}
