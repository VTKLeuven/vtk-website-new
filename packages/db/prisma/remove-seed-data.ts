/**
 * Haalt de testdata van `seed.ts` (en van de demoscripts) weer uit een
 * database, typisch productie nadat iemand daar de seed draaide.
 *
 * Draaien (in de webcontainer, net als de seed):
 *
 *   cd /app && npx tsx packages/db/prisma/remove-seed-data.ts           # toont wat weg zou gaan
 *   cd /app && npx tsx packages/db/prisma/remove-seed-data.ts --apply   # verwijdert het
 *
 * Zonder `--apply` schrijft het niets. Met `--apply` gebeurt alles in één
 * transactie: lukt één stap niet, dan blijft alles staan.
 *
 * Wat het herkent, en enkel op deze markeringen:
 *   - accounts op `@vtk.prototype` (seed) en `@peiling.demo` / `@broodjes.demo`
 *     (demoscripts), met hun lidmaatschappen, POC-plaatsen, shiftdeelnames,
 *     sessies en OAuth-tokens;
 *   - shiften met een id die begint met `seed-shift-`;
 *   - kalenderevents met exact de titel en het begin uit
 *     `seed-calendar-events.ts`, en enkel als niemand ze aanmaakte
 *     (`createdById` leeg: wie een event in de admin maakt, staat erop);
 *   - het demoformulier `peter-meter-groepjes`, enkel als niemand het aanmaakte;
 *   - demopeilingen (`demo-poc-peiling*`) en demoverhuren (`DEMO-VERHUUR`).
 *
 * Wat het enkel meldt en laat staan: inhoud die de seed ook maakt maar die op
 * productie echt kan zijn (pagina's, POC's, partners, tegels, posten, rollen,
 * het Theokot-aanbod, voertuigen, sjablonen), en superadmins met de naam
 * "VTK Admin" (de seed-admin). Die kijk je zelf na in de admin.
 */
import { PrismaClient } from "@prisma/client";
import { CALENDAR_EVENT_SEEDS } from "./seed-calendar-events";
import { GROUP_MAKER_DEMO_SLUG } from "./seed-groepjesmaker";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const DEMO_EMAIL_DOMAINS = ["@vtk.prototype", "@peiling.demo", "@broodjes.demo"];

async function main() {
  console.log(apply ? "Verwijderen van testdata...\n" : "Dry run: er wordt niets verwijderd. Voeg --apply toe om te verwijderen.\n");

  // 1. Accounts
  const users = await prisma.user.findMany({
    where: { OR: DEMO_EMAIL_DOMAINS.map((d) => ({ email: { endsWith: d } })) },
    select: {
      id: true,
      email: true,
      name: true,
      _count: { select: { sessions: true } },
    },
    orderBy: { email: "asc" },
  });
  const userIds = users.map((u) => u.id);
  const [memberships, pocReps, participations] = await Promise.all([
    prisma.groupMembership.count({ where: { userId: { in: userIds } } }),
    prisma.pocRepresentative.count({ where: { userId: { in: userIds } } }),
    prisma.shiftParticipant.count({ where: { userId: { in: userIds } } }),
  ]);
  console.log(`Testaccounts: ${users.length}`);
  for (const u of users) {
    const sessions = u._count.sessions > 0 ? `  (${u._count.sessions} sessie(s): er werd mee aangemeld)` : "";
    console.log(`  - ${u.email}  ${u.name}${sessions}`);
  }
  if (users.length > 0) {
    console.log(`  met ${memberships} lidmaatschap(pen), ${pocReps} POC-plaats(en), ${participations} shiftdeelname(s)`);
  }

  // 2. Shiften
  const shifts = await prisma.shift.findMany({
    where: { id: { startsWith: "seed-shift-" } },
    select: { id: true, name: true, startTime: true, _count: { select: { participants: true } } },
    orderBy: { startTime: "asc" },
  });
  console.log(`\nSeed-shiften: ${shifts.length}`);
  for (const s of shifts) {
    console.log(`  - ${s.id}  ${s.name}  ${s.startTime.toISOString().slice(0, 10)}  (${s._count.participants} deelnemer(s))`);
  }
  const realParticipants = shifts.length
    ? await prisma.shiftParticipant.count({
        where: { shiftId: { in: shifts.map((s) => s.id) }, userId: { notIn: userIds } },
      })
    : 0;
  if (realParticipants > 0) {
    console.log(`  ! ${realParticipants} echte deelnemer(s) schreven zich in op een seed-shift; hun inschrijving gaat mee weg.`);
  }

  // 3. Kalenderevents
  const events = await prisma.calendarEvent.findMany({
    where: {
      createdById: null,
      OR: CALENDAR_EVENT_SEEDS.map((e) => ({ titleNl: e.titleNl, start: new Date(e.start) })),
    },
    select: { id: true, titleNl: true, start: true },
    orderBy: { start: "asc" },
  });
  console.log(`\nSeed-kalenderevents: ${events.length}`);
  for (const e of events) console.log(`  - ${e.start.toISOString().slice(0, 10)}  ${e.titleNl}`);

  // 4. Demoformulier
  const form = await prisma.form.findFirst({
    where: { slug: GROUP_MAKER_DEMO_SLUG, createdById: null },
    select: { id: true, titleNl: true, _count: { select: { entries: true } } },
  });
  console.log(`\nDemoformulier: ${form ? `${form.titleNl} (${GROUP_MAKER_DEMO_SLUG}, ${form._count.entries} inzending(en))` : "geen"}`);

  // 5. Demopeilingen en -verhuren
  const [polls, rentals] = await Promise.all([
    prisma.pocPoll.count({ where: { id: { startsWith: "demo-poc-peiling" } } }),
    prisma.theokotRental.count({ where: { internalNote: { startsWith: "DEMO-VERHUUR" } } }),
  ]);
  console.log(`\nDemopeilingen: ${polls}\nDemoverhuren: ${rentals}`);

  // Enkel melden
  const [seedAdmins, tiles] = await Promise.all([
    prisma.user.findMany({ where: { isSuperAdmin: true, name: "VTK Admin" }, select: { email: true } }),
    prisma.dashboardTile.count({ where: { id: { startsWith: "seed-tile-" } } }),
  ]);
  console.log("\nNiet verwijderd, zelf nakijken:");
  console.log(`  - superadmins met de naam "VTK Admin" (de seed-admin): ${seedAdmins.map((a) => a.email).join(", ") || "geen"}`);
  console.log(`  - dashboardtegels uit de seed (seed-tile-*): ${tiles}`);
  console.log("  - pagina's, POC's, partners, posten, rollen, Theokot-aanbod, voertuigen en sjablonen uit de seed");

  const total = users.length + shifts.length + events.length + (form ? 1 : 0) + polls + rentals;
  if (!apply || total === 0) {
    console.log(total === 0 ? "\nNiets te verwijderen." : `\n${total} item(s) zouden verwijderd worden. Draai opnieuw met --apply.`);
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      // OAuth-tokens en toestemmingen hebben een verplichte koppeling zonder
      // cascade; die moeten eerst weg, anders weigert Postgres de gebruiker.
      await tx.oauthRefreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await tx.oauthAccessToken.deleteMany({ where: { userId: { in: userIds } } });
      await tx.oauthConsent.deleteMany({ where: { userId: { in: userIds } } });
      await tx.shift.deleteMany({ where: { id: { in: shifts.map((s) => s.id) } } });
      await tx.calendarEvent.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
      if (form) await tx.form.delete({ where: { id: form.id } });
      await tx.pocPoll.deleteMany({ where: { id: { startsWith: "demo-poc-peiling" } } });
      await tx.theokotRental.deleteMany({ where: { internalNote: { startsWith: "DEMO-VERHUUR" } } });
      // Lidmaatschappen, POC-plaatsen, deelnames, sessies en accounts volgen via cascade.
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    },
    { timeout: 120_000 },
  );
  console.log(`\n${total} item(s) verwijderd.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
