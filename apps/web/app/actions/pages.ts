'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma, HEADER_TABS } from '@vtk/db';
import { requireAnyPermission, requirePermission, requireSession } from '@/lib/session';
import { canEditPageContent, canPublishPages } from '@/lib/pageAccess';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import { isEditableDestination } from '@/lib/href';
import { readImageField, resolveImageKey } from '@/lib/imageField';
import { describeChanges, logAudit } from '@/lib/audit';
import { deleteObject } from '@vtk/storage';

/** Foutcodes die /admin/inhoud en /admin/paginas op vertaalde meldingen mappen. */
export type ContentErrorCode = 'INVALID_INPUT' | 'SLUG_TAKEN' | 'CODE_TAKEN' | 'INVALID_URL';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Leeg tiptap-document voor de legacy JSON-kolom van nieuwe pagina's. */
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

/**
 * Verwijdert objecten uit storage nadat hun rij weg is. Best-effort en bewust
 * na de databasewijziging: faalt de bucket even, dan blijft de verwijdering
 * geldig en houden we hoogstens een wees over. Andersom (eerst storage) zou een
 * mislukte delete een pagina met kapotte bijlagen opleveren.
 *
 * Enkel voor keys die één rij *bezit*: een bijlage en een kaartfoto horen bij
 * precies één pagina. Afbeeldingen die in de markdown geplakt zijn, staan hier
 * bewust niet bij; die zijn enkel als URL in tekst bekend en kunnen evengoed in
 * de inhoud van iets anders staan.
 */
async function deleteStoredObjects(keys: (string | null | undefined)[]): Promise<void> {
  await Promise.allSettled(keys.filter((k): k is string => Boolean(k)).map((k) => deleteObject(k)));
}

/**
 * Welke foutcode een mislukte zod-parse verdient. Een ongeldig knopadres is een
 * typfout in één veld, geen kapot formulier: dat verdient een melding die zegt
 * wat er mag staan, niet het generieke "controleer je invoer".
 */
function parseErrorCode(error: z.ZodError): ContentErrorCode {
  return error.issues.some((issue) => issue.message === 'INVALID_URL')
    ? 'INVALID_URL'
    : 'INVALID_INPUT';
}

/** `P2002` op een bepaald veld: de unieke constraint die Prisma noemt. */
function isUniqueViolation(err: unknown, field: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    String(err.meta?.target ?? '').includes(field)
  );
}

/** Velden die het logboek bij naam noemt als iemand een pagina bewerkt. */
const PAGE_FIELD_LABELS: Record<string, string> = {
  slug: 'slug',
  headerTabId: 'categorie',
  visibleInHeader: 'zichtbaar in het menu',
  titleNl: 'titel',
  titleEn: 'Engelse titel',
  excerptNl: 'samenvatting',
  excerptEn: 'Engelse samenvatting',
  ctaLabelNl: 'knoptekst',
  ctaLabelEn: 'Engelse knoptekst',
  ctaUrl: 'knoplink',
  needsYearlyEdit: 'jaarlijks nakijken',
  order: 'volgorde',
  published: 'publicatie',
};

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
  ctaLabelNl: z.string().optional().nullable(),
  ctaLabelEn: z.string().optional().nullable(),
  // Anders dan bij een headertab mag dit ook een pad op deze site zijn: de knop
  // op Shiften wijst naar /shift, die op Uitleendienst naar een andere host.
  ctaUrl: z
    .string()
    .refine((v) => v === '' || isEditableDestination(v), { message: 'INVALID_URL' })
    .optional()
    .nullable(),
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
  await requirePermission('pages.manage');
  const parsed = saveSchema.safeParse({
    id: formData.get('id'),
    slug: formData.get('slug'),
    headerTabId: formData.get('headerTabId') || null,
    visibleInHeader: formData.get('visibleInHeader') === 'on',
    titleNl: formData.get('titleNl'),
    titleEn: formData.get('titleEn') || null,
    excerptNl: formData.get('excerptNl') || null,
    excerptEn: formData.get('excerptEn') || null,
    ctaLabelNl: formData.get('ctaLabelNl') || null,
    ctaLabelEn: formData.get('ctaLabelEn') || null,
    ctaUrl: formData.get('ctaUrl') || null,
    published: formData.get('published') === 'on',
    needsYearlyEdit: formData.get('needsYearlyEdit') === 'on',
    editorRoleIds: formData.getAll('editorRoleIds').map(String),
    order: formData.get('order') || 0,
  });
  if (!parsed.success) return saveError(parseErrorCode(parsed.error));
  const data = parsed.data;

  const existing = await prisma.page.findUnique({
    where: { id: data.id },
    select: {
      publishedAt: true,
      slug: true,
      headerTabId: true,
      visibleInHeader: true,
      titleNl: true,
      titleEn: true,
      excerptNl: true,
      excerptEn: true,
      ctaLabelNl: true,
      ctaLabelEn: true,
      ctaUrl: true,
      needsYearlyEdit: true,
      order: true,
    },
  });
  if (!existing) return saveError('INVALID_INPUT' satisfies ContentErrorCode);

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
        ctaLabelNl: data.ctaLabelNl || null,
        ctaLabelEn: data.ctaLabelEn || null,
        ctaUrl: data.ctaUrl || null,
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
    if (isUniqueViolation(err, 'slug')) return saveError('SLUG_TAKEN' satisfies ContentErrorCode);
    throw err;
  }

  await logAudit({
    action: 'update',
    entity: 'page',
    entityId: data.id,
    target: data.titleNl,
    summary: describeChanges(
      { ...existing, published: existing.publishedAt !== null },
      {
        ...data,
        headerTabId: data.headerTabId || null,
        ctaLabelNl: data.ctaLabelNl || null,
        ctaLabelEn: data.ctaLabelEn || null,
        ctaUrl: data.ctaUrl || null,
      },
      PAGE_FIELD_LABELS,
    ),
  });

  revalidatePath('/', 'layout');
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
  const session = await requirePermission('pages.delete');
  const id = formData.get('id') as string;
  if (!id) return saveError('INVALID_INPUT' satisfies ContentErrorCode);

  const page = await prisma.page.findUnique({
    where: { id },
    select: {
      titleNl: true,
      slug: true,
      imageKey: true,
      assets: { select: { storageKey: true } },
      editorRoles: { select: { roleId: true } },
    },
  });
  if (!page) return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  if (!canEditPageContent(session, page)) throw new Error('FORBIDDEN');

  await prisma.page.delete({ where: { id } });

  await logAudit({
    action: 'delete',
    entity: 'page',
    entityId: id,
    target: page.titleNl,
    summary: `/${page.slug}, met ${page.assets.length} bijlage(n)`,
  });

  // `PageAsset` cascadeert in de database, maar de bestanden zelf niet: zonder
  // dit blijft elke PDF en elke kaartfoto van een verwijderde pagina voorgoed in
  // de bucket staan.
  await deleteStoredObjects([page.imageKey, ...page.assets.map((a) => a.storageKey)]);

  revalidatePath('/', 'layout');
  return saveOk();
}

/** Volgorde binnen een categorie; `ids` staat al in de gewenste volgorde. */
export async function reorderPagesAction(ids: string[]): Promise<void> {
  await requirePermission('pages.manage');
  await prisma.$transaction(
    ids.map((id, index) => prisma.page.update({ where: { id }, data: { order: index } }))
  );
  await logAudit({
    action: 'reorder',
    entity: 'page',
    target: `${ids.length} pagina's`,
    summary: 'volgorde binnen een categorie gewijzigd',
  });
  revalidatePath('/', 'layout');
}

/**
 * Een pagina naar een andere categorie hangen (of losmaken met `null`). De pagina
 * gaat achteraan: haar oude volgnummer slaat op de vorige categorie en zou hier
 * een willekeurige plek in het midden opleveren.
 */
export async function movePageToTabAction(
  pageId: string,
  headerTabId: string | null
): Promise<void> {
  await requirePermission('pages.manage');
  const [lastPage, lastLink] = await Promise.all([
    prisma.page.findFirst({
      where: { headerTabId },
      orderBy: { order: 'desc' },
      select: { order: true },
    }),
    headerTabId
      ? prisma.headerTabLink.findFirst({
          where: { tabId: headerTabId },
          orderBy: { order: 'desc' },
          select: { order: true },
        })
      : null,
  ]);
  const maxOrder = Math.max(lastPage?.order ?? -1, lastLink?.order ?? -1);
  const page = await prisma.page.update({
    where: { id: pageId },
    data: { headerTabId, order: maxOrder + 1 },
    select: { titleNl: true },
  });
  const tab = headerTabId
    ? await prisma.headerTab.findUnique({ where: { id: headerTabId }, select: { labelNl: true } })
    : null;
  await logAudit({
    action: 'update',
    entity: 'page',
    entityId: pageId,
    target: page.titleNl,
    summary: tab ? `verplaatst naar categorie ${tab.labelNl}` : 'losgekoppeld van haar categorie',
  });
  revalidatePath('/', 'layout');
}

/**
 * Een bestaande pagina expliciet uit haar categorie halen. Alleen de koppeling
 * en het categoriegebonden volgnummer wijzigen; de pagina en al haar inhoud,
 * bijlagen en bewerkrollen blijven bestaan.
 */
export async function unlinkPageFromTabAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  await requirePermission('pages.manage');
  const id = formData.get('id');
  if (typeof id !== 'string' || !id) {
    return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  }

  const result = await prisma.page.updateMany({
    where: { id, headerTabId: { not: null } },
    data: { headerTabId: null, order: 0 },
  });
  if (result.count !== 1) {
    return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  }

  const unlinked = await prisma.page.findUnique({ where: { id }, select: { titleNl: true } });
  await logAudit({
    action: 'update',
    entity: 'page',
    entityId: id,
    target: unlinked?.titleNl ?? id,
    summary: 'losgekoppeld van haar categorie',
  });

  revalidatePath('/', 'layout');
  return saveOk();
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
  formData: FormData
): Promise<SaveState> {
  const session = await requireSession();
  const parsed = contentSchema.safeParse({
    id: formData.get('id'),
    titleNl: formData.get('titleNl'),
    titleEn: formData.get('titleEn') || null,
    contentMdNl: formData.get('contentMdNl') ?? '',
    contentMdEn: formData.get('contentMdEn') || null,
  });
  if (!parsed.success) return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  const data = parsed.data;

  const page = await prisma.page.findUnique({
    where: { id: data.id },
    select: {
      titleNl: true,
      titleEn: true,
      contentMdNl: true,
      contentMdEn: true,
      editorRoles: { select: { roleId: true } },
    },
  });
  if (!page) return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  if (!canEditPageContent(session, page)) throw new Error('FORBIDDEN');

  const contentMdEn = data.contentMdEn && data.contentMdEn.trim() !== '' ? data.contentMdEn : null;
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

  await logAudit({
    action: 'update',
    entity: 'page',
    entityId: data.id,
    target: data.titleNl,
    summary: describeChanges(
      page,
      { ...data, contentMdEn },
      {
        titleNl: 'titel',
        titleEn: 'Engelse titel',
        contentMdNl: 'inhoud',
        contentMdEn: 'Engelse inhoud',
      },
    ),
  });

  revalidatePath('/', 'layout');
  return saveOk();
}

// ---- Pagina's aanmaken & instellen vanuit de editor -------------------------

const createPageSchema = z.object({
  titleNl: z.string().min(1),
  slug: z.string().min(1).regex(SLUG_REGEX),
  locale: z.enum(['nl', 'en']).optional().default('nl'),
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
  const session = await requireAnyPermission(['pages.edit', 'pages.editAll']);
  const parsed = createPageSchema.safeParse({
    titleNl: formData.get('titleNl'),
    slug: formData.get('slug'),
    locale: formData.get('locale') || 'nl',
  });
  if (!parsed.success) return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  const data = parsed.data;

  let id: string;
  try {
    const created = await prisma.page.create({
      data: {
        slug: data.slug,
        titleNl: data.titleNl,
        contentMdNl: '',
        contentJsonNl: EMPTY_DOC as Prisma.InputJsonValue,
        createdById: session.user.id,
        editorRoles: { create: session.roleIds.map((roleId) => ({ roleId })) },
      },
      select: { id: true },
    });
    id = created.id;
  } catch (err) {
    if (isUniqueViolation(err, 'slug')) return saveError('SLUG_TAKEN' satisfies ContentErrorCode);
    throw err;
  }

  await logAudit({
    action: 'create',
    entity: 'page',
    entityId: id,
    target: data.titleNl,
    summary: `/${data.slug}`,
  });

  revalidatePath('/', 'layout');
  // Buiten de try/catch: redirect() werkt via een throw. De navigatie naar de
  // verse editor is meteen de bevestiging, dus geen toast nodig.
  redirect(`${data.locale === 'nl' ? '' : '/en'}/admin/paginas/${id}`);
}

// ---- Pagina-instellingen vanuit de inhoudseditor ----------------------------

const pageSettingsSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1).regex(SLUG_REGEX),
  needsYearlyEdit: z.coerce.boolean().optional().default(false),
  // Ontbreekt = "niet aangeraakt", niet "depubliceren". Zie de action.
  published: z.enum(['on', 'off']).nullable().optional(),
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
  formData: FormData
): Promise<SaveState> {
  const session = await requireSession();
  const parsed = pageSettingsSchema.safeParse({
    id: formData.get('id'),
    slug: formData.get('slug'),
    needsYearlyEdit: formData.get('needsYearlyEdit') === 'on',
    published: formData.get('published'),
    editorRoleIds: formData.getAll('editorRoleIds').map(String),
  });
  if (!parsed.success) return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  const data = parsed.data;

  const page = await prisma.page.findUnique({
    where: { id: data.id },
    select: {
      titleNl: true,
      slug: true,
      needsYearlyEdit: true,
      publishedAt: true,
      editorRoles: { select: { roleId: true } },
    },
  });
  if (!page) return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  if (!canEditPageContent(session, page)) throw new Error('FORBIDDEN');

  // Publiceren mag enkel met het aparte recht; een gepost `published`-veld van
  // iemand anders wordt genegeerd, niet geweigerd (het formulier toont het veld
  // dan gewoon niet).
  const mayPublish = canPublishPages(session);
  const publishedAt =
    mayPublish && data.published != null
      ? data.published === 'on'
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
    if (known !== roleIds.length) return saveError('INVALID_INPUT' satisfies ContentErrorCode);
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
    if (isUniqueViolation(err, 'slug')) return saveError('SLUG_TAKEN' satisfies ContentErrorCode);
    throw err;
  }

  await logAudit({
    action: 'update',
    entity: 'page',
    entityId: data.id,
    target: page.titleNl,
    summary:
      describeChanges(
        {
          slug: page.slug,
          needsYearlyEdit: page.needsYearlyEdit,
          published: page.publishedAt !== null,
          editorRoles: page.editorRoles.map((r) => r.roleId).sort(),
        },
        {
          slug: data.slug,
          needsYearlyEdit: data.needsYearlyEdit,
          published: publishedAt === undefined ? page.publishedAt !== null : publishedAt !== null,
          editorRoles: [...roleIds].sort(),
        },
        {
          slug: 'slug',
          needsYearlyEdit: 'jaarlijks nakijken',
          published: 'publicatie',
          editorRoles: 'bewerkrollen',
        },
      ) ?? 'instellingen opgeslagen',
  });

  revalidatePath('/', 'layout');
  return saveOk();
}

/**
 * De foto van deze pagina: ze verschijnt als thumbnail op haar kaart op de
 * categoriepagina (`/info`, ...). Staat bewust apart van de inhoud en van de
 * instellingen: een foto vervangen is één handeling en hoort de markdown niet
 * mee op te slaan.
 *
 * Rechten volgen de inhoud (`canEditPageContent`), niet `pages.manage`: wie de
 * tekst van een pagina schrijft, kiest ook de foto erbij.
 */
export async function savePageImageAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireSession();
  const id = formData.get('id');
  const image = readImageField(formData);

  if (typeof id !== 'string' || !id || image.kind === 'invalid') {
    return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  }

  const page = await prisma.page.findUnique({
    where: { id },
    select: { titleNl: true, imageKey: true, editorRoles: { select: { roleId: true } } },
  });
  if (!page) return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  if (!canEditPageContent(session, page)) throw new Error('FORBIDDEN');

  const imageKey = resolveImageKey(image, page.imageKey);

  await prisma.page.update({ where: { id }, data: { imageKey } });

  if (imageKey !== page.imageKey) {
    await logAudit({
      action: 'update',
      entity: 'page',
      entityId: id,
      target: page.titleNl,
      summary: imageKey ? 'foto van de pagina vervangen' : 'foto van de pagina verwijderd',
    });
  }

  // De vervangen foto uit storage halen.
  if (page.imageKey && page.imageKey !== imageKey) await deleteStoredObjects([page.imageKey]);

  revalidatePath('/', 'layout');
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
  if (session.user.isSuperAdmin || session.permissions.includes('pages.manage')) return;
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { editorRoles: { select: { roleId: true } } },
  });
  if (!page || !canEditPageContent(session, page)) throw new Error('FORBIDDEN');
}

const assetSchema = z.object({
  pageId: z.string(),
  storageKey: z.string(),
  kind: z.enum(['EMBEDDED_PDF', 'DOWNLOAD']),
  labelNl: z.string().min(1),
  labelEn: z.string().optional().nullable(),
  sizeBytes: z.coerce.number().optional().nullable(),
  mimeType: z.string().optional().nullable(),
});

export async function addPageAssetAction(formData: FormData): Promise<void> {
  const parsed = assetSchema.parse({
    pageId: formData.get('pageId'),
    storageKey: formData.get('storageKey'),
    kind: formData.get('kind'),
    labelNl: formData.get('labelNl'),
    labelEn: formData.get('labelEn') || null,
    sizeBytes: formData.get('sizeBytes') || null,
    mimeType: formData.get('mimeType') || null,
  });
  await requirePageAssetAccess(parsed.pageId);
  const asset = await prisma.pageAsset.create({ data: parsed });
  const page = await prisma.page.findUnique({
    where: { id: parsed.pageId },
    select: { titleNl: true },
  });
  await logAudit({
    action: 'create',
    entity: 'pageAsset',
    entityId: asset.id,
    target: parsed.labelNl,
    summary: page ? `bijlage toegevoegd aan pagina ${page.titleNl}` : 'bijlage toegevoegd',
  });
  revalidatePath('/admin/header');
  revalidatePath('/admin/inhoud');
  revalidatePath('/admin/paginas');
  revalidatePath('/', 'layout');
}

export async function deletePageAssetAction(formData: FormData): Promise<void> {
  const id = formData.get('id') as string;
  if (!id) return;
  // De toegangscheck hangt aan de pagina van de bijlage zelf, niet aan wat de
  // client als pageId meestuurt.
  const asset = await prisma.pageAsset.findUnique({
    where: { id },
    select: {
      pageId: true,
      storageKey: true,
      labelNl: true,
      page: { select: { titleNl: true } },
    },
  });
  if (!asset) return;
  await requirePageAssetAccess(asset.pageId);
  await prisma.pageAsset.delete({ where: { id } });
  await deleteStoredObjects([asset.storageKey]);
  await logAudit({
    action: 'delete',
    entity: 'pageAsset',
    entityId: id,
    target: asset.labelNl,
    summary: `bijlage verwijderd van pagina ${asset.page.titleNl}`,
  });
  revalidatePath('/admin/header');
  revalidatePath('/admin/inhoud');
  revalidatePath('/admin/paginas');
  revalidatePath('/', 'layout');
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
  visibleNl: z.coerce.boolean().default(true),
  visibleEn: z.coerce.boolean().default(true),
  externalUrl: z
    .string()
    .refine((v) => v === '' || isEditableDestination(v), { message: 'INVALID_URL' })
    .optional()
    .nullable(),
  introNl: z.string().optional().nullable(),
  introEn: z.string().optional().nullable(),
  ctaLabelNl: z.string().optional().nullable(),
  ctaLabelEn: z.string().optional().nullable(),
  // Zelfde knop als op een pagina, dus ook hier mag een pad op deze site staan.
  ctaUrl: z
    .string()
    .refine((v) => v === '' || isEditableDestination(v), { message: 'INVALID_URL' })
    .optional()
    .nullable(),
});

const HEADER_TAB_FIELD_LABELS: Record<string, string> = {
  slug: 'slug',
  labelNl: 'label',
  labelEn: 'Engels label',
  visible: 'zichtbaarheid',
  visibleNl: 'zichtbaar in NL',
  visibleEn: 'zichtbaar in EN',
  externalUrl: 'externe link',
  introNl: 'introtekst',
  introEn: 'Engelse introtekst',
  ctaLabelNl: 'knoptekst',
  ctaLabelEn: 'Engelse knoptekst',
  ctaUrl: 'knoplink',
  links: 'menu-items',
};

export async function saveHeaderTabAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  await requireAnyPermission(['pages.manage', 'header.manage']);
  const visibleNl = formData.get('visibleNl') === 'on';
  const visibleEn = formData.get('visibleEn') === 'on';
  // Als visible niet expliciet gepost is, is de tab zichtbaar zolang minstens 1 taal aanstaat
  const visible = formData.has('visible') ? formData.get('visible') === 'on' : (visibleNl || visibleEn);

  const parsed = headerSchema.safeParse({
    id: (formData.get('id') as string) || undefined,
    code: formData.get('code'),
    slug: formData.get('slug'),
    labelNl: formData.get('labelNl'),
    labelEn: formData.get('labelEn'),
    visible,
    visibleNl,
    visibleEn,
    externalUrl: formData.get('externalUrl') || null,
    introNl: formData.get('introNl') || null,
    introEn: formData.get('introEn') || null,
    ctaLabelNl: formData.get('ctaLabelNl') || null,
    ctaLabelEn: formData.get('ctaLabelEn') || null,
    ctaUrl: formData.get('ctaUrl') || null,
  });
  if (!parsed.success) return saveError(parseErrorCode(parsed.error));
  const p = parsed.data;

  const data = {
    slug: p.slug,
    labelNl: p.labelNl,
    labelEn: p.labelEn,
    visible: p.visible,
    visibleNl: p.visibleNl,
    visibleEn: p.visibleEn,
    externalUrl: p.externalUrl || null,
    introNl: p.introNl || null,
    introEn: p.introEn || null,
    ctaLabelNl: p.ctaLabelNl || null,
    ctaLabelEn: p.ctaLabelEn || null,
    ctaUrl: p.ctaUrl || null,
  };

  // Extra menu-items komen als geïndexeerde velden binnen; de lijst in het
  // formulier is de volledige waarheid, dus ze wordt in haar geheel vervangen.
  const linkCount = Math.min(Number(formData.get('linkCount')) || 0, 20);
  const links: Array<{ labelNl: string; labelEn: string; url: string; order: number }> = [];
  for (let i = 0; i < linkCount; i += 1) {
    const labelNl = String(formData.get(`link-${i}-labelNl`) ?? '').trim();
    const labelEn = String(formData.get(`link-${i}-labelEn`) ?? '').trim();
    const url = String(formData.get(`link-${i}-url`) ?? '').trim();
    if (!labelNl || !url) continue;
    if (!isEditableDestination(url)) return saveError('INVALID_URL' satisfies ContentErrorCode);
    // Twee items naar dezelfde URL kunnen niet (unieke index) en zeggen ook niets.
    if (links.some((link) => link.url === url)) continue;
    links.push({ labelNl, labelEn: labelEn || labelNl, url, order: links.length });
  }

  try {
    if (p.id) {
      // `code` bewust niet bijwerkbaar: het is de sleutel waarop de seed upsert
      // en waarop code als `code: "AANBOD"` filtert.
      const tabId = p.id;
      const before = await prisma.headerTab.findUnique({
        where: { id: tabId },
        include: { links: { select: { labelNl: true, url: true }, orderBy: { order: 'asc' } } },
      });
      await prisma.$transaction([
        prisma.headerTab.update({ where: { id: tabId }, data }),
        prisma.headerTabLink.deleteMany({ where: { tabId } }),
        ...links.map((link) => prisma.headerTabLink.create({ data: { ...link, tabId } })),
      ]);
      await logAudit({
        action: 'update',
        entity: 'headerTab',
        entityId: tabId,
        target: p.labelNl,
        summary: before
          ? describeChanges(
              { ...before, links: before.links.map((l) => `${l.labelNl}|${l.url}`) },
              { ...data, links: links.map((l) => `${l.labelNl}|${l.url}`) },
              HEADER_TAB_FIELD_LABELS,
            )
          : null,
      });
    } else {
      const last = await prisma.headerTab.findFirst({
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      const created = await prisma.headerTab.create({
        data: { ...data, code: p.code, order: (last?.order ?? -1) + 1 },
      });
      if (links.length > 0) {
        await prisma.headerTabLink.createMany({
          data: links.map((link) => ({ ...link, tabId: created.id })),
        });
      }
      await logAudit({
        action: 'create',
        entity: 'headerTab',
        entityId: created.id,
        target: p.labelNl,
        summary: `menucategorie /${p.slug}`,
      });
    }
  } catch (err) {
    if (isUniqueViolation(err, 'slug')) return saveError('SLUG_TAKEN' satisfies ContentErrorCode);
    if (isUniqueViolation(err, 'code')) return saveError('CODE_TAKEN' satisfies ContentErrorCode);
    throw err;
  }

  revalidatePath('/', 'layout');
  return saveOk();
}

export async function deleteHeaderTabAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  await requireAnyPermission(['pages.manage', 'header.manage']);
  const id = formData.get('id') as string;
  if (!id) return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  // Page.headerTabId is onDelete: SetNull, dus pagina's blijven bestaan en komen
  // onder "Niet gekoppeld" te staan.
  const existing = await prisma.headerTab.findUnique({
    where: { id },
    select: { imageKey: true, labelNl: true, _count: { select: { pages: true } } },
  });
  await prisma.headerTab.delete({ where: { id } });
  await deleteStoredObjects([existing?.imageKey]);
  await logAudit({
    action: 'delete',
    entity: 'headerTab',
    entityId: id,
    target: existing?.labelNl ?? id,
    summary: existing
      ? `${existing._count.pages} pagina('s) losgekoppeld, die blijven bestaan`
      : null,
  });
  revalidatePath('/', 'layout');
  return saveOk();
}

/** Volgorde van de tabs in de hoofdnavigatie. */
export async function reorderHeaderTabsAction(ids: string[]): Promise<void> {
  await requireAnyPermission(['pages.manage', 'header.manage']);
  await prisma.$transaction(
    ids.map((id, index) => prisma.headerTab.update({ where: { id }, data: { order: index } }))
  );
  await logAudit({
    action: 'reorder',
    entity: 'headerTab',
    target: `${ids.length} menucategorieën`,
    summary: 'volgorde in de hoofdnavigatie gewijzigd',
  });
  revalidatePath('/', 'layout');
}

/**
 * Persisteert de statische standaardtabs (`HEADER_TABS`) in de database. De nav
 * valt terug op die defaults zolang de tabel leeg is; door ze te importeren
 * worden ze bewerkbaar en lezen nav én beheerpagina dezelfde rijen. Idempotent:
 * bestaande codes/slugs worden overgeslagen.
 */
export async function importDefaultHeaderTabsAction(): Promise<void> {
  await requireAnyPermission(['pages.manage', 'header.manage']);
  await prisma.headerTab.createMany({
    data: HEADER_TABS.map((t) => ({
      code: t.code,
      slug: t.slug,
      labelNl: t.labelNl,
      labelEn: t.labelEn,
      order: t.order,
      visible: t.visible ?? true,
      visibleNl: t.visibleNl ?? true,
      visibleEn: t.visibleEn ?? true,
      introNl: t.introNl ?? null,
      introEn: t.introEn ?? null,
      ctaLabelNl: t.ctaLabelNl ?? null,
      ctaLabelEn: t.ctaLabelEn ?? null,
      ctaUrl: t.ctaUrl ?? null,
    })),
    skipDuplicates: true,
  });
  await logAudit({
    action: 'import',
    entity: 'headerTab',
    target: 'standaardmenu',
    summary: `${HEADER_TABS.length} standaardcategorieën geïmporteerd (bestaande overgeslagen)`,
  });
  revalidatePath('/', 'layout');
}

/**
 * Voegt een vaste route of externe link toe aan een menucategorie.
 */
export async function addHeaderTabLinkAction(
  tabId: string,
  link: { labelNl: string; labelEn?: string | null; url: string }
): Promise<SaveState> {
  await requireAnyPermission(['pages.manage', 'header.manage']);
  const labelNl = link.labelNl.trim();
  const labelEn = (link.labelEn && link.labelEn.trim()) || labelNl;
  const url = link.url.trim();
  if (!labelNl || !url) return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  if (!isEditableDestination(url)) return saveError('INVALID_URL' satisfies ContentErrorCode);

  const tab = await prisma.headerTab.findUnique({ where: { id: tabId } });
  if (!tab) return saveError('INVALID_INPUT' satisfies ContentErrorCode);

  const existing = await prisma.headerTabLink.findFirst({
    where: { tabId, url },
  });
  if (existing) {
    await prisma.headerTabLink.update({
      where: { id: existing.id },
      data: { labelNl, labelEn },
    });
  } else {
    const [lastPage, lastLink] = await Promise.all([
      prisma.page.findFirst({
        where: { headerTabId: tabId },
        orderBy: { order: 'desc' },
        select: { order: true },
      }),
      prisma.headerTabLink.findFirst({
        where: { tabId },
        orderBy: { order: 'desc' },
        select: { order: true },
      }),
    ]);
    const maxOrder = Math.max(lastPage?.order ?? -1, lastLink?.order ?? -1);
    await prisma.headerTabLink.create({
      data: {
        tabId,
        labelNl,
        labelEn,
        url,
        order: maxOrder + 1,
      },
    });
  }

  await logAudit({
    action: 'update',
    entity: 'headerTab',
    entityId: tabId,
    target: tab.labelNl,
    summary: `item "${labelNl}" (${url}) toegevoegd aan categorie ${tab.labelNl}`,
  });

  revalidatePath('/', 'layout');
  return saveOk();
}

/**
 * Verwijdert een menu-item (vaste route of externe link) uit een categorie.
 */
export async function deleteHeaderTabLinkAction(linkId: string): Promise<SaveState> {
  await requireAnyPermission(['pages.manage', 'header.manage']);
  const link = await prisma.headerTabLink.findUnique({
    where: { id: linkId },
    include: { tab: { select: { labelNl: true } } },
  });
  if (!link) return saveError('INVALID_INPUT' satisfies ContentErrorCode);

  await prisma.headerTabLink.delete({ where: { id: linkId } });

  await logAudit({
    action: 'update',
    entity: 'headerTab',
    entityId: link.tabId,
    target: link.tab.labelNl,
    summary: `item "${link.labelNl}" (${link.url}) verwijderd uit categorie ${link.tab.labelNl}`,
  });

  revalidatePath('/', 'layout');
  return saveOk();
}

/**
 * Volgorde van vaste links binnen een categorie; `ids` staat al in de gewenste volgorde.
 */
export async function reorderHeaderTabLinksAction(ids: string[]): Promise<void> {
  await requireAnyPermission(['pages.manage', 'header.manage']);
  await prisma.$transaction(
    ids.map((id, index) => prisma.headerTabLink.update({ where: { id }, data: { order: index } }))
  );
  await logAudit({
    action: 'reorder',
    entity: 'headerTab',
    target: `${ids.length} vaste links`,
    summary: 'volgorde van menu-items binnen een categorie gewijzigd',
  });
  revalidatePath('/', 'layout');
}

/**
 * Volgorde van gemengde items (pagina's én vaste links) binnen een categorie.
 * `items` bevat alle items van die categorie in de gewenste gecombineerde volgorde.
 */
export async function reorderTabItemsAction(
  tabId: string,
  items: Array<{ id: string; kind: 'page' | 'link' }>
): Promise<void> {
  await requireAnyPermission(['pages.manage', 'header.manage']);
  await prisma.$transaction(
    items.map((item, index) =>
      item.kind === 'page'
        ? prisma.page.update({ where: { id: item.id }, data: { order: index } })
        : prisma.headerTabLink.update({ where: { id: item.id }, data: { order: index } })
    )
  );
  await logAudit({
    action: 'reorder',
    entity: 'headerTab',
    entityId: tabId,
    target: `${items.length} menu-items`,
    summary: 'volgorde van menu-items binnen categorie gewijzigd',
  });
  revalidatePath('/', 'layout');
}

/**
 * Een vaste link naar een andere categorie verplaatsen.
 */
export async function moveHeaderTabLinkToTabAction(
  linkId: string,
  tabId: string
): Promise<void> {
  await requireAnyPermission(['pages.manage', 'header.manage']);
  const link = await prisma.headerTabLink.findUnique({
    where: { id: linkId },
    select: { id: true, tabId: true, url: true, labelNl: true },
  });
  if (!link || link.tabId === tabId) return;

  const conflict = await prisma.headerTabLink.findUnique({
    where: { tabId_url: { tabId, url: link.url } },
  });
  if (conflict) return;

  const [lastPage, lastLink] = await Promise.all([
    prisma.page.findFirst({
      where: { headerTabId: tabId },
      orderBy: { order: 'desc' },
      select: { order: true },
    }),
    prisma.headerTabLink.findFirst({
      where: { tabId },
      orderBy: { order: 'desc' },
      select: { order: true },
    }),
  ]);
  const maxOrder = Math.max(lastPage?.order ?? -1, lastLink?.order ?? -1);

  await prisma.headerTabLink.update({
    where: { id: linkId },
    data: { tabId, order: maxOrder + 1 },
  });

  await logAudit({
    action: 'update',
    entity: 'headerTab',
    entityId: tabId,
    target: link.labelNl,
    summary: `vaste link verplaatst naar andere categorie`,
  });

  revalidatePath('/', 'layout');
}

/**
 * Maakt direct een top-level header item (tab) aan die rechtstreeks linkt
 * naar een pagina (bv. /p/shiften), vaste route (/werkgroepen) of externe site.
 */
export async function addHeaderTabDirectAction(input: {
  labelNl: string;
  labelEn?: string | null;
  slug?: string | null;
  url: string;
}): Promise<SaveState> {
  await requireAnyPermission(['pages.manage', 'header.manage']);
  const labelNl = input.labelNl.trim();
  const labelEn = (input.labelEn && input.labelEn.trim()) || labelNl;
  const url = input.url.trim();
  if (!labelNl || !url) return saveError('INVALID_INPUT' satisfies ContentErrorCode);
  if (!isEditableDestination(url)) return saveError('INVALID_URL' satisfies ContentErrorCode);

  let rawSlug =
    (input.slug && input.slug.trim()) ||
    url
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^\/?(nl|en)\//i, '')
      .replace(/^\/?p\//i, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  rawSlug = rawSlug.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!rawSlug) rawSlug = `item-${Date.now()}`;

  const baseCode = rawSlug.toUpperCase().replace(/[^A-Z0-9]/g, '_') || 'HEADER_ITEM';
  let code = baseCode;
  let counter = 1;
  while (await prisma.headerTab.findUnique({ where: { code } })) {
    counter += 1;
    code = `${baseCode}_${counter}`;
  }

  let slug = rawSlug;
  let slugCounter = 1;
  while (await prisma.headerTab.findUnique({ where: { slug } })) {
    slugCounter += 1;
    slug = `${rawSlug}-${slugCounter}`;
  }

  const last = await prisma.headerTab.findFirst({
    orderBy: { order: 'desc' },
    select: { order: true },
  });

  const created = await prisma.headerTab.create({
    data: {
      code,
      slug,
      labelNl,
      labelEn,
      externalUrl: url,
      visible: true,
      visibleNl: true,
      visibleEn: true,
      order: (last?.order ?? -1) + 1,
    },
  });

  await logAudit({
    action: 'create',
    entity: 'headerTab',
    entityId: created.id,
    target: labelNl,
    summary: `header-item aangemaakt met directe link naar ${url}`,
  });

  revalidatePath('/', 'layout');
  return saveOk();
}

