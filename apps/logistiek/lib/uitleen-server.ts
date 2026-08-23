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
  contentUnit: string | null;
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
 * Zet `quantity` van een materiaal-item gelijk aan zijn bruikbare exemplaren.
 *
 * Enkel wanneer het item exemplaren heeft; zonder exemplaren blijft `quantity`
 * het getal dat het team zelf invulde, en verandert er dus niets aan het gedrag
 * van voordien. Zo hoeft de inventaris niet in één keer opgesplitst te worden.
 *
 * Bruikbaar = actief en niet KAPOT. TESTEN en ONVOLLEDIG tellen wél mee: een
 * onvolledige set is nog altijd uitleenbaar, en wie ze niet wil uitlenen zet het
 * exemplaar op inactief. Alleen kapot is hard.
 *
 * Roep dit aan binnen dezelfde transactie als elke wijziging aan de exemplaren.
 */
export async function syncItemQuantityFromUnits(
  tx: Prisma.TransactionClient,
  itemId: string
): Promise<void> {
  const units = await tx.uitleenItemUnit.findMany({
    where: { itemId },
    select: { active: true, condition: true },
  });
  if (units.length === 0) return;
  const usable = units.filter((unit) => unit.active && unit.condition !== 'KAPOT').length;
  await tx.uitleenItem.update({ where: { id: itemId }, data: { quantity: usable } });
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
    select: {
      locationShelf: true,
      locationRack: true,
      condition: true,
      conditionNote: true,
      // De staat per exemplaar, wanneer dit item ze bijhoudt: "Werkt" op de rij
      // zegt dan niets over die ene kapotte box.
      units: {
        where: { active: true },
        orderBy: [{ sortIndex: 'asc' }, { label: 'asc' }],
        select: { label: true, condition: true, conditionNote: true },
      },
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
      // Een afgewezen lijn neemt geen voorraad in (M3). Ze blijft wel op de
      // aanvraag staan, met de reden erbij, dus filteren op de aanvraag alleen
      // volstaat niet: één afgewezen tafel op een verder goedgekeurde aanvraag
      // zou anders de rest van de week als geboekt tellen.
      lineStatus: { not: 'REJECTED' },
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

/**
 * De aanvragen die dit lid mag zien: die van hemzelf, plus de materiaal- en
 * flesserke-aanvragen van zijn posten.
 *
 * Een post bestelt als post: wie op maandag materiaal aanvroeg en op woensdag
 * ziek is, laat de rest van de post anders in het ongewisse over wat er al
 * geregeld is, en dan wordt hetzelfde twee keer aangevraagd. Enkel INTERN
 * hangt aan een post; een werkgroepaanvraag bewaart geen `groupId` (zie
 * `deriveMemberRequester`) en blijft dus persoonlijk.
 *
 * Wie een aanvraag van een collega opent, ziet ze; aanpassen en annuleren blijft
 * aan de aanvrager (zie `reservationForMember`).
 */
export async function myReservations(userId: string, groupIds: string[] = []) {
  return prisma.uitleenReservation.findMany({
    where:
      groupIds.length > 0
        ? { OR: [{ userId }, { requesterType: 'INTERN', groupId: { in: groupIds } }] }
        : { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      lines: true,
      // Om materiaal en flesserke uit elkaar te houden in het overzicht: een
      // aanvraag kan allebei bevatten.
      flesserkeLines: { select: { id: true, quantity: true, itemName: true } },
      user: { select: { id: true, name: true } },
      group: { select: { nameNl: true, nameEn: true } },
      payments: { where: { status: 'SUCCEEDED' }, select: { id: true, status: true } },
      // Voor R8: of de gevraagde levering al een gekoppelde rit heeft. Enkel
      // relevant wanneer `delivery` waar is; ongefilterd op status, net als de
      // logi-badge in beheer/aanvragen die ook gewoon telt of er een rit bestaat.
      transports: { orderBy: { startAt: 'asc' }, select: { id: true, startAt: true } },
    },
  });
}

/** Zoals `myReservations`: eigen ritten plus die van je posten. */
/**
 * Welke aanvragen en ritten iemand anders gewijzigd heeft sinds de aanvrager ze
 * laatst bekeek (R5).
 *
 * De historiek is de bron: daar staat wie wat wanneer deed. Een vergelijking op
 * `updatedAt` zou ook aanslaan op wat de aanvrager zelf net wijzigde, en op
 * velden die niemand ziet.
 */
export async function unseenChanges(
  userId: string,
  targets: { reservationIds: string[]; transportBookingIds: string[] },
  seenAt: Map<string, Date | null>
): Promise<Set<string>> {
  const ids = [...targets.reservationIds, ...targets.transportBookingIds];
  if (ids.length === 0) return new Set();

  const logs = await prisma.uitleenAuditLog.findMany({
    where: {
      OR: [
        { reservationId: { in: targets.reservationIds } },
        { transportBookingId: { in: targets.transportBookingIds } },
      ],
      // Wat het lid zelf deed, is geen nieuws voor hem.
      NOT: { actorId: userId },
    },
    select: { reservationId: true, transportBookingId: true, createdAt: true },
  });

  const changed = new Set<string>();
  for (const log of logs) {
    const id = log.reservationId ?? log.transportBookingId;
    if (!id) continue;
    const seen = seenAt.get(id) ?? null;
    if (seen === null || log.createdAt > seen) changed.add(id);
  }
  return changed;
}

export async function myVanBookings(userId: string, groupIds: string[] = []) {
  return prisma.uitleenTransportBooking.findMany({
    where:
      groupIds.length > 0
        ? { OR: [{ userId }, { requesterType: 'INTERN', groupId: { in: groupIds } }] }
        : { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      vehicle: { select: { nameNl: true, nameEn: true } },
      user: { select: { id: true, name: true } },
      payments: { where: { status: 'SUCCEEDED' }, select: { id: true, status: true } },
      // Voor R1: het evenement waar de rit bij hoort, zodat "Mijn reservaties"
      // dezelfde koppeling toont als het materiaalgedeelte.
      event: { select: { id: true, name: true } },
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

const memberReservationInclude = {
  lines: true,
  flesserkeLines: true,
  payments: { orderBy: { createdAt: 'desc' as const } },
  group: { select: { nameNl: true, nameEn: true } },
  user: { select: { id: true, name: true } },
  // Voor R8: zie de gelijknamige select in `myReservations` hierboven.
  transports: { orderBy: { startAt: 'asc' as const }, select: { id: true, startAt: true } },
};

export async function reservationForUser(id: string, userId: string) {
  return prisma.uitleenReservation.findFirst({
    where: { id, userId },
    include: memberReservationInclude,
  });
}

/**
 * Een aanvraag die dit lid mag openen: die van hemzelf, of een interne aanvraag
 * van een van zijn posten.
 *
 * Alleen lezen in dat tweede geval. Zien wat de post besteld heeft, voorkomt dat
 * hetzelfde twee keer aangevraagd wordt; ze kunnen aanpassen of annuleren is
 * iets anders, want dan haalt iemand materiaal weg onder de aanvrager zonder dat
 * die het merkt. De pagina zet die knoppen daarom uit voor een collega.
 */
export async function reservationForMember(id: string, userId: string, groupIds: string[]) {
  return prisma.uitleenReservation.findFirst({
    where: {
      id,
      OR: [
        { userId },
        ...(groupIds.length > 0
          ? [{ requesterType: 'INTERN' as const, groupId: { in: groupIds } }]
          : []),
      ],
    },
    include: memberReservationInclude,
  });
}

/** Zoals `reservationForMember`: eigen rit, of een interne rit van je post. */
export async function vanBookingForMember(id: string, userId: string, groupIds: string[]) {
  return prisma.uitleenTransportBooking.findFirst({
    where: {
      id,
      OR: [
        { userId },
        ...(groupIds.length > 0
          ? [{ requesterType: 'INTERN' as const, groupId: { in: groupIds } }]
          : []),
      ],
    },
    include: {
      payments: { orderBy: { createdAt: 'desc' } },
      driver: { select: { name: true } },
      vehicle: { select: { nameNl: true, nameEn: true } },
      user: { select: { id: true, name: true } },
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
  // Op naam, en niet in de volgorde die Postgres toevallig teruggeeft: zonder
  // `orderBy` verspringt een lijn zodra ze aangepast wordt (de rij verhuist in de
  // heap), en dan schuift de klaarzetlijst onder je handen weg terwijl je aan het
  // afvinken bent.
  lines: {
    include: { item: { select: { quantity: true, active: true } } },
    orderBy: { itemName: 'asc' as const },
  },
  flesserkeLines: { include: { item: { select: { quantity: true } } } },
  user: { select: { id: true, name: true, email: true } },
  group: { select: { nameNl: true, nameEn: true } },
  event: { select: { id: true, name: true } },
  payments: { orderBy: { createdAt: 'desc' as const } },
  // Enkel het aantal: de lijst wil weten of een gevraagde levering al een rit
  // geworden is, niet welke. De ritten zelf haalt de detailpagina op.
  _count: { select: { transports: true } },
} satisfies Prisma.UitleenReservationInclude;

export type AdminReservation = Awaited<ReturnType<typeof adminReservations>>[number];

/**
 * Een lijn die niet past in de gevraagde periode, met de aanvragen waarmee ze
 * botst.
 *
 * Altijd opnieuw berekend en nooit opgeslagen: een conflict verdwijnt zodra de
 * andere aanvraag geannuleerd of teruggedraaid wordt, en een opgeslagen vlag zou
 * dan blijven staan tot iemand ze toevallig aanraakt.
 */
export type ReservationConflict = {
  itemId: string;
  itemName: string;
  requested: number;
  /** Vrij in deze periode, deze aanvraag zelf niet meegerekend. */
  available: number;
  clashes: Array<{
    id: string;
    eventName: string;
    quantity: number;
    pickupDate: Date;
    returnDate: Date;
    createdAt: Date;
    requester: string;
  }>;
};

function requesterLabelOf(reservation: {
  requesterType: string;
  requesterName: string | null;
  group: { nameNl: string } | null;
  user: { name: string };
}): string {
  if (reservation.requesterType === 'INTERN' && reservation.group) return reservation.group.nameNl;
  return reservation.requesterName ?? reservation.user.name;
}

/**
 * Welke lijnen van deze aanvraag niet passen, en met welke goedgekeurde
 * aanvragen ze botsen. Leeg wanneer alles past.
 *
 * De aanvraag zelf telt niet mee (ook niet wanneer ze al goedgekeurd is): anders
 * botst elke goedgekeurde aanvraag met zichzelf.
 */
export async function reservationConflicts(
  reservationId: string,
  /** Andere datums doorrekenen zonder ze op te slaan, voor de schuif-preview. */
  override?: { pickupDate: Date; returnDate: Date }
): Promise<ReservationConflict[]> {
  const found = await prisma.uitleenReservation.findUnique({
    where: { id: reservationId },
    select: {
      pickupDate: true,
      returnDate: true,
      lines: { select: { itemId: true, itemName: true, quantity: true } },
    },
  });
  if (!found || found.lines.length === 0) return [];
  const reservation = override ? { ...found, ...override } : found;

  const itemIds = reservation.lines.map((line) => line.itemId);
  const [items, overlapping] = await Promise.all([
    prisma.uitleenItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, quantity: true },
    }),
    prisma.uitleenReservation.findMany({
      where: {
        id: { not: reservationId },
        status: { in: STOCK_CONSUMING_STATUSES },
        pickupDate: { lte: reservation.returnDate },
        returnDate: { gte: reservation.pickupDate },
        lines: { some: { itemId: { in: itemIds } } },
      },
      select: {
        id: true,
        eventName: true,
        pickupDate: true,
        returnDate: true,
        createdAt: true,
        requesterType: true,
        requesterName: true,
        group: { select: { nameNl: true } },
        user: { select: { name: true } },
        lines: { select: { itemId: true, quantity: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const stockById = new Map(items.map((item) => [item.id, item.quantity]));

  const conflicts: ReservationConflict[] = [];
  for (const line of reservation.lines) {
    const takenBy = overlapping.filter((other) =>
      other.lines.some((otherLine) => otherLine.itemId === line.itemId)
    );
    const taken = takenBy.reduce(
      (total, other) =>
        total +
        other.lines
          .filter((otherLine) => otherLine.itemId === line.itemId)
          .reduce((sum, otherLine) => sum + otherLine.quantity, 0),
      0
    );
    const available = (stockById.get(line.itemId) ?? 0) - taken;
    if (line.quantity <= available) continue;
    conflicts.push({
      itemId: line.itemId,
      itemName: line.itemName,
      requested: line.quantity,
      available: Math.max(0, available),
      clashes: takenBy.map((other) => ({
        id: other.id,
        eventName: other.eventName,
        quantity: other.lines
          .filter((otherLine) => otherLine.itemId === line.itemId)
          .reduce((sum, otherLine) => sum + otherLine.quantity, 0),
        pickupDate: other.pickupDate,
        returnDate: other.returnDate,
        createdAt: other.createdAt,
        requester: requesterLabelOf(other),
      })),
    });
  }
  return conflicts;
}

/**
 * De id's van de openstaande aanvragen die niet passen, voor de badge in de
 * lijst. Eén query in plaats van `reservationConflicts` per rij: de lijst toont
 * er tweehonderd.
 */
export async function conflictingReservationIds(): Promise<Set<string>> {
  const [open, blocking, items] = await Promise.all([
    prisma.uitleenReservation.findMany({
      where: { status: 'REQUESTED', lines: { some: {} } },
      select: {
        id: true,
        pickupDate: true,
        returnDate: true,
        lines: { select: { itemId: true, quantity: true } },
      },
    }),
    prisma.uitleenReservation.findMany({
      where: { status: { in: STOCK_CONSUMING_STATUSES } },
      select: {
        pickupDate: true,
        returnDate: true,
        lines: { select: { itemId: true, quantity: true } },
      },
    }),
    prisma.uitleenItem.findMany({ select: { id: true, quantity: true } }),
  ]);
  const stockById = new Map(items.map((item) => [item.id, item.quantity]));

  const conflicting = new Set<string>();
  for (const reservation of open) {
    const overlapping = blocking.filter(
      (other) => other.pickupDate <= reservation.returnDate && other.returnDate >= reservation.pickupDate
    );
    for (const line of reservation.lines) {
      const taken = overlapping.reduce(
        (total, other) =>
          total +
          other.lines
            .filter((otherLine) => otherLine.itemId === line.itemId)
            .reduce((sum, otherLine) => sum + otherLine.quantity, 0),
        0
      );
      if (line.quantity > (stockById.get(line.itemId) ?? 0) - taken) {
        conflicting.add(reservation.id);
        break;
      }
    }
  }
  return conflicting;
}

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

/**
 * De detailpagina heeft per lijn meer nodig dan de lijst: waar het item ligt (de
 * klaarzetlijst en het printblad) en wie het al klaarzette. Dat hangt hier en
 * niet in `adminReservationInclude`, want die haalt tweehonderd aanvragen op en
 * betaalt die extra kolommen dan tweehonderd keer voor niets.
 */
const adminReservationLinesDetail = {
  include: {
    item: {
      select: {
        quantity: true,
        active: true,
        locationShelf: true,
        locationRack: true,
      },
    },
    preparedBy: { select: { name: true } },
  },
  orderBy: { itemName: 'asc' as const },
} satisfies Prisma.UitleenReservation$linesArgs;

export async function adminReservation(id: string) {
  return prisma.uitleenReservation.findUnique({
    where: { id },
    include: {
      ...adminReservationInclude,
      lines: adminReservationLinesDetail,
      auditLogs: auditLogInclude,
      // De ritten die als levering bij deze aanvraag horen. Enkel hier en niet in
      // de lijst: die haalt tweehonderd aanvragen op.
      transports: {
        orderBy: { startAt: 'asc' },
        select: {
          id: true,
          status: true,
          startAt: true,
          endAt: true,
          tripLeg: true,
          vehicle: { select: { nameNl: true } },
        },
      },
    },
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
      // `needsDriver`: bij de bakfiets hoort geen chauffeur, dus die rit mag ook
      // niet als onafgewerkt aangeduid staan (T13).
      vehicle: { select: { nameNl: true, nameEn: true, needsDriver: true } },
      group: { select: { nameNl: true, nameEn: true } },
      event: { select: { id: true, name: true } },
      payments: { orderBy: { createdAt: 'desc' } },
      // De materiaalaanvraag waarvan dit de levering is, zodat de chauffeur ziet
      // wat er mee moet en het team van hieruit naar die aanvraag kan.
      reservation: { select: { id: true, eventName: true } },
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

/**
 * De ritten van één week voor de transportplanning (T7).
 *
 * Meer velden dan het oude raster nodig had: sinds er vanuit dit scherm beslist
 * en aangepast wordt, moet het venster dezelfde gegevens hebben als de lijst.
 */
export async function transportWeek(from: Date, to: Date) {
  return prisma.uitleenTransportBooking.findMany({
    where: transportWindowWhere(from, to),
    select: {
      id: true,
      vehicleId: true,
      tripGroupId: true,
      tripLeg: true,
      startAt: true,
      endAt: true,
      status: true,
      purpose: true,
      eventName: true,
      requesterType: true,
      requesterName: true,
      contactPhone: true,
      pickupAddress: true,
      destination: true,
      pricingMode: true,
      paidOfflineAt: true,
      driverId: true,
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
/**
 * Hetzelfde weekvenster, maar geanonimiseerd: enkel voertuig, dag en
 * tijdvenster. Een eigen projectie en geen filter over de beheerquery, want dat
 * laatste lekt vroeg of laat een veld mee.
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
 * Het weekvenster voor een ingelogd lid (T8): dezelfde planning als het team
 * ziet, met het evenement en de chauffeur erbij, maar zonder adressen,
 * telefoonnummers en bedragen.
 *
 * Waarom een derde projectie naast de publieke en de beheerversie: wie zonder
 * login kijkt, hoort de werking van de kring niet te zien (zie
 * `transportWeekPublic`), terwijl een praesidiumlid net wél moet kunnen zien wie
 * welk ritje doet. Die twee in één query met een vlag zou betekenen dat één
 * vergeten `if` de namen aan de straatkant zet.
 */
export async function transportWeekForMembers(from: Date, to: Date) {
  return prisma.uitleenTransportBooking.findMany({
    where: { ...transportWindowWhere(from, to), status: { not: 'CANCELLED' } },
    select: {
      id: true,
      vehicleId: true,
      startAt: true,
      endAt: true,
      status: true,
      purpose: true,
      eventName: true,
      driverId: true,
      driver: { select: { name: true } },
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

export type DriverOption = {
  id: string;
  name: string;
  source: DriverSource;
  /** Mag met de kar rijden, de bestelwagen; zie `UitleenDriver.canDriveVan`. */
  canDriveVan: boolean;
};

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
      select: { canDriveVan: true, user: { select: { id: true, name: true } } },
    }),
  ]);

  // Een postlid kan óók een rij hier hebben: die wordt aangemaakt zodra iemand de
  // karvlag zet. De bron blijft dan POST (die verdwijnt vanzelf op 15 juli), maar
  // de vlag komt uit de rij.
  const vanFlag = new Map(extra.map((row) => [row.user.id, row.canDriveVan]));

  const byId = new Map<string, DriverOption>();
  for (const member of team) {
    byId.set(member.id, {
      id: member.id,
      name: member.name,
      source: 'POST',
      canDriveVan: vanFlag.get(member.id) ?? false,
    });
  }
  for (const row of extra) {
    if (byId.has(row.user.id)) continue;
    byId.set(row.user.id, {
      id: row.user.id,
      name: row.user.name,
      source: 'EXTRA',
      canDriveVan: row.canDriveVan,
    });
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
        canDriveVan: true,
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

  const rowByUser = new Map(extra.map((row) => [row.user.id, row]));

  for (const member of team) {
    // `driverRowId` blijft null: een postlid haal je niet uit de lijst met de
    // knop hier, ook niet wanneer het een rij heeft voor de karvlag. Die rij
    // levert enkel de notitie en de vlag.
    const row = rowByUser.get(member.id);
    put({
      id: member.id,
      name: member.name,
      email: member.email,
      source: 'POST',
      driverRowId: null,
      note: row?.note ?? null,
      canDriveVan: row?.canDriveVan ?? false,
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
      canDriveVan: row.canDriveVan,
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
        units: { orderBy: [{ sortIndex: 'asc' }, { label: 'asc' }] },
      },
    }),
  ]);
  return { categories, items };
}

export type AdminInventoryItem = Awaited<ReturnType<typeof adminInventory>>['items'][number];

/**
 * Sjablonen voor het aanvraagformulier: naam plus de aantallen per item.
 *
 * Enkel actieve items: een sjabloon dat een item uit de catalogus voorstelt zou
 * een aanvraag opleveren die de server meteen weigert. De lijn blijft wel staan,
 * zodat het sjabloon weer compleet is als het item terugkomt.
 */
export type RequestTemplate = {
  id: string;
  name: string;
  description: string | null;
  groupName: string | null;
  lines: Array<{ itemId: string; quantity: number }>;
};

export async function requestTemplates(): Promise<RequestTemplate[]> {
  const templates = await prisma.uitleenRequestTemplate.findMany({
    where: { active: true },
    orderBy: [{ sortIndex: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      group: { select: { nameNl: true } },
      lines: {
        where: { item: { active: true } },
        select: { itemId: true, quantity: true },
      },
    },
  });
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    groupName: template.group?.nameNl ?? null,
    lines: template.lines,
  }));
}

/** Alle sjablonen met hun itemnamen, voor het beheerscherm. */
export async function adminRequestTemplates() {
  return prisma.uitleenRequestTemplate.findMany({
    orderBy: [{ sortIndex: 'asc' }, { name: 'asc' }],
    include: {
      group: { select: { nameNl: true } },
      createdBy: { select: { name: true } },
      lines: {
        orderBy: { item: { name: 'asc' } },
        // itemId erbij: de editor vult er de aantallen mee voor in de catalogus.
        select: {
          id: true,
          itemId: true,
          quantity: true,
          item: { select: { name: true, active: true } },
        },
      },
    },
  });
}

export type AdminRequestTemplate = Awaited<ReturnType<typeof adminRequestTemplates>>[number];

// ---------------------------------------------------------------------------
// Evenementen (A8): de optionele koepel boven materiaal, flesserke en vervoer
// ---------------------------------------------------------------------------

/** Wat een evenement bindt, met alles wat eronder hangt. */
const eventInclude = {
  group: { select: { nameNl: true } },
  createdBy: { select: { name: true } },
  reservations: {
    orderBy: { pickupDate: 'asc' as const },
    select: {
      id: true,
      status: true,
      eventName: true,
      pickupDate: true,
      returnDate: true,
      pickupPart: true,
      returnPart: true,
      user: { select: { name: true } },
      lines: {
        select: {
          id: true,
          quantity: true,
          itemName: true,
          note: true,
          adminNote: true,
          lineStatus: true,
          // `volumeLiters` voor de ladingberekening, de plaats voor het
          // afdrukbare blad per evenement (E4).
          item: {
            select: { volumeLiters: true, locationShelf: true, locationRack: true },
          },
        },
      },
      flesserkeLines: { select: { id: true, quantity: true, itemName: true } },
    },
  },
  transport: {
    orderBy: { startAt: 'asc' as const },
    select: {
      id: true,
      status: true,
      purpose: true,
      startAt: true,
      endAt: true,
      tripLeg: true,
      vehicle: { select: { nameNl: true } },
      driver: { select: { name: true } },
    },
  },
  // Materiaal dat niet van Logistiek komt, en de boodschappen (E5). Ze hangen
  // aan het evenement en niet aan een aanvraag: er is geen aanvraag voor iets
  // dat je zelf meebrengt.
  extraItems: { orderBy: [{ source: 'asc' as const }, { itemName: 'asc' as const }] },
  groceryOrders: {
    orderBy: { receivedAt: 'desc' as const },
    select: {
      id: true,
      reservationNumber: true,
      status: true,
      pickupFrom: true,
      pickupPoint: true,
      lines: { select: { productName: true, quantityText: true, quantity: true, unit: true } },
    },
  },
} satisfies Prisma.UitleenEventInclude;

export type AdminEvent = Prisma.UitleenEventGetPayload<{ include: typeof eventInclude }>;

/**
 * De evenementen, recentste startdatum eerst; evenementen zonder startdatum
 * sorteren op aanmaakmoment. Bewust alles in één query: het scherm toont per
 * evenement drie soorten aanvragen naast elkaar, en dat per rij ophalen zou
 * tientallen queries kosten.
 */
export async function adminEvents(): Promise<AdminEvent[]> {
  return prisma.uitleenEvent.findMany({
    orderBy: [{ startAt: 'desc' }, { createdAt: 'desc' }],
    include: eventInclude,
    take: 200,
  });
}

/**
 * De evenementen van dit lid: die van zijn posten en werkgroepen, plus wat hij
 * zelf aanmaakte (N5).
 *
 * Waarom niet gewoon alles: een postverantwoordelijke wil weten wat er onder
 * zijn evenement hangt, niet wat de rest van de kring doet. Logistiek heeft
 * daarvoor /beheer/evenementen, met alles erin.
 */
export async function memberEvents(
  userId: string,
  groupIds: string[]
): Promise<AdminEvent[]> {
  if (groupIds.length === 0) {
    // Een externe hoort bij geen enkele groep en heeft dus ook geen evenementen;
    // wat hij zelf aanmaakte bij een aanvraag, blijft wel van hem.
    return prisma.uitleenEvent.findMany({
      where: { createdById: userId },
      orderBy: [{ startAt: 'desc' }, { createdAt: 'desc' }],
      include: eventInclude,
      take: 100,
    });
  }
  return prisma.uitleenEvent.findMany({
    where: { OR: [{ groupId: { in: groupIds } }, { createdById: userId }] },
    orderBy: [{ startAt: 'desc' }, { createdAt: 'desc' }],
    include: eventInclude,
    take: 100,
  });
}

/** Eén evenement, maar enkel wanneer dit lid eraan mag (zie {@link memberEvents}). */
export async function memberEvent(
  id: string,
  userId: string,
  groupIds: string[]
): Promise<AdminEvent | null> {
  return prisma.uitleenEvent.findFirst({
    where: {
      id,
      OR: [
        ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
        { createdById: userId },
      ],
    },
    include: eventInclude,
  });
}

export async function adminEvent(id: string): Promise<AdminEvent | null> {
  return prisma.uitleenEvent.findUnique({ where: { id }, include: eventInclude });
}

/**
 * De ladingsinschatting van een evenement.
 *
 * `volumeLiters` is optioneel per item, dus het totaal is bijna altijd
 * onvolledig. Daarom geven we allebei terug: het volume dat we kennen én het
 * aantal stuks waarvan we het niet weten. Een half volume als "het totaal" tonen
 * zou de transportverantwoordelijke een te kleine kar laten kiezen.
 */
export function eventLoad(event: AdminEvent): {
  items: number;
  liters: number;
  unknownItems: number;
} {
  let items = 0;
  let liters = 0;
  let unknownItems = 0;
  for (const reservation of event.reservations) {
    // Een afgewezen of geannuleerde aanvraag gaat niet mee op de kar.
    if (reservation.status === 'REJECTED' || reservation.status === 'CANCELLED') continue;
    for (const line of reservation.lines) {
      items += line.quantity;
      if (line.item.volumeLiters === null) unknownItems += line.quantity;
      else liters += line.item.volumeLiters * line.quantity;
    }
  }
  return { items, liters, unknownItems };
}

/**
 * Evenementen om een aanvraag aan te hangen: wat nog moet komen of net geweest
 * is. Geen filter op post: twee posten die samen een evenement doen, moeten er
 * allebei aan kunnen hangen, en dat is precies waarvoor de koepel dient.
 */
export async function selectableEvents(
  groupIds: string[] = []
): Promise<
  Array<{ id: string; name: string; startAt: Date | null; groupName: string | null; own: boolean }>
> {
  const horizon = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await prisma.uitleenEvent.findMany({
    where: { OR: [{ startAt: null }, { startAt: { gte: horizon } }] },
    orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    select: {
      id: true,
      name: true,
      startAt: true,
      groupId: true,
      group: { select: { nameNl: true } },
    },
  });
  // Evenementen van je eigen post of werkgroep eerst (N3). De rest blijft
  // gewoon staan: twee posten die samen een evenement doen, moeten er allebei
  // aan kunnen hangen, en dat is precies waarvoor de koepel dient.
  const own = new Set(groupIds);
  return events
    .map((event) => ({
      id: event.id,
      name: event.name,
      startAt: event.startAt,
      groupName: event.group?.nameNl ?? null,
      own: event.groupId !== null && own.has(event.groupId),
    }))
    .sort((a, b) => Number(b.own) - Number(a.own));
}

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
    // Voor de kalender moet zichtbaar zijn of het om materiaal, flesserke of
    // allebei gaat (F3); dat blijkt enkel uit welke lijnen er zijn.
    flesserkeLines: { select: { id: true, quantity: true, itemName: true } },
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
