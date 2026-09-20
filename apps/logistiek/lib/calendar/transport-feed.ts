import 'server-only';

import { prisma } from '@vtk/db';
import { currentWorkingYear } from '@vtk/auth';
import type { Prisma, UitleenFeedScope, UitleenTransportBookingStatus } from '@prisma/client';
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

/**
 * Hoe lang een geannuleerde of afgewezen rit als grafsteen blijft meerijden.
 *
 * Ze gewoon uit de feed laten vallen, is niet hetzelfde als ze weghalen: een
 * geabonneerde agenda hoort een verdwenen VEVENT op te ruimen, maar Google laat
 * hem geregeld staan. Wie zijn rit afgelast zag worden, hield er dan een
 * afspraak aan over. We sturen hem daarom nog even mee met `STATUS:CANCELLED`,
 * de expliciete instructie om hem te schrappen.
 *
 * Dertig dagen: lang genoeg dat elke client minstens één keer opgehaald heeft
 * (ze pollen om de paar uur), kort genoeg dat het bestand niet volloopt met de
 * annulaties van het hele jaar.
 */
const TOMBSTONE_DAYS = 30;

export function feedWindow(now = new Date()): { from: Date; to: Date } {
  const DAY = 24 * 60 * 60 * 1000;
  return { from: new Date(now.getTime() - PAST_DAYS * DAY), to: new Date(now.getTime() + FUTURE_DAYS * DAY) };
}

/**
 * De posten waar deze persoon dit werkingsjaar in zit.
 *
 * Nodig omdat een feed geen sessie heeft: hij authenticeert met een token in de
 * URL, dus `session.groups` bestaat hier niet. Werkingsjaar-gescoped, net als
 * overal elders: wie vorig jaar bij Feest zat, hoort de ritten van Feest niet
 * meer in zijn agenda te krijgen.
 */
async function myGroupIds(userId: string): Promise<string[]> {
  const memberships = await prisma.groupMembership.findMany({
    where: { userId, year: currentWorkingYear() },
    select: { groupId: true },
  });
  return memberships.map((membership) => membership.groupId);
}

/**
 * De feed voor dit abonnement.
 *
 * `TEAM` toont elke rit die het voertuig bezet houdt of gereden is; `DRIVER`
 * de ritten die deze persoon aangaan. Die tweede is niet "dezelfde query met
 * een filter erop" maar een eigen `where`: een filter achteraf laat vroeg of
 * laat een rit door wanneer iemand hierboven iets toevoegt.
 *
 * **`DRIVER` is meer dan `driverId`.** Sinds een autorit aan een post
 * doorgegeven kan worden (`assignedGroupId`), staat op `/ritten` naast je eigen
 * ritten ook wat jouw post nog moet invullen. Die stonden hier niet, en dat was
 * precies de verkeerde helft om weg te laten: een rit met een chauffeur is
 * geregeld, een rit die nog een chauffeur zoekt is werk. Deze feed volgt nu
 * dezelfde twee bronnen als `tripsForGroups`.
 */
export async function buildTransportFeed(scope: UitleenFeedScope, userId: string, now = new Date()): Promise<string> {
  const { from, to } = feedWindow(now);
  const base = logistiekBaseUrl();
  const tombstoneFrom = new Date(now.getTime() - TOMBSTONE_DAYS * 24 * 60 * 60 * 1000);

  const groupIds = scope === 'DRIVER' ? await myGroupIds(userId) : [];

  // Levend = staat in de agenda. Afgelast = gaat als grafsteen mee, zodat een
  // client die de rit al had, de instructie krijgt om hem te schrappen.
  const live: UitleenTransportBookingStatus[] = ['APPROVED', 'COMPLETED'];
  const dead: UitleenTransportBookingStatus[] = ['REJECTED', 'CANCELLED'];

  // Dezelfde twee bronnen als `tripsForGroups`: aan jou toegewezen, aan jouw
  // post doorgegeven, of door jouw post aangevraagd en al aan iemand toegewezen.
  const mine: Prisma.UitleenTransportBookingWhereInput[] =
    groupIds.length > 0
      ? [
          { driverId: userId },
          { assignedGroupId: { in: groupIds } },
          { groupId: { in: groupIds }, driverId: { not: null } },
        ]
      : [{ driverId: userId }];

  // Enkel recent afgelast: een rit die vorig jaar afgewezen werd, staat in
  // niemands agenda meer en hoeft geen grafsteen.
  const statusWhere: Prisma.UitleenTransportBookingWhereInput = {
    OR: [
      { status: { in: scope === 'DRIVER' ? live : ['REQUESTED', ...live] } },
      { status: { in: dead }, updatedAt: { gte: tombstoneFrom } },
    ],
  };

  const bookings = await prisma.uitleenTransportBooking.findMany({
    where: {
      startAt: { lt: to },
      endAt: { gt: from },
      ...(scope === 'DRIVER' ? { AND: [{ OR: mine }, statusWhere] } : statusWhere),
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

  const events: IcsEvent[] = bookings.map((booking) => {
    const cancelled = booking.status === 'REJECTED' || booking.status === 'CANCELLED';
    return {
      uid: `rit-${booking.id}@logistiek.vtk.be`,
      start: booking.startAt,
      end: booking.endAt,
      allDay: false,
      // Het voertuig in de titel: in een agenda-app zie je vaak enkel de eerste
      // regel, en "welke kar" is dan de vraag die je bespaart.
      // "Afgelast" vooraan en niet enkel `STATUS:CANCELLED`: een client die dat
      // veld negeert, toont de rit anders als een gewone afspraak.
      summary: `${cancelled ? 'Afgelast: ' : ''}${booking.vehicle.nameNl}: ${
        booking.eventName?.trim() || booking.purpose
      }`,
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
      // Een afgewezen of geannuleerde rit blijft even meerijden met
      // `STATUS:CANCELLED` in plaats van stil uit de feed te vallen; zie
      // TOMBSTONE_DAYS hierboven.
      cancelled,
      // **Bewust géén `private: true`.** Dat zet `CLASS:PRIVATE` op elk VEVENT, en
      // Google Calendar verbergt in een geabonneerde agenda de titel en de details
      // van zo'n event: je zag enkel "Bezet" staan waar de rit hoorde te staan
      // (Outlook doet hetzelfde). De gegevens hierboven stonden er dus wel, maar
      // met de instructie aan de agenda om ze niet te tonen; dat is precies de
      // leesbaarheid waarvoor deze feed bestaat.
      //
      // De vertrouwelijkheid hangt aan het geheim in de URL, `no-store` en
      // `noindex` (zie de route). `CLASS` voegt daar niets aan toe: wie de link
      // heeft, kan de feed toch ophalen.
    };
  });

  return buildIcs(
    {
      name: scope === 'DRIVER' ? 'VTK Logistiek: mijn ritten' : 'VTK Logistiek: transport',
      description:
        scope === 'DRIVER'
          ? 'De ritten die aan jou toegewezen zijn, en die van je post.'
          : 'De transportplanning van VTK Logistiek.',
      url: `${base}/beheer/vervoer/week`,
      events,
    },
    now
  );
}
