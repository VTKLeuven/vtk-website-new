import { NextResponse } from 'next/server';
import writeXlsxFile from 'write-excel-file/node';
import { contentDisposition } from '@/lib/contentDisposition';
import { formatWorkingYear } from '@/lib/workingYear';
import { hasResult } from '@/lib/bo/budget/calc';
import { budgetAccess, getBudgetSettings, loadBudget, postNames } from '@/lib/bo/budget/server';
import { budgetFileName, budgetSheet } from '@/lib/bo/budget/sheet';

export const runtime = 'nodejs';

/**
 * Een budget van de site als rekenblad (`?taal=en` voor Engelse labels), om in
 * de map Budgetten van een BO te zetten. Zo leest de scan het zoals elk ander
 * budget, en blijft Drive de bron zolang het BO daarmee werkt. Met het
 * resultaat aan heet het bestand "Resultaat" en is de kolom Resultaat gevuld.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const budget = await loadBudget(id);
  // Een lid van de post, of een deellink (`?token=`); voor de rest bestaat het niet.
  if (!budget || !(await budgetAccess(budget, query.get('token'))))
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const nl = query.get('taal') !== 'en';
  const [settings, names] = await Promise.all([getBudgetSettings(), postNames([budget.postKey], nl)]);
  const postName = names.get(budget.postKey) ?? budget.postKey;
  const year = formatWorkingYear(budget.workingYear);
  const madeOn = new Date().toLocaleDateString(nl ? 'nl-BE' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Brussels',
  });
  const sheets = budgetSheet(
    budget.content,
    { postKey: budget.postKey, settings },
    { title: budget.title, postName, year, madeOn, nl }
  );
  const file = await writeXlsxFile(sheets).toBuffer();

  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(
        'attachment',
        budgetFileName(year, postName, budget.title, hasResult(budget.content))
      ),
      'Cache-Control': 'no-store',
    },
  });
}
