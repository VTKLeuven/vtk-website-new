import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@vtk/db';
import { lookupShopProduct } from '@/lib/priceCheck/fetch';
import { parseShopUrl } from '@/lib/priceCheck/shops';
import { allCostRows } from './calc';
import { applyCheck, checkFromLookup, pricesStillChecked, rowsToCheck, type CheckableRow, type Lookup } from './prices';
import { parseBudgetContent } from './schema';
import { getBudgetSettings } from './server';
import type { BudgetSettings, PriceCheck } from './types';

/*
 * De prijzen van budgetten nakijken op de server: de ronde om de vier uur voor
 * de budgetten van het eerstvolgende BO (`refreshDueBudgetPrices`, vanuit de
 * background-worker), en de ronde wanneer iemand een budget opent
 * (`refreshBudgetPrices`, via `/api/bo/budgets/[id]/prices`).
 *
 * Bewust geen server action: Next stuurt die vanuit de browser één voor één,
 * dus een ronde van een halve minuut hield elke bewaring van de editor zolang
 * tegen. Zie docs/bestuursorgaan.md, "Prijzen nakijken gebeurt vanzelf".
 */

/** Hoeveel producten tegelijk. De prijsbrowser begrenst zelf nog eens per soort aanvraag. */
const PARALLEL = 4;
/** Hoogstens zoveel producten per budget per ronde. */
const MAX_ROWS = 80;

export type RowLookup = { rowId: string; url: string; lookup: Lookup };

/**
 * De productpagina's van de gekende winkels opvragen (de link wordt eerst
 * herkend, nooit zomaar gevolgd), vier tegelijk en elke pagina één keer, ook
 * als twee regels hetzelfde product hebben. Wat de site de voorbije vier uur al
 * vroeg, komt uit haar geheugen (`lib/priceCheck/fetch.ts`).
 */
export async function lookupRows(rows: CheckableRow[], settings: BudgetSettings, fresh = false): Promise<RowLookup[]> {
  const wanted = rows.slice(0, MAX_ROWS).flatMap((row) => {
    const ref = parseShopUrl(String(row?.url ?? ''));
    return ref ? [{ rowId: String(row.rowId).slice(0, 40), url: String(row.url), ref }] : [];
  });
  const pages = [...new Map(wanted.map((w) => [w.ref.page, w.ref])).values()];
  const found = new Map<string, Lookup>();
  let next = 0;
  // Een kleine pool in plaats van groepjes van drie: een traag product houdt de rest niet op.
  async function worker() {
    while (next < pages.length) {
      const ref = pages[next++];
      const lookup = await lookupShopProduct(ref, { fresh, colruytPostcode: settings.colruytPostcode });
      found.set(
        ref.page,
        lookup.status === 'found' ? { ...lookup, basis: ref.basis, shop: ref.shop } : { ...lookup, shop: ref.shop }
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, pages.length) }, worker));
  return wanted.map((w) => ({ rowId: w.rowId, url: w.url, lookup: found.get(w.ref.page)! }));
}

function brusselsToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(now);
}

export type RefreshOutcome =
  | { ok: true; at: string | null; checks: Record<string, PriceCheck> }
  | { ok: false; code: 'NOT_FOUND' | 'DISABLED' };

/**
 * Eén ronde voor één budget: enkel wat `rowsToCheck` zegt (alles na vier uur,
 * anders enkel regels die nog nooit een antwoord kregen), en niet meer eens het
 * budget vastligt. De uitkomst komt in het budget zonder `updatedAt` te
 * wijzigen, zodat een editor die openstaat gewoon blijft bewaren; bewaarde
 * iemand intussen, dan leest dit het budget opnieuw en zet het de antwoorden
 * in die versie, op de regels waarvan de link niet veranderde.
 */
export async function refreshBudgetPrices(
  id: string,
  settings?: BudgetSettings,
  now = new Date()
): Promise<RefreshOutcome> {
  const config = settings ?? (await getBudgetSettings());
  if (!config.collectGoLive) return { ok: false, code: 'DISABLED' };
  const budget = await prisma.boBudget.findUnique({ where: { id } });
  if (!budget) return { ok: false, code: 'NOT_FOUND' };
  const content = parseBudgetContent(budget.content);
  const open = pricesStillChecked(
    { status: budget.status, targetDate: budget.targetDate?.toISOString().slice(0, 10) ?? null },
    brusselsToday(now)
  );
  if (!content || !open) return { ok: true, at: null, checks: {} };
  const rows = rowsToCheck(content, now.getTime());
  if (rows.length === 0) return { ok: true, at: null, checks: {} };
  // Een volledige ronde zet de klok; een losse nieuwe regel niet.
  const fullRound = rows.length === rowsToCheck({ ...content, pricesAt: null }, now.getTime()).length;

  const results = await lookupRows(rows, config);
  const at = new Date().toISOString();

  let current = budget;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const latest = attempt === 0 ? content : parseBudgetContent(current.content);
    if (!latest) break;
    const checks: Record<string, PriceCheck> = {};
    for (const row of allCostRows(latest)) {
      const hit = results.find((r) => r.rowId === row.id);
      // Wie intussen een andere link plakte, krijgt geen antwoord over het vorige product.
      if (!hit || hit.url !== row.source?.url) continue;
      applyCheck(row, checkFromLookup(row, hit.lookup, at));
      if (row.lastCheck) checks[row.id] = row.lastCheck;
    }
    if (fullRound) latest.pricesAt = at;
    const { count } = await prisma.boBudget.updateMany({
      where: { id: current.id, updatedAt: current.updatedAt },
      data: { content: latest as unknown as Prisma.InputJsonValue, updatedAt: current.updatedAt },
    });
    if (count === 1) return { ok: true, at: latest.pricesAt ?? null, checks };
    const again = await prisma.boBudget.findUnique({ where: { id } });
    if (!again) return { ok: false, code: 'NOT_FOUND' };
    current = again;
  }
  return { ok: true, at: null, checks: {} };
}

/**
 * De datum van het eerstvolgende BO (vandaag inbegrepen), uit de mappen die de
 * scan in Drive vond. Null als er geen gepland staat.
 */
export async function nextMeetingDate(now = new Date()): Promise<string | null> {
  const today = brusselsToday(now);
  const meeting = await prisma.boMeeting.findFirst({
    where: { date: { gte: new Date(`${today}T00:00:00Z`) }, missingSince: null },
    orderBy: { date: 'asc' },
    select: { date: true },
  });
  return meeting?.date ? meeting.date.toISOString().slice(0, 10) : null;
}

let running: Promise<unknown> | null = null;

/**
 * De ronde om de vier uur, vanuit de background-worker (die elke vijf minuten
 * langskomt; `rowsToCheck` beslist per budget of het al tijd is). Enkel de
 * budgetten van het eerstvolgende BO die nog niet ingediend zijn: die bekijkt
 * de GM, en daar moet de prijs kloppen zonder dat de post het budget eerst
 * opent. Andere budgetten worden nagekeken wanneer iemand ze opent. Eén budget
 * na het andere, en nooit twee rondes tegelijk.
 */
export async function refreshDueBudgetPrices(now = new Date()) {
  if (running) return { skipped: 'already running' as const };
  const job = (async () => {
    const settings = await getBudgetSettings();
    if (!settings.collectGoLive) return { skipped: 'disabled' };
    const meeting = await nextMeetingDate(now);
    if (!meeting) return { skipped: 'no upcoming meeting' };
    const today = brusselsToday(now);
    const budgets = await prisma.boBudget.findMany({
      where: {
        status: 'DRAFT',
        targetDate: { gte: new Date(`${today}T00:00:00Z`), lte: new Date(`${meeting}T00:00:00Z`) },
      },
      select: { id: true, content: true },
    });
    let checked = 0;
    let rows = 0;
    for (const budget of budgets) {
      const content = parseBudgetContent(budget.content);
      if (!content || rowsToCheck(content, now.getTime()).length === 0) continue;
      const outcome = await refreshBudgetPrices(budget.id, settings, now);
      if (outcome.ok) {
        checked += 1;
        rows += Object.keys(outcome.checks).length;
      }
    }
    return { meeting, budgets: budgets.length, checked, rows };
  })();
  running = job
    .catch((err) => console.error('[budgetprijzen] ronde mislukt:', err instanceof Error ? err.message : err))
    .finally(() => {
      running = null;
    });
  // De worker wacht hoogstens twintig seconden: een lange ronde loopt verder,
  // en de andere taken van de worker schuiven er niet door op.
  const later = new Promise<{ running: true }>((resolve) => setTimeout(() => resolve({ running: true }), 20_000).unref());
  return Promise.race([job, later]);
}
