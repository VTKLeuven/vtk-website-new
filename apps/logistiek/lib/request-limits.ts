import { prisma } from '@vtk/db';

/**
 * Hoeveel één lid tegelijk kan aanvragen en publiceren (S4, S5 uit de audit van
 * november 2026).
 *
 * Zonder bovengrens kon één account de tabellen vullen, en met dringende
 * aanvragen ook de mailbox van het team. De grenzen liggen ver boven wat een post
 * voor een druk weekend nodig heeft; wie er toch tegenaan loopt, krijgt een
 * melding die zegt wat te doen, geen foutpagina.
 *
 * Staat in een eigen bestand en niet in `app/actions/uitleen.ts`: een bestand met
 * `'use server'` mag enkel async functies exporteren.
 */

/** Openstaande aanvragen per lid: materiaal, flesserke en ritten samen. */
export const MAX_OPEN_REQUESTS = 20;

/** Actieve sjablonen die één lid gepubliceerd heeft. */
export const MAX_TEMPLATES_PER_PERSON = 10;

/**
 * Wat er voor dit lid nog openstaat.
 *
 * Een materiaalaanvraag telt zolang ze op een beslissing wacht of het materiaal
 * buiten is. Een rit telt zolang ze niet voorbij is: een aanvraag voor vorige week
 * waar nooit op beslist werd, houdt niemand nog bezig. Heen en terug zijn één
 * aanvraag, zoals overal in de uitleendienst.
 */
export async function openRequestCount(userId: string, now = new Date()): Promise<number> {
  const [reservations, trips] = await Promise.all([
    prisma.uitleenReservation.count({
      where: { userId, status: { in: ['REQUESTED', 'APPROVED', 'PICKED_UP'] } },
    }),
    prisma.uitleenTransportBooking.findMany({
      where: { userId, status: { in: ['REQUESTED', 'APPROVED'] }, endAt: { gte: now } },
      select: { id: true, tripGroupId: true },
    }),
  ]);
  return reservations + new Set(trips.map((trip) => trip.tripGroupId ?? trip.id)).size;
}

/** De melding wanneer dit lid geen nieuwe aanvraag meer kan indienen, anders `null`. */
export async function openRequestLimitError(userId: string): Promise<string | null> {
  if ((await openRequestCount(userId)) < MAX_OPEN_REQUESTS) return null;
  return `Je hebt al ${MAX_OPEN_REQUESTS} aanvragen openstaan. Wacht tot er een afgerond is, of mail logistiek@vtk.be.`;
}

/** De melding wanneer dit lid geen sjabloon meer kan publiceren, anders `null`. */
export async function templateLimitError(userId: string): Promise<string | null> {
  const own = await prisma.uitleenRequestTemplate.count({ where: { createdById: userId, active: true } });
  if (own < MAX_TEMPLATES_PER_PERSON) return null;
  return `Je hebt al ${MAX_TEMPLATES_PER_PERSON} sjablonen. Vraag Logistiek om er een op te ruimen.`;
}
