"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { deleteObject } from "@vtk/storage";

/** `P2002` op een bepaald veld: de unieke constraint die Prisma noemt. */
function isUniqueViolation(err: unknown, field: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    String(err.meta?.target ?? "").includes(field)
  );
}

// ---- POCs -------------------------------------------------------------------

const pocSchema = z.object({
  id: z.string().optional(),
  slug: z.string().min(1).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  nameNl: z.string().min(1),
  nameEn: z.string().optional().nullable(),
  studyTrack: z.string().min(1),
  descriptionNl: z.string().optional().nullable(),
  descriptionEn: z.string().optional().nullable(),
  order: z.coerce.number().int().default(0),
});

export async function savePocAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("pocs.manage");
  const parsed = pocSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    slug: formData.get("slug"),
    nameNl: formData.get("nameNl"),
    nameEn: formData.get("nameEn") || null,
    studyTrack: formData.get("studyTrack"),
    descriptionNl: formData.get("descriptionNl") || null,
    descriptionEn: formData.get("descriptionEn") || null,
    order: formData.get("order") || 0,
  });
  if (!parsed.success) return saveError("INVALID_INPUT");

  try {
    if (parsed.data.id) {
      await prisma.poc.update({ where: { id: parsed.data.id }, data: parsed.data });
    } else {
      await prisma.poc.create({ data: parsed.data });
    }
  } catch (err) {
    if (isUniqueViolation(err, "slug")) return saveError("SLUG_TAKEN");
    throw err;
  }

  revalidatePath("/pocs");
  revalidatePath("/admin/pocs");
  return saveOk();
}

export async function deletePocAction(formData: FormData): Promise<void> {
  await requirePermission("pocs.manage");
  const id = formData.get("id") as string;
  if (id) await prisma.poc.delete({ where: { id } });
  revalidatePath("/pocs");
  // Geen redirect: de lijst staat op deze pagina en ververst ter plaatse.
  revalidatePath("/admin/pocs");
}

const repSchema = z.object({
  pocId: z.string(),
  userId: z.string(),
  roleNl: z.string().optional().nullable(),
  roleEn: z.string().optional().nullable(),
  order: z.coerce.number().int().default(0),
});

export async function addPocRepresentativeAction(formData: FormData): Promise<void> {
  await requirePermission("pocs.manage");
  const parsed = repSchema.parse({
    pocId: formData.get("pocId"),
    userId: formData.get("userId"),
    roleNl: formData.get("roleNl") || null,
    roleEn: formData.get("roleEn") || null,
    order: formData.get("order") || 0,
  });
  await prisma.pocRepresentative.upsert({
    where: { pocId_userId: { pocId: parsed.pocId, userId: parsed.userId } },
    update: { roleNl: parsed.roleNl, roleEn: parsed.roleEn, order: parsed.order },
    create: parsed,
  });
  revalidatePath("/pocs");
  revalidatePath("/admin/pocs");
}

export async function removePocRepresentativeAction(formData: FormData): Promise<void> {
  await requirePermission("pocs.manage");
  const id = formData.get("id") as string;
  if (id) await prisma.pocRepresentative.delete({ where: { id } });
  revalidatePath("/pocs");
  revalidatePath("/admin/pocs");
}

// ---- Partners ---------------------------------------------------------------

const partnerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  url: z.string().optional().nullable(),
  logoKey: z.string().min(1),
  active: z.coerce.boolean().default(true),
});

export async function savePartnerAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("partners.manage");
  const parsed = partnerSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    name: formData.get("name"),
    url: formData.get("url") || null,
    logoKey: formData.get("logoKey"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return saveError("INVALID_INPUT");
  const data = parsed.data;

  if (data.id) {
    const existing = await prisma.partner.findUnique({ where: { id: data.id } });
    // order is managed via drag-and-drop (reorderPartnersAction), never touched here.
    await prisma.partner.update({
      where: { id: data.id },
      data: { name: data.name, url: data.url, logoKey: data.logoKey, active: data.active },
    });
    if (existing && existing.logoKey && existing.logoKey !== data.logoKey) {
      try {
        await deleteObject(existing.logoKey);
      } catch {
        /* ignore */
      }
    }
  } else {
    // New partners are appended to the end of the current order.
    const last = await prisma.partner.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
    await prisma.partner.create({ data: { ...data, order: (last?.order ?? -1) + 1 } });
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/partners");
  return saveOk();
}

export async function reorderPartnersAction(ids: string[]): Promise<void> {
  await requirePermission("partners.manage");
  await prisma.$transaction(
    ids.map((id, index) => prisma.partner.update({ where: { id }, data: { order: index } })),
  );
  revalidatePath("/", "layout");
  revalidatePath("/admin/partners");
}

export async function deletePartnerAction(formData: FormData): Promise<void> {
  await requirePermission("partners.manage");
  const id = formData.get("id") as string;
  if (!id) return;
  const existing = await prisma.partner.findUnique({ where: { id } });
  if (existing) {
    try {
      await deleteObject(existing.logoKey);
    } catch {
      /* ignore */
    }
    await prisma.partner.delete({ where: { id } });
  }
  revalidatePath("/", "layout");
  // Geen redirect: het raster staat op deze pagina en ververst ter plaatse.
  revalidatePath("/admin/partners");
}
