import 'server-only';

import { prisma } from '@vtk/db';
import type { Prisma } from '@prisma/client';
import { currentWorkingYear } from '@vtk/auth';
import { STOCK_CONSUMING_STATUSES } from './uitleen';

export type CatalogItem = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  depositCents: number;
  priceCents: number;
};

export type CatalogCategory = {
  id: string | null;
  name: string;
  items: CatalogItem[];
};

/** Actieve catalogus, gegroepeerd per categorie; itemloze categorieën vallen weg. */
export async function getCatalog(): Promise<CatalogCategory[]> {
  const [categories, items] = await Promise.all([
    prisma.uitleenCategory.findMany({
      where: { active: true },
      orderBy: [{ sortIndex: 'asc' }, { name: 'asc' }],
    }),
    prisma.uitleenItem.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const grouped: CatalogCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    items: items
      .filter((item) => item.categoryId === category.id)
      .map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        depositCents: item.depositCents,
        priceCents: item.priceCents,
      })),
  }));

  const uncategorized = items.filter(
    (item) => !item.categoryId || !categories.some((c) => c.id === item.categoryId)
  );
  if (uncategorized.length > 0) {
    grouped.push({
      id: null,
      name: 'Overig',
      items: uncategorized.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        depositCents: item.depositCents,
        priceCents: item.priceCents,
      })),
    });
  }

  return grouped.filter((category) => category.items.length > 0);
}

/**
 * Reeds ingenomen aantallen per item voor een periode: som van de lijnen van
 * overlappende reservaties met een voorraad-innemende status. Optioneel kan
 * één reservatie uitgesloten worden (bij het goedkeuren van die reservatie zelf).
 */
export async function reservedQuantities(
  tx: Prisma.TransactionClient,
  pickupDate: Date,
  returnDate: Date,
  opts: { excludeReservationId?: string } = {}
): Promise<Map<string, number>> {
  const lines = await tx.uitleenReservationLine.findMany({
    where: {
      reservation: {
        status: { in: STOCK_CONSUMING_STATUSES },
        pickupDate: { lte: returnDate },
        returnDate: { gte: pickupDate },
        ...(opts.excludeReservationId ? { id: { not: opts.excludeReservationId } } : {}),
      },
    },
    select: { itemId: true, quantity: true },
  });

  const reserved = new Map<string, number>();
  for (const line of lines) {
    reserved.set(line.itemId, (reserved.get(line.itemId) ?? 0) + line.quantity);
  }
  return reserved;
}

/** Beschikbaarheid per actief item voor een periode (zachte indicatie voor leden). */
export async function availabilityForRange(
  pickupDate: Date,
  returnDate: Date
): Promise<Array<{ itemId: string; available: number }>> {
  const [items, reserved] = await Promise.all([
    prisma.uitleenItem.findMany({ where: { active: true }, select: { id: true, quantity: true } }),
    reservedQuantities(prisma, pickupDate, returnDate),
  ]);
  return items.map((item) => ({
    itemId: item.id,
    available: Math.max(0, item.quantity - (reserved.get(item.id) ?? 0)),
  }));
}

export async function myReservations(userId: string) {
  return prisma.uitleenReservation.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { lines: true, payments: { where: { status: 'SUCCEEDED' }, select: { id: true, status: true } } },
  });
}

export async function myVanBookings(userId: string) {
  return prisma.uitleenVanBooking.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { payments: { where: { status: 'SUCCEEDED' }, select: { id: true, status: true } } },
  });
}

export async function reservationForUser(id: string, userId: string) {
  return prisma.uitleenReservation.findFirst({
    where: { id, userId },
    include: { lines: true, payments: { orderBy: { createdAt: 'desc' } } },
  });
}

export async function vanBookingForUser(id: string, userId: string) {
  return prisma.uitleenVanBooking.findFirst({
    where: { id, userId },
    include: {
      payments: { orderBy: { createdAt: 'desc' } },
      driver: { select: { name: true } },
    },
  });
}

export function hasSucceededPayment(payments: Array<{ status: string }>): boolean {
  return payments.some((payment) => payment.status === 'SUCCEEDED');
}

// ---------------------------------------------------------------------------
// Beheer (logistiek.manage)
// ---------------------------------------------------------------------------

const adminReservationInclude = {
  lines: { include: { item: { select: { quantity: true, active: true } } } },
  user: { select: { id: true, name: true, email: true } },
  payments: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.UitleenReservationInclude;

export async function adminReservations() {
  return prisma.uitleenReservation.findMany({
    orderBy: [{ createdAt: 'desc' }],
    include: adminReservationInclude,
    take: 200,
  });
}

export async function adminReservation(id: string) {
  return prisma.uitleenReservation.findUnique({
    where: { id },
    include: adminReservationInclude,
  });
}

export async function adminVanBookings() {
  return prisma.uitleenVanBooking.findMany({
    orderBy: [{ startAt: 'desc' }],
    include: {
      user: { select: { id: true, name: true, email: true } },
      driver: { select: { id: true, name: true } },
      payments: { orderBy: { createdAt: 'desc' } },
    },
    take: 200,
  });
}

/** Leden van de post Logistiek dit werkingsjaar, als chauffeurskeuze. */
export async function logistiekTeamMembers() {
  return prisma.user.findMany({
    where: {
      memberships: { some: { group: { code: 'LOGISTIEK' }, year: currentWorkingYear() } },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function adminInventory() {
  const [categories, items] = await Promise.all([
    prisma.uitleenCategory.findMany({ orderBy: [{ sortIndex: 'asc' }, { name: 'asc' }] }),
    prisma.uitleenItem.findMany({ orderBy: { name: 'asc' } }),
  ]);
  return { categories, items };
}

/** Afhalingen, terugbrengmomenten en ritten in een periode, voor de daglijst. */
export async function adminAgenda(from: Date, to: Date) {
  const [pickups, returns, vanBookings] = await Promise.all([
    prisma.uitleenReservation.findMany({
      where: { status: { in: ['APPROVED', 'PICKED_UP'] }, pickupDate: { gte: from, lte: to } },
      include: { lines: true, user: { select: { name: true } } },
      orderBy: { pickupDate: 'asc' },
    }),
    prisma.uitleenReservation.findMany({
      where: { status: { in: ['APPROVED', 'PICKED_UP'] }, returnDate: { gte: from, lte: to } },
      include: { lines: true, user: { select: { name: true } } },
      orderBy: { returnDate: 'asc' },
    }),
    prisma.uitleenVanBooking.findMany({
      where: { status: 'APPROVED', startAt: { gte: from, lte: new Date(to.getTime() + 24 * 60 * 60 * 1000) } },
      include: { user: { select: { name: true } }, driver: { select: { name: true } } },
      orderBy: { startAt: 'asc' },
    }),
  ]);
  return { pickups, returns, vanBookings };
}
