import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@vtk/db';
import { currentWorkingYear } from '@vtk/auth';
import { buildTransportFeed } from '@/lib/calendar/transport-feed';

/**
 * De chauffeursfeed tegen een echte database.
 *
 * De unit test ernaast controleert de vorm van de `where`; dit controleert wat
 * er uiteindelijk in het bestand staat. Dat is hier het verschil dat telt: de
 * twee gaten hieronder zagen er in de query niet verkeerd uit, ze lieten enkel
 * iets weg.
 */

function unfold(ics: string): string {
  return ics.replace(/\r\n /g, '');
}

function vevent(ics: string, ritId: string): string | undefined {
  return unfold(ics)
    .split('BEGIN:VEVENT')
    .slice(1)
    .find((block) => block.includes(`UID:rit-${ritId}@`));
}

describe.sequential('de agendafeed van een chauffeur', () => {
  const ids = {
    chauffeur: randomUUID(),
    aanvrager: randomUUID(),
    post: randomUUID(),
    anderePost: randomUUID(),
    voertuig: randomUUID(),
    eigenRit: randomUUID(),
    postRit: randomUUID(),
    vreemdeRit: randomUUID(),
    afgelasteRit: randomUUID(),
    oudeAfgelasteRit: randomUUID(),
  };

  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const eind = new Date(start.getTime() + 3 * 60 * 60 * 1000);

  async function rit(id: string, data: Record<string, unknown>) {
    await prisma.uitleenTransportBooking.create({
      data: {
        id,
        userId: ids.aanvrager,
        vehicleId: ids.voertuig,
        startAt: start,
        endAt: eind,
        purpose: `Rit ${id.slice(0, 6)}`,
        pricingMode: 'FREE',
        rateCents: 0,
        ...data,
      },
    });
  }

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: ids.chauffeur, name: 'Jonas Chauffeur', email: `feed-${ids.chauffeur}@vtk.test` },
        { id: ids.aanvrager, name: 'Arthur Aanvrager', email: `feed-${ids.aanvrager}@vtk.test` },
      ],
    });

    for (const [id, naam] of [
      [ids.post, 'Feest'],
      [ids.anderePost, 'Sport'],
    ] as const) {
      await prisma.group.create({
        data: { id, code: `feed-${id}`, slug: `feed-${id}`, nameNl: naam, nameEn: naam },
      });
    }

    // De chauffeur zit dit werkingsjaar bij Feest, niet bij Sport.
    await prisma.groupMembership.create({
      data: { userId: ids.chauffeur, groupId: ids.post, year: currentWorkingYear(), role: 'MEMBER' },
    });

    await prisma.uitleenVehicle.create({
      data: {
        id: ids.voertuig,
        code: `feed-${ids.voertuig}`,
        nameNl: 'Auto',
        nameEn: 'Car',
        pricingMode: 'FREE',
        rateCents: 0,
      },
    });

    await rit(ids.eigenRit, { status: 'APPROVED', driverId: ids.chauffeur });
    // Doorgegeven aan zijn post en nog zonder chauffeur: precies de rit die
    // ontbrak, en precies degene waar nog iets mee moet gebeuren.
    await rit(ids.postRit, { status: 'APPROVED', assignedGroupId: ids.post });
    // Doorgegeven aan een post waar hij niet in zit.
    await rit(ids.vreemdeRit, { status: 'APPROVED', assignedGroupId: ids.anderePost });
    await rit(ids.afgelasteRit, { status: 'CANCELLED', driverId: ids.chauffeur });
    await rit(ids.oudeAfgelasteRit, { status: 'CANCELLED', driverId: ids.chauffeur });

    // Een annulatie van vorig jaar hoort geen grafsteen meer te krijgen.
    // `updatedAt` staat op `@updatedAt`, dus enkel ruw te zetten.
    await prisma.$executeRaw`
      UPDATE "UitleenTransportBooking"
         SET "updatedAt" = NOW() - INTERVAL '200 days'
       WHERE "id" = ${ids.oudeAfgelasteRit}`;
  });

  afterAll(async () => {
    await prisma.uitleenTransportBooking.deleteMany({
      where: {
        id: {
          in: [ids.eigenRit, ids.postRit, ids.vreemdeRit, ids.afgelasteRit, ids.oudeAfgelasteRit],
        },
      },
    });
    await prisma.uitleenVehicle.deleteMany({ where: { id: ids.voertuig } });
    await prisma.groupMembership.deleteMany({ where: { userId: ids.chauffeur } });
    await prisma.group.deleteMany({ where: { id: { in: [ids.post, ids.anderePost] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.chauffeur, ids.aanvrager] } } });
  });

  it('draagt naast je eigen ritten ook die van je post', async () => {
    const feed = await buildTransportFeed('DRIVER', ids.chauffeur);

    expect(vevent(feed, ids.eigenRit), 'je eigen rit').toBeDefined();
    expect(
      vevent(feed, ids.postRit),
      'de rit die aan jouw post doorgegeven is en nog een chauffeur zoekt'
    ).toBeDefined();
    expect(vevent(feed, ids.vreemdeRit), 'de rit van een post waar je niet in zit, hoort er niet in').toBeUndefined();
  });

  it('stuurt een recent afgelaste rit mee als grafsteen', async () => {
    const feed = await buildTransportFeed('DRIVER', ids.chauffeur);
    const block = vevent(feed, ids.afgelasteRit);

    expect(block, 'een pas geannuleerde rit blijft even meerijden').toBeDefined();
    expect(block).toContain('STATUS:CANCELLED');
    expect(block).toContain('Afgelast:');

    // De levende rit blijft gewoon bevestigd.
    expect(vevent(feed, ids.eigenRit)).toContain('STATUS:CONFIRMED');
  });

  it('laat een oude annulatie wel vallen', async () => {
    const feed = await buildTransportFeed('DRIVER', ids.chauffeur);
    expect(
      vevent(feed, ids.oudeAfgelasteRit),
      'een annulatie van 200 dagen geleden staat in niemands agenda meer'
    ).toBeUndefined();
  });
});
