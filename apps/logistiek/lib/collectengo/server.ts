import 'server-only';

import { prisma } from '@vtk/db';
import { suggestFlesserkeItem, type MatchCandidate } from './match';

/** De lijst met klaarstaande en verwerkte bestellingen, voor /beheer/collectengo. */
export async function collectEnGoOrders() {
  const orders = await prisma.collectEnGoOrder.findMany({
    orderBy: [{ receivedAt: 'desc' }],
    take: 60,
    include: { _count: { select: { lines: true } }, importedBy: { select: { name: true } } },
  });
  return orders;
}

export type CollectEnGoOrderRow = Awaited<ReturnType<typeof collectEnGoOrders>>[number];

/**
 * Eén bestelling klaar om te importeren: de lijnen uit de mail, de
 * flesserke-catalogus om uit te kiezen, en per lijn het voorstel.
 *
 * Het voorstel wordt bij elke opening opnieuw berekend in plaats van bewaard: de
 * catalogus verandert (net aangemaakte items), en een bewaarde suggestie zou dan
 * naar iets ouds wijzen.
 */
export async function collectEnGoOrderForImport(id: string) {
  const order = await prisma.collectEnGoOrder.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortIndex: 'asc' } },
      importedBy: { select: { name: true } },
      // Bij welk evenement deze boodschappen horen (E5).
      event: { select: { id: true, name: true } },
    },
  });
  if (!order) return null;

  const [items, categories, matches, siblings] = await Promise.all([
    prisma.uitleenFlesserkeItem.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, brand: true, contentAmount: true, contentUnit: true,
        categoryId: true, quantity: true,
      },
    }),
    prisma.uitleenFlesserkeCategory.findMany({
      where: { active: true },
      orderBy: [{ sortIndex: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.collectEnGoProductMatch.findMany({ select: { productKey: true, flesserkeItemId: true } }),
    prisma.collectEnGoOrder.findMany({
      where: { reservationNumber: order.reservationNumber, id: { not: order.id } },
      orderBy: { receivedAt: 'desc' },
      select: { id: true, receivedAt: true, status: true },
    }),
  ]);

  const remembered = new Map(matches.map((match) => [match.productKey, match.flesserkeItemId]));
  const candidates: MatchCandidate[] = items;
  const suggestions = Object.fromEntries(
    order.lines.map((line) => [line.id, suggestFlesserkeItem(line.productName, candidates, remembered)])
  );

  return { order, items, categories, suggestions, siblings };
}

export type CollectEnGoImportView = NonNullable<Awaited<ReturnType<typeof collectEnGoOrderForImport>>>;
