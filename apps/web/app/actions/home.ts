"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { saveOk, type SaveState } from "@/lib/saveState";

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
  const items: Array<{ type: "video" | "image"; url: string; titleNl?: string; titleEn?: string }> = [];
  for (let i = 0; i < 10; i += 1) {
    const url = formData.get(`url-${i}`) as string | null;
    if (!url) continue;
    items.push({
      type: (formData.get(`type-${i}`) as "video" | "image") || "video",
      url,
      titleNl: (formData.get(`titleNl-${i}`) as string) || undefined,
      titleEn: (formData.get(`titleEn-${i}`) as string) || undefined,
    });
  }
  await prisma.setting.upsert({
    where: { key: "home.aftermovies" },
    update: { value: { titleNl, titleEn, items } },
    create: { key: "home.aftermovies", value: { titleNl, titleEn, items } },
  });
  revalidatePath("/");
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
