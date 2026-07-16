"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { newStorageKey, putObject } from "@vtk/storage";
import { requirePermission } from "@/lib/session";
import {
  getMediaContent,
  type MediaPublication,
  type MediaPublicationKind,
} from "@/lib/media-content";
import {
  addImmichAssetsToAlbum,
  createImmichGalleryAlbum,
  refreshImmichGallerySnapshot,
  setImmichAlbumCover,
  uploadImmichAsset,
} from "@/lib/immich-gallery";

const MAX_PDF_BYTES = 40 * 1024 * 1024;
const MAX_IMAGE_BYTES = 45 * 1024 * 1024;
const IMMICH_ADMIN_DEVICE_ID = "vtk-web-admin";

function slugifyId(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "editie";
}

function readField(formData: FormData, name: string, max = 200): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

async function savePublications(publications: MediaPublication[]): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "media.magazines" },
    update: { value: { publications } },
    create: { key: "media.magazines", value: { publications } },
  });
  revalidatePath("/media");
  revalidatePath("/en/media");
}

export async function saveMagazineAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  await requirePermission("media.manage");

  const kindRaw = readField(formData, "kind", 20);
  const kind: MediaPublicationKind | null =
    kindRaw === "bakske" || kindRaw === "ir-reeel" ? kindRaw : null;
  const titleNl = readField(formData, "titleNl");
  const titleEn = readField(formData, "titleEn");
  const issueNl = readField(formData, "issueNl");
  const issueEn = readField(formData, "issueEn");
  const publishedAt = readField(formData, "publishedAt", 30);
  const file = formData.get("file");

  if (!kind || !titleNl || !issueNl) return { ok: false, error: "missing_fields" };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "missing_pdf" };
  if (file.size > MAX_PDF_BYTES) return { ok: false, error: "pdf_too_large" };
  const isPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) return { ok: false, error: "not_a_pdf" };
  if (publishedAt && !Number.isFinite(Date.parse(publishedAt))) {
    return { ok: false, error: "invalid_date" };
  }

  // Persist the currently visible list so the first edit keeps what the
  // public page already shows (including the built-in fallback issues).
  const { publications: current } = await getMediaContent();

  const usedIds = new Set(current.map((p) => p.id));
  const base = slugifyId(`${kind}-${issueNl}`);
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }

  const storageKey = newStorageKey("publications", file.name || "magazine.pdf");
  const bytes = Buffer.from(await file.arrayBuffer());
  await putObject(storageKey, bytes, "application/pdf");

  const entry: MediaPublication = {
    id,
    kind,
    titleNl,
    issueNl,
    storageKey,
    ...(titleEn ? { titleEn } : {}),
    ...(issueEn ? { issueEn } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };

  await savePublications([entry, ...current]);
  return { ok: true };
}

export async function deleteMagazineAction(formData: FormData): Promise<void> {
  await requirePermission("media.manage");
  const id = readField(formData, "id", 100);
  if (!id) return;
  const { publications: current } = await getMediaContent();
  await savePublications(current.filter((p) => p.id !== id));
}

export async function savePromoVideosAction(formData: FormData): Promise<void> {
  await requirePermission("media.manage");

  const existing = await prisma.setting.findUnique({ where: { key: "media.aftermovies" } });
  const existingValue =
    existing && typeof existing.value === "object" && existing.value !== null && !Array.isArray(existing.value)
      ? (existing.value as Record<string, unknown>)
      : {};

  const items: Array<Record<string, string>> = [];
  const usedIds = new Set<string>();
  for (let i = 0; i < 20; i += 1) {
    const url = readField(formData, `url-${i}`, 2048);
    const titleNl = readField(formData, `titleNl-${i}`);
    if (!url || !titleNl) continue;
    const titleEn = readField(formData, `titleEn-${i}`);
    const publishedAt = readField(formData, `publishedAt-${i}`, 30);
    const savedId = readField(formData, `id-${i}`, 100);
    const base =
      savedId && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(savedId) ? savedId : slugifyId(titleNl);
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    items.push({
      id,
      type: "video",
      url,
      titleNl,
      ...(titleEn ? { titleEn } : {}),
      ...(publishedAt && Number.isFinite(Date.parse(publishedAt)) ? { publishedAt } : {}),
    });
  }

  await prisma.setting.upsert({
    where: { key: "media.aftermovies" },
    update: { value: { ...existingValue, items } },
    create: {
      key: "media.aftermovies",
      value: { titleNl: "Aftermovies", titleEn: "Aftermovies", items },
    },
  });
  revalidatePath("/");
  revalidatePath("/media");
  revalidatePath("/en/media");
}

export async function createImmichAlbumAction(
  formData: FormData
): Promise<{ ok: boolean; albumId?: string; error?: string }> {
  await requirePermission("media.manage");
  const title = readField(formData, "title");
  const description = readField(formData, "description", 1000);
  if (!title) return { ok: false, error: "missing_title" };
  try {
    const album = await createImmichGalleryAlbum({ title, description });
    return { ok: true, albumId: album.id };
  } catch (error) {
    console.error("Immich album creation failed", error);
    return { ok: false, error: "immich_unreachable" };
  }
}

export async function uploadImmichAlbumAssetAction(
  formData: FormData
): Promise<{ ok: boolean; assetId?: string; error?: string }> {
  await requirePermission("media.manage");
  const albumId = readField(formData, "albumId", 100);
  const file = formData.get("file");
  if (!albumId || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "missing" };
  }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "too_large" };
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return { ok: false, error: "unsupported_type" };
  }

  try {
    const uploaded = await uploadImmichAsset({
      assetData: file,
      filename: file.name || "photo.jpg",
      mimeType: file.type || "image/jpeg",
      deviceAssetId: `${IMMICH_ADMIN_DEVICE_ID}-${randomUUID()}`,
      deviceId: IMMICH_ADMIN_DEVICE_ID,
      createdAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
    });
    if (!uploaded?.id) return { ok: false, error: "upload_failed" };
    await addImmichAssetsToAlbum(albumId, [uploaded.id]);
    return { ok: true, assetId: uploaded.id };
  } catch (error) {
    console.error("Immich asset upload failed", error);
    return { ok: false, error: "upload_failed" };
  }
}

export async function setImmichAlbumCoverAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  await requirePermission("media.manage");
  const albumId = readField(formData, "albumId", 100);
  const assetId = readField(formData, "assetId", 100);
  if (!albumId || !assetId) return { ok: false, error: "missing" };
  try {
    await setImmichAlbumCover(albumId, assetId);
    return { ok: true };
  } catch (error) {
    console.error("Immich album cover update failed", error);
    return { ok: false, error: "cover_failed" };
  }
}

export async function finalizeImmichAlbumAction(): Promise<void> {
  await requirePermission("media.manage");
  await refreshImmichGallerySnapshot();
  revalidatePath("/media");
  revalidatePath("/en/media");
}
