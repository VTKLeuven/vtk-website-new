"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, HEADER_TABS } from "@vtk/db";
import { requireAnyPermission, requirePermission, requireSession } from "@/lib/session";
import { canEditPageContent } from "@/lib/pageAccess";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

/** Foutcodes die /admin/inhoud en /admin/paginas op vertaalde meldingen mappen. */
export type ContentErrorCode = "INVALID_INPUT" | "SLUG_TAKEN" | "CODE_TAKEN";

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Leeg tiptap-document voor de legacy JSON-kolom van nieuwe pagina's. */
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/** `P2002` op een bepaald veld: de unieke constraint die Prisma noemt. */
function isUniqueViolation(err: unknown, field: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    String(err.meta?.target ?? "").includes(field)
  );
}

// ---- Pagina's: structuur & metadata (pages.manage, /admin/inhoud) -----------

const saveSchema = z.object({
  id: z.string().optional(),
  slug: z.string().min(1).regex(SLUG_REGEX),
  headerTabId: z.string().optional().nullable(),
  visibleInHeader: z.coerce.boolean().optional().default(true),
  titleNl: z.string().min(1),
  titleEn: z.string().optional().nullable(),
  excerptNl: z.string().optional().nullable(),
  excerptEn: z.string().optional().nullable(),
  published: z.coerce.boolean().optional().default(false),
  needsYearlyEdit: z.coerce.boolean().optional().default(false),
  editorRoleIds: z.array(z.string().min(1)),
  order: z.coerce.number().int().optional().default(0),
});

/**
 * Metadata en structuur van een pagina (of een nieuwe pagina aanmaken). De
 * INHOUD wordt hier bewust niet geraakt: die bewerk je in /admin/paginas via
 * {@link savePageContentAction}.
 */
export async function savePageAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("pages.manage");
  const parsed = saveSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    slug: formData.get("slug"),
    headerTabId: formData.get("headerTabId") || null,
    visibleInHeader: formData.get("visibleInHeader") === "on",
    titleNl: formData.get("titleNl"),
    titleEn: formData.get("titleEn") || null,
    excerptNl: formData.get("excerptNl") || null,
    excerptEn: formData.get("excerptEn") || null,
    published: formData.get("published") === "on",
    needsYearlyEdit: formData.get("needsYearlyEdit") === "on",
    editorRoleIds: formData.getAll("editorRoleIds").map(String),
    order: formData.get("order") || 0,
  });
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  const data = parsed.data;

  const common = {
    slug: data.slug,
    headerTabId: data.headerTabId || null,
    visibleInHeader: data.visibleInHeader,
    titleNl: data.titleNl,
    titleEn: data.titleEn,
    excerptNl: data.excerptNl,
    excerptEn: data.excerptEn,
    needsYearlyEdit: data.needsYearlyEdit,
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
          // Bewerkrollen exact op de aangevinkte set zetten.
          editorRoles: {
            deleteMany: {},
            create: data.editorRoleIds.map((roleId) => ({ roleId })),
          },
        },
      });
    } else {
      await prisma.page.create({
        data: {
          ...common,
          // Nieuwe pagina's zijn vanaf dag één markdown; de JSON-kolom is
          // verplicht en krijgt een leeg legacy-document.
          contentMdNl: "",
          contentJsonNl: EMPTY_DOC as Prisma.InputJsonValue,
          publishedAt: data.published ? new Date() : null,
          createdById: session.user.id,
          editorRoles: {
            create: data.editorRoleIds.map((roleId) => ({ roleId })),
          },
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
  await requirePermission("pages.manage");
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
  await requirePermission("pages.manage");
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

// ---- Pagina's: inhoud (pages.edit + paginarol, /admin/paginas) --------------

const contentSchema = z.object({
  id: z.string().min(1),
  titleNl: z.string().min(1),
  titleEn: z.string().optional().nullable(),
  contentMdNl: z.string(),
  contentMdEn: z.string().optional().nullable(),
});

/**
 * De inhoud (markdown, NL + optioneel EN) en de titels van een pagina opslaan.
 * Toegang: superadmin of `pages.editAll`, of `pages.edit` + een paginarol van de
 * gebruiker (zie lib/pageAccess.ts).
 *
 * Na deze save is markdown de volledige waarheid voor de pagina: een lege
 * EN-versie betekent "geen Engelse versie" (publiek valt terug op NL), en het
 * legacy tiptap-JSON wordt niet meer gerenderd. `contentJsonEn` wordt daarom
 * leeggemaakt; `contentJsonNl` (verplichte kolom) blijft als backup staan maar
 * is vanaf nu dood.
 */
export async function savePageContentAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireSession();
  const parsed = contentSchema.safeParse({
    id: formData.get("id"),
    titleNl: formData.get("titleNl"),
    titleEn: formData.get("titleEn") || null,
    contentMdNl: formData.get("contentMdNl") ?? "",
    contentMdEn: formData.get("contentMdEn") || null,
  });
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  const data = parsed.data;

  const page = await prisma.page.findUnique({
    where: { id: data.id },
    select: { editorRoles: { select: { roleId: true } } },
  });
  if (!page) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  if (!canEditPageContent(session, page)) throw new Error("FORBIDDEN");

  const contentMdEn = data.contentMdEn && data.contentMdEn.trim() !== "" ? data.contentMdEn : null;
  await prisma.page.update({
    where: { id: data.id },
    data: {
      titleNl: data.titleNl,
      titleEn: data.titleEn,
      contentMdNl: data.contentMdNl,
      contentMdEn,
      contentJsonEn: contentMdEn === null ? Prisma.DbNull : undefined,
      contentEditedAt: new Date(),
    },
  });

  revalidatePath("/", "layout");
  return saveOk();
}

// ---- Bijlagen ---------------------------------------------------------------

/**
 * Bijlagen mogen beheerd worden door wie de structuur beheert (`pages.manage`)
 * én door wie de inhoud van deze specifieke pagina mag bewerken: PDF's en
 * downloads horen bij de inhoud van een pagina.
 */
async function requirePageAssetAccess(pageId: string): Promise<void> {
  const session = await requireSession();
  if (session.user.isSuperAdmin || session.permissions.includes("pages.manage")) return;
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { editorRoles: { select: { roleId: true } } },
  });
  if (!page || !canEditPageContent(session, page)) throw new Error("FORBIDDEN");
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
  const parsed = assetSchema.parse({
    pageId: formData.get("pageId"),
    storageKey: formData.get("storageKey"),
    kind: formData.get("kind"),
    labelNl: formData.get("labelNl"),
    labelEn: formData.get("labelEn") || null,
    sizeBytes: formData.get("sizeBytes") || null,
    mimeType: formData.get("mimeType") || null,
  });
  await requirePageAssetAccess(parsed.pageId);
  await prisma.pageAsset.create({ data: parsed });
  revalidatePath("/admin/inhoud");
  revalidatePath("/admin/paginas");
  revalidatePath("/", "layout");
}

export async function deletePageAssetAction(formData: FormData): Promise<void> {
  const id = formData.get("id") as string;
  if (!id) return;
  // De toegangscheck hangt aan de pagina van de bijlage zelf, niet aan wat de
  // client als pageId meestuurt.
  const asset = await prisma.pageAsset.findUnique({ where: { id }, select: { pageId: true } });
  if (!asset) return;
  await requirePageAssetAccess(asset.pageId);
  await prisma.pageAsset.delete({ where: { id } });
  revalidatePath("/admin/inhoud");
  revalidatePath("/admin/paginas");
  revalidatePath("/", "layout");
}

// ---- Headercategorieën ------------------------------------------------------
// Headerbeheer hoort bij het inhoudsscherm (pages.manage); het oudere
// header.manage blijft geldig voor rollen die het nog dragen.

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
  await requireAnyPermission(["pages.manage", "header.manage"]);
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
  await requireAnyPermission(["pages.manage", "header.manage"]);
  const id = formData.get("id") as string;
  if (!id) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  // Page.headerTabId is onDelete: SetNull, dus pagina's blijven bestaan en komen
  // onder "Niet gekoppeld" te staan.
  await prisma.headerTab.delete({ where: { id } });
  revalidatePath("/", "layout");
  return saveOk();
}

/** Volgorde van de tabs in de hoofdnavigatie. */
export async function reorderHeaderTabsAction(ids: string[]): Promise<void> {
  await requireAnyPermission(["pages.manage", "header.manage"]);
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
  await requireAnyPermission(["pages.manage", "header.manage"]);
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
