import 'server-only';
import { prisma } from '@vtk/db';
import type { Prisma, UitleenRequesterType } from '@prisma/client';
import { STOCK_CONSUMING_STATUSES } from '@/lib/uitleen';
import { auditLogInclude, yearsBetween } from './shared';

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

export type AdminReservation = Prisma.UitleenReservationGetPayload<{ include: typeof adminReservationInclude }>;

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

/**
 * Open werk bij materiaal en flesserke: te beslissen, goedgekeurd en afgehaald,
 * plus wat teruggebracht is maar nog niet rond (een externe die nog moet betalen
 * of een waarborg die nog terug moet). Zonder bovengrens (L2): de lijst stopte
 * bij de laatste 200 aanvragen, en dan viel net de oudste openstaande weg.
 */
export const OPEN_RESERVATION_WHERE: Prisma.UitleenReservationWhereInput = {
  OR: [
    { status: { in: ['REQUESTED', 'APPROVED', 'PICKED_UP'] } },
    {
      status: 'RETURNED',
      requesterType: 'EXTERN',
      OR: [
        { totalPriceCents: { gt: 0 }, paidOfflineAt: null, payments: { none: { status: 'SUCCEEDED' } } },
        { totalDepositCents: { gt: 0 }, depositReturnedAt: null },
      ],
    },
  ],
};

export async function adminReservationsOpen(requesterType?: UitleenRequesterType) {
  return prisma.uitleenReservation.findMany({
    where: { AND: [OPEN_RESERVATION_WHERE, requesterType ? { requesterType } : {}] },
    orderBy: [{ createdAt: 'desc' }],
    include: adminReservationInclude,
  });
}

export const RESERVATION_ARCHIVE_PAGE_SIZE = 50;

/** Het archief: al de rest, per werkingsjaar van de afhaaldatum, met pagina's. */
export async function adminReservationsArchive(year: number, page: number, requesterType?: UitleenRequesterType) {
  // `pickupDate` is een datum zonder uur, als middernacht UTC bewaard.
  const where: Prisma.UitleenReservationWhereInput = {
    pickupDate: { gte: new Date(Date.UTC(year, 6, 15)), lt: new Date(Date.UTC(year + 1, 6, 15)) },
    NOT: OPEN_RESERVATION_WHERE,
    ...(requesterType ? { requesterType } : {}),
  };
  const total = await prisma.uitleenReservation.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / RESERVATION_ARCHIVE_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  const rows = await prisma.uitleenReservation.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    include: adminReservationInclude,
    skip: (current - 1) * RESERVATION_ARCHIVE_PAGE_SIZE,
    take: RESERVATION_ARCHIVE_PAGE_SIZE,
  });
  return { rows, total, page: current, pageCount };
}

/** De werkingsjaren met aanvragen, nieuwste eerst, voor de keuze van het archief. */
export async function adminReservationYears(): Promise<number[]> {
  const [first, last] = await Promise.all([
    prisma.uitleenReservation.findFirst({ orderBy: { pickupDate: 'asc' }, select: { pickupDate: true } }),
    prisma.uitleenReservation.findFirst({ orderBy: { pickupDate: 'desc' }, select: { pickupDate: true } }),
  ]);
  return yearsBetween(first?.pickupDate, last?.pickupDate);
}

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
