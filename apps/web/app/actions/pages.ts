"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma, HEADER_TABS } from "@vtk/db";
import { requirePermission } from "@/lib/session";

const saveSchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  headerTabId: z.string().optional().nullable(),
  visibleInHeader: z.coerce.boolean().optional().default(true),
  titleNl: z.string().min(1),
  titleEn: z.string().optional().nullable(),
  excerptNl: z.string().optional().nullable(),
  excerptEn: z.string().optional().nullable(),
  contentJsonNl: z.string(),
  contentJsonEn: z.string().optional().nullable(),
  published: z.coerce.boolean().optional().default(false),
  order: z.coerce.number().int().optional().default(0),
});

export async function savePageAction(formData: FormData): Promise<void> {
  const session = await requirePermission("pages.edit");
  const parsed = saveSchema.parse({
    id: (formData.get("id") as string) || undefined,
    slug: formData.get("slug"),
    headerTabId: formData.get("headerTabId") || null,
    visibleInHeader: formData.get("visibleInHeader") === "on",
    titleNl: formData.get("titleNl"),
    titleEn: formData.get("titleEn") || null,
    excerptNl: formData.get("excerptNl") || null,
    excerptEn: formData.get("excerptEn") || null,
    contentJsonNl: formData.get("contentJsonNl") || "{}",
    contentJsonEn: formData.get("contentJsonEn") || null,
    published: formData.get("published") === "on",
    order: formData.get("order") || 0,
  });

  const contentNl = JSON.parse(parsed.contentJsonNl);
  const contentEn = parsed.contentJsonEn ? JSON.parse(parsed.contentJsonEn) : null;

  const data = {
    slug: parsed.slug,
    headerTabId: parsed.headerTabId || null,
    visibleInHeader: parsed.visibleInHeader,
    titleNl: parsed.titleNl,
    titleEn: parsed.titleEn,
    excerptNl: parsed.excerptNl,
    excerptEn: parsed.excerptEn,
    contentJsonNl: contentNl,
    contentJsonEn: contentEn,
    publishedAt: parsed.published ? new Date() : null,
    order: parsed.order,
    createdById: session.user.id,
  };

  if (parsed.id) {
    await prisma.page.update({ where: { id: parsed.id }, data });
  } else {
    await prisma.page.create({ data });
  }

  revalidatePath("/", "layout");
  redirect("/admin/paginas");
}

export async function deletePageAction(formData: FormData): Promise<void> {
  await requirePermission("pages.delete");
  const id = formData.get("id") as string;
  if (id) {
    await prisma.page.delete({ where: { id } });
    revalidatePath("/", "layout");
  }
  redirect("/admin/paginas");
}

const assetSchema = z.object({
  pageId: z.string(),
  storageKey: z.string(),
  kind: z.enum(["EMBEDDED_PDF", "DOWNLOAD"]),
  labelNl: z.string().min(1),
  labelEn: z.string().optional().nullable(),
  sizeBytes: z.coerce.number().optional().nullable(),
  mimeType: z.string().optional().nullable(),
});

export async function addPageAssetAction(formData: FormData): Promise<void> {
  await requirePermission("pages.edit");
  const parsed = assetSchema.parse({
    pageId: formData.get("pageId"),
    storageKey: formData.get("storageKey"),
    kind: formData.get("kind"),
    labelNl: formData.get("labelNl"),
    labelEn: formData.get("labelEn") || null,
    sizeBytes: formData.get("sizeBytes") || null,
    mimeType: formData.get("mimeType") || null,
  });
  await prisma.pageAsset.create({ data: parsed });
  revalidatePath(`/admin/paginas/${parsed.pageId}`);
}

export async function deletePageAssetAction(formData: FormData): Promise<void> {
  await requirePermission("pages.edit");
  const id = formData.get("id") as string;
  const pageId = formData.get("pageId") as string;
  if (id) await prisma.pageAsset.delete({ where: { id } });
  revalidatePath(`/admin/paginas/${pageId}`);
}

const headerSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  labelNl: z.string().min(1),
  labelEn: z.string().min(1),
  order: z.coerce.number().int().default(0),
  visible: z.coerce.boolean().default(true),
});

export async function saveHeaderTabAction(formData: FormData): Promise<void> {
  await requirePermission("header.manage");
  const parsed = headerSchema.parse({
    id: (formData.get("id") as string) || undefined,
    code: formData.get("code"),
    slug: formData.get("slug"),
    labelNl: formData.get("labelNl"),
    labelEn: formData.get("labelEn"),
    order: formData.get("order") || 0,
    visible: formData.get("visible") === "on",
  });
  if (parsed.id) {
    await prisma.headerTab.update({ where: { id: parsed.id }, data: parsed });
  } else {
    await prisma.headerTab.create({ data: parsed });
  }
  revalidatePath("/", "layout");
  redirect("/admin/header");
}

export async function deleteHeaderTabAction(formData: FormData): Promise<void> {
  await requirePermission("header.manage");
  const id = formData.get("id") as string;
  if (id) await prisma.headerTab.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect("/admin/header");
}

/**
 * Persisteert de statische standaardtabs (`HEADER_TABS`) in de database. De nav
 * valt terug op die defaults zolang de tabel leeg is; door ze te importeren
 * worden ze bewerkbaar en lezen nav én beheerpagina dezelfde rijen. Idempotent:
 * bestaande codes/slugs worden overgeslagen.
 */
export async function importDefaultHeaderTabsAction(): Promise<void> {
  await requirePermission("header.manage");
  await prisma.headerTab.createMany({
    data: HEADER_TABS.map((t) => ({
      code: t.code,
      slug: t.slug,
      labelNl: t.labelNl,
      labelEn: t.labelEn,
      order: t.order,
      visible: true,
    })),
    skipDuplicates: true,
  });
  revalidatePath("/", "layout");
  redirect("/admin/header");
}
