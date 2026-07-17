"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, HEADER_TABS } from "@vtk/db";
import { deleteObject } from "@vtk/storage";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

/** Foutcodes die /admin/inhoud op vertaalde meldingen mapt. */
export type ContentErrorCode = "INVALID_INPUT" | "SLUG_TAKEN" | "CODE_TAKEN";

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** `P2002` op een bepaald veld: de unieke constraint die Prisma noemt. */
function isUniqueViolation(err: unknown, field: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    String(err.meta?.target ?? "").includes(field)
  );
}

// ---- Pagina's ---------------------------------------------------------------

const saveSchema = z.object({
  id: z.string().optional(),
  slug: z.string().min(1).regex(SLUG_REGEX),
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

export async function savePageAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("pages.edit");
  const parsed = saveSchema.safeParse({
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
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  const data = parsed.data;

  let contentNl: unknown;
  let contentEn: unknown = null;
  try {
    contentNl = JSON.parse(data.contentJsonNl);
    contentEn = data.contentJsonEn ? JSON.parse(data.contentJsonEn) : null;
  } catch {
    return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  }

  const common = {
    slug: data.slug,
    headerTabId: data.headerTabId || null,
    visibleInHeader: data.visibleInHeader,
    titleNl: data.titleNl,
    titleEn: data.titleEn,
    excerptNl: data.excerptNl,
    excerptEn: data.excerptEn,
    contentJsonNl: contentNl as Prisma.InputJsonValue,
    contentJsonEn: contentEn as Prisma.InputJsonValue,
    order: data.order,
  };

  try {
    if (data.id) {
      const existing = await prisma.page.findUnique({
        where: { id: data.id },
        select: { publishedAt: true },
      });
      await prisma.page.update({
        where: { id: data.id },
        data: {
          ...common,
          // Enkel de eerste publicatie stempelen: een bewerking van een al
          // gepubliceerde pagina mag de publicatiedatum niet verzetten.
          publishedAt: data.published ? (existing?.publishedAt ?? new Date()) : null,
          // createdById bewust niet: dat blijft de oorspronkelijke auteur.
        },
      });
    } else {
      await prisma.page.create({
        data: {
          ...common,
          publishedAt: data.published ? new Date() : null,
          createdById: session.user.id,
        },
      });
    }
  } catch (err) {
    // Page.slug is globaal uniek, niet per categorie.
    if (isUniqueViolation(err, "slug")) return saveError("SLUG_TAKEN" satisfies ContentErrorCode);
    throw err;
  }

  revalidatePath("/", "layout");
  return saveOk();
}

export async function deletePageAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("pages.delete");
  const id = formData.get("id") as string;
  if (!id) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  await prisma.page.delete({ where: { id } });
  revalidatePath("/", "layout");
  return saveOk();
}

/** Volgorde binnen een categorie; `ids` staat al in de gewenste volgorde. */
export async function reorderPagesAction(ids: string[]): Promise<void> {
  await requirePermission("pages.edit");
  await prisma.$transaction(
    ids.map((id, index) => prisma.page.update({ where: { id }, data: { order: index } })),
  );
  revalidatePath("/", "layout");
}

/**
 * Een pagina naar een andere categorie hangen (of losmaken met `null`). De pagina
 * gaat achteraan: haar oude volgnummer slaat op de vorige categorie en zou hier
 * een willekeurige plek in het midden opleveren.
 */
export async function movePageToTabAction(pageId: string, headerTabId: string | null): Promise<void> {
  await requirePermission("pages.edit");
  const last = await prisma.page.findFirst({
    where: { headerTabId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  await prisma.page.update({
    where: { id: pageId },
    data: { headerTabId, order: (last?.order ?? -1) + 1 },
  });
  revalidatePath("/", "layout");
}

// ---- Bijlagen ---------------------------------------------------------------

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
  revalidatePath("/admin/inhoud");
  revalidatePath("/", "layout");
}

export async function deletePageAssetAction(formData: FormData): Promise<void> {
  await requirePermission("pages.edit");
  const id = formData.get("id") as string;
  if (id) await prisma.pageAsset.delete({ where: { id } });
  revalidatePath("/admin/inhoud");
  revalidatePath("/", "layout");
}

// ---- Headercategorieën ------------------------------------------------------

const headerSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1),
  slug: z.string().min(1).regex(SLUG_REGEX),
  labelNl: z.string().min(1),
  labelEn: z.string().min(1),
  visible: z.coerce.boolean().default(true),
  introNl: z.string().optional().nullable(),
  introEn: z.string().optional().nullable(),
  ctaLabelNl: z.string().optional().nullable(),
  ctaLabelEn: z.string().optional().nullable(),
  ctaUrl: z.string().url().optional().nullable().or(z.literal("")),
});

export async function saveHeaderTabAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("header.manage");
  const parsed = headerSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    code: formData.get("code"),
    slug: formData.get("slug"),
    labelNl: formData.get("labelNl"),
    labelEn: formData.get("labelEn"),
    visible: formData.get("visible") === "on",
    introNl: formData.get("introNl") || null,
    introEn: formData.get("introEn") || null,
    ctaLabelNl: formData.get("ctaLabelNl") || null,
    ctaLabelEn: formData.get("ctaLabelEn") || null,
    ctaUrl: formData.get("ctaUrl") || null,
  });
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  const p = parsed.data;

  const data = {
    slug: p.slug,
    labelNl: p.labelNl,
    labelEn: p.labelEn,
    visible: p.visible,
    introNl: p.introNl || null,
    introEn: p.introEn || null,
    ctaLabelNl: p.ctaLabelNl || null,
    ctaLabelEn: p.ctaLabelEn || null,
    ctaUrl: p.ctaUrl || null,
  };

  try {
    if (p.id) {
      // `code` bewust niet bijwerkbaar: het is de sleutel waarop de seed upsert
      // en waarop code als `code: "AANBOD"` filtert.
      await prisma.headerTab.update({ where: { id: p.id }, data });
    } else {
      const last = await prisma.headerTab.findFirst({
        orderBy: { order: "desc" },
        select: { order: true },
      });
      await prisma.headerTab.create({
        data: { ...data, code: p.code, order: (last?.order ?? -1) + 1 },
      });
    }
  } catch (err) {
    if (isUniqueViolation(err, "slug")) return saveError("SLUG_TAKEN" satisfies ContentErrorCode);
    if (isUniqueViolation(err, "code")) return saveError("CODE_TAKEN" satisfies ContentErrorCode);
    throw err;
  }

  revalidatePath("/", "layout");
  return saveOk();
}

export async function deleteHeaderTabAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("header.manage");
  const id = formData.get("id") as string;
  if (!id) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  // Page.headerTabId is onDelete: SetNull, dus pagina's blijven bestaan en komen
  // onder "Niet gekoppeld" te staan.
  const existing = await prisma.headerTab.findUnique({
    where: { id },
    select: { imageKey: true },
  });
  await prisma.headerTab.delete({ where: { id } });
  if (existing?.imageKey) {
    try {
      await deleteObject(existing.imageKey);
    } catch {
      /* ignore */
    }
  }
  revalidatePath("/", "layout");
  return saveOk();
}

/** Volgorde van de tabs in de hoofdnavigatie. */
export async function reorderHeaderTabsAction(ids: string[]): Promise<void> {
  await requirePermission("header.manage");
  await prisma.$transaction(
    ids.map((id, index) => prisma.headerTab.update({ where: { id }, data: { order: index } })),
  );
  revalidatePath("/", "layout");
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
      introNl: t.introNl ?? null,
      introEn: t.introEn ?? null,
      ctaLabelNl: t.ctaLabelNl ?? null,
      ctaLabelEn: t.ctaLabelEn ?? null,
      ctaUrl: t.ctaUrl ?? null,
    })),
    skipDuplicates: true,
  });
  revalidatePath("/", "layout");
}
