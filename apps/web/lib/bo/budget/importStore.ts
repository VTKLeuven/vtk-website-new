import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@vtk/db';
import { currentWorkingYear } from '@/lib/workingYear';
import { hasResult, overviewOf, toCents } from './calc';
import type { ImportedBudget } from './importSheet';
import { parseBudgetContent } from './schema';
import type { BudgetSettings } from './types';

/*
 * Een overgenomen rekenblad bewaren als budget op de site.
 *
 * Eén activiteit van een post is één budget: het resultaatblad van dezelfde
 * activiteit vervangt het budgetblad (het bevat beide kolommen), niet
 * omgekeerd. Wat iemand op de site zelf opstelde, blijft altijd staan: een
 * import overschrijft enkel wat zelf uit een rekenblad kwam.
 */

export type StoreOutcome = 'created' | 'replaced' | 'kept-site' | 'kept-result';

export async function storeImportedBudget(input: {
  imported: ImportedBudget;
  postKey: string;
  title: string;
  workingYear?: number;
  targetDate: string | null;
  settings: BudgetSettings;
  userId: string | null;
}): Promise<StoreOutcome> {
  const { imported, postKey, settings } = input;
  const workingYear = input.workingYear ?? currentWorkingYear();
  const title = input.title.trim().slice(0, 200) || 'Budget';
  const overview = overviewOf(imported.content, { postKey, settings });
  const data = {
    content: imported.content as unknown as Prisma.InputJsonValue,
    incomeCents: toCents(overview.income),
    expenseCents: toCents(overview.expense),
    totalCents: toCents(overview.total),
  };
  const existing = await prisma.boBudget.findFirst({
    where: { workingYear, postKey, title: { equals: title, mode: 'insensitive' } },
  });
  if (!existing) {
    await prisma.boBudget.create({
      data: {
        workingYear,
        postKey,
        title,
        template: 'import',
        targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00Z`) : null,
        createdById: input.userId,
        ...data,
      },
    });
    return 'created';
  }
  const current = parseBudgetContent(existing.content);
  if (!current?.source) return 'kept-site';
  // Een budgetblad dat na het resultaat nog eens binnenkomt, gooit het resultaat niet weg.
  if (hasResult(current) && !imported.hasResult) return 'kept-result';
  await prisma.boBudget.update({
    where: { id: existing.id },
    data: {
      ...data,
      ...(existing.targetDate ? {} : input.targetDate ? { targetDate: new Date(`${input.targetDate}T00:00:00Z`) } : {}),
    },
  });
  return 'replaced';
}
