import { NextResponse } from 'next/server';
import writeXlsxFile from 'write-excel-file/node';
import { authErrorResponse, requireSession } from '@/lib/session';
import { contentDisposition } from '@/lib/contentDisposition';
import { formatWorkingYear } from '@/lib/workingYear';
import { canEditBudget, getBudgetSettings, loadBudget, postNames } from '@/lib/bo/budget/server';
import { budgetFileName, budgetSheet } from '@/lib/bo/budget/sheet';

export const runtime = 'nodejs';

/**
 * Een budget van de site als rekenblad (`?taal=en` voor Engelse labels), om in
 * de map Budgetten van een BO te zetten. Zo leest de scan het zoals elk ander
 * budget, en blijft Drive de bron zolang het BO daarmee werkt.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }
  const { id } = await params;
  const budget = await loadBudget(id);
  if (!budget || !canEditBudget(session, budget.postKey))
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const nl = new URL(request.url).searchParams.get('taal') !== 'en';
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
      'Content-Disposition': contentDisposition('attachment', budgetFileName(year, postName, budget.title)),
      'Cache-Control': 'no-store',
    },
  });
}
