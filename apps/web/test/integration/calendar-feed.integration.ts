import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@vtk/db';
import { buildFeed } from '@/lib/calendar/feeds';

/**
 * Wat er in een agendafeed terechtkomt, tegen een echte database.
 *
 * Deze twee gevallen deelden één oorzaak: de feed klopte technisch, maar wat je
 * in je agenda-app zág, was het niet. Daar vangt geen enkele unit test je op,
 * want de gegevens stonden er gewoon in.
 */

/** Plakt de vervolgregels van een gevouwen .ics terug aan elkaar (RFC 5545). */
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, '');
}

/** Het VEVENT-blok met deze UID erin, of undefined. */
function vevent(ics: string, uid: string): string | undefined {
  return unfold(ics)
    .split('BEGIN:VEVENT')
    .slice(1)
    .find((block) => block.includes(`UID:${uid}`));
}

describe.sequential('agendafeeds', () => {
  const ids = {
    user: randomUUID(),
    group: randomUUID(),
    audienceCat: randomUUID(),
    groupEvent: randomUUID(),
    groupFirstYearEvent: randomUUID(),
    shift: randomUUID(),
  };

  const start = new Date('2027-04-01T17:00:00.000Z');
  const end = new Date('2027-04-01T21:00:00.000Z');

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: ids.user,
        name: 'Test Lid',
        email: `feed-${ids.user}@student.kuleuven.be`,
        emailVerified: true,
      },
    });

    await prisma.group.create({
      data: {
        id: ids.group,
        code: `feed-${ids.group}`,
        slug: `feed-${ids.group}`,
        nameNl: 'Onthaal',
        nameEn: 'Onthaal',
      },
    });

    await prisma.calendarCategory.create({
      data: {
        id: ids.audienceCat,
        slug: `ey-${ids.audienceCat}`,
        nameNl: 'Eerstejaars',
        nameEn: 'First years',
        audience: 'FIRST_YEARS',
      },
    });

    // Twee evenementen van dezelfde post: één zonder doelgroep, één met.
    await prisma.calendarEvent.create({
      data: {
        id: ids.groupEvent,
        slug: ids.groupEvent,
        titleNl: 'Postactiviteit',
        start,
        end,
        groupId: ids.group,
        publishedAt: new Date(),
      },
    });
    await prisma.calendarEvent.create({
      data: {
        id: ids.groupFirstYearEvent,
        slug: ids.groupFirstYearEvent,
        titleNl: 'Doopcantus',
        start,
        end,
        groupId: ids.group,
        publishedAt: new Date(),
        categories: { create: [{ categoryId: ids.audienceCat }] },
      },
    });

    await prisma.shift.create({
      data: {
        id: ids.shift,
        name: 'Bar opbouwen',
        startTime: start,
        endTime: end,
        location: 'Fakbar',
        description: 'Helpen met de opbouw',
        maxParticipants: 4,
        reward: 2,
        participantIds: [],
      },
    });
    await prisma.shiftParticipant.create({
      data: { shiftId: ids.shift, userId: ids.user, payedOut: false },
    });
  });

  afterAll(async () => {
    await prisma.shiftParticipant.deleteMany({ where: { shiftId: ids.shift } });
    await prisma.shift.deleteMany({ where: { id: ids.shift } });
    await prisma.calendarEvent.deleteMany({
      where: { id: { in: [ids.groupEvent, ids.groupFirstYearEvent] } },
    });
    await prisma.calendarCategory.deleteMany({ where: { id: ids.audienceCat } });
    await prisma.group.deleteMany({ where: { id: ids.group } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  /**
   * De shift stond op `CLASS:PRIVATE`. Google toont een geabonneerd privé-event
   * enkel als "Bezet", zonder titel en zonder plaats; Outlook laat de details
   * weg. De naam, de plaats en de omschrijving stonden dus wél in het bestand,
   * met de instructie aan de agenda om ze niet te tonen. Een test op "staat de
   * naam erin" had dit nooit gezien.
   */
  it("toont een shift in de persoonlijke feed, niet als 'Bezet'", async () => {
    const feed = await buildFeed({ kind: 'personal', userId: ids.user }, 'nl');
    const block = vevent(feed, `shift-${ids.shift}@vtk.be`);

    expect(block, 'de shift van dit lid hoort in zijn persoonlijke feed').toBeDefined();
    expect(block).not.toContain('CLASS:PRIVATE');
    expect(block).toContain('CLASS:PUBLIC');
    expect(block).toContain('SUMMARY:Shift: Bar opbouwen');
    expect(block).toContain('LOCATION:Fakbar');
  });

  /**
   * `Shift` had geen `updatedAt`, dus de feed vulde `LAST-MODIFIED` en
   * `SEQUENCE` met `startTime`. Dat is wanneer de shift doorgaat, niet wanneer
   * we er iets aan veranderden: een shift hernoemen bewoog dat getal niet, en
   * een client die erop let, hield de oude versie.
   *
   * De assertie gaat op `LAST-MODIFIED` en niet op een stijgende `SEQUENCE`:
   * dat getal telt in hele seconden, en een test die sneller is dan een seconde
   * ziet twee keer hetzelfde. Dat de starttijd er niet meer in staat, is het
   * punt en is wel deterministisch.
   */
  it('stempelt een shift met zijn wijzigingstijd, niet met zijn starttijd', async () => {
    await prisma.shift.update({
      where: { id: ids.shift },
      data: { name: 'Bar afbreken' },
    });

    const block = vevent(await buildFeed({ kind: 'personal', userId: ids.user }, 'nl'), `shift-${ids.shift}@vtk.be`);

    expect(block).toContain('SUMMARY:Shift: Bar afbreken');
    // De starttijd ligt in 2027; de wijziging is van vandaag.
    expect(block).not.toContain('LAST-MODIFIED:20270401T170000Z');

    const stamp = /LAST-MODIFIED:(\d{8})T/.exec(block ?? '')?.[1];
    const vandaag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    expect(stamp).toBe(vandaag);
  });

  /**
   * De postfeed draaide op `audienceFilter([])`, oftewel "enkel evenementen
   * zonder doelgroepcategorie". Wie zich op de feed van Onthaal abonneerde,
   * kreeg daardoor geen enkele eerstejaarsactiviteit van Onthaal te zien,
   * terwijl de hoofdfeed ze wel droeg. Twee feeds die iets anders bedoelen met
   * hetzelfde woord.
   */
  it('draagt in een postfeed ook de doelgroepevents van die post', async () => {
    const feed = await buildFeed({ kind: 'group', slug: `feed-${ids.group}` }, 'nl');
    expect(feed).not.toBeNull();

    expect(vevent(feed!, `${ids.groupEvent}@vtk.be`)).toBeDefined();
    expect(
      vevent(feed!, `${ids.groupFirstYearEvent}@vtk.be`),
      'een eerstejaarsactiviteit van deze post hoort in haar eigen feed'
    ).toBeDefined();
  });
});
