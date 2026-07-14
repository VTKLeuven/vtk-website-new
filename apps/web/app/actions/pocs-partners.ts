"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { deleteObject } from "@vtk/storage";

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

export async function savePocAction(formData: FormData): Promise<void> {
  await requirePermission("pocs.manage");
  const parsed = pocSchema.parse({
    id: (formData.get("id") as string) || undefined,
    slug: formData.get("slug"),
    nameNl: formData.get("nameNl"),
    nameEn: formData.get("nameEn") || null,
    studyTrack: formData.get("studyTrack"),
    descriptionNl: formData.get("descriptionNl") || null,
    descriptionEn: formData.get("descriptionEn") || null,
    order: formData.get("order") || 0,
  });
  if (parsed.id) {
    await prisma.poc.update({ where: { id: parsed.id }, data: parsed });
  } else {
    await prisma.poc.create({ data: parsed });
  }
  revalidatePath("/pocs");
  redirect("/admin/pocs");
}

export async function deletePocAction(formData: FormData): Promise<void> {
  await requirePermission("pocs.manage");
  const id = formData.get("id") as string;
  if (id) await prisma.poc.delete({ where: { id } });
  revalidatePath("/pocs");
  redirect("/admin/pocs");
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
}

export async function removePocRepresentativeAction(formData: FormData): Promise<void> {
  await requirePermission("pocs.manage");
  const id = formData.get("id") as string;
  if (id) await prisma.pocRepresentative.delete({ where: { id } });
  revalidatePath("/pocs");
}

// ---- Partners ---------------------------------------------------------------

const partnerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  url: z.string().optional().nullable(),
  logoKey: z.string().min(1),
  active: z.coerce.boolean().default(true),
});

export async function savePartnerAction(formData: FormData): Promise<void> {
  await requirePermission("partners.manage");
  const parsed = partnerSchema.parse({
    id: (formData.get("id") as string) || undefined,
    name: formData.get("name"),
    url: formData.get("url") || null,
    logoKey: formData.get("logoKey"),
    active: formData.get("active") === "on",
  });
  if (parsed.id) {
    const existing = await prisma.partner.findUnique({ where: { id: parsed.id } });
    // order is managed via drag-and-drop (reorderPartnersAction), never touched here.
    await prisma.partner.update({
      where: { id: parsed.id },
      data: { name: parsed.name, url: parsed.url, logoKey: parsed.logoKey, active: parsed.active },
    });
    if (existing && existing.logoKey !== parsed.logoKey) {
      try {
        await deleteObject(existing.logoKey);
      } catch {
        /* ignore */
      }
    }
  } else {
    // New partners are appended to the end of the current order.
    const last = await prisma.partner.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
    await prisma.partner.create({ data: { ...parsed, order: (last?.order ?? -1) + 1 } });
  }
  revalidatePath("/", "layout");
  redirect("/admin/partners");
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
  redirect("/admin/partners");
}
