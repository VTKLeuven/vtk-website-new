"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import sharp from "sharp";
import { prisma } from "@vtk/db";
import { deleteObject, newStorageKey, putObject } from "@vtk/storage";
import { requirePermission } from "@/lib/session";

const albumSchema = z.object({
  id: z.string().optional(),
  slug: z.string().min(1).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  titleNl: z.string().min(1),
  titleEn: z.string().optional().nullable(),
  descriptionNl: z.string().optional().nullable(),
  descriptionEn: z.string().optional().nullable(),
  eventDate: z.string().optional().nullable(),
  published: z.coerce.boolean().default(false),
});

export async function saveAlbumAction(formData: FormData): Promise<void> {
  await requirePermission("photos.manageAlbums");
  const parsed = albumSchema.parse({
    id: (formData.get("id") as string) || undefined,
    slug: formData.get("slug"),
    titleNl: formData.get("titleNl"),
    titleEn: formData.get("titleEn") || null,
    descriptionNl: formData.get("descriptionNl") || null,
    descriptionEn: formData.get("descriptionEn") || null,
    eventDate: formData.get("eventDate") || null,
    published: formData.get("published") === "on",
  });

  const data = {
    slug: parsed.slug,
    titleNl: parsed.titleNl,
    titleEn: parsed.titleEn,
    descriptionNl: parsed.descriptionNl,
    descriptionEn: parsed.descriptionEn,
    eventDate: parsed.eventDate ? new Date(parsed.eventDate) : null,
    publishedAt: parsed.published ? new Date() : null,
  };

  if (parsed.id) {
    await prisma.photoAlbum.update({ where: { id: parsed.id }, data });
    revalidatePath("/fotos");
    revalidatePath(`/fotos/${parsed.slug}`);
    redirect(`/admin/albums/${parsed.id}`);
  } else {
    const created = await prisma.photoAlbum.create({ data });
    redirect(`/admin/albums/${created.id}`);
  }
}

export async function deleteAlbumAction(formData: FormData): Promise<void> {
  await requirePermission("photos.manageAlbums");
  const id = formData.get("id") as string;
  if (!id) return;
  const photos = await prisma.photo.findMany({ where: { albumId: id } });
  for (const p of photos) {
    try {
      await deleteObject(p.storageKey);
      if (p.thumbnailKey) await deleteObject(p.thumbnailKey);
    } catch {
      /* ignore */
    }
  }
  await prisma.photoAlbum.delete({ where: { id } });
  revalidatePath("/fotos");
  redirect("/admin/albums");
}

export async function uploadPhotoAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requirePermission("photos.upload");
  const albumId = formData.get("albumId") as string | null;
  const file = formData.get("file");
  if (!albumId || !(file instanceof File)) {
    return { ok: false, error: "missing" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const image = sharp(bytes).rotate();
  const meta = await image.metadata();
  const original = await image.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const thumb = await sharp(bytes)
    .rotate()
    .resize(600, 600, { fit: "cover", position: "attention" })
    .jpeg({ quality: 78 })
    .toBuffer();

  const fullKey = newStorageKey(`albums/${albumId}`, "photo.jpg");
  const thumbKey = newStorageKey(`albums/${albumId}/thumbs`, "thumb.jpg");
  await putObject(fullKey, original, "image/jpeg");
  await putObject(thumbKey, thumb, "image/jpeg");

  const photo = await prisma.photo.create({
    data: {
      albumId,
      storageKey: fullKey,
      thumbnailKey: thumbKey,
      width: meta.width,
      height: meta.height,
      sizeBytes: original.length,
      originalName: file.name,
    },
  });

  // If album has no cover yet, set this as cover.
  const album = await prisma.photoAlbum.findUnique({ where: { id: albumId } });
  if (album && !album.coverPhotoId) {
    await prisma.photoAlbum.update({
      where: { id: albumId },
      data: { coverPhotoId: photo.id },
    });
  }

  revalidatePath(`/admin/albums/${albumId}`);
  return { ok: true };
}

export async function deletePhotoAction(formData: FormData): Promise<void> {
  await requirePermission("photos.manageAlbums");
  const id = formData.get("id") as string;
  const albumId = formData.get("albumId") as string;
  if (!id) return;
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) return;
  try {
    await deleteObject(photo.storageKey);
    if (photo.thumbnailKey) await deleteObject(photo.thumbnailKey);
  } catch {
    /* ignore */
  }
  await prisma.photo.delete({ where: { id } });
  revalidatePath(`/admin/albums/${albumId}`);
}

export async function setAlbumCoverAction(formData: FormData): Promise<void> {
  await requirePermission("photos.manageAlbums");
  const albumId = formData.get("albumId") as string;
  const photoId = formData.get("photoId") as string;
  if (!albumId || !photoId) return;
  await prisma.photoAlbum.update({
    where: { id: albumId },
    data: { coverPhotoId: photoId },
  });
  revalidatePath(`/admin/albums/${albumId}`);
}
