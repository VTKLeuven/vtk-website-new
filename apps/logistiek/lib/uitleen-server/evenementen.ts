import 'server-only';
import { prisma } from '@vtk/db';
import type { Prisma } from '@prisma/client';
import { workingYearBounds, yearsBetween } from './shared';

/**
 * De evenementen die dit venster raken, voor de balken boven de transportplanning
 * (P5).
 *
 * Enkel evenementen met een startmoment: een evenement zonder datum heeft geen
 * plek op een kalender, en het bovenaan of onderaan plakken zou beweren dat het
 * ergens valt.
 *
 * Een evenement zonder einde duurt tot het einde van zijn startdag; anders werd
 * het een balk van nul breed, en dat is precies het evenement waarvan het team
 * het uur nog niet ingevuld heeft.
 */
export async function eventsInRange(from: Date, to: Date) {
  const events = await prisma.uitleenEvent.findMany({
    where: {
      startAt: { not: null, lt: to },
      OR: [{ endAt: null }, { endAt: { gt: from } }],
    },
    select: {
      id: true,
      name: true,
      location: true,
      startAt: true,
      startTimeKnown: true,
      endAt: true,
      note: true,
      group: { select: { nameNl: true } },
      _count: { select: { reservations: true, transport: true } },
    },
    orderBy: { startAt: 'asc' },
  });
  // Het einde per evenement afronden gebeurt hier en niet in de query: Prisma
  // kan geen `endAt ?? einde van de startdag` in een `where` zetten, dus een
  // meerdaags evenement dat vóór dit venster begon en geen einde heeft, filteren
  // we er alsnog uit.
  return events.filter((event) => (event.endAt ?? event.startAt!) >= from || event.startAt! >= from);
}

export type PlanningEvent = Awaited<ReturnType<typeof eventsInRange>>[number];

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
export async function adminEventsUpcoming(): Promise<AdminEvent[]> {
  // Komend, gisteren nog bezig, of zonder datum: zonder bovengrens (L2).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.uitleenEvent.findMany({
    where: { OR: [{ startAt: null }, { startAt: { gte: since } }] },
    orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
    include: eventInclude,
  });
}

export const EVENT_ARCHIVE_PAGE_SIZE = 30;

/** Voorbije evenementen van één werkingsjaar, recentste eerst, met pagina's. */
export async function adminEventsArchive(year: number, page: number) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { from, to } = workingYearBounds(year);
  const where: Prisma.UitleenEventWhereInput = { startAt: { gte: from, lt: to.getTime() < since.getTime() ? to : since } };
  const total = await prisma.uitleenEvent.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / EVENT_ARCHIVE_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  const rows = await prisma.uitleenEvent.findMany({
    where,
    orderBy: [{ startAt: 'desc' }],
    include: eventInclude,
    skip: (current - 1) * EVENT_ARCHIVE_PAGE_SIZE,
    take: EVENT_ARCHIVE_PAGE_SIZE,
  });
  return { rows, total, page: current, pageCount };
}

/** De werkingsjaren met evenementen, voor de keuze van het archief. */
export async function adminEventYears(): Promise<number[]> {
  const [first, last] = await Promise.all([
    prisma.uitleenEvent.findFirst({ where: { startAt: { not: null } }, orderBy: { startAt: 'asc' }, select: { startAt: true } }),
    prisma.uitleenEvent.findFirst({ where: { startAt: { not: null } }, orderBy: { startAt: 'desc' }, select: { startAt: true } }),
  ]);
  return yearsBetween(first?.startAt ?? undefined, last?.startAt ?? undefined);
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
