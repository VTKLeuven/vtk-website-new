import { prisma } from '@vtk/db';
import { budgetAccess, getBudgetSettings } from '@/lib/bo/budget/server';
import { lookupRows, refreshBudgetPrices } from '@/lib/bo/budget/priceRound';
import type { CheckableRow } from '@/lib/bo/budget/prices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
 * De prijzen van een budget nakijken vanuit de editor of een deellink.
 *
 * Een route handler en geen server action: Next stuurt server actions vanuit
 * de browser één voor één, en een ronde langs de winkels kan een halve minuut
 * duren. Als action hield ze zolang elke bewaring van de editor tegen. Zie
 * `lib/bo/budget/priceRound.ts`.
 *
 * - Zonder `rows`: de ronde van het budget (`refreshBudgetPrices`), voor
 *   iedereen die het budget mag zien. De server houdt zelf de klok bij, dus dit
 *   doet meestal niets.
 * - Met `rows`: enkel die regels opvragen (een nieuwe link, of "Nu nakijken"),
 *   voor wie mag wijzigen. Bewaart niets: de editor zet het antwoord in de
 *   regels en bewaart zoals bij elke wijziging.
 */

type Body = { token?: unknown; rows?: unknown; fresh?: unknown };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  // Enkel JSON: een formulier van een andere site kan dit zo niet aanroepen zonder CORS-voorcontrole.
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return Response.json({ ok: false, code: 'BAD_REQUEST' }, { status: 415 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Body;
  const token = typeof body.token === 'string' ? body.token : null;

  const budget = await prisma.boBudget.findUnique({
    where: { id: String(id) },
    select: { id: true, postKey: true, viewToken: true, editToken: true },
  });
  const access = budget ? await budgetAccess(budget, token) : null;
  if (!budget || !access) return Response.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });

  if (!Array.isArray(body.rows)) {
    const outcome = await refreshBudgetPrices(budget.id);
    return Response.json(outcome, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (access.level !== 'edit') return Response.json({ ok: false, code: 'NOT_YOUR_POST' }, { status: 403 });
  const settings = await getBudgetSettings();
  if (!settings.collectGoLive) return Response.json({ ok: false, code: 'DISABLED' });
  const rows: CheckableRow[] = body.rows
    .filter((r): r is { rowId: unknown; url: unknown } => !!r && typeof r === 'object')
    .map((r) => ({ rowId: String(r.rowId ?? ''), url: String(r.url ?? '') }))
    .filter((r) => r.rowId && r.url);
  // Vers bij de winkel enkel voor één regel: een hele lijst hoeft dat niet.
  const results = await lookupRows(rows, settings, body.fresh === true && rows.length === 1);
  return Response.json(
    { ok: true, results: results.map(({ rowId, lookup }) => ({ rowId, lookup })) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
