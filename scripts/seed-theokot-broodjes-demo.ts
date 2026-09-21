/**
 * Vult het broodjessysteem van het Theokot met voorbeelden, zodat elk scherm en
 * elke knop in een paar minuten uit te proberen is.
 *
 * Draaien:
 *
 *   npm run db:demo:broodjes          # of: make broodjes
 *   npm run db:demo:broodjes -- --reset   # enkel opruimen
 *
 * Wat dit script aanmaakt, onthoudt het in de setting in `MARK_KEY`: de ids van
 * de verkoopdagen, de demostudenten, de shift en de vergadering. Bij een
 * volgende beurt gooit het precies die weg en zet het alles opnieuw. Een
 * verkoopdag die jij met de hand aanmaakte, blijft dus staan.
 *
 * De dagen liggen relatief ten opzichte van vandaag. Een demo met vaste datums
 * erin laat net de schermen leeg waar iets te zien moest zijn.
 *
 * Weigert te draaien tegen iets anders dan een lokale database: dit maakt
 * bestellingen, no-shows en een ban aan op naam van verzonnen studenten.
 */

import { PrismaClient } from "@prisma/client";
import { brusselsWallClock, brusselsYMD, shiftYMD } from "../apps/web/lib/brussels";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const MARK_KEY = "theokot.demo.broodjes";
const DEMO_DOMAIN = "@broodjes.demo";

function assertLocalDatabase(rawUrl: string | undefined): string {
  if (!rawUrl) {
    console.error("DATABASE_URL ontbreekt. Staat je .env op zijn plaats?");
    process.exit(1);
  }
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    console.error("DATABASE_URL is geen geldige URL.");
    process.exit(1);
  }
  if (!LOCAL_HOSTS.has(host)) {
    console.error(
      [
        `Weigert te draaien: DATABASE_URL wijst naar "${host}" en niet naar een lokale database.`,
        "",
        "Dit script maakt bestellingen, no-shows en een ban aan op naam van",
        "verzonnen studenten. Op de echte site staan die dan in de historiek van",
        "Theokot en in de turflijst.",
      ].join("\n"),
    );
    process.exit(1);
  }
  return host;
}

const today = brusselsYMD(new Date());

/** Een wandklokmoment op de dag `days` verder dan vandaag. */
function at(days: number, hhmm: string): Date {
  const ymd = shiftYMD(today, days);
  return brusselsWallClock(ymd.year, ymd.month, ymd.day, hhmm);
}

/** Lokale middernacht van die dag; dat is wat `TheokotSession.date` bewaart. */
function midnight(days: number): Date {
  return at(days, "00:00");
}

function dayLabel(days: number): string {
  const ymd = shiftYMD(today, days);
  return `${String(ymd.day).padStart(2, "0")}/${String(ymd.month).padStart(2, "0")}`;
}

/** De demostudenten. Het r-nummer is waarmee je ze aan de balie opzoekt. */
const STUDENTS = [
  { key: "wannes", name: "Wannes Demo", rNumber: "r9000001" },
  { key: "fien", name: "Fien Demo", rNumber: "r9000002" },
  { key: "joris", name: "Joris Demo", rNumber: "r9000003" },
  { key: "lies", name: "Lies Demo", rNumber: "r9000004" },
  { key: "tuur", name: "Tuur Demo", rNumber: "r9000005" },
] as const;

type StudentKey = (typeof STUDENTS)[number]["key"];

/** Het aanbod dat elke demodag krijgt. */
const OFFERING = [
  { nameNl: "Broodje kaas", nameEn: "Cheese sandwich", priceCents: 260, quantity: 20, isWeeklySpecial: false },
  { nameNl: "Broodje hesp", nameEn: "Ham sandwich", priceCents: 260, quantity: 20, isWeeklySpecial: false },
  { nameNl: "Broodje gezond", nameEn: "Healthy sandwich", priceCents: 300, quantity: 12, isWeeklySpecial: false },
  { nameNl: "Broodje kip curry", nameEn: "Chicken curry sandwich", priceCents: 320, quantity: 8, isWeeklySpecial: true },
];

type Mark = {
  sessionIds: string[];
  userIds: string[];
  shiftIds: string[];
  meetingIds: string[];
};

const EMPTY_MARK: Mark = { sessionIds: [], userIds: [], shiftIds: [], meetingIds: [] };

async function cleanUp(prisma: PrismaClient): Promise<Mark> {
  const row = await prisma.setting.findUnique({ where: { key: MARK_KEY } });
  const mark = { ...EMPTY_MARK, ...((row?.value as Partial<Mark>) ?? {}) };

  // Vergaderingen eerst: hun reservaties wijzen naar de aanbod-items hieronder.
  if (mark.meetingIds.length > 0) {
    await prisma.meeting.deleteMany({ where: { id: { in: mark.meetingIds } } });
  }
  if (mark.sessionIds.length > 0) {
    await prisma.theokotSession.deleteMany({ where: { id: { in: mark.sessionIds } } });
  }
  if (mark.shiftIds.length > 0) {
    await prisma.shift.deleteMany({ where: { id: { in: mark.shiftIds } } });
  }
  // De studenten op hun beurt: bans, bestellingen en deelnames hangen er met
  // cascade aan. Op het demodomein en niet op de onthouden ids, zodat een
  // half afgebroken vorige beurt ook opgeruimd raakt.
  const users = await prisma.user.deleteMany({ where: { email: { endsWith: DEMO_DOMAIN } } });

  return {
    ...mark,
    userIds: users.count > 0 ? [] : mark.userIds,
  };
}

async function main() {
  const host = assertLocalDatabase(process.env.DATABASE_URL);
  const resetOnly = process.argv.includes("--reset");
  const prisma = new PrismaClient();

  try {
    await cleanUp(prisma);
    if (resetOnly) {
      await prisma.setting.deleteMany({ where: { key: MARK_KEY } });
      console.log(`\nDemo opgeruimd op ${host}. Niets nieuws aangemaakt.\n`);
      return;
    }

    const mark: Mark = { sessionIds: [], userIds: [], shiftIds: [], meetingIds: [] };

    // -- De studenten ---------------------------------------------------------
    const userId: Record<string, string> = {};
    for (const student of STUDENTS) {
      const user = await prisma.user.create({
        data: {
          name: student.name,
          email: `${student.key}${DEMO_DOMAIN}`,
          rNumber: student.rNumber,
          locale: "NL",
          emailVerified: true,
        },
        select: { id: true },
      });
      userId[student.key] = user.id;
      mark.userIds.push(user.id);
    }

    // -- Een afgelopen shift, zodat er openstaande bonnetjes zijn -------------
    // Joris heeft er twee staan; dat is precies wat een broodje aan de balie
    // kost, dus bij het scannen van zijn r-nummer springt het bonnetjesvenster
    // open.
    const shift = await prisma.shift.create({
      data: {
        name: "Theokot middag (demo)",
        startTime: at(-1, "12:00"),
        endTime: at(-1, "14:00"),
        location: "Theokot",
        description: "Demoshift, enkel om openstaande bonnetjes te hebben.",
        maxParticipants: 4,
        reward: 2,
        post: "THEOKOT",
        participants: {
          create: [{ userId: userId.joris, payedOut: false, rewardPaid: 0 }],
        },
      },
      select: { id: true },
    });
    mark.shiftIds.push(shift.id);

    // -- De verkoopdagen ------------------------------------------------------
    type DayPlan = {
      offset: number;
      note: string;
      orderOpenAt: Date;
      orderCloseAt: Date;
      pickupStart: Date;
      pickupEnd: Date;
      processed?: boolean;
    };

    const days: DayPlan[] = [
      {
        offset: -1,
        note: "Gisteren, volledig afgehandeld: no-shows verwerkt.",
        orderOpenAt: at(-3, "12:00"),
        orderCloseAt: at(-1, "10:30"),
        pickupStart: at(-1, "12:00"),
        pickupEnd: at(-1, "16:00"),
        processed: true,
      },
      {
        offset: 0,
        note: "Vandaag: afhaal loopt. Hier test je de balie.",
        orderOpenAt: at(-2, "12:00"),
        orderCloseAt: at(0, "10:30"),
        pickupStart: at(0, "12:00"),
        pickupEnd: at(0, "16:00"),
      },
      {
        offset: 1,
        note: "Morgen: bestellen staat open, niets opgehaald.",
        orderOpenAt: at(-1, "12:00"),
        orderCloseAt: at(1, "10:30"),
        pickupStart: at(1, "12:00"),
        pickupEnd: at(1, "16:00"),
      },
      {
        offset: 2,
        note: "Overmorgen: meer besteld dan er in het aanbod staat.",
        orderOpenAt: at(0, "12:00"),
        orderCloseAt: at(2, "10:30"),
        pickupStart: at(2, "12:00"),
        pickupEnd: at(2, "16:00"),
      },
      {
        offset: 5,
        note: "Over vijf dagen: bestellen opent pas later.",
        orderOpenAt: at(3, "12:00"),
        orderCloseAt: at(5, "10:30"),
        pickupStart: at(5, "12:00"),
        pickupEnd: at(5, "16:00"),
      },
    ];

    const sessionByOffset = new Map<number, { id: string; items: Array<{ id: string; nameNl: string; priceCents: number }> }>();

    for (const day of days) {
      const created = await prisma.theokotSession.create({
        data: {
          date: midnight(day.offset),
          isOpen: true,
          orderOpenAt: day.orderOpenAt,
          orderCloseAt: day.orderCloseAt,
          pickupStart: day.pickupStart,
          pickupEnd: day.pickupEnd,
          processedAt: day.processed ? at(day.offset, "16:15") : null,
          items: {
            create: OFFERING.map((item, order) => ({ ...item, order })),
          },
        },
        select: { id: true, items: { select: { id: true, nameNl: true, priceCents: true }, orderBy: { order: "asc" } } },
      });
      mark.sessionIds.push(created.id);
      sessionByOffset.set(day.offset, created);
    }

    /** Plaatst een bestelling van een broodje op een dag. */
    async function order(
      offset: number,
      student: StudentKey,
      itemIndex: number,
      quantity: number,
      status: "RESERVED" | "PICKED_UP" | "NO_SHOW",
    ) {
      const session = sessionByOffset.get(offset);
      if (!session) return;
      const item = session.items[itemIndex];
      await prisma.theokotOrder.create({
        data: {
          sessionId: session.id,
          userId: userId[student],
          status,
          totalCents: item.priceCents * quantity,
          pickedUpAt: status === "PICKED_UP" ? at(offset, "12:30") : null,
          noShowProcessedAt: status === "NO_SHOW" && offset < 0 ? at(offset, "16:15") : null,
          lines: {
            create: [{ sessionItemId: item.id, quantity, unitPriceCents: item.priceCents }],
          },
        },
      });
    }

    // Gisteren: een opgehaalde en twee niet-opgehaalde bestellingen.
    await order(-1, "joris", 0, 1, "PICKED_UP");
    await order(-1, "lies", 1, 2, "NO_SHOW");
    await order(-1, "tuur", 2, 1, "NO_SHOW");

    // Vandaag: alles wat de balie moet kunnen tonen.
    await order(0, "wannes", 0, 2, "RESERVED");
    await order(0, "fien", 1, 1, "PICKED_UP");
    await order(0, "joris", 3, 1, "NO_SHOW");

    // Morgen: niets opgehaald, dus deze dag is nog te verwijderen.
    await order(1, "wannes", 0, 1, "RESERVED");
    await order(1, "tuur", 2, 1, "RESERVED");

    // Overmorgen: vier broodjes kaas besteld en er staan er straks nog twee in
    // het aanbod. Zo zie je de rode regel in de aanbod-editor meteen staan.
    await order(2, "wannes", 0, 1, "RESERVED");
    await order(2, "fien", 0, 1, "RESERVED");
    await order(2, "joris", 0, 1, "RESERVED");
    await order(2, "tuur", 0, 1, "RESERVED");
    const overbooked = sessionByOffset.get(2);
    if (overbooked) {
      await prisma.theokotSessionItem.update({
        where: { id: overbooked.items[0].id },
        data: { quantity: 2 },
      });
    }

    // -- Een grocomeet op vandaag, voor de GM-kolom op de turflijst ----------
    const todaySession = sessionByOffset.get(0);
    if (todaySession) {
      const meeting = await prisma.meeting.create({
        data: {
          kind: "GROCOMEET",
          year: today.year,
          semester: today.month >= 2 && today.month <= 8 ? 2 : 1,
          slug: `demo-grocomeet-${today.year}-${today.month}-${today.day}`,
          startsAt: at(0, "12:45"),
          location: "Vergaderzaal",
          reservations: {
            create: [
              {
                userId: userId.lies,
                itemNameNl: todaySession.items[1].nameNl,
                itemPriceCents: todaySession.items[1].priceCents,
                sessionItemId: todaySession.items[1].id,
                drinkName: "Cola",
                drinkPriceCents: 100,
              },
            ],
          },
        },
        select: { id: true },
      });
      mark.meetingIds.push(meeting.id);
    }

    // -- Een lopende ban ------------------------------------------------------
    await prisma.theokotBan.create({
      data: {
        userId: userId.lies,
        reason: "2 niet-opgehaalde bestellingen",
        endsAt: at(10, "12:00"),
        note: "Aangemaakt door de demo-seeding.",
      },
    });

    await prisma.setting.upsert({
      where: { key: MARK_KEY },
      create: { key: MARK_KEY, value: mark },
      update: { value: mark },
    });

    console.log(`\nDemo klaar op ${host}.`);
    console.log(`  ${days.length} verkoopdagen, ${STUDENTS.length} studenten, 10 bestellingen, 1 ban, 1 grocomeet.\n`);
    console.log("  Verkoopdagen");
    for (const day of days) {
      console.log(`    ${dayLabel(day.offset).padEnd(6)} ${day.note}`);
    }
    console.log("\n  Studenten (r-nummer om aan de balie op te zoeken)");
    console.log("    r9000001  Wannes  bestelling van vandaag, nog niet opgehaald");
    console.log("    r9000002  Fien    bestelling van vandaag, al opgehaald");
    console.log("    r9000003  Joris   niet opgehaald vandaag + 2 openstaande bonnetjes");
    console.log("    r9000004  Lies    geband tot over 10 dagen, met grocomeet-broodje");
    console.log("    r9000005  Tuur    bestellingen op morgen en overmorgen");
    console.log("\n  Uit te proberen");
    console.log("    Balie        /theokot/balie          r9000003: laattijdig uitdelen + bonnetjesvenster");
    console.log("    Beheer       /admin/theokot          afhaalronde afsluiten (vandaag), verwijderen (morgen)");
    console.log("    Aanbod       /admin/theokot          overmorgen: 4 besteld, 2 in het aanbod");
    console.log("    Bestellingen /admin/theokot          uitklap onder een verkoopdag, schrappen met mail");
    console.log("    Turflijst    /admin/theokot/turflijst  vandaag: GM-kolom en drankje");
    console.log("    Bans         /admin/theokot/bans     de ban van Lies en de no-show-historiek");
    console.log("    Mails        /admin/it/flows         de annulatiemail en de no-show-waarschuwing");
    console.log("    Student      /theokot                log in als een demostudent bestaat niet; gebruik je eigen account\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
