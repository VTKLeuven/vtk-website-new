"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, HEADER_TABS } from "@vtk/db";
import { requireAnyPermission, requirePermission, requireSession } from "@/lib/session";
import { canEditPageContent, canPublishPages } from "@/lib/pageAccess";
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
  id: z.string().min(1),
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
 * Metadata en structuur van een BESTAANDE pagina (/admin/inhoud). De INHOUD
 * wordt hier bewust niet geraakt: die bewerk je in /admin/paginas via
 * {@link savePageContentAction}.
 *
 * Aanmaken kan hier niet: dat is {@link createPageAction}, die de pagina meteen
 * de rollen van de maker geeft. Een tweede aanmaakpad zonder die stap zou
 * pagina's opleveren die vergrendeld zijn zodra ze bestaan.
 */
export async function savePageAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission("pages.manage");
  const parsed = saveSchema.safeParse({
    id: formData.get("id"),
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

  const existing = await prisma.page.findUnique({
    where: { id: data.id },
    select: { publishedAt: true },
  });
  if (!existing) return saveError("INVALID_INPUT" satisfies ContentErrorCode);

  try {
    await prisma.page.update({
      where: { id: data.id },
      data: {
        slug: data.slug,
        headerTabId: data.headerTabId || null,
        visibleInHeader: data.visibleInHeader,
        titleNl: data.titleNl,
        titleEn: data.titleEn,
        excerptNl: data.excerptNl,
        excerptEn: data.excerptEn,
        needsYearlyEdit: data.needsYearlyEdit,
        order: data.order,
        // Enkel de eerste publicatie stempelen: een bewerking van een al
        // gepubliceerde pagina mag de publicatiedatum niet verzetten.
        publishedAt: data.published ? (existing.publishedAt ?? new Date()) : null,
        // createdById bewust niet: dat blijft de oorspronkelijke auteur.
        // Bewerkrollen exact op de aangevinkte set zetten.
        editorRoles: {
          deleteMany: {},
          create: [...new Set(data.editorRoleIds)].map((roleId) => ({ roleId })),
        },
      },
    });
  } catch (err) {
    // Page.slug is globaal uniek, niet per categorie.
    if (isUniqueViolation(err, "slug")) return saveError("SLUG_TAKEN" satisfies ContentErrorCode);
    throw err;
  }

  revalidatePath("/", "layout");
  return saveOk();
}

/**
 * Een pagina verwijderen. Twee voorwaarden, want dit staat sinds de rework in de
 * editor (die ook gewone `pages.edit`-bewerkers bereiken): het recht
 * `pages.delete` ÉN toegang tot deze specifieke pagina. Zonder die tweede check
 * zou iedereen met `pages.delete` elke pagina kunnen wissen door een id te
 * posten, ook pagina's van een werkgroep waar hij niets mee te maken heeft.
 */
export async function deletePageAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("pages.delete");
  const id = formData.get("id") as string;
  if (!id) return saveError("INVALID_INPUT" satisfies ContentErrorCode);

  const page = await prisma.page.findUnique({
    where: { id },
    select: { editorRoles: { select: { roleId: true } } },
  });
  if (!page) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  if (!canEditPageContent(session, page)) throw new Error("FORBIDDEN");

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

// ---- Pagina's aanmaken & instellen vanuit de editor -------------------------

const createPageSchema = z.object({
  titleNl: z.string().min(1),
  slug: z.string().min(1).regex(SLUG_REGEX),
  locale: z.enum(["nl", "en"]).optional().default("nl"),
});

/**
 * Een nieuwe pagina vanuit `/admin/paginas`, voor wie pagina's mag bewerken.
 * Bewust minimaal: titel en slug. Categorie, publicatie en excerpts zijn
 * structuur en blijven bij `pages.manage` (`/admin/inhoud`); een nieuwe pagina
 * start dus als ongepubliceerd concept zonder categorie.
 *
 * De pagina krijgt meteen de rollen van de maker als bewerkrollen. Anders zou ze
 * vergrendeld zijn op het moment dat ze bestaat (een pagina zonder rollen is
 * enkel voor `pages.editAll`/superadmin), en zou de maker zijn eigen pagina niet
 * kunnen openen. Aanpasbaar in de instellingen-kaart van de editor.
 */
export async function createPageAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireAnyPermission(["pages.edit", "pages.editAll"]);
  const parsed = createPageSchema.safeParse({
    titleNl: formData.get("titleNl"),
    slug: formData.get("slug"),
    locale: formData.get("locale") || "nl",
  });
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  const data = parsed.data;

  let id: string;
  try {
    const created = await prisma.page.create({
      data: {
        slug: data.slug,
        titleNl: data.titleNl,
        contentMdNl: "",
        contentJsonNl: EMPTY_DOC as Prisma.InputJsonValue,
        createdById: session.user.id,
        editorRoles: { create: session.roleIds.map((roleId) => ({ roleId })) },
      },
      select: { id: true },
    });
    id = created.id;
  } catch (err) {
    if (isUniqueViolation(err, "slug")) return saveError("SLUG_TAKEN" satisfies ContentErrorCode);
    throw err;
  }

  revalidatePath("/", "layout");
  // Buiten de try/catch: redirect() werkt via een throw. De navigatie naar de
  // verse editor is meteen de bevestiging, dus geen toast nodig.
  redirect(`${data.locale === "nl" ? "" : "/en"}/admin/paginas/${id}`);
}

// ---- Pagina-instellingen vanuit de inhoudseditor ----------------------------

const pageSettingsSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1).regex(SLUG_REGEX),
  needsYearlyEdit: z.coerce.boolean().optional().default(false),
  // Ontbreekt = "niet aangeraakt", niet "depubliceren". Zie de action.
  published: z.enum(["on", "off"]).nullable().optional(),
  editorRoleIds: z.array(z.string().min(1)),
});

/**
 * De bewerkrollen en het jaarlijks-nakijken-vinkje van één pagina, vanuit de
 * inhoudseditor (`/admin/paginas/[id]`).
 *
 * Wie de inhoud van een pagina mag bewerken, mag hier ook bepalen welke rollen
 * dat verder mogen; dat is bewust ruimer dan `pages.manage` (zie
 * docs/design-decisions.md). De check is dus dezelfde als voor de inhoud, op de
 * pagina zoals ze NU is: je kan enkel rollen wijzigen van een pagina waar je al
 * aan mag. Zichzelf de toegang ontnemen kan wel; de UI vraagt dat expliciet te
 * bevestigen.
 *
 * `contentEditedAt` blijft hier bewust ongemoeid: dit is geen inhoudswijziging,
 * dus het jaarlijkse nakijken mag hiermee niet afgevinkt raken.
 *
 * De slug hoort hier ook thuis: wie een pagina mag bewerken, mag haar adres
 * kiezen zolang het vrij is. Slugs zijn globaal uniek, dus een bezette slug is
 * verwachte invoer en komt als `SLUG_TAKEN` terug, niet als serverfout.
 *
 * Publiceren is een APART recht (`pages.publish` of `pages.manage`). Wie dat niet
 * heeft, stuurt het veld niet mee en dan blijft de publicatiestatus staan zoals
 * ze is. Dat is bewust geen "afwezig = uit": anders zou een gewone bewerker een
 * gepubliceerde pagina offline halen door gewoon zijn rollen op te slaan.
 */
export async function savePageSettingsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireSession();
  const parsed = pageSettingsSchema.safeParse({
    id: formData.get("id"),
    slug: formData.get("slug"),
    needsYearlyEdit: formData.get("needsYearlyEdit") === "on",
    published: formData.get("published"),
    editorRoleIds: formData.getAll("editorRoleIds").map(String),
  });
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  const data = parsed.data;

  const page = await prisma.page.findUnique({
    where: { id: data.id },
    select: { publishedAt: true, editorRoles: { select: { roleId: true } } },
  });
  if (!page) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  if (!canEditPageContent(session, page)) throw new Error("FORBIDDEN");

  // Publiceren mag enkel met het aparte recht; een gepost `published`-veld van
  // iemand anders wordt genegeerd, niet geweigerd (het formulier toont het veld
  // dan gewoon niet).
  const mayPublish = canPublishPages(session);
  const publishedAt =
    mayPublish && data.published != null
      ? data.published === "on"
        ? (page.publishedAt ?? new Date())
        : null
      : undefined;

  // Dubbels eruit: (pageId, roleId) is de primaire sleutel, dus een dubbele rol
  // zou de create laten klappen op een unique violation.
  const roleIds = [...new Set(data.editorRoleIds)];

  // Onbestaande rol-id's zijn ongeldige invoer, geen serverfout: zonder deze
  // check wordt het een FK-violation en dus een error boundary.
  if (roleIds.length > 0) {
    const known = await prisma.role.count({ where: { id: { in: roleIds } } });
    if (known !== roleIds.length) return saveError("INVALID_INPUT" satisfies ContentErrorCode);
  }

  try {
    await prisma.page.update({
      where: { id: data.id },
      data: {
        slug: data.slug,
        needsYearlyEdit: data.needsYearlyEdit,
        // `undefined` = kolom niet aanraken (geen publicatierecht of veld niet
        // meegestuurd). Enkel de eerste publicatie stempelen: een latere save
        // mag de publicatiedatum niet verzetten.
        publishedAt,
        editorRoles: { deleteMany: {}, create: roleIds.map((roleId) => ({ roleId })) },
      },
    });
  } catch (err) {
    if (isUniqueViolation(err, "slug")) return saveError("SLUG_TAKEN" satisfies ContentErrorCode);
    throw err;
  }

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
