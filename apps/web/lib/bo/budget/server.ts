import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@vtk/db';
import { hasPermission, type SessionPayload } from '@vtk/auth';
import { currentWorkingYear } from '@/lib/workingYear';
import { ownPostKeys } from '../own';
import { postName } from '../posts';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getCurrentSession } from '@/lib/session';
import { applyFormulas } from './formula';
import { hasResult, overviewOf, resultOverviewOf, type CalcContext } from './calc';
import type { Begroting } from './begroting';
import { potKey, potOf, type Pot, type PotMember } from './pot';
import { begrotingSchema, parseBudgetContent, parseBudgetSettings } from './schema';
import { DEFAULT_SETTINGS, type BudgetContent, type BudgetSettings } from './types';

/*
 * Wie welk budget mag zien en wijzigen, en de instellingen van Beheer.
 *
 * Een budget hoort bij een post. Wie dit werkingsjaar in die post zit, stelt
 * het op, zoals "Mijn budgetten" het lidmaatschap volgt en geen recht (zie
 * `lib/bo/own.ts`). Groep 5 (`bestuursorgaan.manage`) ziet en wijzigt elk
 * budget, zoals ze vandaag elk blad kan openen.
 */

export const BUDGET_SETTINGS_KEY = 'bestuursorgaan.budgets';

export async function getBudgetSettings(): Promise<BudgetSettings> {
  const row = await prisma.setting.findUnique({ where: { key: BUDGET_SETTINGS_KEY } });
  return parseBudgetSettings(row?.value) ?? DEFAULT_SETTINGS;
}

export async function saveBudgetSettings(settings: BudgetSettings): Promise<void> {
  const value = settings as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: BUDGET_SETTINGS_KEY },
    create: { key: BUDGET_SETTINGS_KEY, value },
    update: { value },
  });
}

/** De posten waarvoor dit lid een budget mag opstellen. */
export function ownBudgetPostKeys(session: SessionPayload): string[] {
  return ownPostKeys(session.groups);
}

export function canManageBudgets(session: SessionPayload): boolean {
  return hasPermission(session, 'bestuursorgaan.manage');
}

export function canEditBudget(session: SessionPayload, postKey: string): boolean {
  return canManageBudgets(session) || ownBudgetPostKeys(session).includes(postKey);
}

/**
 * De posten waarvoor dit lid een nieuw budget op de site mag starten. Het is
 * een proef naast de rekenbladen in Drive: Groep 5 mag het voor haar eigen
 * posten, andere posten pas wanneer Groep 5 ze aanvinkt bij de instellingen.
 * Een budget dat al bestaat, blijft voor de post te openen (`canEditBudget`).
 */
export function siteBudgetPostKeys(session: SessionPayload, settings: BudgetSettings): string[] {
  const own = ownBudgetPostKeys(session);
  if (canManageBudgets(session)) return own;
  return own.filter((key) => settings.pilotPostKeys.includes(key));
}

/** De naam van een post zoals een lid ze kent, ook voor een vak van Groep 5. */
export async function postNames(keys: readonly string[], nl: boolean): Promise<Map<string, string>> {
  const ids = keys.filter((k) => k.startsWith('g:')).map((k) => k.slice(2));
  const groups = ids.length
    ? await prisma.group.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true, slug: true, nameNl: true, nameEn: true },
      })
    : [];
  return new Map(keys.map((key) => [key, postName(key, groups, nl) ?? key]));
}

export type BudgetRecord = {
  id: string;
  workingYear: number;
  postKey: string;
  title: string;
  template: string;
  status: 'DRAFT' | 'SUBMITTED';
  targetDate: string | null;
  content: BudgetContent;
  totalCents: number;
  submittedAt: string | null;
  /** De versie die de editor terugstuurt, om twee gelijktijdige bewerkers te vangen. */
  version: string;
  viewToken: string | null;
  editToken: string | null;
};

function toRecord(row: {
  id: string;
  workingYear: number;
  postKey: string;
  title: string;
  template: string;
  status: 'DRAFT' | 'SUBMITTED';
  targetDate: Date | null;
  content: Prisma.JsonValue;
  totalCents: number;
  submittedAt: Date | null;
  updatedAt: Date;
  viewToken: string | null;
  editToken: string | null;
}): BudgetRecord | null {
  const content = parseBudgetContent(row.content);
  if (!content) return null;
  return {
    id: row.id,
    workingYear: row.workingYear,
    postKey: row.postKey,
    title: row.title,
    template: row.template,
    status: row.status,
    targetDate: row.targetDate ? row.targetDate.toISOString().slice(0, 10) : null,
    content,
    totalCents: row.totalCents,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    version: row.updatedAt.toISOString(),
    viewToken: row.viewToken,
    editToken: row.editToken,
  };
}

export async function loadBudget(id: string): Promise<BudgetRecord | null> {
  const row = await prisma.boBudget.findUnique({ where: { id } });
  return row ? toRecord(row) : null;
}

export type BudgetListItem = {
  id: string;
  postKey: string;
  title: string;
  status: 'DRAFT' | 'SUBMITTED';
  targetDate: string | null;
  totalCents: number;
  updatedAt: string;
};

/** De budgetten op de site van deze posten, dit werkingsjaar, het laatst gewijzigd eerst. */
export async function listBudgets(postKeys: readonly string[]): Promise<BudgetListItem[]> {
  if (postKeys.length === 0) return [];
  const rows = await prisma.boBudget.findMany({
    where: { workingYear: currentWorkingYear(), postKey: { in: [...postKeys] } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, postKey: true, title: true, status: true, targetDate: true, totalCents: true, updatedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    postKey: r.postKey,
    title: r.title,
    status: r.status,
    targetDate: r.targetDate ? r.targetDate.toISOString().slice(0, 10) : null,
    totalCents: r.totalCents,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/* ------------------------------------------------------------ Deellinks */

/*
 * Een deellink is een geheim in de URL (`/budget/<token>`): wie hem heeft, ziet
 * het budget of mag het aanpassen, zonder account. Bedoeld voor een kring
 * waarmee samengewerkt wordt en voor de slides van het BO. Een link geeft
 * toegang tot dat ene budget en tot niets anders: niet tot de lijst, niet tot
 * de instellingen, en verwijderen of de links beheren kan enkel een lid.
 */

export const SHARE_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

export function newShareToken(): string {
  return randomBytes(24).toString('base64url');
}

function sameToken(a: string | null, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type BudgetAccess = { level: 'edit' | 'view'; via: 'member' | 'link' };

/** Het budget achter een deellink, en wat de link toelaat. */
export async function loadBudgetByToken(
  token: string
): Promise<{ budget: BudgetRecord; level: 'edit' | 'view' } | null> {
  if (!SHARE_TOKEN.test(token)) return null;
  const row = await prisma.boBudget.findFirst({ where: { OR: [{ viewToken: token }, { editToken: token }] } });
  const budget = row ? toRecord(row) : null;
  if (!budget) return null;
  return { budget, level: sameToken(budget.editToken, token) ? 'edit' : 'view' };
}

/**
 * Wat deze aanvraag met het budget mag: als lid van de post (of Groep 5), of
 * met een deellink. Elke server action vraagt dit opnieuw; een action is een
 * gewoon POST-adres.
 */
export async function budgetAccess(
  budget: { postKey: string; viewToken: string | null; editToken: string | null },
  token?: string | null
): Promise<BudgetAccess | null> {
  if (token) {
    if (!SHARE_TOKEN.test(token)) return null;
    if (sameToken(budget.editToken, token)) return { level: 'edit', via: 'link' };
    if (sameToken(budget.viewToken, token)) return { level: 'view', via: 'link' };
    return null;
  }
  const session = await getCurrentSession();
  if (session && canEditBudget(session, budget.postKey)) return { level: 'edit', via: 'member' };
  return null;
}

/* ------------------------------------------------------------ Begroting */

export const BEGROTING_KEY = 'bestuursorgaan.begroting';

export async function getBegroting(): Promise<Begroting | null> {
  const row = await prisma.setting.findUnique({ where: { key: BEGROTING_KEY } });
  const parsed = begrotingSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

export async function saveBegroting(begroting: Begroting): Promise<void> {
  const value = begroting as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: BEGROTING_KEY },
    create: { key: BEGROTING_KEY, value },
    update: { value },
  });
}

/* --------------------------------------------------------------- Potjes */

/** De budgetten van dit werkingsjaar op dezelfde begrotingslijn als dit budget. */
export async function loadPot(budget: BudgetRecord, settings: BudgetSettings): Promise<Pot | null> {
  const key = potKey(budget.content.begrotingRef);
  if (!key) return null;
  const rows = await prisma.boBudget.findMany({
    where: {
      workingYear: budget.workingYear,
      content: { path: ['begrotingRef', 'key'], equals: budget.content.begrotingRef!.key },
    },
  });
  const members: PotMember[] = [];
  for (const row of rows) {
    const record = toRecord(row);
    if (!record || potKey(record.content.begrotingRef) !== key) continue;
    const ctx: CalcContext = { postKey: record.postKey, settings };
    members.push({
      id: record.id,
      title: record.title,
      postKey: record.postKey,
      status: record.status,
      targetDate: record.targetDate,
      total: overviewOf(record.content, ctx).total,
      result: hasResult(record.content) ? resultOverviewOf(record.content, ctx).total : null,
    });
  }
  return potOf(members, budget.id);
}

/** Het budget zoals het bewaard wordt: elke berekening uitgerekend, zodat de getallen kloppen met de formules. */
export function normalizeContent(content: BudgetContent): BudgetContent {
  applyFormulas(content);
  return content;
}

/* ---------------------------------------------------------------- Mappen */

export type FolderBudget = BudgetListItem & { hasResult: boolean; resultCents: number | null };

/** Alle budgetten op de site van dit werkingsjaar (Groep 5), of enkel die van de eigen posten. */
export async function listFolderBudgets(
  postKeys: readonly string[] | 'all',
  settings: BudgetSettings
): Promise<FolderBudget[]> {
  if (postKeys !== 'all' && postKeys.length === 0) return [];
  const rows = await prisma.boBudget.findMany({
    where: { workingYear: currentWorkingYear(), ...(postKeys === 'all' ? {} : { postKey: { in: [...postKeys] } }) },
    orderBy: { title: 'asc' },
  });
  return rows.flatMap((row) => {
    const record = toRecord(row);
    if (!record) return [];
    const result = hasResult(record.content)
      ? resultOverviewOf(record.content, { postKey: record.postKey, settings }).total
      : null;
    return [
      {
        id: record.id,
        postKey: record.postKey,
        title: record.title,
        status: record.status,
        targetDate: record.targetDate,
        totalCents: record.totalCents,
        updatedAt: row.updatedAt.toISOString(),
        hasResult: result != null,
        resultCents: result == null ? null : Math.round(result * 100),
      },
    ];
  });
}
