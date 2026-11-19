import 'server-only';

import { prisma } from '@vtk/db';
import type { ShopLookup } from './fetch';
import type { ShopRef } from './shops';

/*
 * Het logboek van de prijscontroles (`BoPriceCheckLog`), voor
 * /admin/bestuursorgaan/prijzen. Elke opvraging bij een winkel komt erin, ook
 * een antwoord uit het geheugen van vier uur: zo zie je waarom een ronde niets
 * nieuws vroeg. Schrijven mag een controle nooit doen mislukken; een fout hier
 * komt enkel in de serverlog.
 */

export const PRICE_LOG_TRIGGERS = ['ronde', 'openen', 'nieuwe link', 'nakijken', 'knop', 'test'] as const;
export type PriceLogTrigger = (typeof PRICE_LOG_TRIGGERS)[number];

/** Waarom en voor welk budget de site een prijs opvraagt. */
export type PriceLogContext = { trigger: PriceLogTrigger; budgetId?: string | null; budgetName?: string | null };

/** Hoe lang het logboek bijhoudt. */
export const PRICE_LOG_DAYS = 60;

export function logLookup(
  context: PriceLogContext,
  ref: ShopRef,
  via: ShopRef['via'],
  lookup: ShopLookup,
  durationMs: number,
  cached: boolean
): void {
  const found = lookup.status === 'found' ? lookup.product : null;
  void prisma.boPriceCheckLog
    .create({
      data: {
        trigger: context.trigger,
        budgetId: context.budgetId ?? null,
        budgetName: context.budgetName?.slice(0, 200) ?? null,
        shop: ref.shop,
        url: ref.page.slice(0, 2000),
        via,
        status: lookup.status,
        price: found ? found.price : null,
        basis: found ? ref.basis : null,
        product: found ? found.name.slice(0, 300) : null,
        reason: lookup.status === 'failed' ? lookup.reason.slice(0, 300) : null,
        durationMs: Math.max(0, Math.round(durationMs)),
        cached,
      },
    })
    .catch((err) => console.error('[prijslog] schrijven mislukt:', err instanceof Error ? err.message : String(err)));
}

let lastPrune = 0;

/** Wat ouder is dan zestig dagen, weg; hoogstens één keer per uur. */
export async function prunePriceLog(now = new Date()): Promise<number> {
  if (now.getTime() - lastPrune < 60 * 60 * 1000) return 0;
  lastPrune = now.getTime();
  const { count } = await prisma.boPriceCheckLog.deleteMany({
    where: { at: { lt: new Date(now.getTime() - PRICE_LOG_DAYS * 86_400_000) } },
  });
  return count;
}
