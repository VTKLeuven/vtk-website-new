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
  photoKey: string | null;
  photoKeys: string[];
  isSet: boolean;
};

export type CatalogCategory = {
  id: string | null;
  name: string;
  items: CatalogItem[];
};

type ItemRow = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  depositCents: number;
  priceCents: number;
  photoKey: string | null;
  photos?: Array<{ key: string }>;
  isSet: boolean;
  categoryId: string | null;
};

function toCatalogItem(item: ItemRow): CatalogItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    depositCents: item.depositCents,
    priceCents: item.priceCents,
    photoKey: item.photoKey,
    photoKeys: item.photos?.map((photo) => photo.key) ?? [],
    isSet: item.isSet,
  };
}

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
      include: { photos: { orderBy: { sortIndex: 'asc' } } },
    }),
  ]);

  const grouped: CatalogCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    items: items.filter((item) => item.categoryId === category.id).map(toCatalogItem),
  }));

  const uncategorized = items.filter(
    (item) => !item.categoryId || !categories.some((c) => c.id === item.categoryId)
  );
  if (uncategorized.length > 0) {
    grouped.push({ id: null, name: 'Overig', items: uncategorized.map(toCatalogItem) });
  }

  return grouped.filter((category) => category.items.length > 0);
}

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
  quantity: number;
};

export type FlesserkeCatalogCategory = { id: string | null; name: string; items: FlesserkeCatalogItem[] };

/** Actieve flesserke-catalogus, gegroepeerd per categorie. */
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
    prisma.uitleenFlesserkeItem.findMany({ orderBy: [{ name: 'asc' }] }),
  ]);
  const reserved = await flesserkeReserved(prisma);
  return {
    categories,
    items: items.map((i) => ({ ...i, reserved: reserved.get(i.id) ?? 0 })),
  };
}

export type AdminFlesserkeItem = Awaited<ReturnType<typeof adminFlesserke>>['items'][number];

/** Eén catalogusitem met categorie en set-inhoud, voor de detailpagina. */
export async function itemDetail(id: string) {
  return prisma.uitleenItem.findFirst({
    where: { id, active: true },
    include: {
      category: { select: { name: true } },
      setContents: { orderBy: { sortIndex: 'asc' } },
      photos: { orderBy: { sortIndex: 'asc' } },
      properties: { orderBy: { sortIndex: 'asc' } },
      downloads: { orderBy: { sortIndex: 'asc' } },
    },
  });
}

/**
 * "Vaak samen aangevraagd": items die vaak in dezelfde aanvraag als `itemId`
 * voorkomen (statussen REJECTED/CANCELLED uitgesloten). Top `take` op frequentie.
 */
export async function frequentlyRequestedWith(itemId: string, take = 4): Promise<CatalogItem[]> {
  const reservationIds = (
    await prisma.uitleenReservationLine.findMany({
      where: { itemId, reservation: { status: { notIn: ['REJECTED', 'CANCELLED'] } } },
      select: { reservationId: true },
    })
  ).map((l) => l.reservationId);
  if (reservationIds.length === 0) return [];

  const grouped = await prisma.uitleenReservationLine.groupBy({
    by: ['itemId'],
    where: { reservationId: { in: reservationIds }, itemId: { not: itemId } },
    _count: { itemId: true },
    orderBy: { _count: { itemId: 'desc' } },
    take: take * 2,
  });
  if (grouped.length === 0) return [];

  const items = await prisma.uitleenItem.findMany({
    where: { id: { in: grouped.map((g) => g.itemId) }, active: true },
    include: { photos: { orderBy: { sortIndex: 'asc' } } },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  return grouped
    .map((g) => byId.get(g.itemId))
    .filter((i): i is (typeof items)[number] => Boolean(i))
    .slice(0, take)
    .map(toCatalogItem);
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
  return prisma.uitleenTransportBooking.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      vehicle: { select: { nameNl: true, nameEn: true } },
      payments: { where: { status: 'SUCCEEDED' }, select: { id: true, status: true } },
    },
  });
}

/** Actieve voertuigen, voor de aanvraagkeuze door leden. */
export async function activeVehicles() {
  return prisma.uitleenVehicle.findMany({
    where: { active: true },
    orderBy: { sortIndex: 'asc' },
  });
}

export async function adminVehicles() {
  return prisma.uitleenVehicle.findMany({ orderBy: [{ active: 'desc' }, { sortIndex: 'asc' }] });
}

const LOGISTIEK_SETTINGS_KEY = 'logistiek.settings';

export type LogistiekSettings = { showRentPrices: boolean };

/** Kringinstellingen (bv. huurprijzen tonen). Default: huurprijzen verbergen. */
export async function getLogistiekSettings(): Promise<LogistiekSettings> {
  const row = await prisma.setting.findUnique({ where: { key: LOGISTIEK_SETTINGS_KEY } });
  const value = (row?.value ?? null) as { showRentPrices?: boolean } | null;
  return { showRentPrices: Boolean(value?.showRentPrices) };
}

export async function reservationForUser(id: string, userId: string) {
  return prisma.uitleenReservation.findFirst({
    where: { id, userId },
    include: {
      lines: true,
      flesserkeLines: true,
      payments: { orderBy: { createdAt: 'desc' } },
      group: { select: { nameNl: true, nameEn: true } },
    },
  });
}

export async function vanBookingForUser(id: string, userId: string) {
  return prisma.uitleenTransportBooking.findFirst({
    where: { id, userId },
    include: {
      payments: { orderBy: { createdAt: 'desc' } },
      driver: { select: { name: true } },
      vehicle: { select: { nameNl: true, nameEn: true } },
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
  flesserkeLines: { include: { item: { select: { quantity: true } } } },
  user: { select: { id: true, name: true, email: true } },
  group: { select: { nameNl: true, nameEn: true } },
  payments: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.UitleenReservationInclude;

export type AdminReservation = Awaited<ReturnType<typeof adminReservations>>[number];

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
  return prisma.uitleenTransportBooking.findMany({
    orderBy: [{ startAt: 'desc' }],
    include: {
      user: { select: { id: true, name: true, email: true } },
      driver: { select: { id: true, name: true } },
      vehicle: { select: { nameNl: true, nameEn: true } },
      group: { select: { nameNl: true, nameEn: true } },
      payments: { orderBy: { createdAt: 'desc' } },
    },
    take: 200,
  });
}

export type AdminTransportBooking = Awaited<ReturnType<typeof adminVanBookings>>[number];

/** Alle actieve posten, voor de INTERN-keuze door het team bij het bewerken. */
export async function activeGroups() {
  return prisma.group.findMany({
    where: { active: true },
    select: { id: true, nameNl: true, nameEn: true },
    orderBy: { orderInPraesidium: 'asc' },
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
    prisma.uitleenItem.findMany({
      orderBy: { name: 'asc' },
      include: {
        setContents: { orderBy: { sortIndex: 'asc' } },
        photos: { orderBy: { sortIndex: 'asc' } },
        properties: { orderBy: { sortIndex: 'asc' } },
        downloads: { orderBy: { sortIndex: 'asc' } },
      },
    }),
  ]);
  return { categories, items };
}

export type AdminInventoryItem = Awaited<ReturnType<typeof adminInventory>>['items'][number];

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
    prisma.uitleenTransportBooking.findMany({
      where: { status: 'APPROVED', startAt: { gte: from, lte: new Date(to.getTime() + 24 * 60 * 60 * 1000) } },
      include: {
        user: { select: { name: true } },
        driver: { select: { name: true } },
        vehicle: { select: { nameNl: true } },
      },
      orderBy: { startAt: 'asc' },
    }),
  ]);
  return { pickups, returns, vanBookings };
}
