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
import { canEditBudget, getBudgetSettings, saveBudgetSettings, siteBudgetPostKeys } from '@/lib/bo/budget/server';
import type { Lookup } from '@/lib/bo/budget/prices';
import { lookupCollectGoProduct } from '@/lib/collectgo/fetch';
import { parseCollectGoUrl, productPageUrl } from '@/lib/collectgo/product';
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
}): Promise<BudgetSaveResult> {
  const session = await requireSession();
  const budget = await prisma.boBudget.findUnique({ where: { id: input.id } });
  if (!budget) return saveError('NOT_FOUND');
  if (!canEditBudget(session, budget.postKey)) return saveError('NOT_YOUR_POST');
  if (budget.status !== 'DRAFT') return saveError('ALREADY_SUBMITTED');
  if (budget.updatedAt.toISOString() !== input.version) return saveError('CHANGED_ELSEWHERE');

  const title = String(input.title ?? '').trim();
  if (!title) return saveError('TITLE_REQUIRED');
  if (title.length > 200) return saveError('TITLE_TOO_LONG');
  if (input.targetDate && !DATE.test(input.targetDate)) return saveError('INVALID_DATE');
  const content = parseBudgetContent(input.content);
  if (!content) return saveError('INVALID_CONTENT');

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
 * De prijzen van Collect&Go opvragen voor de regels die de editor meestuurt.
 * Haalt enkel productpagina's van collectandgo.be op (de link wordt eerst
 * herkend, nooit zomaar gevolgd), hoogstens 60 per keer en drie tegelijk.
 * Verandert niets aan het budget: de editor zet de uitkomst in de regels en
 * bewaart dan zoals bij elke wijziging.
 */
export async function checkCollectGoPricesAction(input: {
  id: string;
  rows: { rowId: string; url: string }[];
}): Promise<PriceCheckResponse> {
  const session = await requireSession();
  const budget = await prisma.boBudget.findUnique({ where: { id: String(input.id) }, select: { postKey: true } });
  if (!budget) return { ok: false, code: 'NOT_FOUND' };
  if (!canEditBudget(session, budget.postKey)) return { ok: false, code: 'NOT_YOUR_POST' };
  const settings = await getBudgetSettings();
  if (!settings.collectGoLive) return { ok: false, code: 'DISABLED' };

  const wanted = (Array.isArray(input.rows) ? input.rows : []).slice(0, 60).flatMap((row) => {
    const ref = parseCollectGoUrl(String(row?.url ?? ''));
    return ref ? [{ rowId: String(row.rowId).slice(0, 40), ref, page: productPageUrl(ref) }] : [];
  });
  // Elke pagina één keer, ook als twee regels hetzelfde product hebben.
  const pages = [...new Map(wanted.map((w) => [w.page, w.ref])).entries()];
  const found = new Map<string, Lookup>();
  for (let i = 0; i < pages.length; i += 3) {
    const batch = pages.slice(i, i + 3);
    const lookups = await Promise.all(batch.map(([, ref]) => lookupCollectGoProduct(ref)));
    batch.forEach(([page], j) => found.set(page, lookups[j]));
  }
  return { ok: true, results: wanted.map((w) => ({ rowId: w.rowId, lookup: found.get(w.page)! })) };
}
