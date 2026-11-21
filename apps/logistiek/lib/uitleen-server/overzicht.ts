import 'server-only';
import { prisma } from '@vtk/db';
import type { Prisma } from '@prisma/client';

/**
 * Wat de startpagina van een lid toont (C1): zijn openstaande aanvragen en ritten,
 * en de eerstvolgende ritten die hij (of zijn post) rijdt.
 *
 * Bewust klein: enkel wat open is, met een bovengrens en een telling, en niet de
 * volledige lijsten van /reservaties en /ritten. De startpagina zegt wat er
 * loopt; de volledige lijst is een klik verder.
 */
export async function memberStartOverview(userId: string, groupIds: string[] = []) {
  const now = new Date();
  const mineOrPost = (
    groupIds.length > 0 ? { OR: [{ userId }, { requesterType: 'INTERN' as const, groupId: { in: groupIds } }] } : { userId }
  );
  const reservationWhere: Prisma.UitleenReservationWhereInput = {
    AND: [mineOrPost, { status: { in: ['REQUESTED', 'APPROVED', 'PICKED_UP'] } }],
  };
  const tripWhere: Prisma.UitleenTransportBookingWhereInput = {
    AND: [mineOrPost, { status: { in: ['REQUESTED', 'APPROVED'] } }, { endAt: { gte: now } }],
  };
  const drivingWhere: Prisma.UitleenTransportBookingWhereInput = {
    status: 'APPROVED',
    endAt: { gte: now },
    OR: [
      { driverId: userId },
      ...(groupIds.length > 0 ? [{ assignedGroupId: { in: groupIds } }] : []),
    ],
  };
  const [reservations, reservationCount, trips, tripCount, driving] = await Promise.all([
    prisma.uitleenReservation.findMany({
      where: reservationWhere,
      orderBy: { pickupDate: 'asc' },
      take: 5,
      select: {
        id: true,
        eventName: true,
        status: true,
        pickupDate: true,
        returnDate: true,
        _count: { select: { lines: true, flesserkeLines: true } },
      },
    }),
    prisma.uitleenReservation.count({ where: reservationWhere }),
    prisma.uitleenTransportBooking.findMany({
      where: tripWhere,
      orderBy: { startAt: 'asc' },
      take: 5,
      select: {
        id: true,
        purpose: true,
        eventName: true,
        status: true,
        startAt: true,
        endAt: true,
        vehicle: { select: { nameNl: true, nameEn: true } },
      },
    }),
    prisma.uitleenTransportBooking.count({ where: tripWhere }),
    prisma.uitleenTransportBooking.findMany({
      where: drivingWhere,
      orderBy: { startAt: 'asc' },
      take: 3,
      select: {
        id: true,
        purpose: true,
        startAt: true,
        endAt: true,
        driverId: true,
        vehicle: { select: { nameNl: true, nameEn: true } },
      },
    }),
  ]);
  return { reservations, reservationCount, trips, tripCount, driving };
}

/**
 * Wat er op het overzicht van het beheer staat: werk, geen geschiedenis (L3).
 *
 * Het overzicht telde "teruggebracht", "uitgevoerd" en "niet doorgegaan" sinds
 * het begin: getallen die enkel groeien en niets vragen. Dit zijn de dingen die
 * iemand nu moet doen. Enkel externen betalen en krijgen een waarborg terug
 * (`chargesRequester`), dus enkel zij tellen voor geld.
 */
export async function adminWorkCounts(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const unpaid = { paidOfflineAt: null, payments: { none: { status: 'SUCCEEDED' as const } } };
  const [decideMaterial, tripRequests, overdue, noDriver, unpaidReservations, unpaidTrips, deposits] =
    await Promise.all([
      prisma.uitleenReservation.count({ where: { status: 'REQUESTED' } }),
      prisma.uitleenTransportBooking.findMany({
        where: { status: 'REQUESTED' },
        select: { id: true, tripGroupId: true },
      }),
      prisma.uitleenReservation.count({ where: { status: 'PICKED_UP', returnDate: { lt: today } } }),
      prisma.uitleenTransportBooking.count({
        where: { status: 'APPROVED', driverId: null, endAt: { gte: now }, vehicle: { needsDriver: true } },
      }),
      prisma.uitleenReservation.count({
        where: {
          requesterType: 'EXTERN',
          status: { in: ['APPROVED', 'PICKED_UP', 'RETURNED'] },
          totalPriceCents: { gt: 0 },
          ...unpaid,
        },
      }),
      prisma.uitleenTransportBooking.count({
        where: { requesterType: 'EXTERN', status: { in: ['APPROVED', 'COMPLETED'] }, priceCents: { gt: 0 }, ...unpaid },
      }),
      prisma.uitleenReservation.count({
        where: { requesterType: 'EXTERN', status: 'RETURNED', totalDepositCents: { gt: 0 }, depositReturnedAt: null },
      }),
    ]);
  // Heen en terug zijn twee ritten maar één aanvraag.
  const decideTrips = new Set(tripRequests.map((trip) => trip.tripGroupId ?? trip.id)).size;
  return { decideMaterial, decideTrips, overdue, noDriver, unpaid: unpaidReservations + unpaidTrips, deposits };
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
