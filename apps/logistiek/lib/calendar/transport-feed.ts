import 'server-only';

import { prisma } from '@vtk/db';
import type { UitleenFeedScope } from '@prisma/client';
import { requesterLabel, vanStatusLabel } from '../uitleen';
import { logistiekBaseUrl } from '../payments';
import { buildIcs, type IcsEvent } from './ics';

/**
 * De transportplanning als agendafeed (A1).
 *
 * Waarom dit bestaat: het team plant in deze app, maar leeft in zijn eigen
 * agenda. Zonder feed staat een rit op twee plekken of op één plek die niemand
 * open heeft. Dezelfde redenering als bij de kalenderfeeds op vtk.be, met één
 * verschil: die zijn publiek, en deze draagt namen, adressen en telefoonnummers.
 * Daarom een geheim in de URL en `no-store` op het antwoord (zie de route).
 *
 * Het venster is bewust kort aan de kant van het verleden: een agenda-client
 * haalt dit elk uur op, en drie jaar gereden ritten meesturen kost enkel
 * bandbreedte in de broekzak van de chauffeur.
 */

const PAST_DAYS = 60;
const FUTURE_DAYS = 365;

export function feedWindow(now = new Date()): { from: Date; to: Date } {
  const DAY = 24 * 60 * 60 * 1000;
  return { from: new Date(now.getTime() - PAST_DAYS * DAY), to: new Date(now.getTime() + FUTURE_DAYS * DAY) };
}

/**
 * De feed voor dit abonnement.
 *
 * `TEAM` toont elke rit die het voertuig bezet houdt of gereden is; `DRIVER`
 * enkel de ritten van deze persoon. Die tweede is niet "dezelfde query met een
 * filter erop" maar een eigen `where`: een filter achteraf laat vroeg of laat
 * een rit door wanneer iemand hierboven iets toevoegt.
 */
export async function buildTransportFeed(
  scope: UitleenFeedScope,
  userId: string,
  now = new Date()
): Promise<string> {
  const { from, to } = feedWindow(now);
  const base = logistiekBaseUrl();

  const bookings = await prisma.uitleenTransportBooking.findMany({
    where: {
      startAt: { lt: to },
      endAt: { gt: from },
      ...(scope === 'DRIVER'
        ? { driverId: userId, status: { in: ['APPROVED', 'COMPLETED'] } }
        : { status: { in: ['REQUESTED', 'APPROVED', 'COMPLETED'] } }),
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      updatedAt: true,
      status: true,
      purpose: true,
      cargoNote: true,
      eventName: true,
      pickupAddress: true,
      destination: true,
      contactPhone: true,
      helpersNote: true,
      helpersPhone: true,
      helpers: { orderBy: { createdAt: 'asc' as const }, select: { name: true, phone: true } },
      requesterType: true,
      requesterName: true,
      user: { select: { name: true } },
      group: { select: { nameNl: true } },
      vehicle: { select: { nameNl: true } },
      driver: { select: { name: true } },
    },
    orderBy: { startAt: 'asc' },
  });

  const events: IcsEvent[] = bookings.map((booking) => ({
    uid: `rit-${booking.id}@logistiek.vtk.be`,
    start: booking.startAt,
    end: booking.endAt,
    allDay: false,
    // Het voertuig in de titel: in een agenda-app zie je vaak enkel de eerste
    // regel, en "welke kar" is dan de vraag die je bespaart.
    summary: `${booking.vehicle.nameNl}: ${booking.eventName?.trim() || booking.purpose}`,
    description: [
      `Waarvoor: ${booking.purpose}`,
      booking.cargoNote ? `Lading: ${booking.cargoNote}` : null,
      `Aanvrager: ${requesterLabel(booking)} (${booking.user.name})`,
      booking.contactPhone ? `Aanvrager bellen: ${booking.contactPhone}` : null,
      booking.helpers.length > 0
        ? `Bijrijders: ${booking.helpers
            .map((helper) => `${helper.name}${helper.phone ? ` (${helper.phone})` : ''}`)
            .join(', ')}`
        : null,
      booking.helpersNote ? `Bijrijders: ${booking.helpersNote}` : null,
      booking.helpersPhone ? `Bijrijder bellen: ${booking.helpersPhone}` : null,
      booking.driver ? `Chauffeur: ${booking.driver.name}` : 'Nog geen chauffeur',
      `Status: ${vanStatusLabel(booking.status, 'nl')}`,
      `${base}/beheer/vervoer?rit=${booking.id}`,
    ]
      .filter(Boolean)
      .join('\n'),
    // De bestemming, want dat is wat een agenda-app als navigatiedoel aanbiedt.
    location: booking.destination ?? booking.pickupAddress,
    url: `${base}/beheer/vervoer?rit=${booking.id}`,
    categories: ['Transport'],
    updatedAt: booking.updatedAt,
    // Deze feed hangt aan een geheim in een URL; alles erin is privé.
    private: true,
  }));

  return buildIcs(
    {
      name: scope === 'DRIVER' ? 'VTK Logistiek: mijn ritten' : 'VTK Logistiek: transport',
      description:
        scope === 'DRIVER'
          ? 'De ritten die Logistiek aan jou toegewezen heeft.'
          : 'De transportplanning van VTK Logistiek.',
      url: `${base}/beheer/vervoer/week`,
      events,
    },
    now
  );
}
