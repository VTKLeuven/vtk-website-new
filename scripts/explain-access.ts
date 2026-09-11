/**
 * Waarom ziet deze persoon /admin (niet)?
 *
 * "Ik heb toch IT-rechten maar ik raak niet meer in het beheer" is bijna nooit
 * een bug in de code en bijna altijd een van drie dingen, en welke van de drie
 * is niet te zien zonder de databank erbij:
 *
 * 1. **De 15-juli-reset.** `UserRole` en `GroupMembership` zijn per werkingsjaar
 *    opgeslagen, en de sessie-resolver telt enkel het lopende jaar
 *    (`currentWorkingYear`, cutover 15 juli). Staat het lidmaatschap van de post
 *    nog op het vorige jaar, dan zijn alle permissies weg zonder dat er iets aan
 *    het account veranderd is. `User.isSuperAdmin` is het enige dat blijft.
 * 2. **Een gate in `apps/web/proxy.ts`** stuurt je van élke pagina weg, en dan
 *    lijkt dat op "ik raak niet in /admin": onboarding niet af, de jaarlijkse
 *    studiebevestiging (cutover 27 september), of de @vtk.be-koppelgate.
 * 3. Pas als 1 en 2 uitgesloten zijn: een rol die de permissie niet (meer)
 *    bevat.
 *
 * Dit script print die drie naast elkaar, zodat je niet hoeft te gokken. Het
 * **leest enkel**; rechtzetten gebeurt in /admin/groepen of /admin/gebruikers.
 *
 * Draaien:
 *
 *   dotenv -e .env -- tsx scripts/explain-access.ts iemand@vtk.be
 *
 * Tegen de dev- of productiedatabank draai je het met de `DATABASE_URL` van die
 * omgeving ervoor. Dat mag hier, anders dan bij `create-local-admin.ts`: dat
 * script deelt toegang uit, dit kijkt er enkel naar.
 */

import { PrismaClient } from "@prisma/client";
import { currentWorkingYear, needsStudyConfirmation } from "@vtk/auth";

const prisma = new PrismaClient();

/** Het werkingsjaar als "26-27", zoals de schermen het schrijven. */
function yearLabel(year: number): string {
  return `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Geef een e-mailadres mee: tsx scripts/explain-access.ts iemand@vtk.be");
    process.exit(1);
  }

  const year = currentWorkingYear();
  const host = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).host : "onbekend";

  const user = await prisma.user.findFirst({
    // Ook het persoonlijke adres: wie dat als voorkeur zette, geeft meestal dát
    // op wanneer hij zegt met welk account hij inlogt.
    where: { OR: [{ email }, { personalEmail: email }] },
    select: {
      id: true,
      name: true,
      email: true,
      personalEmail: true,
      active: true,
      deletedAt: true,
      isSuperAdmin: true,
      onboardedAt: true,
      isStudent: true,
      studyConfirmedYear: true,
      googleLinkedAt: true,
      googleLinkDeferredAt: true,
      roles: {
        select: { year: true, role: { select: { code: true, nameNl: true } } },
        orderBy: { year: "desc" },
      },
      memberships: {
        select: {
          year: true,
          role: true,
          group: { select: { code: true, nameNl: true, active: true } },
        },
        orderBy: { year: "desc" },
      },
    },
  });

  console.log(`\nDatabank: ${host}`);
  console.log(`Werkingsjaar nu: ${year} (${yearLabel(year)}), cutover 15 juli\n`);

  if (!user) {
    console.log(`Geen gebruiker gevonden met ${email}.`);
    return;
  }

  console.log(`${user.name} <${user.email}>${user.personalEmail ? ` / ${user.personalEmail}` : ""}`);
  console.log(`  actief: ${user.active}${user.deletedAt ? ` (verwijderd op ${user.deletedAt.toISOString()})` : ""}`);
  console.log(`  superadmin: ${user.isSuperAdmin}${user.isSuperAdmin ? "  <- ziet alles, los van rollen" : ""}`);

  // 2. De gates uit proxy.ts. Eerst, want die houden je van élke pagina en niet
  // enkel van /admin; wie hierin vastzit, heeft aan zijn permissies niets.
  console.log("\nGates (apps/web/proxy.ts), die je van élke pagina wegsturen:");
  // De sessie draagt `onboarded` als boolean; in de databank is het een datum.
  const onboarded = user.onboardedAt !== null;
  console.log(`  onboarding afgerond: ${onboarded}${onboarded ? "" : "  <- redirect naar /onboarding"}`);
  const studyBlocked = needsStudyConfirmation(user);
  console.log(
    `  studiebevestiging in orde: ${!studyBlocked}` +
      `  (student: ${user.isStudent}, bevestigd voor: ${user.studyConfirmedYear ?? "-"})` +
      (studyBlocked ? "  <- redirect naar /studie-bevestigen" : "")
  );
  const googleLinked = user.googleLinkedAt !== null;
  console.log(
    `  @vtk.be gekoppeld: ${googleLinked}` +
      (user.googleLinkDeferredAt ? `  (uitgesteld op ${user.googleLinkDeferredAt.toISOString()})` : "") +
      (googleLinked ? "" : "  <- enkel een gate zolang die aanstaat én je in een post zit")
  );

  // 1. De 15-juli-reset. Alle jaren tonen en niet enkel het lopende: het punt is
  // juist te zien dat er wél iets staat, maar op het vorige jaar.
  console.log("\nPostlidmaatschappen per werkingsjaar:");
  if (user.memberships.length === 0) console.log("  (geen)");
  for (const membership of user.memberships) {
    const current = membership.year === year;
    console.log(
      `  ${yearLabel(membership.year)}  ${membership.group.nameNl} (${membership.group.code})` +
        `  ${membership.role}${membership.group.active ? "" : "  [post inactief]"}` +
        (current ? "  <- telt mee" : "")
    );
  }

  console.log("\nDirecte rollen per werkingsjaar:");
  if (user.roles.length === 0) console.log("  (geen)");
  for (const assignment of user.roles) {
    const current = assignment.year === year;
    console.log(
      `  ${yearLabel(assignment.year)}  ${assignment.role.nameNl} (${assignment.role.code})` +
        (current ? "  <- telt mee" : "")
    );
  }

  // 3. De opgeloste permissies: dezelfde twee bronnen als `getSession`, en enkel
  // voor het lopende jaar.
  const groupIds = user.memberships.filter((m) => m.year === year).map((m) => m.group);
  const leadGroups = new Set(
    user.memberships.filter((m) => m.year === year && m.role === "LEAD").map((m) => m.group.code)
  );
  const grants = await prisma.groupRole.findMany({
    where: { group: { code: { in: groupIds.map((g) => g.code) } } },
    select: {
      kind: true,
      group: { select: { code: true } },
      role: {
        select: { code: true, permissions: { select: { permission: { select: { code: true } } } } },
      },
    },
  });
  const direct = await prisma.userRole.findMany({
    where: { userId: user.id, year },
    select: {
      role: {
        select: { code: true, permissions: { select: { permission: { select: { code: true } } } } },
      },
    },
  });

  const permissions = new Set<string>();
  for (const row of direct) {
    for (const entry of row.role.permissions) permissions.add(entry.permission.code);
  }
  for (const grant of grants) {
    // LEADER-rollen enkel voor wie effectief lead is van die post, zoals de
    // resolver dat ook doet.
    if (grant.kind === "LEADER" && !leadGroups.has(grant.group.code)) continue;
    for (const entry of grant.role.permissions) permissions.add(entry.permission.code);
  }

  console.log(`\nPermissies dit werkingsjaar (${permissions.size}):`);
  if (permissions.size === 0) {
    console.log("  (geen)  <- /admin opent wel, maar er staat geen enkele tab in de zijbalk");
  } else {
    for (const code of [...permissions].sort()) console.log(`  ${code}`);
  }
  console.log();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
