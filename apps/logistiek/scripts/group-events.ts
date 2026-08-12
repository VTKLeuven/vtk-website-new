/**
 * Bestaande aanvragen groeperen onder een `UitleenEvent` (A8).
 *
 * Vóór A8 droeg elke aanvraag haar eigen `eventName` als vrije tekst. Dit script
 * zoekt de clusters die duidelijk hetzelfde evenement zijn en maakt er één
 * evenement van.
 *
 * **Draait standaard als dry-run.** Het print wat het zou doen en schrijft niets.
 * Laat het team de groepering nakijken vóór je `--apply` meegeeft; een verkeerde
 * groepering hangt aanvragen van twee posten onder één naam, en dat is
 * vervelender dan geen groepering.
 *
 *   npx dotenv -e .env -- npx tsx apps/logistiek/scripts/group-events.ts
 *   npx dotenv -e .env -- npx tsx apps/logistiek/scripts/group-events.ts --apply
 *
 * Wat er gegroepeerd wordt: aanvragen met dezelfde genormaliseerde naam, dezelfde
 * post (of allebei geen post) en een datum binnen dezelfde week. Clusters van één
 * aanvraag blijven ongemoeid: een koepel boven één aanvraag voegt niets toe en zou
 * het evenementscherm een tweede aanvraaglijst maken.
 */
import { prisma } from '@vtk/db';

const APPLY = process.argv.includes('--apply');

/** Naam zonder hoofdletters, leestekens en dubbele spaties: "24-Urenloop!" = "24 urenloop". */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** De maandag van de week waarin dit moment valt, als sleutel. */
function weekKey(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 24 * 60 * 60 * 1000);
  return monday.toISOString().slice(0, 10);
}

type Entry = {
  kind: 'reservation' | 'transport';
  id: string;
  name: string;
  groupId: string | null;
  at: Date;
  label: string;
};

async function main() {
  const [reservations, bookings] = await Promise.all([
    prisma.uitleenReservation.findMany({
      where: { eventId: null },
      select: {
        id: true,
        eventName: true,
        groupId: true,
        pickupDate: true,
        eventStart: true,
        eventLocation: true,
        user: { select: { name: true } },
      },
    }),
    prisma.uitleenTransportBooking.findMany({
      where: { eventId: null, eventName: { not: null } },
      select: {
        id: true,
        eventName: true,
        groupId: true,
        startAt: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  const entries: Entry[] = [
    ...reservations.map((reservation) => ({
      kind: 'reservation' as const,
      id: reservation.id,
      name: reservation.eventName,
      groupId: reservation.groupId,
      at: reservation.eventStart ?? reservation.pickupDate,
      label: `materiaal/flesserke · ${reservation.user.name}`,
    })),
    ...bookings.map((booking) => ({
      kind: 'transport' as const,
      id: booking.id,
      name: booking.eventName!,
      groupId: booking.groupId,
      at: booking.startAt,
      label: `vervoer · ${booking.user.name}`,
    })),
  ];

  const clusters = new Map<string, Entry[]>();
  for (const entry of entries) {
    const name = normalize(entry.name);
    if (!name) continue;
    const key = `${name}|${entry.groupId ?? '-'}|${weekKey(entry.at)}`;
    clusters.set(key, [...(clusters.get(key) ?? []), entry]);
  }

  // Enkel echte clusters: twee of meer aanvragen die samen horen.
  const groupable = [...clusters.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]));

  console.log(
    `${entries.length} losse ${entries.length === 1 ? 'aanvraag' : 'aanvragen'} bekeken; ` +
      `${groupable.length} ${groupable.length === 1 ? 'cluster' : 'clusters'} van 2 of meer.`
  );
  console.log(APPLY ? 'Modus: APPLY (er wordt geschreven).\n' : 'Modus: dry-run (er wordt niets geschreven).\n');

  for (const [key, list] of groupable) {
    const [name] = key.split('|');
    const first = list.reduce((earliest, entry) => (entry.at < earliest.at ? entry : earliest));
    console.log(`▸ "${first.name}"  (sleutel: ${name}, ${list.length} aanvragen)`);
    for (const entry of list) {
      console.log(`    - ${entry.at.toISOString().slice(0, 10)}  ${entry.label}`);
    }

    if (!APPLY) continue;

    const source = reservations.find((reservation) => reservation.id === first.id);
    const event = await prisma.uitleenEvent.create({
      data: {
        name: first.name.slice(0, 200),
        location: source?.eventLocation ?? null,
        startAt: source?.eventStart ?? null,
        groupId: first.groupId,
      },
      select: { id: true },
    });
    await prisma.uitleenReservation.updateMany({
      where: { id: { in: list.filter((e) => e.kind === 'reservation').map((e) => e.id) } },
      data: { eventId: event.id },
    });
    await prisma.uitleenTransportBooking.updateMany({
      where: { id: { in: list.filter((e) => e.kind === 'transport').map((e) => e.id) } },
      data: { eventId: event.id },
    });
  }

  if (!APPLY && groupable.length > 0) {
    console.log('\nZiet dit er goed uit? Draai opnieuw met --apply.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
