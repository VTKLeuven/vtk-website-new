import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@vtk/db';
import { hasPermission, type SessionPayload } from '@vtk/auth';
import { currentWorkingYear } from '@/lib/workingYear';
import { ownPostKeys } from '../own';
import { postName } from '../posts';
import { parseBudgetContent, parseBudgetSettings } from './schema';
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
