import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@vtk/db';
import { tripsForDriver, tripsForGroups } from '@/lib/uitleen-server';
import { buildTransportFeed } from '@/lib/calendar/transport-feed';

/**
 * Een rit zoals die er vóór september 2026 uitzag, door de huidige code.
 *
 * De regel staat in docs/uitleendienst.md, "Een veld toevoegen aan een rit":
 * een bestaande rit verandert niet mee met een nieuwe feature, en een leeg veld
 * betekent "niet gevraagd" en nooit "nee". `rit-kolommen.test.ts` zorgt dat
 * niemand een kolom toevoegt zonder die beslissing te maken; dit bestand legt
 * vast hoe een rit zich gedraagt die geen van die kolommen heeft.
 *
 * **Twee ritten, want afwezigheid bewijst niets zonder contrast.** Elke assertie
 * hieronder controleert de oude rit én de nieuwe, zodat een test die per
 * ongeluk niets meer doet, opvalt: ze zou dan ook voor de nieuwe rit "leeg"
 * zien.
 */
/**
 * Plakt de vervolgregels van een gevouwen .ics terug aan elkaar. RFC 5545 knipt
 * elke contentregel op 75 octets, dus zonder dit staat "Lading: 20 bierbakken"
 * halverwege op een nieuwe regel en vindt geen enkele assertie hem terug.
 * Zelfde helper als in test/ics.test.ts.
 */
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, '');
}

describe.sequential('een rit van voor de nieuwe velden', () => {
  const ids = {
    aanvrager: randomUUID(),
    chauffeur: randomUUID(),
    postgenoot: randomUUID(),
    post: randomUUID(),
    voertuig: randomUUID(),
    oudeRit: randomUUID(),
    nieuweRit: randomUUID(),
  };

  // Het venster van de feed is 60 dagen terug tot 365 vooruit; volgende week
  // valt daar met zekerheid in, ook wanneer de test in een schrikkeljaar draait.
  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const eind = new Date(start.getTime() + 3 * 60 * 60 * 1000);

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: ids.aanvrager, name: 'Arthur Aanvrager', email: `rit-${ids.aanvrager}@vtk.test` },
        { id: ids.chauffeur, name: 'Jonas Chauffeur', email: `rit-${ids.chauffeur}@vtk.test` },
        { id: ids.postgenoot, name: 'Lotte Postgenoot', email: `rit-${ids.postgenoot}@vtk.test` },
      ],
    });

    await prisma.group.create({
      data: {
        id: ids.post,
        code: `rit-${ids.post}`,
        slug: `rit-${ids.post}`,
        nameNl: 'Testpost',
        nameEn: 'Test group',
      },
    });

    await prisma.uitleenVehicle.create({
      data: {
        id: ids.voertuig,
        code: `rit-${ids.voertuig}`,
        nameNl: 'Testkar',
        nameEn: 'Test trailer',
        pricingMode: 'FREE',
        rateCents: 0,
      },
    });

    /**
     * De oude rit: enkel de kolommen die vóór september 2026 bestonden.
     *
     * Wat hier bewust ontbreekt, is de kern van de test: `cargoNote` (ronde 3),
     * `assignedGroupId` (20260917160000), `teamNotifiedAt` (20260911110000) en
     * elke `UitleenTransportHelper`-rij (V2). `plannedByTeam` blijft op zijn
     * default staan, want dat is precies wat een bestaande rij bij de migratie
     * kreeg.
     */
    await prisma.uitleenTransportBooking.create({
      data: {
        id: ids.oudeRit,
        userId: ids.aanvrager,
        vehicleId: ids.voertuig,
        groupId: ids.post,
        driverId: ids.chauffeur,
        status: 'APPROVED',
        requesterType: 'INTERN',
        startAt: start,
        endAt: eind,
        purpose: 'Cantusmateriaal ophalen',
        contactPhone: '0470 11 22 33',
        pricingMode: 'FREE',
        rateCents: 0,
      },
    });

    // De rit van vandaag: alles ingevuld, als tegenbewijs.
    await prisma.uitleenTransportBooking.create({
      data: {
        id: ids.nieuweRit,
        userId: ids.aanvrager,
        vehicleId: ids.voertuig,
        groupId: ids.post,
        assignedGroupId: ids.post,
        driverId: ids.chauffeur,
        status: 'APPROVED',
        requesterType: 'INTERN',
        startAt: start,
        endAt: eind,
        purpose: 'Tafels terugbrengen',
        cargoNote: '20 bierbakken en 4 tafels',
        contactPhone: '0470 44 55 66',
        plannedByTeam: true,
        pricingMode: 'FREE',
        rateCents: 0,
        helpers: { create: [{ name: 'Lotte', phone: '0470 77 88 99' }] },
      },
    });
  });

  afterAll(async () => {
    const ritIds = [ids.oudeRit, ids.nieuweRit];
    // Helpers cascaden mee, maar expliciet: een afgebroken run mag niets
    // achterlaten. Het voertuig staat op `onDelete: Restrict`, dus de ritten
    // moeten er eerst uit.
    await prisma.uitleenTransportHelper.deleteMany({
      where: { transportBookingId: { in: ritIds } },
    });
    await prisma.uitleenTransportBooking.deleteMany({ where: { id: { in: ritIds } } });
    await prisma.uitleenVehicle.deleteMany({ where: { id: ids.voertuig } });
    await prisma.group.deleteMany({ where: { id: ids.post } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.aanvrager, ids.chauffeur, ids.postgenoot] } },
    });
  });

  /**
   * Nullable kolom en nieuwe tabel: de include struikelt niet over wat er niet
   * is, en levert `null` en `[]` in plaats van te ontbreken.
   */
  it('staat gewoon in "mijn ritten", met lege nieuwe velden', async () => {
    const ritten = await tripsForDriver(ids.chauffeur);
    const oud = ritten.find((rit) => rit.id === ids.oudeRit);
    const nieuw = ritten.find((rit) => rit.id === ids.nieuweRit);

    expect(oud, 'de oude rit hoort gewoon in de lijst van de chauffeur').toBeDefined();
    expect(oud!.cargoNote).toBeNull();
    expect(oud!.assignedGroup).toBeNull();
    expect(oud!.helpers).toEqual([]);

    // Hetzelfde pad met alles ingevuld, zodat "leeg" hierboven iets betekent.
    expect(nieuw!.cargoNote).toBe('20 bierbakken en 4 tafels');
    expect(nieuw!.assignedGroup?.id).toBe(ids.post);
    expect(nieuw!.helpers).toHaveLength(1);
  });

  /**
   * `assignedGroupId` kreeg bewust geen backfill (20260917160000). Het gevolg is
   * stil en staat nergens anders vast: een oude rit bereikt de postlijst enkel
   * nog via de tweede tak, "aangevraagd door de post en al toegewezen".
   */
  it('bereikt de postlijst via de aanvragende post, niet via de doorgeeftak', async () => {
    const viaPost = await tripsForGroups(ids.postgenoot, [ids.post]);
    const ids_ = viaPost.map((rit) => rit.id);

    expect(ids_).toContain(ids.oudeRit);
    expect(viaPost.find((rit) => rit.id === ids.oudeRit)!.assignedGroupId).toBeNull();
    expect(viaPost.find((rit) => rit.id === ids.nieuweRit)!.assignedGroupId).toBe(ids.post);

    // Zonder chauffeur valt de oude rit uit die lijst, want dan is er geen tak
    // meer die haar bereikt. Dat is het verschil dat de migratie introduceerde.
    await prisma.uitleenTransportBooking.update({
      where: { id: ids.oudeRit },
      data: { driverId: null },
    });
    const zonderChauffeur = await tripsForGroups(ids.postgenoot, [ids.post]);
    expect(zonderChauffeur.map((rit) => rit.id)).not.toContain(ids.oudeRit);
    // De nieuwe rit blijft wel staan: die hangt aan `assignedGroupId`.
    expect(zonderChauffeur.map((rit) => rit.id)).toContain(ids.nieuweRit);

    await prisma.uitleenTransportBooking.update({
      where: { id: ids.oudeRit },
      data: { driverId: ids.chauffeur },
    });
  });

  /**
   * De agendafeed bouwt zijn DESCRIPTION met `.filter(Boolean)`. Ontbreekt een
   * kolom, dan hoort de regel wég te vallen en er niet als "Lading: null" te
   * staan. Dit is de assertie die faalt wanneer iemand die ternary weghaalt.
   */
  it('levert een leesbare agendafeed zonder lege regels', async () => {
    const feed = unfold(await buildTransportFeed('DRIVER', ids.chauffeur));
    const blokken = feed.split('BEGIN:VEVENT').slice(1);

    const oud = blokken.find((blok) => blok.includes(ids.oudeRit));
    const nieuw = blokken.find((blok) => blok.includes(ids.nieuweRit));
    expect(oud, 'de oude rit hoort in de feed van haar chauffeur').toBeDefined();

    // De regels die bij een oude rit niet bestaan, staan er niet.
    expect(oud).not.toContain('Lading:');
    expect(oud).not.toContain('Bijrijders:');
    // Wat er wel is, staat er wel.
    expect(oud).toContain('Waarvoor: Cantusmateriaal ophalen');
    expect(oud).toContain('Chauffeur: Jonas Chauffeur');
    expect(oud).toContain('Aanvrager bellen: 0470 11 22 33');

    // Nergens een lege waarde die als tekst doorlekt.
    expect(oud).not.toMatch(/undefined|: null/);

    // Bij de nieuwe rit staan diezelfde regels er wel, dus de asserties
    // hierboven testen de guards en niet een kapotte feed.
    expect(nieuw).toContain('Lading: 20 bierbakken en 4 tafels');
    expect(nieuw).toContain('Bijrijders: Lotte (0470 77 88 99)');
  });

  /**
   * `NOT NULL` met een default. `plannedByTeam` staat op `false` voor elke rij
   * die er al was, en dat is voor een deel van hen onwaar; daarom draagt
   * migratie 20260911100000 een backfill uit de auditlog. Een rit die buiten die
   * backfill valt, blijft `false` en dus onverwijderbaar. Dat is geen bug maar
   * de prijs van een default, en precies waarom een nieuwe kolom met een default
   * altijd de vraag "klopt die voor bestaande ritten?" verdient.
   */
  it('houdt de default van plannedByTeam, ook al is die voor haar onbekend', async () => {
    const oud = await prisma.uitleenTransportBooking.findUniqueOrThrow({
      where: { id: ids.oudeRit },
      select: { plannedByTeam: true, teamNotifiedAt: true },
    });
    expect(oud.plannedByTeam).toBe(false);
    // Nooit gemeld, want de wachtrij bestond nog niet toen deze rit gemaakt werd.
    expect(oud.teamNotifiedAt).toBeNull();
  });
});
