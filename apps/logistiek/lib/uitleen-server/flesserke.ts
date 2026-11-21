import 'server-only';
import { prisma } from '@vtk/db';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Flesserke (verbruiksstock, enkel interne werking)
// ---------------------------------------------------------------------------

/** Aanvragertypes die flesserke mogen aanvragen: interne werking. */
export const FLESSERKE_REQUESTER_TYPES = ['INTERN', 'WERKGROEP'] as const;

export type FlesserkeCatalogItem = {
  id: string;
  name: string;
  brand: string | null;
  contentAmount: string | null;
  contentUnit: string | null;
  colruytUrl: string | null;
  quantity: number;
};

export type FlesserkeCatalogCategory = { id: string | null; name: string; items: FlesserkeCatalogItem[] };

export async function getFlesserkeCatalog(): Promise<FlesserkeCatalogCategory[]> {
  const [categories, items] = await Promise.all([
    prisma.uitleenFlesserkeCategory.findMany({
      where: { active: true },
      orderBy: [{ sortIndex: 'asc' }, { name: 'asc' }],
    }),
    prisma.uitleenFlesserkeItem.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ]);
  const toItem = (i: (typeof items)[number]): FlesserkeCatalogItem => ({
    id: i.id,
    name: i.name,
    brand: i.brand,
    contentAmount: i.contentAmount,
    contentUnit: i.contentUnit,
    colruytUrl: i.colruytUrl,
    quantity: i.quantity,
  });
  const grouped: FlesserkeCatalogCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    items: items.filter((i) => i.categoryId === c.id).map(toItem),
  }));
  const rest = items.filter((i) => !i.categoryId || !categories.some((c) => c.id === i.categoryId));
  if (rest.length > 0) grouped.push({ id: null, name: 'Overig', items: rest.map(toItem) });
  return grouped.filter((c) => c.items.length > 0);
}

/**
 * Gereserveerde flesserke-aantallen per item: som van de lijnen van reservaties
 * met status APPROVED of PICKED_UP (verbruiksgoederen, geen datumoverlap). Bij
 * het terugbrengen wordt de voorraad afgeboekt, dus een gereserveerd item telt
 * tot dan mee. Optioneel één reservatie uitsluiten.
 */
export async function flesserkeReserved(
  tx: Prisma.TransactionClient,
  opts: { excludeReservationId?: string } = {}
): Promise<Map<string, number>> {
  const lines = await tx.uitleenFlesserkeLine.findMany({
    where: {
      reservation: {
        status: { in: ['APPROVED', 'PICKED_UP'] },
        ...(opts.excludeReservationId ? { id: { not: opts.excludeReservationId } } : {}),
      },
    },
    select: { flesserkeItemId: true, quantity: true },
  });
  const reserved = new Map<string, number>();
  for (const line of lines) {
    reserved.set(line.flesserkeItemId, (reserved.get(line.flesserkeItemId) ?? 0) + line.quantity);
  }
  return reserved;
}

/**
 * Zet `quantity` en `expiryDate` van een flesserke-item gelijk aan zijn
 * ladingen: de som en de eerstvolgende datum. De batches zijn de waarheid, maar
 * de beschikbaarheidsberekening, de zoekfilter en de sortering lezen die twee
 * velden op de itemrij; ze zelf bijhouden scheelt een join in elke query.
 *
 * Roep dit aan binnen dezelfde transactie als elke wijziging aan de batches.
 */
export async function syncFlesserkeItemTotals(
  tx: Prisma.TransactionClient,
  itemId: string
): Promise<void> {
  const batches = await tx.uitleenFlesserkeBatch.findMany({
    where: { itemId },
    select: { quantity: true, expiryDate: true },
  });
  const quantity = batches.reduce((total, batch) => total + batch.quantity, 0);
  // Enkel ladingen die er nog liggen tellen mee voor "vervalt binnenkort": een
  // leeggedronken bak van vorige maand mag het item niet rood houden. Een lading
  // zonder datum telt evenmin mee: die heeft geen houdbaarheid, en null als
  // kleinste waarde nemen zou elk item rood maken.
  const dates = batches
    .filter((batch) => batch.quantity > 0)
    .map((batch) => batch.expiryDate)
    .filter((date): date is Date => date !== null);
  const expiryDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
  await tx.uitleenFlesserkeItem.update({ where: { id: itemId }, data: { quantity, expiryDate } });
}

/**
 * Boekt `amount` stuks af van de ladingen van een item, oudste vervaldatum
 * eerst; ladingen zonder datum gaan als laatste. Geeft terug hoeveel er niet
 * meer af te boeken viel (0 in het normale geval).
 *
 * FIFO omdat dat is wat er in de kelder gebeurt: je neemt de bak die het eerst
 * vervalt. De rest van de app rekent met het totaal, dus die verdeling is enkel
 * hier zichtbaar.
 */
export async function consumeFlesserkeStock(
  tx: Prisma.TransactionClient,
  itemId: string,
  amount: number
): Promise<number> {
  if (amount <= 0) return 0;
  const batches = await tx.uitleenFlesserkeBatch.findMany({
    where: { itemId, quantity: { gt: 0 } },
    orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    select: { id: true, quantity: true },
  });
  let left = amount;
  for (const batch of batches) {
    if (left <= 0) break;
    const take = Math.min(batch.quantity, left);
    await tx.uitleenFlesserkeBatch.update({
      where: { id: batch.id },
      data: { quantity: batch.quantity - take },
    });
    left -= take;
  }
  await syncFlesserkeItemTotals(tx, itemId);
  return left;
}

/**
 * Zet `amount` stuks terug op de voorraad, op de oudste lading.
 *
 * Dat is het spiegelbeeld van {@link consumeFlesserkeStock} en dus exact juist
 * zolang er tussen afboeken en terugdraaien niets anders gebeurde. Welke lading
 * precies verbruikt werd, houden we niet bij: dat zou een koppeltabel per lijn
 * vragen voor een correctie die zelden gebeurt, en het totaal klopt hoe dan ook.
 */
export async function restoreFlesserkeStock(
  tx: Prisma.TransactionClient,
  itemId: string,
  amount: number
): Promise<void> {
  if (amount <= 0) return;
  const oldest = await tx.uitleenFlesserkeBatch.findFirst({
    where: { itemId },
    orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    select: { id: true },
  });
  if (oldest) {
    await tx.uitleenFlesserkeBatch.update({
      where: { id: oldest.id },
      data: { quantity: { increment: amount } },
    });
  } else {
    // Alle ladingen zijn intussen verwijderd: maak er weer een, anders zou de
    // voorraad stil verdwijnen bij het terugdraaien.
    await tx.uitleenFlesserkeBatch.create({ data: { itemId, quantity: amount } });
  }
  await syncFlesserkeItemTotals(tx, itemId);
}

/** Beschikbaarheid per flesserke-item (voorraad min gereserveerd). */
export async function flesserkeAvailability(): Promise<Array<{ itemId: string; available: number }>> {
  const [items, reserved] = await Promise.all([
    prisma.uitleenFlesserkeItem.findMany({ where: { active: true }, select: { id: true, quantity: true } }),
    flesserkeReserved(prisma),
  ]);
  return items.map((i) => ({ itemId: i.id, available: Math.max(0, i.quantity - (reserved.get(i.id) ?? 0)) }));
}

export async function adminFlesserke() {
  const [categories, items] = await Promise.all([
    prisma.uitleenFlesserkeCategory.findMany({ orderBy: [{ sortIndex: 'asc' }, { name: 'asc' }] }),
    prisma.uitleenFlesserkeItem.findMany({
      orderBy: [{ name: 'asc' }],
      include: {
        batches: {
          orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        },
      },
    }),
  ]);
  const reserved = await flesserkeReserved(prisma);
  return {
    categories,
    items: items.map((i) => ({ ...i, reserved: reserved.get(i.id) ?? 0 })),
  };
}

export type AdminFlesserkeItem = Awaited<ReturnType<typeof adminFlesserke>>['items'][number];
