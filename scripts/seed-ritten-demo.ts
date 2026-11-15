/**
 * Zet ritten klaar om "Mijn ritten" (logistiek, /ritten) lokaal te bekijken:
 * ritten die je zelf rijdt, ritten van je post, een rit die nog een chauffeur
 * zoekt, een rit over middernacht, nota's, bijrijders en gereden ritten.
 *
 * Draaien:
 *
 *   npm run db:demo:ritten              # zet alles (opnieuw) klaar
 *   npm run db:demo:ritten -- --reset   # enkel opruimen
 *
 * Bekijken: start logistiek (`npm run dev -w @vtk/logistiek`, poort 3100) met
 * `LOGISTIEK_TEST_LOGIN=open` in de `.env`, ga naar /test-login en kies
 * "Carol (test post)". Zij zit in Sport en staat in de chauffeurslijst. De
 * datums hangen aan vandaag: draai het script opnieuw om ze te verversen.
 *
 * Wat dit script aanmaakt, herkent het aan het id (`demo-ritten-...`) en aan het
 * domein `@ritten.demo`. Carol zelf (`test-user-post`) blijft staan; enkel haar
 * plaats in de chauffeurslijst komt van hier en gaat mee weg bij `--reset`.
 *
 * Weigert te draaien tegen iets anders dan een lokale database.
 */

import { PrismaClient } from "@prisma/client";
import type { UitleenTransportNoteVisibility } from "@prisma/client";
import { currentWorkingYear } from "../packages/auth/src/lib/workingYear";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PREFIX = "demo-ritten";
const DOMAIN = "@ritten.demo";
const CAROL = "test-user-post";

function assertLocalDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("DATABASE_URL ontbreekt. Staat je .env op zijn plaats?");
    process.exit(1);
  }
  const host = new URL(raw).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    console.error(`Weigert te draaien: DATABASE_URL wijst naar "${host}" en niet naar een lokale database.`);
    process.exit(1);
  }
}

/** Vandaag plus `days`, om `hour:minute` op de klok van deze machine. */
function at(days: number, hour: number, minute = 0): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, minute);
}

const KELDER = "VTK-kelder, Studentenwijk Arenberg 6, 3001 Heverlee";
const HAACHT = "Brouwerij Haacht, Provinciesteenweg 28, 3190 Boortmeerbeek";
const MAGAZIJN = "Magazijn Logistiek, Kasteelpark Arenberg 41, 3001 Heverlee";
const SALONS = "Salons Vandenhove, Naamsesteenweg 120, 3001 Heverlee";
const ALMA = "Alma 2, Edward Van Evenstraat 2, 3000 Leuven";

const PEOPLE = [
  { slug: "lotte", name: "Lotte Peeters", group: "SPORT", driver: false },
  { slug: "arne", name: "Arne Janssens", group: "SPORT", driver: true },
  { slug: "elias", name: "Elias Maes", group: "CULTUUR", driver: false },
  { slug: "hanne", name: "Hanne Wouters", group: "IT", driver: false },
  { slug: "noor", name: "Noor Vandamme", group: "CULTUUR", driver: false },
] as const;

type Person = (typeof PEOPLE)[number]["slug"];

const userId = (slug: Person) => `${PREFIX}-user-${slug}`;

type DemoTrip = {
  n: number;
  vehicle: "kar" | "auto" | "bakfiets";
  start: Date;
  end: Date;
  purpose: string;
  group: string;
  requester: Person;
  contactPhone?: string;
  /** `carol`, iemand van hierboven, of niemand. */
  driver: "carol" | Person | null;
  /** Doorgegeven aan deze post om zelf een chauffeur te kiezen. */
  assignedGroup?: string;
  eventName?: string;
  pickup?: string;
  destination?: string;
  cargo?: string;
  adminNote?: string;
  memberNote?: string;
  helpers?: Array<{ name: string; phone?: string }>;
  notes?: Array<{ author: "carol" | Person; text: string; visibility: UitleenTransportNoteVisibility }>;
  completed?: boolean;
};

function trips(): DemoTrip[] {
  // De eerste rit begint binnen twee uur, zodat er altijd een rit "vandaag" is.
  const soon = new Date(Math.ceil((Date.now() + 2 * 60 * 60 * 1000) / (15 * 60 * 1000)) * 15 * 60 * 1000);
  return [
    {
      n: 1, vehicle: "kar", start: soon, end: new Date(soon.getTime() + 2 * 60 * 60 * 1000),
      purpose: "Leeggoed terug naar de brouwerij", group: "SPORT", requester: "lotte", contactPhone: "+32 470 12 34 56",
      driver: "carol", eventName: "Sportcantus", pickup: KELDER, destination: HAACHT,
      cargo: "24 lege vaten en 6 bakken leeggoed",
      adminNote: "De code van de poort aan de kelder is 4711. Het leeggoed staat links achteraan.",
      helpers: [{ name: "Jonas Claes", phone: "+32 472 55 18 90" }],
      notes: [{ author: "carol", text: "Tankkaart zit in het handschoenkastje.", visibility: "POST_EN_LOGISTIEK" }],
    },
    {
      n: 2, vehicle: "kar", start: at(2, 14), end: at(2, 17, 30),
      purpose: "Vaten ophalen voor de TD", group: "CULTUUR", requester: "elias", contactPhone: "+32 485 21 09 77",
      driver: "carol", eventName: "TD Cultuur", pickup: HAACHT, destination: ALMA,
      cargo: "12 vaten pils en 2 tapinstallaties",
      memberNote: "Bel even als je aan de brouwerij vertrekt, dan staan we klaar om te lossen.",
    },
    {
      n: 3, vehicle: "bakfiets", start: at(3, 12), end: at(3, 13),
      purpose: "Affiches naar de faculteiten", group: "SPORT", requester: "lotte", contactPhone: "+32 470 12 34 56",
      driver: null, pickup: KELDER, destination: "Gebouw 200A, Celestijnenlaan 200A, 3001 Heverlee",
    },
    {
      n: 4, vehicle: "auto", start: at(4, 8), end: at(4, 9, 30),
      purpose: "Statafels naar de jobbeurs", group: "IT", requester: "hanne", contactPhone: "+32 476 30 44 12",
      driver: "carol", eventName: "Jobbeurs", pickup: MAGAZIJN, destination: "Brabanthal, 3010 Kessel-Lo",
      cargo: "4 statafels en 2 verlengkabels",
      adminNote: "Laden aan de achterkant, ingang C. Meld je bij de stand van VTK.",
    },
    {
      n: 5, vehicle: "kar", start: at(5, 18), end: at(5, 23, 30),
      purpose: "Drank en decor naar het sportgala", group: "SPORT", requester: "lotte", contactPhone: "+32 470 12 34 56",
      driver: null, assignedGroup: "SPORT", eventName: "Sportgala", pickup: KELDER, destination: SALONS,
      cargo: "Drank voor 400 man en 6 kisten decor",
      memberNote: "Laden kan pas vanaf 18:15: tot dan staat de laadkaai vol.",
      notes: [{ author: "lotte", text: "Wie kan er rijden? Arne heeft die avond examen.", visibility: "POST" }],
    },
    {
      n: 6, vehicle: "auto", start: at(6, 10), end: at(6, 12),
      purpose: "Boodschappen voor de cantus", group: "SPORT", requester: "lotte", contactPhone: "+32 470 12 34 56",
      driver: "arne", eventName: "Sportcantus", pickup: "Colruyt, Tiensesteenweg 300, 3001 Heverlee", destination: KELDER,
      helpers: [{ name: "Mila Desmet", phone: "+32 471 66 20 05" }],
    },
    {
      n: 7, vehicle: "kar", start: at(8, 13), end: at(8, 16),
      purpose: "Podium terug naar de verhuurder", group: "CULTUUR", requester: "noor", contactPhone: "+32 494 18 72 30",
      driver: "carol", eventName: "Revue",
      pickup: "Aula Pieter De Somer, Deberiotstraat 24, 3000 Leuven",
      destination: "Podiumverhuur Vermeulen, Diestsesteenweg 410, 3010 Kessel-Lo",
      cargo: "8 podiumelementen en 16 poten",
      adminNote: "Geef de factuur mee aan de verhuurder; ze zit in de map in de kar.",
      helpers: [{ name: "Robbe Verhoeven", phone: "+32 479 11 45 60" }, { name: "Fien Lambrechts" }],
    },
    {
      n: 8, vehicle: "kar", start: at(10, 22), end: at(11, 2),
      purpose: "Geluid ophalen na het sportgala", group: "SPORT", requester: "lotte", contactPhone: "+32 470 12 34 56",
      driver: "carol", eventName: "Sportgala", pickup: SALONS, destination: MAGAZIJN,
      cargo: "Geluidsinstallatie en 2 lichtbruggen",
    },
    {
      n: 9, vehicle: "auto", start: at(23, 9), end: at(23, 11),
      purpose: "Kerstbomen voor de kerstmarkt", group: "CULTUUR", requester: "noor", contactPhone: "+32 494 18 72 30",
      driver: "carol", eventName: "Kerstmarkt",
      pickup: "Tuincentrum Groen, Tervuursesteenweg 55, 3001 Heverlee", destination: "Ladeuzeplein, 3000 Leuven",
      cargo: "3 kerstbomen",
    },
    // Gereden ritten.
    {
      n: 20, vehicle: "kar", start: at(-3, 17), end: at(-3, 19), completed: true,
      purpose: "Affiches en standjes naar de faculteit", group: "CULTUUR", requester: "elias",
      driver: "carol", pickup: MAGAZIJN, destination: "Gebouw 200A, Celestijnenlaan 200A, 3001 Heverlee",
    },
    {
      n: 21, vehicle: "kar", start: at(-6, 10), end: at(-6, 13), completed: true,
      purpose: "Tenten naar het sportveld", group: "SPORT", requester: "lotte",
      driver: "carol", pickup: MAGAZIJN, destination: "Sportkot, Tervuursevest 101, 3001 Heverlee",
      notes: [{ author: "carol", text: "Eén haring ontbreekt in de grote tent.", visibility: "POST_EN_LOGISTIEK" }],
    },
    {
      n: 22, vehicle: "kar", start: at(-15, 20), end: at(-15, 23), completed: true,
      purpose: "Vaten voor de Halloween-TD", group: "SPORT", requester: "lotte",
      driver: "carol", pickup: HAACHT, destination: ALMA,
    },
    {
      n: 23, vehicle: "auto", start: at(-25, 14), end: at(-25, 15), completed: true,
      purpose: "Drukwerk ophalen", group: "IT", requester: "hanne",
      driver: "carol", pickup: "Drukkerij Acco, Tiensestraat 134, 3000 Leuven", destination: MAGAZIJN,
    },
    {
      n: 24, vehicle: "kar", start: at(-33, 9), end: at(-33, 12), completed: true,
      purpose: "Verhuis van het praesidiumlokaal", group: "CULTUUR", requester: "noor",
      driver: "carol", pickup: KELDER, destination: MAGAZIJN,
    },
  ];
}

async function clear(prisma: PrismaClient): Promise<void> {
  // Nota's en bijrijders gaan mee via onDelete: Cascade.
  await prisma.uitleenTransportBooking.deleteMany({ where: { id: { startsWith: `${PREFIX}-` } } });
  await prisma.uitleenDriver.deleteMany({ where: { id: { startsWith: `${PREFIX}-` } } });
  await prisma.groupMembership.deleteMany({ where: { user: { email: { endsWith: DOMAIN } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
}

async function main(): Promise<void> {
  assertLocalDatabase();
  const prisma = new PrismaClient();
  try {
    await clear(prisma);
    if (process.argv.includes("--reset")) {
      console.log("Opgeruimd.");
      return;
    }

    const year = currentWorkingYear();
    const groups = new Map(
      (await prisma.group.findMany({ where: { code: { in: ["SPORT", "CULTUUR", "IT"] } }, select: { id: true, code: true } }))
        .map((group) => [group.code, group.id])
    );
    for (const code of ["SPORT", "CULTUUR", "IT"]) {
      if (!groups.has(code)) throw new Error(`Post ${code} bestaat niet. Draai eerst de seed (make db).`);
    }
    const vehicles = new Map(
      (await prisma.uitleenVehicle.findMany({ select: { id: true, code: true, pricingMode: true, rateCents: true } }))
        .map((vehicle) => [vehicle.code, vehicle])
    );

    // Carol bestaat ook zonder dit script zodra iemand als haar inlogt; hier
    // alvast, want de ritten hangen eraan. Haar lidmaatschap van Sport zet de
    // testlogin zelf.
    await prisma.user.upsert({
      where: { id: CAROL },
      update: {},
      create: { id: CAROL, email: "post@test.vtk.be", name: "Carol (test post)", active: true },
    });
    await prisma.groupMembership.upsert({
      where: { userId_groupId_year: { userId: CAROL, groupId: groups.get("SPORT")!, year } },
      update: {},
      create: { userId: CAROL, groupId: groups.get("SPORT")!, year, role: "MEMBER" },
    });
    await prisma.uitleenDriver.upsert({
      where: { userId: CAROL },
      update: { canDriveVan: true },
      create: { id: `${PREFIX}-driver-carol`, userId: CAROL, canDriveVan: true },
    });

    for (const person of PEOPLE) {
      await prisma.user.create({
        data: { id: userId(person.slug), email: `${person.slug}${DOMAIN}`, name: person.name, active: true },
      });
      await prisma.groupMembership.create({
        data: { userId: userId(person.slug), groupId: groups.get(person.group)!, year, role: "MEMBER" },
      });
      if (person.driver) {
        await prisma.uitleenDriver.create({
          data: { id: `${PREFIX}-driver-${person.slug}`, userId: userId(person.slug), canDriveVan: true },
        });
      }
    }

    const who = (person: "carol" | Person) => (person === "carol" ? CAROL : userId(person));
    for (const trip of trips()) {
      const vehicle = vehicles.get(trip.vehicle);
      if (!vehicle) throw new Error(`Voertuig ${trip.vehicle} bestaat niet. Draai eerst de seed (make db).`);
      await prisma.uitleenTransportBooking.create({
        data: {
          id: `${PREFIX}-${trip.n}`,
          userId: userId(trip.requester),
          vehicleId: vehicle.id,
          status: trip.completed ? "COMPLETED" : "APPROVED",
          requesterType: "INTERN",
          groupId: groups.get(trip.group)!,
          startAt: trip.start,
          endAt: trip.end,
          purpose: trip.purpose,
          eventName: trip.eventName ?? null,
          cargoNote: trip.cargo ?? null,
          pickupAddress: trip.pickup ?? null,
          destination: trip.destination ?? null,
          contactPhone: trip.contactPhone ?? null,
          driverId: trip.driver ? who(trip.driver) : null,
          assignedGroupId: trip.assignedGroup ? groups.get(trip.assignedGroup)! : null,
          pricingMode: vehicle.pricingMode,
          rateCents: vehicle.rateCents,
          memberNote: trip.memberNote ?? null,
          adminNote: trip.adminNote ?? null,
          decidedAt: new Date(),
          completedAt: trip.completed ? trip.end : null,
          helpers: { create: (trip.helpers ?? []).map((helper) => ({ name: helper.name, phone: helper.phone ?? null })) },
          notes: {
            create: (trip.notes ?? []).map((note) => ({
              authorId: who(note.author),
              text: note.text,
              visibility: note.visibility,
            })),
          },
        },
      });
    }

    console.log(`Klaar: ${trips().length} ritten. Log in op /test-login als "Carol (test post)" en open /ritten.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
