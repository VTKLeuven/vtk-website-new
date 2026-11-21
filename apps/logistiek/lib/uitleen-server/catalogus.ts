import 'server-only';
import { prisma } from '@vtk/db';
import type { Prisma } from '@prisma/client';
import { STOCK_CONSUMING_STATUSES } from '@/lib/uitleen';

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
