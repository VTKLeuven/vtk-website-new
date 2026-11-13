'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { prisma } from '@vtk/db';
import { logAudit } from '@/lib/audit';
import { requirePermission, requireSession } from '@/lib/session';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import { currentWorkingYear } from '@/lib/workingYear';
import { overviewOf, toCents } from '@/lib/bo/budget/calc';
import { checksOf } from '@/lib/bo/budget/checks';
import { budgetSettingsSchema, parseBudgetContent } from '@/lib/bo/budget/schema';
import {
  budgetAccess,
  canEditBudget,
  getBudgetSettings,
  newShareToken,
  normalizeContent,
  saveBegroting,
  saveBudgetSettings,
  siteBudgetPostKeys,
} from '@/lib/bo/budget/server';
import { begrotingSheets } from '@/lib/bo/budget/begroting';
import { importBudgetWorkbook } from '@/lib/bo/budget/importSheet';
import { storeImportedBudget, type StoreOutcome } from '@/lib/bo/budget/importStore';
import { loadBoOverview } from '@/lib/bo/overview';
import { parseDocumentName } from '@/lib/bo/names';
import { resolvePostKeys } from '@/lib/bo/posts';
import { downloadSpreadsheet } from '@/lib/google/client';
import { getGoogleConfig } from '@/lib/google/config';
import type { Lookup } from '@/lib/bo/budget/prices';
import { lookupShopProduct } from '@/lib/priceCheck/fetch';
import { parseShopUrl } from '@/lib/priceCheck/shops';
import { templateContent } from '@/lib/bo/budget/templates';
import { BUDGET_TEMPLATES, type BudgetContent, type BudgetTemplate } from '@/lib/bo/budget/types';

/*
 * Acties voor budgetten op de site. Elke actie kijkt opnieuw na of de
 * gebruiker in de post zit (of Groep 5 is): een server action is een gewoon
 * POST-adres. Verwachte fouten (een budget dat iemand anders net wijzigde, een
 * indiening met open punten) komen als `saveError` terug, niet als throw.
 */

function revalidateBudgets(id?: string) {
  revalidatePath('/[locale]/admin/bestuursorgaan/mijn', 'page');
  revalidatePath('/[locale]/admin/bestuursorgaan', 'page');
  if (id) revalidatePath(`/[locale]/admin/bestuursorgaan/mijn/${id}`, 'page');
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function totals(content: BudgetContent, postKey: string, settings: Awaited<ReturnType<typeof getBudgetSettings>>) {
  const o = overviewOf(content, { postKey, settings });
  return { incomeCents: toCents(o.income), expenseCents: toCents(o.expense), totalCents: toCents(o.total) };
}

/** Een nieuw budget uit een sjabloon; daarna opent de editor. */
export async function createBoBudgetAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireSession();
  const nl = formData.get('locale') !== 'en';
  const postKey = field(formData, 'post');
  const title = field(formData, 'title');
  const template = field(formData, 'template') as BudgetTemplate;
  const targetDate = field(formData, 'targetDate');

  const settings = await getBudgetSettings();
  // Een proef: enkel Groep 5 en de posten die ze aanvinkte, starten een budget op de site.
  if (!postKey || !siteBudgetPostKeys(session, settings).includes(postKey)) return saveError('NOT_YOUR_POST');
  if (!title) return saveError('TITLE_REQUIRED');
  if (title.length > 200) return saveError('TITLE_TOO_LONG');
  if (!BUDGET_TEMPLATES.includes(template)) return saveError('UNKNOWN_TEMPLATE');
  if (targetDate && !DATE.test(targetDate)) return saveError('INVALID_DATE');

  const content = templateContent(template, nl);
  const budget = await prisma.boBudget.create({
    data: {
      workingYear: currentWorkingYear(),
      postKey,
      title,
      template,
      targetDate: targetDate ? new Date(`${targetDate}T00:00:00Z`) : null,
      content: content as unknown as Prisma.InputJsonValue,
      ...totals(content, postKey, settings),
      createdById: session.user.id,
    },
  });
  await logAudit({
    action: 'create',
    entity: 'boBudget',
    entityId: budget.id,
    target: title,
    summary: `Sjabloon ${template}`,
  });
  revalidateBudgets();
  // De editor openen is zelf de bevestiging; buiten elke try/catch.
  redirect(`${nl ? '' : '/en'}/admin/bestuursorgaan/mijn/${budget.id}`);
}

export type BudgetSaveResult = SaveState & { version?: string };

/**
 * Bewaart het hele budget. De editor roept dit een halve seconde na elke
 * wijziging aan. `version` is de `updatedAt` die de editor laatst kreeg: wijzigde
 * iemand anders het intussen, dan bewaart dit niets en zegt het dat.
 */
export async function saveBoBudgetAction(input: {
  id: string;
  version: string;
  title: string;
  targetDate: string | null;
  content: unknown;
  /** Een deellink om aan te passen, voor wie geen lid van de post is. */
  token?: string | null;
}): Promise<BudgetSaveResult> {
  const budget = await prisma.boBudget.findUnique({ where: { id: String(input.id) } });
  if (!budget) return saveError('NOT_FOUND');
  const access = await budgetAccess(budget, input.token);
  if (access?.level !== 'edit') return saveError('NOT_YOUR_POST');
  if (budget.status !== 'DRAFT') return saveError('ALREADY_SUBMITTED');
  if (budget.updatedAt.toISOString() !== input.version) return saveError('CHANGED_ELSEWHERE');

  const title = String(input.title ?? '').trim();
  if (!title) return saveError('TITLE_REQUIRED');
  if (title.length > 200) return saveError('TITLE_TOO_LONG');
  if (input.targetDate && !DATE.test(input.targetDate)) return saveError('INVALID_DATE');
  const parsed = parseBudgetContent(input.content);
  if (!parsed) return saveError('INVALID_CONTENT');
  // Elke berekening opnieuw uitgerekend: wat bewaard wordt, klopt met de formules.
  const content = normalizeContent(parsed);

  const settings = await getBudgetSettings();
  // Enkel bewaren als niemand er intussen aan kwam: de voorwaarde op updatedAt
  // maakt het nalezen hierboven en het schrijven één stap.
  const { count } = await prisma.boBudget.updateMany({
    where: { id: budget.id, updatedAt: budget.updatedAt, status: 'DRAFT' },
    data: {
      title,
      targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00Z`) : null,
      content: content as unknown as Prisma.InputJsonValue,
      ...totals(content, budget.postKey, settings),
    },
  });
  if (count === 0) return saveError('CHANGED_ELSEWHERE');
  const fresh = await prisma.boBudget.findUnique({ where: { id: budget.id }, select: { updatedAt: true } });
  revalidatePath('/[locale]/admin/bestuursorgaan/mijn', 'page');
  return { ...saveOk(), version: fresh!.updatedAt.toISOString() };
}

/** Indienen voor een BO: enkel zonder open punten, en met een datum. */
export async function submitBoBudgetAction(input: {
  id: string;
  version: string;
  locale: string;
}): Promise<BudgetSaveResult> {
  const session = await requireSession();
  const nl = input.locale !== 'en';
  const budget = await prisma.boBudget.findUnique({ where: { id: input.id } });
  if (!budget) return saveError('NOT_FOUND');
  if (!canEditBudget(session, budget.postKey)) return saveError('NOT_YOUR_POST');
  if (budget.status !== 'DRAFT') return saveError('ALREADY_SUBMITTED');
  if (budget.updatedAt.toISOString() !== input.version) return saveError('CHANGED_ELSEWHERE');
  if (!budget.targetDate) return saveError('TARGET_REQUIRED');
  const content = parseBudgetContent(budget.content);
  if (!content) return saveError('INVALID_CONTENT');
  const settings = await getBudgetSettings();
  const open = checksOf(content, { postKey: budget.postKey, settings }, nl).filter((c) => c.level === 'block');
  if (open.length > 0) return saveError('OPEN_CHECKS');

  const updated = await prisma.boBudget.update({
    where: { id: budget.id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  });
  await logAudit({
    action: 'send',
    entity: 'boBudget',
    entityId: budget.id,
    target: budget.title,
    summary: `Ingediend voor het BO van ${budget.targetDate.toISOString().slice(0, 10)}`,
  });
  revalidateBudgets(budget.id);
  return { ...saveOk(), version: updated.updatedAt.toISOString() };
}

/** Terug in opmaak: de post wil nog iets wijzigen. */
export async function reopenBoBudgetAction(input: { id: string }): Promise<BudgetSaveResult> {
  const session = await requireSession();
  const budget = await prisma.boBudget.findUnique({ where: { id: input.id } });
  if (!budget) return saveError('NOT_FOUND');
  if (!canEditBudget(session, budget.postKey)) return saveError('NOT_YOUR_POST');
  const updated = await prisma.boBudget.update({
    where: { id: budget.id },
    data: { status: 'DRAFT', submittedAt: null },
  });
  await logAudit({
    action: 'update',
    entity: 'boBudget',
    entityId: budget.id,
    target: budget.title,
    summary: 'Terug in opmaak gezet',
  });
  revalidateBudgets(budget.id);
  return { ...saveOk(), version: updated.updatedAt.toISOString() };
}

/**
 * Een budget weggooien. Drive en de andere budgetten blijven zoals ze zijn.
 * Daarna terug naar "Mijn budgetten": dat scherm bestaat nog, de editor niet.
 */
export async function deleteBoBudgetAction(formData: FormData): Promise<SaveState> {
  const session = await requireSession();
  const id = field(formData, 'id');
  const nl = formData.get('locale') !== 'en';
  const budget = await prisma.boBudget.findUnique({ where: { id } });
  if (!budget) return saveError('NOT_FOUND');
  if (!canEditBudget(session, budget.postKey)) return saveError('NOT_YOUR_POST');
  await prisma.boBudget.delete({ where: { id } });
  await logAudit({ action: 'delete', entity: 'boBudget', entityId: id, target: budget.title });
  revalidateBudgets();
  redirect(`${nl ? '' : '/en'}/admin/bestuursorgaan/mijn`);
}

/** BTW per post, de Collect&Go-servicekost, Flesserke en de locaties. Enkel Groep 5. */
export async function saveBudgetSettingsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission('bestuursorgaan.manage');
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get('settings') ?? ''));
  } catch {
    return saveError('INVALID_SETTINGS');
  }
  const parsed = budgetSettingsSchema.safeParse(raw);
  if (!parsed.success) return saveError('INVALID_SETTINGS');
  const names = parsed.data.locations.map((l) => l.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return saveError('DUPLICATE_LOCATION');
  await saveBudgetSettings({
    ...parsed.data,
    locations: parsed.data.locations.map((l) => ({ ...l, name: l.name.trim() })),
  });
  await logAudit({
    action: 'update',
    entity: 'boSettings',
    target: 'Budgetten op de site',
    summary: 'BTW, Collect&Go, Flesserke of locaties gewijzigd',
  });
  revalidateBudgets();
  revalidatePath('/[locale]/admin/bestuursorgaan/instellingen', 'page');
  return saveOk();
}

export type PriceCheckResponse =
  { ok: true; results: { rowId: string; lookup: Lookup }[] } | { ok: false; code: string };

/**
 * De prijzen opvragen bij de webshops (`lib/priceCheck/shops.ts`) voor de
 * regels die de editor meestuurt. Haalt enkel productpagina's van de gekende
 * winkels op (de link wordt eerst herkend, nooit zomaar gevolgd), hoogstens 60
 * per keer en drie tegelijk. Verandert niets aan het budget: de editor zet de
 * uitkomst in de regels en bewaart dan zoals bij elke wijziging.
 */
export async function checkPricesAction(input: {
  id: string;
  rows: { rowId: string; url: string }[];
  token?: string | null;
}): Promise<PriceCheckResponse> {
  const budget = await prisma.boBudget.findUnique({ where: { id: String(input.id) } });
  if (!budget) return { ok: false, code: 'NOT_FOUND' };
  const access = await budgetAccess(budget, input.token);
  if (access?.level !== 'edit') return { ok: false, code: 'NOT_YOUR_POST' };
  const settings = await getBudgetSettings();
  if (!settings.collectGoLive) return { ok: false, code: 'DISABLED' };

  const wanted = (Array.isArray(input.rows) ? input.rows : []).slice(0, 60).flatMap((row) => {
    const ref = parseShopUrl(String(row?.url ?? ''));
    return ref ? [{ rowId: String(row.rowId).slice(0, 40), ref, page: ref.page }] : [];
  });
  // Elke pagina één keer, ook als twee regels hetzelfde product hebben.
  const pages = [...new Map(wanted.map((w) => [w.page, w.ref])).entries()];
  const found = new Map<string, Lookup>();
  for (let i = 0; i < pages.length; i += 3) {
    const batch = pages.slice(i, i + 3);
    const lookups = await Promise.all(batch.map(([, ref]) => lookupShopProduct(ref)));
    batch.forEach(([page, ref], j) => {
      const lookup = lookups[j];
      found.set(
        page,
        lookup.status === 'found' ? { ...lookup, basis: ref.basis, shop: ref.shop } : { ...lookup, shop: ref.shop }
      );
    });
  }
  return { ok: true, results: wanted.map((w) => ({ rowId: w.rowId, lookup: found.get(w.page)! })) };
}

export type ShareLinks = { viewToken: string | null; editToken: string | null };
export type ShareResult = (SaveState & { links?: ShareLinks }) | (SaveState & { links: ShareLinks });

/**
 * Een deellink maken, vernieuwen of intrekken. Enkel een lid van de post (of
 * Groep 5): wie zelf via een link binnenkwam, deelt het budget niet verder uit.
 * Een nieuwe link maakt de oude meteen ongeldig.
 */
export async function setBudgetShareAction(input: {
  id: string;
  kind: 'view' | 'edit';
  on: boolean;
}): Promise<ShareResult> {
  const session = await requireSession();
  const budget = await prisma.boBudget.findUnique({ where: { id: String(input.id) } });
  if (!budget) return saveError('NOT_FOUND');
  if (!canEditBudget(session, budget.postKey)) return saveError('NOT_YOUR_POST');
  const kind = input.kind === 'edit' ? 'edit' : 'view';
  const token = input.on ? newShareToken() : null;
  // `updatedAt` blijft wat het was: de editor die openstaat, mag blijven bewaren.
  await prisma.boBudget.update({
    where: { id: budget.id },
    data: { ...(kind === 'edit' ? { editToken: token } : { viewToken: token }), updatedAt: budget.updatedAt },
  });
  await logAudit({
    action: 'update',
    entity: 'boBudget',
    entityId: budget.id,
    target: budget.title,
    summary: `Deellink om te ${kind === 'edit' ? 'bewerken' : 'bekijken'} ${input.on ? 'gemaakt' : 'ingetrokken'}`,
  });
  return {
    ...saveOk(),
    links: {
      viewToken: kind === 'view' ? token : budget.viewToken,
      editToken: kind === 'edit' ? token : budget.editToken,
    },
  };
}

/** De begroting van het werkingsjaar opladen (het rekenblad van Beheer). Enkel Groep 5. */
export async function uploadBegrotingAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission('bestuursorgaan.manage');
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return saveError('NO_FILE');
  if (file.size > 15 * 1024 * 1024) return saveError('FILE_TOO_LARGE');
  const sheets = begrotingSheets(Buffer.from(await file.arrayBuffer()));
  if ('error' in sheets) return saveError(sheets.error);
  await saveBegroting({ fileName: file.name.slice(0, 200), uploadedAt: new Date().toISOString(), sheets });
  const lines = sheets.reduce((sum, sheet) => sum + sheet.lines.length, 0);
  await logAudit({
    action: 'update',
    entity: 'boSettings',
    target: 'Begroting',
    summary: `${file.name}: ${sheets.length} tabbladen, ${lines} lijnen`,
  });
  revalidateBudgets();
  revalidatePath('/[locale]/admin/bestuursorgaan/instellingen', 'page');
  return saveOk(`${sheets.length} tabbladen en ${lines} lijnen ingelezen uit ${file.name}.`);
}

/* ------------------------------------------- Rekenbladen overnemen */

type ImportTally = { created: number; replaced: number; kept: number; overview: number; problems: string[] };

function tally(): ImportTally {
  return { created: 0, replaced: 0, kept: 0, overview: 0, problems: [] };
}

function count(t: ImportTally, outcome: StoreOutcome, mode: 'regels' | 'overzicht') {
  if (outcome === 'created') t.created += 1;
  else if (outcome === 'replaced') t.replaced += 1;
  else t.kept += 1;
  if (outcome !== 'kept-site' && outcome !== 'kept-result' && mode === 'overzicht') t.overview += 1;
}

function importSummary(t: ImportTally): string {
  const parts = [
    `${t.created} nieuw`,
    t.replaced ? `${t.replaced} vervangen` : '',
    t.kept ? `${t.kept} ongemoeid gelaten (op de site gemaakt, of er stond al een resultaat)` : '',
    t.overview
      ? `${t.overview} enkel met het overzicht, omdat de regels niet op het totaal van het blad uitkwamen`
      : '',
  ].filter(Boolean);
  const problems = t.problems.length
    ? ` Niet overgenomen: ${t.problems.slice(0, 8).join('; ')}${t.problems.length > 8 ? `; en nog ${t.problems.length - 8}` : ''}.`
    : '';
  return `${parts.join(', ')}.${problems}`;
}

const IMPORT_ERRORS: Record<string, string> = {
  UNREADABLE: 'geen leesbaar rekenblad',
  NO_OVERVIEW: 'geen blok Overzicht gevonden',
};

/**
 * Rekenbladen van het BO opladen (een map Budgetten of Resultaten, of alles
 * van één BO) en als budgetten op de site zetten. De post en de activiteit
 * komen uit de bestandsnaam, zoals de scan ze leest. Enkel Groep 5.
 */
export async function importBudgetFilesAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission('bestuursorgaan.manage');
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  const targetDate = field(formData, 'targetDate');
  if (files.length === 0) return saveError('NO_FILE');
  if (files.length > 80) return saveError('TOO_MANY_FILES');
  if (targetDate && !DATE.test(targetDate)) return saveError('INVALID_DATE');

  const [settings, groups, aliases] = await Promise.all([
    getBudgetSettings(),
    prisma.group.findMany({
      where: { type: { not: 'JAARWERKING' } },
      select: { id: true, code: true, slug: true, nameNl: true, nameEn: true },
    }),
    prisma.boPostAlias.findMany({ select: { key: true, postKeys: true } }),
  ]);
  const aliasMap = new Map(aliases.map((a) => [a.key, a.postKeys ?? []]));
  const t = tally();
  // Budgetten eerst: het resultaat van dezelfde activiteit vervangt daarna het budget.
  const ordered = [...files].sort(
    (a, b) => Number(/resultaat/i.test(a.name)) - Number(/resultaat/i.test(b.name)) || a.name.localeCompare(b.name)
  );
  for (const file of ordered) {
    if (!/\.xlsx$/i.test(file.name)) {
      t.problems.push(`${file.name} (geen .xlsx)`);
      continue;
    }
    if (file.size > 15 * 1024 * 1024) {
      t.problems.push(`${file.name} (groter dan 15 MB)`);
      continue;
    }
    const imported = importBudgetWorkbook(Buffer.from(await file.arrayBuffer()), {
      fileName: file.name,
      kind: 'upload',
    });
    if ('error' in imported) {
      t.problems.push(`${file.name} (${IMPORT_ERRORS[imported.error]})`);
      continue;
    }
    const parsed = parseDocumentName(file.name);
    const postKey =
      resolvePostKeys(parsed.post ?? '', groups, aliasMap)[0] ??
      resolvePostKeys(imported.sheetPost ?? '', groups, aliasMap)[0];
    if (!postKey) {
      t.problems.push(`${file.name} (post "${parsed.post ?? imported.sheetPost ?? '?'}" niet herkend)`);
      continue;
    }
    const outcome = await storeImportedBudget({
      imported,
      postKey,
      title: parsed.activity ?? imported.sheetTitle ?? file.name.replace(/\.xlsx$/i, ''),
      workingYear: parsed.year ?? undefined,
      targetDate: targetDate || null,
      settings,
      userId: session.user.id,
    });
    count(t, outcome, imported.mode);
  }
  await logAudit({
    action: 'create',
    entity: 'boBudget',
    target: 'Rekenbladen overgenomen',
    summary: `${files.length} bestanden opgeladen: ${t.created} nieuw, ${t.replaced} vervangen, ${t.problems.length} niet gelukt`,
  });
  revalidateBudgets();
  revalidatePath('/[locale]/admin/bestuursorgaan/mappen', 'page');
  if (t.created + t.replaced + t.kept === 0) return saveError('NOTHING_IMPORTED', importSummary(t));
  return saveOk(importSummary(t));
}

/**
 * De rekenbladen van één BO rechtstreeks uit Drive overnemen: wat de scan in
 * die map vond, met de post, de activiteit en budget-of-resultaat zoals het
 * register ze kent. Leest enkel; in Drive verandert niets. Enkel Groep 5.
 */
export async function importMeetingFromDriveAction(input: { meetingId: string }): Promise<SaveState> {
  const session = await requirePermission('bestuursorgaan.manage');
  const meeting = await prisma.boMeeting.findUnique({ where: { id: String(input.meetingId) } });
  if (!meeting) return saveError('NOT_FOUND');
  const cfg = await getGoogleConfig();
  if (!cfg?.driveSubject) return saveError('NO_DRIVE');

  const [{ overview }, settings, rows] = await Promise.all([
    loadBoOverview(meeting.workingYear, true),
    getBudgetSettings(),
    prisma.boDocument.findMany({
      where: { meetingId: meeting.id, hiddenAt: null, missingSince: null },
      select: { id: true, driveFileId: true, mimeType: true, name: true },
    }),
  ]);
  const files = new Map(rows.map((r) => [r.id, r]));
  // Elk bestand van deze BO, met het dossier waar het register het bij zette.
  const jobs: { docId: string; result: boolean; postKey: string; title: string; date: string | null }[] = [];
  const seen = new Set<string>();
  for (const post of overview.posts) {
    for (const dossier of post.dossiers) {
      const date = dossier.date ? dossier.date.toISOString().slice(0, 10) : null;
      for (const [docs, result] of [
        [dossier.budgets, false],
        [dossier.results, true],
      ] as const) {
        for (const doc of docs) {
          if (doc.meetingId !== meeting.id || seen.has(doc.id) || !files.has(doc.id)) continue;
          seen.add(doc.id);
          jobs.push({ docId: doc.id, result, postKey: dossier.postKeys[0], title: dossier.activity, date });
        }
      }
    }
  }
  if (jobs.length === 0)
    return saveError(
      'NOTHING_IMPORTED',
      'In deze map staan geen budgetten of resultaten die de site aan een post kon koppelen.'
    );
  jobs.sort((a, b) => Number(a.result) - Number(b.result));

  const t = tally();
  for (const job of jobs.slice(0, 60)) {
    const file = files.get(job.docId)!;
    let buffer: Buffer;
    try {
      buffer = await downloadSpreadsheet(cfg, cfg.driveSubject, { id: file.driveFileId, mimeType: file.mimeType });
    } catch {
      t.problems.push(`${file.name} (niet te openen in Drive)`);
      continue;
    }
    const imported = importBudgetWorkbook(buffer, { fileName: file.name, kind: 'drive', fileId: file.driveFileId });
    if ('error' in imported) {
      t.problems.push(`${file.name} (${IMPORT_ERRORS[imported.error]})`);
      continue;
    }
    const outcome = await storeImportedBudget({
      imported,
      postKey: job.postKey,
      title: job.title,
      workingYear: meeting.workingYear,
      targetDate: job.date ?? (meeting.date ? meeting.date.toISOString().slice(0, 10) : null),
      settings,
      userId: session.user.id,
    });
    count(t, outcome, imported.mode);
  }
  await logAudit({
    action: 'create',
    entity: 'boBudget',
    target: `Rekenbladen van ${meeting.name} overgenomen`,
    summary: `${t.created} nieuw, ${t.replaced} vervangen, ${t.problems.length} niet gelukt`,
  });
  revalidateBudgets();
  revalidatePath('/[locale]/admin/bestuursorgaan/mappen', 'page');
  if (t.created + t.replaced + t.kept === 0) return saveError('NOTHING_IMPORTED', importSummary(t));
  return saveOk(importSummary(t));
}
