import 'server-only';

import { prisma } from '@vtk/db';
import type { Prisma, UitleenRequesterType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { isOnQuarterHour, parseNotifyEmails, transportPriceCents } from './uitleen';
import { parseBrusselsDateTime } from './reservation-form';

/**
 * De boekingen van één ritaanvraag opbouwen en valideren.
 *
 * Twee kanten gebruiken dit: een lid dat op /vervoer een rit aanvraagt, en
 * Logistiek dat vanaf een materiaalaanvraag met "Levering nodig" de rit
 * aanmaakt. Dat zijn dezelfde regels (kwartieren, geen rit in het verleden, de
 * terugrit na de heenrit, het tarief gesnapshot per voertuig), en die twee keer
 * schrijven betekent dat ze na de eerste wijziging uit elkaar lopen.
 *
 * Wat verschilt zit in `owner`: van wie de rit is, en waar ze aan hangt.
 */

/** Bovengrens tegen tikfouten, geen beleid. Zie de oude comment bij de actie. */
export const MAX_VAN_BOOKING_DAYS = 30;

export type TransportFormInput = {
  startAt: string; // datetime-local, Belgische wall-clock
  endAt: string;
  purpose: string;
  /** Wat er mee moet ("20 bierbakken en 4 tafels"). */
  cargoNote?: string;
  pickupAddress: string;
  destination: string;
  note: string;
  /** Eén of meer voertuigen; `vehicleId` blijft aanvaard voor één voertuig. */
  vehicleIds?: string[];
  vehicleId?: string;
  eventName?: string;
  helpersNote?: string;
  helpersPhone?: string;
  contactPhone?: string;
  /** Meelezend adres, zoals op een materiaalaanvraag. */
  notifyEmail?: string;
  /** Tweede tijdvenster: dan wordt dit een heen-en-terugaanvraag (twee ritten). */
  returnStartAt?: string;
  returnEndAt?: string;
};

export type TransportOwner = {
  /** Op wiens naam de rit komt; die persoon ziet ze bij "Mijn aanvragen". */
  userId: string;
  /** Koepel-evenement (A8), al opgelost door de aanroeper. */
  eventId: string | null;
  requesterType?: UitleenRequesterType;
  groupId?: string | null;
  requesterName?: string | null;
  /** Materiaalaanvraag waarvan dit de levering is. */
  reservationId?: string | null;
};

export type BuiltTransport =
  | {
      ok: true;
      bookings: Prisma.UitleenTransportBookingCreateManyInput[];
      vehicleCount: number;
      roundTrip: boolean;
    }
  | { ok: false; error: string };

/**
 * Eén tijdvenster van een rit, gevalideerd. `label` komt in de foutmelding
 * terecht, zodat je bij een heen-en-terugaanvraag weet welke helft fout staat.
 */
function parseTripWindow(
  startRaw: string,
  endRaw: string,
  label: string
): { ok: true; startAt: Date; endAt: Date } | { ok: false; error: string } {
  const startAt = parseBrusselsDateTime(startRaw);
  const endAt = parseBrusselsDateTime(endRaw);
  if (!startAt || !endAt) return { ok: false, error: `Kies een start- en eindmoment${label}.` };
  if (startAt <= new Date()) return { ok: false, error: `Het startmoment${label} ligt in het verleden.` };
  if (endAt <= startAt) {
    return { ok: false, error: `Het eindmoment${label} ligt voor het startmoment.` };
  }
  if (!isOnQuarterHour(startAt) || !isOnQuarterHour(endAt)) {
    return {
      ok: false,
      error: `Kies een begin- en einduur op het kwartier (bv. 14:00, 14:15)${label}.`,
    };
  }
  const days = (endAt.getTime() - startAt.getTime()) / (24 * 60 * 60 * 1000);
  if (days > MAX_VAN_BOOKING_DAYS) {
    return {
      ok: false,
      error: `Een rit kan maximaal ${MAX_VAN_BOOKING_DAYS} dagen duren; controleer de datums${label}.`,
    };
  }
  return { ok: true, startAt, endAt };
}

const MAX_NOTE_LENGTH = 1000;

export async function buildTransportBookings(
  input: TransportFormInput,
  owner: TransportOwner
): Promise<BuiltTransport> {
  const wantsReturn = Boolean(input.returnStartAt && input.returnEndAt);
  const outbound = parseTripWindow(input.startAt, input.endAt, wantsReturn ? ' van de heenrit' : '');
  if (!outbound.ok) return { ok: false, error: outbound.error };
  const { startAt, endAt } = outbound;

  let inbound: { startAt: Date; endAt: Date } | null = null;
  if (wantsReturn) {
    const parsed = parseTripWindow(input.returnStartAt!, input.returnEndAt!, ' van de terugrit');
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (parsed.startAt < endAt) {
      return { ok: false, error: 'De terugrit start voor de heenrit gedaan is.' };
    }
    inbound = { startAt: parsed.startAt, endAt: parsed.endAt };
  }

  const purpose = input.purpose.trim();
  if (!purpose) return { ok: false, error: 'Beschrijf waarvoor je het voertuig nodig hebt.' };

  // Meerdere adressen mogen, gescheiden door een komma; zie `parseNotifyEmails`.
  const notifyEmails = parseNotifyEmails(input.notifyEmail ?? '');
  if (notifyEmails === null) {
    return {
      ok: false,
      error:
        'Een van de extra e-mailadressen ziet er niet uit als een adres. Splits meerdere adressen met een komma.',
    };
  }
  const notifyEmail = notifyEmails.join(', ');

  // Eén of meerdere voertuigen: een verhuis met de kar én de auto is één vraag,
  // en die als twee aanvragen laten indienen betekent dat het team ze ook los kan
  // beslissen. Ze delen daarom één `tripGroupId`, net als heen en terug (V12).
  const chosenIds = (input.vehicleIds ?? (input.vehicleId ? [input.vehicleId] : [])).filter(Boolean);
  const vehicles = chosenIds.length
    ? await prisma.uitleenVehicle.findMany({ where: { id: { in: chosenIds }, active: true } })
    : await prisma.uitleenVehicle
        .findFirst({ where: { active: true }, orderBy: { sortIndex: 'asc' } })
        .then((found) => (found ? [found] : []));
  if (vehicles.length === 0) return { ok: false, error: 'Kies een voertuig.' };
  if (vehicles.length !== new Set(chosenIds).size && chosenIds.length > 0) {
    return { ok: false, error: 'Een van de gekozen voertuigen bestaat niet meer; herlaad de pagina.' };
  }

  // Gedeelde velden van elke boeking; voertuig, tarief en tijdvenster verschillen.
  const shared = {
    userId: owner.userId,
    eventId: owner.eventId,
    reservationId: owner.reservationId ?? null,
    ...(owner.requesterType ? { requesterType: owner.requesterType } : {}),
    ...(owner.groupId !== undefined ? { groupId: owner.groupId } : {}),
    ...(owner.requesterName !== undefined ? { requesterName: owner.requesterName } : {}),
    purpose: purpose.slice(0, MAX_NOTE_LENGTH),
    cargoNote: input.cargoNote?.trim().slice(0, MAX_NOTE_LENGTH) || null,
    eventName: input.eventName?.trim().slice(0, 300) || null,
    pickupAddress: input.pickupAddress.trim().slice(0, 300) || null,
    destination: input.destination.trim().slice(0, 300) || null,
    helpersNote: input.helpersNote?.trim().slice(0, 300) || null,
    helpersPhone: input.helpersPhone?.trim().slice(0, 60) || null,
    contactPhone: input.contactPhone?.trim().slice(0, 60) || null,
    notifyEmail: notifyEmail.slice(0, 300) || null,
    memberNote: input.note.trim().slice(0, MAX_NOTE_LENGTH) || null,
  };

  /** Tarief per voertuig gesnapshot; per km blijft de prijs null tot na de rit. */
  const bookingFor = (
    vehicle: (typeof vehicles)[number],
    from: Date,
    to: Date,
    leg: 'HEEN' | 'TERUG' | null,
    tripGroupId: string | null
  ) => ({
    ...shared,
    vehicleId: vehicle.id,
    pricingMode: vehicle.pricingMode,
    rateCents: vehicle.rateCents,
    tripGroupId,
    tripLeg: leg,
    startAt: from,
    endAt: to,
    priceCents: transportPriceCents({
      pricingMode: vehicle.pricingMode,
      rateCents: vehicle.rateCents,
      startAt: from,
      endAt: to,
    }),
  });

  // Eén boeking per voertuig en per rit. Ze horen bij elkaar zodra het er meer dan
  // één is: het team beslist, annuleert en verschuift ze in hun geheel. Bij één
  // enkele rit met één voertuig blijft `tripGroupId` null, zoals voordien.
  const legs: Array<{ from: Date; to: Date; leg: 'HEEN' | 'TERUG' | null }> = inbound
    ? [
        { from: startAt, to: endAt, leg: 'HEEN' },
        { from: inbound.startAt, to: inbound.endAt, leg: 'TERUG' },
      ]
    : [{ from: startAt, to: endAt, leg: null }];
  const grouped = vehicles.length > 1 || legs.length > 1;
  const tripGroupId = grouped ? randomUUID() : null;

  return {
    ok: true,
    bookings: vehicles.flatMap((vehicle) =>
      legs.map((leg) => bookingFor(vehicle, leg.from, leg.to, leg.leg, tripGroupId))
    ),
    vehicleCount: vehicles.length,
    roundTrip: Boolean(inbound),
  };
}
