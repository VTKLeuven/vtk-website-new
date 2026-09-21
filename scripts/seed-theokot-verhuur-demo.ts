/**
 * Vult de Theokot-verhuur met voorbeelden, zodat elke toestand van de publieke
 * beschikbaarheidskalender en van het beheer in één keer te zien is.
 *
 * Draaien:
 *
 *   npm run db:demo:verhuur          # of: make verhuur
 *   DEMO_CLOSED=1 npm run db:demo:verhuur   # met het formulier dicht
 *
 * Alles wat dit script maakt, draagt de markering in `DEMO_MARK` in zijn interne
 * notitie. Het script gooit eerst alles met die markering weg en zet het dan
 * opnieuw, dus twee keer draaien levert geen tweede set op. Bestaande aanvragen
 * blijven ongemoeid: er wordt enkel op die markering verwijderd.
 *
 * De dagen liggen relatief ten opzichte van vandaag, niet op vaste datums. Een
 * demo met datums uit 2025 erin laat een kalender leeg staan op de plaats waar
 * net iets te zien moest zijn.
 *
 * Weigert te draaien tegen iets anders dan een lokale database: dit schrijft
 * verhuren en wijzigt de instellingen van de verhuur.
 */

import { PrismaClient } from "@prisma/client";
import { brusselsWallClock, brusselsYMD, shiftYMD } from "../apps/web/lib/brussels";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const DEMO_MARK = "DEMO-VERHUUR";
const CONFIG_KEY = "theokot.rental.config";

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
        "Dit script maakt verhuuraanvragen aan en zet de wachttijd van het",
        "publieke formulier. Op de echte site staan er dan verzonnen avonden in",
        "de kalender van Theokot.",
      ].join("\n"),
    );
    process.exit(1);
  }
  return host;
}

const today = brusselsYMD(new Date());

/** Een uur op de dag `days` verder dan vandaag, in Brussel-wandklok. */
function at(days: number, hhmm: string): Date {
  const ymd = shiftYMD(today, days);
  return brusselsWallClock(ymd.year, ymd.month, ymd.day, hhmm);
}

type Demo = {
  /** Wat je hieraan moet zien; komt in de samenvatting op het scherm. */
  note: string;
  startDay: number;
  start: string;
  endDay: number;
  end: string;
  status: "UNANSWERED" | "APPROVED" | "REJECTED" | "CANCELLED" | "ENDED" | "COMPLETED";
  responsibleName: string;
  email: string;
  phone: string;
  purpose: string;
  purposePublic: boolean;
  renterType: "INTERNAL" | "EXTERNAL";
  attendees: number | null;
};

const DEMOS: Demo[] = [
  {
    note: "Goedgekeurd en anoniem: publiek staat er enkel 'Bezet' met de uren.",
    startDay: 3, start: "20:00", endDay: 4, end: "01:00",
    status: "APPROVED",
    responsibleName: "Marie Vermeulen",
    email: "marie.vermeulen@student.kuleuven.be",
    phone: "0478 12 34 56",
    purpose: "Verjaardagsfeest van Marie",
    purposePublic: false,
    renterType: "EXTERNAL",
    attendees: 60,
  },
  {
    note: "Goedgekeurd en vrijgegeven: publiek staat de activiteit erbij.",
    startDay: 4, start: "19:00", endDay: 4, end: "23:30",
    status: "APPROVED",
    responsibleName: "Lotte Peeters",
    email: "lotte.peeters@vtk.be",
    phone: "0491 22 33 44",
    purpose: "[Theokot] Kaas- en wijnavond",
    purposePublic: true,
    renterType: "INTERNAL",
    attendees: 45,
  },
  {
    note: "Onbeantwoord, op dezelfde dag als de kaas- en wijnavond: in het beheer een botsing, publiek onzichtbaar.",
    startDay: 4, start: "14:00", endDay: 4, end: "17:00",
    status: "UNANSWERED",
    responsibleName: "Joris Claes",
    email: "joris.claes@student.kuleuven.be",
    phone: "0472 98 76 54",
    purpose: "Receptie doctoraatsverdediging",
    purposePublic: false,
    renterType: "EXTERNAL",
    attendees: 80,
  },
  {
    note: "Loopt door tot na middernacht: één blokje op de startdag, in de weekweergave van het beheer in twee stukken.",
    startDay: 10, start: "21:00", endDay: 11, end: "03:00",
    status: "APPROVED",
    responsibleName: "Wout Janssens",
    email: "wout@wina.be",
    phone: "0486 55 66 77",
    purpose: "[Wina] Afterparty galabal",
    purposePublic: true,
    renterType: "INTERNAL",
    attendees: 120,
  },
  {
    note: "Geweigerd: staat standaard nergens op, in het beheer terug te halen met het vinkje in de legende.",
    startDay: 11, start: "18:00", endDay: 11, end: "22:00",
    status: "REJECTED",
    responsibleName: "Sam De Ridder",
    email: "sam.deridder@student.kuleuven.be",
    phone: "0474 11 22 33",
    purpose: "Fuif met 200 man",
    purposePublic: false,
    renterType: "EXTERNAL",
    attendees: 200,
  },
  {
    note: "Geannuleerd: idem, en doorstreept zodra je ze toont.",
    startDay: 17, start: "20:00", endDay: 17, end: "23:00",
    status: "CANCELLED",
    responsibleName: "Nina Willems",
    email: "nina.willems@vtk.be",
    phone: "0495 44 55 66",
    purpose: "[Sportraad] Quiz",
    purposePublic: true,
    renterType: "INTERNAL",
    attendees: 50,
  },
  {
    note: "Afgelopen (vorige week): publiek nog altijd bezet, op een voorbije dag.",
    startDay: -6, start: "19:00", endDay: -6, end: "23:00",
    status: "ENDED",
    responsibleName: "Tuur Maes",
    email: "tuur.maes@vtk.be",
    phone: "0493 77 88 99",
    purpose: "[Theokot] Filmavond",
    purposePublic: true,
    renterType: "INTERNAL",
    attendees: 35,
  },
  {
    note: "Afgerond (drie weken geleden): ook bezet, ook anoniem.",
    startDay: -20, start: "20:00", endDay: -19, end: "02:00",
    status: "COMPLETED",
    responsibleName: "Elise Goossens",
    email: "elise.goossens@student.kuleuven.be",
    phone: "0477 33 22 11",
    purpose: "Verlovingsfeest",
    purposePublic: false,
    renterType: "EXTERNAL",
    attendees: 70,
  },
  {
    note: "Binnen de wachttijd én bezet: bezet wint van 'te kort dag'.",
    startDay: 2, start: "19:00", endDay: 2, end: "22:00",
    status: "APPROVED",
    responsibleName: "Bram Coppens",
    email: "bram.coppens@vtk.be",
    phone: "0470 10 20 30",
    purpose: "[Cursusdienst] Inpakavond",
    purposePublic: true,
    renterType: "INTERNAL",
    attendees: 25,
  },
  {
    note: "Volgende maand: om te zien dat bladeren met de pijltjes iets oplevert.",
    startDay: 35, start: "20:00", endDay: 36, end: "00:30",
    status: "APPROVED",
    responsibleName: "Hanne Vos",
    email: "hanne.vos@ekonomika.be",
    phone: "0488 90 12 34",
    purpose: "[Ekonomika] Cantus",
    purposePublic: true,
    renterType: "EXTERNAL",
    attendees: 150,
  },
];

async function main() {
  const host = assertLocalDatabase(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  const closed = process.env.DEMO_CLOSED === "1";

  try {
    const removed = await prisma.theokotRental.deleteMany({
      where: { internalNote: { startsWith: DEMO_MARK } },
    });

    for (const demo of DEMOS) {
      await prisma.theokotRental.create({
        data: {
          locale: "nl",
          responsibleName: demo.responsibleName,
          email: demo.email,
          phone: demo.phone,
          startsAt: at(demo.startDay, demo.start),
          endsAt: at(demo.endDay, demo.end),
          purpose: demo.purpose,
          purposePublic: demo.purposePublic,
          attendees: demo.attendees,
          renterType: demo.renterType,
          status: demo.status,
          depositChoice: demo.renterType === "INTERNAL" ? "NVT" : "TRANSFER",
          deposit: demo.renterType === "INTERNAL" ? "NVT" : "TRANSFER",
          contract: demo.renterType === "INTERNAL" ? "NVT" : "PENDING",
          keyStatus: demo.status === "COMPLETED" ? "RETURNED" : "PENDING",
          internalNote: `${DEMO_MARK}: ${demo.note}`,
          decidedAt: demo.status === "UNANSWERED" ? null : new Date(),
        },
      });
    }

    // De wachttijd aan zetten, anders is de derde toestand van de kalender
    // ("te kort dag") nergens te zien.
    const existing = await prisma.setting.findUnique({ where: { key: CONFIG_KEY } });
    const config = {
      ...((existing?.value as Record<string, unknown>) ?? {}),
      minLeadDays: 7,
      formOpen: !closed,
    };
    await prisma.setting.upsert({
      where: { key: CONFIG_KEY },
      create: { key: CONFIG_KEY, value: config },
      update: { value: config },
    });

    console.log(`\nDemo klaar op ${host}.`);
    console.log(`  ${removed.count} oude demo-aanvragen weg, ${DEMOS.length} nieuwe erin.`);
    console.log(`  Wachttijd: 7 dagen. Formulier: ${closed ? "dicht" : "open"}.\n`);
    for (const demo of DEMOS) {
      const day = shiftYMD(today, demo.startDay);
      const stamp = `${String(day.day).padStart(2, "0")}/${String(day.month).padStart(2, "0")}`;
      console.log(`  ${stamp} ${demo.start}  ${demo.status.padEnd(10)} ${demo.note}`);
    }
    console.log("\n  Publiek:  http://localhost:3000/theokot/verhuur");
    console.log("  Beheer:   http://localhost:3000/admin/theokot/verhuur?tab=kalender\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
