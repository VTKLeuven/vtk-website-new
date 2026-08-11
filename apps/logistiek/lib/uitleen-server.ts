import 'server-only';

import { prisma } from '@vtk/db';
import type { Prisma } from '@prisma/client';
import { currentWorkingYear } from '@vtk/auth';
import { DEFAULT_LAST_MINUTE_DAYS, STOCK_CONSUMING_STATUSES } from './uitleen';

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
  /** Inhoud van een set, beschrijvend; leeg voor een gewoon item. */
  setContents: Array<{ label: string; quantity: number }>;
  /** Items die het team als alternatief aanduidde; zie UitleenItemAlternative. */
  alternativeIds: string[];
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
  setContents?: Array<{ label: string; quantity: number }>;
  alternatives?: Array<{ alternativeId: string }>;
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
    setContents: item.setContents ?? [],
    alternativeIds: (item.alternatives ?? []).map((a) => a.alternativeId),
  };
}

/**
 * Wat een gewoon lid van een item mag zien. Expliciet een `select` en geen
 * `include`: waar iets in de loods ligt (`locationShelf`/`locationRack`) en wat
 * het team erover noteerde (`condition`/`conditionNote`) gaat enkel Logistiek
 * aan, en een weglating in de weergave is geen bescherming; de velden zaten dan
 * nog altijd in de payload en zouden bij de eerstvolgende `{...item}` opnieuw
 * meeliften.
 */
const memberItemSelect = {
  id: true,
  categoryId: true,
  name: true,
  description: true,
  quantity: true,
  depositCents: true,
  priceCents: true,
  photoKey: true,
  isSet: true,
  photos: { orderBy: { sortIndex: 'asc' as const }, select: { key: true } },
  // De inhoud van een set hoort in de catalogus zelf: anders moet je naar de
  // detailpagina om te weten of de cantusset de vaten bevat of niet.
  setContents: { orderBy: { sortIndex: 'asc' as const }, select: { label: true, quantity: true } },
  alternatives: { select: { alternativeId: true } },
} satisfies Prisma.UitleenItemSelect;

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
      select: memberItemSelect,
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
  colruytUrl: string | null;
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
    select: {
      ...memberItemSelect,
      category: { select: { name: true } },
      properties: { orderBy: { sortIndex: 'asc' as const } },
      downloads: { orderBy: { sortIndex: 'asc' as const } },
    },
  });
}

/**
 * De loodsgegevens van een item: waar het ligt en wat het team over de staat
 * noteerde. Een aparte query in plaats van een vlag op `itemDetail`, zodat de
 * kolommen enkel opgehaald worden wanneer de aanroeper `logistiek.manage` heeft
 * en er geen pad bestaat waarlangs ze per ongeluk in de ledenrespons belanden.
 */
export async function itemTeamDetails(id: string) {
  return prisma.uitleenItem.findUnique({
    where: { id },
    select: { locationShelf: true, locationRack: true, condition: true, conditionNote: true },
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
    select: memberItemSelect,
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

export type LogistiekSettings = { showRentPrices: boolean; lastMinuteDays: number };

/**
 * Kringinstellingen, als één JSON-blob in `Setting`. Defaults: huurprijzen
 * verbergen en zeven dagen last minute. Een ontbrekende of onzinnige waarde valt
 * terug op de default in plaats van de pagina te doen falen; dit is een
 * instelling, geen invoer.
 */
export async function getLogistiekSettings(): Promise<LogistiekSettings> {
  const row = await prisma.setting.findUnique({ where: { key: LOGISTIEK_SETTINGS_KEY } });
  const value = (row?.value ?? null) as {
    showRentPrices?: boolean;
    lastMinuteDays?: number;
  } | null;
  const days = Number(value?.lastMinuteDays);
  return {
    showRentPrices: Boolean(value?.showRentPrices),
    lastMinuteDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_LAST_MINUTE_DAYS,
  };
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

/**
 * Historiek, oudste eerst. Enkel op een detailpagina opgehaald: in de lijst van
 * tweehonderd aanvragen zou dit per rij een extra query kosten voor iets dat
 * daar toch niet getoond wordt.
 */
const auditLogInclude = {
  orderBy: { createdAt: 'asc' as const },
  include: { actor: { select: { name: true } } },
};

export async function adminReservation(id: string) {
  return prisma.uitleenReservation.findUnique({
    where: { id },
    include: { ...adminReservationInclude, auditLogs: auditLogInclude },
  });
}

export type UitleenAuditEntry = {
  id: string;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: Date;
  actor: { name: string } | null;
};

/**
 * Historiek van meerdere ritten in één query, gegroepeerd per rit. De
 * vervoerlijst rendert de details van elke rij (ingeklapt), dus een query per
 * rit zou er tweehonderd zijn.
 */
export async function transportAuditLogsByBooking(
  bookingIds: string[]
): Promise<Map<string, UitleenAuditEntry[]>> {
  const byBooking = new Map<string, UitleenAuditEntry[]>();
  if (bookingIds.length === 0) return byBooking;

  const logs = await prisma.uitleenAuditLog.findMany({
    where: { transportBookingId: { in: bookingIds } },
    ...auditLogInclude,
  });
  for (const log of logs) {
    if (!log.transportBookingId) continue;
    const list = byBooking.get(log.transportBookingId) ?? [];
    list.push(log);
    byBooking.set(log.transportBookingId, list);
  }
  return byBooking;
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

/**
 * Ritten die een venster raken, voor het weekoverzicht. Een rit telt mee zodra
 * ze het venster overlapt en niet enkel wanneer ze erin start: een rit van
 * vrijdag tot maandag hoort in beide weken te staan.
 *
 * `REQUESTED` komt mee, want het weekraster dient net om te zien waar een
 * nieuwe aanvraag nog past; het beheer toont ze in een lichtere stijl.
 */
const transportWindowWhere = (
  from: Date,
  to: Date
): Prisma.UitleenTransportBookingWhereInput => ({
  status: { in: ['REQUESTED', 'APPROVED'] },
  startAt: { lt: to },
  endAt: { gt: from },
});

export async function transportWeek(from: Date, to: Date) {
  return prisma.uitleenTransportBooking.findMany({
    where: transportWindowWhere(from, to),
    select: {
      id: true,
      vehicleId: true,
      startAt: true,
      endAt: true,
      status: true,
      purpose: true,
      eventName: true,
      requesterType: true,
      requesterName: true,
      vehicle: { select: { nameNl: true } },
      user: { select: { name: true } },
      driver: { select: { name: true } },
      group: { select: { nameNl: true } },
    },
    orderBy: { startAt: 'asc' },
  });
}

export type TransportWeekBooking = Awaited<ReturnType<typeof transportWeek>>[number];

/**
 * Zelfde venster, maar enkel wanneer welk voertuig bezet is: geen namen, doelen,
 * adressen of chauffeurs. Bewust een eigen `select` en geen filter over
 * `transportWeek`: een projectie achteraf laat vroeg of laat een veld door
 * wanneer iemand hierboven een relatie toevoegt. Voor het publieke overzicht
 * (zie docs/logistiek-feedback-plan.md, V13).
 */
export async function transportWeekPublic(from: Date, to: Date) {
  return prisma.uitleenTransportBooking.findMany({
    where: transportWindowWhere(from, to),
    select: {
      id: true,
      vehicleId: true,
      startAt: true,
      endAt: true,
      status: true,
    },
    orderBy: { startAt: 'asc' },
  });
}

/**
 * Alle actieve groepen, voor de aanvragerkeuze door het team bij het bewerken.
 * Werkgroepen zitten er mee in; `type` laat het formulier ze apart zetten in
 * plaats van ze als post aan te bieden.
 */
export async function activeGroups() {
  return prisma.group.findMany({
    where: { active: true },
    select: { id: true, nameNl: true, nameEn: true, type: true },
    orderBy: { orderInPraesidium: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Chauffeurs
// ---------------------------------------------------------------------------

/**
 * Waar een chauffeur vandaan komt: uit de post Logistiek (automatisch, per
 * werkingsjaar) of met de hand toegevoegd in /beheer/chauffeurs.
 */
export type DriverSource = 'POST' | 'EXTRA';

export type DriverOption = { id: string; name: string; source: DriverSource };

/** Leden van de post Logistiek dit werkingsjaar. */
async function logistiekTeamMembers() {
  return prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      memberships: { some: { group: { code: 'LOGISTIEK' }, year: currentWorkingYear() } },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * Iedereen die als chauffeur gekozen kan worden: de post Logistiek van dit
 * werkingsjaar plus de handmatig toegevoegde chauffeurs. Zit iemand in allebei,
 * dan telt de post (die kost geen beheerwerk en verdwijnt vanzelf op 15 juli).
 */
export async function driverOptions(): Promise<DriverOption[]> {
  const [team, extra] = await Promise.all([
    logistiekTeamMembers(),
    prisma.uitleenDriver.findMany({
      where: { user: { active: true, deletedAt: null } },
      select: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const byId = new Map<string, DriverOption>();
  for (const member of team) byId.set(member.id, { id: member.id, name: member.name, source: 'POST' });
  for (const row of extra) {
    if (byId.has(row.user.id)) continue;
    byId.set(row.user.id, { id: row.user.id, name: row.user.name, source: 'EXTRA' });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

export type DriverPoolEntry = DriverOption & {
  email: string;
  /** Id van de rij in `UitleenDriver`; null voor iemand die via de post chauffeur is. */
  driverRowId: string | null;
  note: string | null;
  /** Gedeactiveerd op vtk.be: staat nog in de lijst, maar valt uit de keuze weg. */
  inactive: boolean;
  upcomingTrips: number;
  totalTrips: number;
};

/**
 * De chauffeurslijst voor het beheerscherm: dezelfde unie als
 * {@link driverOptions}, met contactgegevens, herkomst en hoeveel ritten er aan
 * elke chauffeur hangen (zodat je ziet wie je niet zomaar weghaalt).
 */
export async function driverPool(): Promise<DriverPoolEntry[]> {
  const now = new Date();
  const [team, extra, tripCounts, upcomingCounts] = await Promise.all([
    logistiekTeamMembers(),
    prisma.uitleenDriver.findMany({
      where: { user: { deletedAt: null } },
      select: {
        id: true,
        note: true,
        user: { select: { id: true, name: true, email: true, active: true } },
      },
    }),
    prisma.uitleenTransportBooking.groupBy({
      by: ['driverId'],
      where: { driverId: { not: null }, status: { in: ['APPROVED', 'COMPLETED'] } },
      _count: { _all: true },
    }),
    prisma.uitleenTransportBooking.groupBy({
      by: ['driverId'],
      where: { driverId: { not: null }, status: 'APPROVED', endAt: { gte: now } },
      _count: { _all: true },
    }),
  ]);

  const total = new Map(tripCounts.map((row) => [row.driverId, row._count._all]));
  const upcoming = new Map(upcomingCounts.map((row) => [row.driverId, row._count._all]));

  const byId = new Map<string, DriverPoolEntry>();
  const put = (entry: Omit<DriverPoolEntry, 'upcomingTrips' | 'totalTrips'>) => {
    if (byId.has(entry.id)) return;
    byId.set(entry.id, {
      ...entry,
      upcomingTrips: upcoming.get(entry.id) ?? 0,
      totalTrips: total.get(entry.id) ?? 0,
    });
  };

  for (const member of team) {
    put({
      id: member.id,
      name: member.name,
      email: member.email,
      source: 'POST',
      driverRowId: null,
      note: null,
      inactive: false,
    });
  }
  for (const row of extra) {
    put({
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      source: 'EXTRA',
      driverRowId: row.id,
      note: row.note,
      inactive: !row.user.active,
    });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

/**
 * Actieve leden zoeken voor de chauffeurspicker, op naam, e-mail of r-nummer.
 * Spiegelt /api/users/search op de hoofdsite: server-side en gelimiteerd, zodat
 * de picker ook met duizenden leden werkt.
 */
export async function searchDriverCandidates(query: string, limit = 10) {
  const q = query.trim();
  if (q.length < 2) return [];

  return prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { rNumber: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, email: true, rNumber: true },
    orderBy: { name: 'asc' },
    take: Math.min(limit, 25),
  });
}

export type DriverCandidate = Awaited<ReturnType<typeof searchDriverCandidates>>[number];

/**
 * Staat dit lid in de chauffeurspool? Via de post of handmatig toegevoegd.
 * Bepaalt of "Mijn ritten" in de navigatie verschijnt.
 */
export async function isDriver(userId: string): Promise<boolean> {
  const [extra, membership] = await Promise.all([
    prisma.uitleenDriver.count({ where: { userId } }),
    prisma.groupMembership.count({
      where: { userId, year: currentWorkingYear(), group: { code: 'LOGISTIEK' } },
    }),
  ]);
  return extra > 0 || membership > 0;
}

/**
 * Wat de navigatie en de homepage over "Mijn ritten" moeten weten: staat dit lid
 * in de chauffeurspool, en hoeveel ritten komen er nog aan. Wie uit de pool
 * gehaald is maar nog een geplande rit heeft, houdt de link: anders verdwijnt
 * zijn planning terwijl hij nog moet rijden.
 */
export async function driverStatus(userId: string): Promise<{ isDriver: boolean; upcomingTrips: number }> {
  const [driver, upcomingTrips] = await Promise.all([
    isDriver(userId),
    prisma.uitleenTransportBooking.count({
      where: { driverId: userId, status: 'APPROVED', endAt: { gte: new Date() } },
    }),
  ]);
  return { isDriver: driver, upcomingTrips };
}

/** Toont de app "Mijn ritten" voor dit lid? */
export function showsMyTrips(status: { isDriver: boolean; upcomingTrips: number }): boolean {
  return status.isDriver || status.upcomingTrips > 0;
}

/**
 * De ritten die aan dit lid toegewezen zijn. Enkel goedgekeurde en afgeronde
 * ritten: een afgewezen of geannuleerde rit rijdt niemand, en een aanvraag die
 * nog niet beslist is heeft nog geen chauffeur.
 */
export async function tripsForDriver(driverId: string) {
  return prisma.uitleenTransportBooking.findMany({
    where: { driverId, status: { in: ['APPROVED', 'COMPLETED'] } },
    orderBy: { startAt: 'asc' },
    include: {
      user: { select: { name: true, email: true } },
      vehicle: { select: { nameNl: true, nameEn: true } },
      group: { select: { nameNl: true, nameEn: true } },
    },
  });
}

export type DriverTrip = Awaited<ReturnType<typeof tripsForDriver>>[number];

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
        alternatives: { select: { alternativeId: true } },
      },
    }),
  ]);
  return { categories, items };
}

export type AdminInventoryItem = Awaited<ReturnType<typeof adminInventory>>['items'][number];

/**
 * Afhalingen, terugbrengmomenten en ritten in een periode, voor de daglijst.
 *
 * De post (`group`), het evenement en het voertuig horen er expliciet bij: een
 * kalenderregel met enkel de naam van de aanvrager zegt het team te weinig om
 * zonder doorklikken te weten waarover het gaat.
 */
export async function adminAgenda(from: Date, to: Date) {
  const agendaReservationInclude = {
    lines: true,
    user: { select: { name: true } },
    group: { select: { nameNl: true } },
  } satisfies Prisma.UitleenReservationInclude;

  const [pickups, returns, vanBookings] = await Promise.all([
    prisma.uitleenReservation.findMany({
      where: { status: { in: ['APPROVED', 'PICKED_UP'] }, pickupDate: { gte: from, lte: to } },
      include: agendaReservationInclude,
      orderBy: { pickupDate: 'asc' },
    }),
    prisma.uitleenReservation.findMany({
      where: { status: { in: ['APPROVED', 'PICKED_UP'] }, returnDate: { gte: from, lte: to } },
      include: agendaReservationInclude,
      orderBy: { returnDate: 'asc' },
    }),
    prisma.uitleenTransportBooking.findMany({
      where: { status: 'APPROVED', startAt: { gte: from, lte: new Date(to.getTime() + 24 * 60 * 60 * 1000) } },
      include: {
        user: { select: { name: true } },
        driver: { select: { name: true } },
        vehicle: { select: { nameNl: true } },
        group: { select: { nameNl: true } },
      },
      orderBy: { startAt: 'asc' },
    }),
  ]);
  return { pickups, returns, vanBookings };
}
