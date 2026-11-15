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
 * `LOGISTIEK_TEST_LOGIN=open` in de `.env`, ga naar /test-login en kies:
 *
 * - "Carol (test post)": zit in Sport en rijdt af en toe. Ze ziet haar eigen
 *   ritten, die van Sport, en een rit die Sport nog zelf moet invullen.
 * - "Alice (test logistiek)": zit in Logistiek en rijdt elke week meerdere
 *   ritten met de kar voor andere posten. Zo ziet een drukke chauffeur het.
 *
 * De datums hangen aan vandaag: draai het script opnieuw om ze te verversen.
 *
 * Wat dit script aanmaakt, herkent het aan het id (`demo-ritten-...`) en aan het
 * domein `@ritten.demo`. Carol en Alice zelf (`test-user-*`) blijven staan; enkel
 * een plaats in de chauffeurslijst die van hier komt, gaat mee weg bij `--reset`.
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
const ALICE = "test-user-logistiek";

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
  { slug: "ruben", name: "Ruben Claes", group: "FAKBAR", driver: false },
  { slug: "sara", name: "Sara De Smet", group: "ACTIVITEITEN", driver: false },
  { slug: "tom", name: "Tom Wuyts", group: "INTERNATIONAAL", driver: false },
  { slug: "ines", name: "Ines Mertens", group: "CURSUSDIENST", driver: false },
  { slug: "emma", name: "Emma Jacobs", group: "BEDRIJVENRELATIES", driver: false },
  { slug: "lars", name: "Lars Goossens", group: "ONTHAAL", driver: false },
] as const;

/** Het nummer van elke contactpersoon, zodat de belknop iets doet. */
const PHONES: Record<Person, string> = {
  lotte: "+32 470 12 34 56",
  arne: "+32 478 90 12 34",
  elias: "+32 485 21 09 77",
  hanne: "+32 476 30 44 12",
  noor: "+32 494 18 72 30",
  ruben: "+32 471 82 40 19",
  sara: "+32 486 55 07 31",
  tom: "+32 475 14 63 88",
  ines: "+32 492 70 21 45",
  emma: "+32 477 39 52 06",
  lars: "+32 483 61 17 92",
};

type Driver = "carol" | "alice" | Person;

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
  /** `carol`, `alice`, iemand van hierboven, of niemand. */
  driver: Driver | null;
  /** Doorgegeven aan deze post om zelf een chauffeur te kiezen. */
  assignedGroup?: string;
  eventName?: string;
  pickup?: string;
  destination?: string;
  cargo?: string;
  adminNote?: string;
  memberNote?: string;
  helpers?: Array<{ name: string; phone?: string }>;
  notes?: Array<{ author: Driver; text: string; visibility: UitleenTransportNoteVisibility }>;
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
    ...aliceTrips(),
  ];
}

const FAKBAR = "Fakbar 't Elixir, Tiensestraat 1, 3000 Leuven";
const ACCO = "Drukkerij Acco, Tiensestraat 134, 3000 Leuven";
const CURSUSDIENST = "Cursusdienst VTK, Kasteelpark Arenberg 1, 3001 Heverlee";
const LADEUZE = "Ladeuzeplein, 3000 Leuven";
const BRABANTHAL = "Brabanthal, Brabantlaan 1, 3010 Kessel-Lo";
const PDS = "Aula Pieter De Somer, Deberiotstraat 24, 3000 Leuven";

/**
 * Alice rijdt voor iedereen: elke week drie tot vijf ritten met de kar, voor
 * andere posten, met af en toe twee op één dag (heen en terug rond een
 * activiteit) en een rit tot na middernacht.
 */
function aliceTrips(): DemoTrip[] {
  const kar = { vehicle: "kar" as const, driver: "alice" as const };
  const fakbar = (n: number, day: number, completed = false): DemoTrip => ({
    ...kar, n, start: at(day, 9), end: at(day, 11), completed,
    purpose: "Vaten ophalen voor de Fakbar", group: "FAKBAR", requester: "ruben",
    pickup: HAACHT, destination: FAKBAR, cargo: "20 vaten pils en 4 bakken frisdrank",
    adminNote: "Neem het leeggoed van vorige week mee naar Haacht; het staat naast de koelcel.",
  });
  return [
    // Deze week en volgende week.
    fakbar(101, 1),
    {
      ...kar, n: 102, start: at(2, 13), end: at(2, 15),
      purpose: "Cursussen van de drukkerij naar de cursusdienst", group: "CURSUSDIENST", requester: "ines",
      pickup: ACCO, destination: CURSUSDIENST, cargo: "40 dozen cursussen",
      memberNote: "Aan de achterkant van de drukkerij laden, de voordeur is te smal voor de dozen.",
    },
    {
      ...kar, n: 103, start: at(3, 16, 30), end: at(3, 18, 30), eventName: "Winterbar",
      purpose: "Podium en tap naar het Ladeuzeplein", group: "ACTIVITEITEN", requester: "sara",
      pickup: MAGAZIJN, destination: LADEUZE, cargo: "6 podiumelementen, 1 tapinstallatie en 2 partytenten",
      helpers: [{ name: "Wout Peeters", phone: "+32 479 22 81 03" }, { name: "Julie Maes", phone: "+32 470 66 14 29" }],
      notes: [{ author: "sara", text: "We staan klaar vanaf 16:15 aan de loods.", visibility: "POST_EN_LOGISTIEK" }],
    },
    {
      ...kar, n: 104, start: at(3, 23, 30), end: at(4, 1), eventName: "Winterbar",
      purpose: "Podium en tap terug naar de loods", group: "ACTIVITEITEN", requester: "sara",
      pickup: LADEUZE, destination: MAGAZIJN, cargo: "6 podiumelementen, 1 tapinstallatie en 2 partytenten",
      helpers: [{ name: "Wout Peeters", phone: "+32 479 22 81 03" }],
      adminNote: "De loods sluit om 01:30. Sleutel terug in de sleutelkluis, code 2580.",
    },
    {
      ...kar, n: 105, start: at(5, 8, 30), end: at(5, 10), eventName: "Welkomstweekend",
      purpose: "Bagage naar het welkomstweekend", group: "INTERNATIONAAL", requester: "tom",
      pickup: "Studentenhuis Groot Begijnhof, Schapenstraat 34, 3000 Leuven",
      destination: "Jeugdherberg De Blauwput, Martelarenlaan 11A, 3010 Kessel-Lo",
      cargo: "Bagage van 30 uitwisselingsstudenten",
    },
    {
      ...kar, n: 106, start: at(6, 14), end: at(6, 16),
      purpose: "Kraampje naar de Sintactie", group: "ONTHAAL", requester: "lars",
      pickup: MAGAZIJN, destination: LADEUZE, cargo: "1 kraam, 2 tafels en een doos snoep",
    },
    // Week daarna.
    {
      ...kar, n: 107, start: at(8, 10), end: at(8, 12), eventName: "Jobbeurs",
      purpose: "Standen naar de jobbeurs", group: "BEDRIJVENRELATIES", requester: "emma",
      pickup: MAGAZIJN, destination: BRABANTHAL, cargo: "12 standwanden, 20 statafels en kabelhaspels",
      adminNote: "Laden aan poort C. Meld je bij de stand van VTK, daar ligt je parkeerkaart.",
      helpers: [{ name: "Kobe Hermans", phone: "+32 474 08 31 66" }, { name: "Lina Aerts" }],
    },
    fakbar(108, 9),
    {
      ...kar, n: 109, start: at(11, 19), end: at(11, 21), eventName: "Sportgala",
      purpose: "Geluid en licht naar het sportgala", group: "SPORT", requester: "lotte",
      pickup: MAGAZIJN, destination: SALONS, cargo: "Geluidsinstallatie, 2 lichtbruggen en 8 kabelkisten",
    },
    {
      ...kar, n: 110, start: at(12, 22, 30), end: at(13, 1), eventName: "Jobbeurs",
      purpose: "Standen terug van de jobbeurs", group: "BEDRIJVENRELATIES", requester: "emma",
      pickup: BRABANTHAL, destination: MAGAZIJN, cargo: "12 standwanden, 20 statafels en kabelhaspels",
    },
    // Twee en drie weken verder.
    {
      ...kar, n: 111, start: at(15, 9), end: at(15, 10, 30),
      purpose: "Cursussen tweede semester", group: "CURSUSDIENST", requester: "ines",
      pickup: ACCO, destination: CURSUSDIENST, cargo: "65 dozen cursussen",
    },
    {
      ...kar, n: 112, start: at(16, 18), end: at(16, 20), eventName: "Revue",
      purpose: "Decor naar de revue", group: "CULTUUR", requester: "noor",
      pickup: MAGAZIJN, destination: PDS, cargo: "Decorstukken en 4 kostuumrekken",
      memberNote: "De decorstukken zijn breed; de kar moet tot aan de zij-ingang.",
    },
    {
      ...kar, n: 113, start: at(18, 14), end: at(18, 17), eventName: "Kerstmarkt",
      purpose: "Kerstmarktkramen opbouwen", group: "ONTHAAL", requester: "lars",
      pickup: MAGAZIJN, destination: LADEUZE, cargo: "4 kramen en verlichting",
    },
    fakbar(114, 22),
    {
      ...kar, n: 115, start: at(24, 13), end: at(24, 15), eventName: "Kerstmarkt",
      purpose: "Kerstmarktkramen terug naar de loods", group: "ONTHAAL", requester: "lars",
      pickup: LADEUZE, destination: MAGAZIJN, cargo: "4 kramen en verlichting",
    },
    // Gereden.
    {
      ...kar, n: 130, start: at(-1, 20), end: at(-1, 23, 30), completed: true, eventName: "Sportcantus",
      purpose: "Vaten naar de sportcantus", group: "SPORT", requester: "lotte",
      pickup: HAACHT, destination: KELDER,
    },
    fakbar(131, -3, true),
    {
      ...kar, n: 132, start: at(-5, 14), end: at(-5, 16), completed: true,
      purpose: "Cursussen van de drukkerij naar de cursusdienst", group: "CURSUSDIENST", requester: "ines",
      pickup: ACCO, destination: CURSUSDIENST,
      notes: [{ author: "alice", text: "Twee dozen beschadigd bij het laden; gemeld aan Ines.", visibility: "POST_EN_LOGISTIEK" }],
    },
    fakbar(133, -6, true),
    {
      ...kar, n: 134, start: at(-9, 17), end: at(-9, 19), completed: true, eventName: "Filmavond",
      purpose: "Scherm en projector naar de filmavond", group: "CULTUUR", requester: "elias",
      pickup: MAGAZIJN, destination: PDS,
    },
    {
      ...kar, n: 135, start: at(-12, 8), end: at(-12, 10), completed: true,
      purpose: "Matrassen naar het onthaalkamp", group: "ONTHAAL", requester: "lars",
      pickup: MAGAZIJN, destination: "Jeugdherberg De Blauwput, Martelarenlaan 11A, 3010 Kessel-Lo",
    },
    fakbar(136, -13, true),
    {
      ...kar, n: 137, start: at(-19, 21), end: at(-18, 0, 30), completed: true, eventName: "Halloween-TD",
      purpose: "Leeggoed terug na de Halloween-TD", group: "ACTIVITEITEN", requester: "sara",
      pickup: ALMA, destination: HAACHT,
    },
  ];
}

/**
 * In het echt plakt Logistiek bijna altijd de link naar een Google Sheet met de
 * materiaallijst in de lading. Hier ook, met een verzonnen sheet: de link opent
 * niets, maar zo zie je hoe hij op het scherm staat.
 */
function cargoWithSheet(trip: DemoTrip): string | null {
  if (!trip.cargo) return null;
  if (trip.n % 5 === 0) return trip.cargo;
  const sheet = `https://docs.google.com/spreadsheets/d/1Demo${trip.n}RittenMateriaallijstVtkLogistiek2026/edit#gid=${trip.n * 1000}`;
  return `${trip.cargo}. Materiaallijst: ${sheet}`;
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
    const codes = [...new Set([...PEOPLE.map((person) => person.group), "LOGISTIEK"])];
    const groups = new Map(
      (await prisma.group.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } }))
        .map((group) => [group.code, group.id])
    );
    for (const code of codes) {
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

    // Alice net zo: Logistiek, en karchauffeur.
    await prisma.user.upsert({
      where: { id: ALICE },
      update: {},
      create: { id: ALICE, email: "logistiek@test.vtk.be", name: "Alice (test logistiek)", active: true },
    });
    await prisma.groupMembership.upsert({
      where: { userId_groupId_year: { userId: ALICE, groupId: groups.get("LOGISTIEK")!, year } },
      update: {},
      create: { userId: ALICE, groupId: groups.get("LOGISTIEK")!, year, role: "LEAD" },
    });
    await prisma.uitleenDriver.upsert({
      where: { userId: ALICE },
      update: { canDriveVan: true },
      create: { id: `${PREFIX}-driver-alice`, userId: ALICE, canDriveVan: true },
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

    const who = (person: Driver) => (person === "carol" ? CAROL : person === "alice" ? ALICE : userId(person));
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
          cargoNote: cargoWithSheet(trip),
          pickupAddress: trip.pickup ?? null,
          destination: trip.destination ?? null,
          contactPhone: trip.contactPhone ?? (trip.completed ? null : PHONES[trip.requester]),
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

    console.log(
      `Klaar: ${trips().length} ritten. Log in op /test-login als "Carol (test post)" of "Alice (test logistiek)" en open /ritten.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
