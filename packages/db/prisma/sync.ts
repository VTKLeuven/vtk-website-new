/**
 * Config-sync: brengt de DB in lijn met de registries in code.
 *
 * Waarom apart van `seed.ts`: de seed draait bewust NIET bij een deploy (enkel
 * met RUN_SEED=true, zie infra/docker/web.Dockerfile), want ze zou
 * admin-beheerde inhoud (header tabs, pagina's, partners, settings) terug naar
 * de defaults duwen. Gevolg: een nieuwe permissie in
 * `packages/db/src/permissions.ts` landde nooit in de DB van dev.vtk.be, en de
 * bijhorende schermen bleven onbereikbaar tot iemand handmatig seedde.
 *
 * Deze sync draait daarom wel bij elke start. Ze raakt enkel data aan waarvan
 * de code de bron van waarheid is:
 *   - `Permission`: de registry is canoniek en niet GUI-bewerkbaar.
 *   - de rechten van de systeemrol `admin`: die bundelt per definitie alles, dus
 *     een nieuwe permissie moet er meteen aan hangen.
 *
 * Ze maakt GEEN gebruikers, rollen of posten aan: dat gebeurt live via de GUI.
 * Wat GUI-beheerd is (posten, header tabs, settings) wordt enkel gerapporteerd
 * als het ontbreekt, nooit geschreven.
 *
 * Flags:
 *   --dry-run   toon wat er zou wijzigen, schrijf niets
 *   --prune     verwijder Permission-rijen die niet meer in de registry staan
 *               (cascade: hun RolePermission-toewijzingen gaan mee)
 */
import { PrismaClient } from "@prisma/client";
import { GROUP_SEEDS, WERKGROEP_SEEDS, HEADER_TABS } from "../src/groups";
import { PERMISSIONS } from "../src/permissions";

const prisma = new PrismaClient();

const dryRun = process.argv.includes("--dry-run");
const prune = process.argv.includes("--prune");

/** Regels die we aan het eind als samenvatting tonen. */
const changes: string[] = [];
const warnings: string[] = [];

function note(line: string) {
  changes.push(line);
  console.log(`  ${dryRun ? "[dry-run] " : ""}${line}`);
}

function warn(line: string) {
  warnings.push(line);
  console.log(`  ! ${line}`);
}

async function syncPermissions() {
  console.log("Permissions (registry -> DB)...");
  const existing = await prisma.permission.findMany();
  const byCode = new Map(existing.map((p) => [p.code, p]));

  for (const p of PERMISSIONS) {
    const current = byCode.get(p.code);
    if (!current) {
      note(`+ permissie "${p.code}" (${p.category})`);
      if (!dryRun) {
        await prisma.permission.create({
          data: { code: p.code, labelNl: p.labelNl, labelEn: p.labelEn, category: p.category },
        });
      }
      continue;
    }

    const drifted =
      current.labelNl !== p.labelNl ||
      current.labelEn !== p.labelEn ||
      current.category !== p.category;
    if (drifted) {
      note(`~ permissie "${p.code}": labels/categorie bijgewerkt`);
      if (!dryRun) {
        await prisma.permission.update({
          where: { code: p.code },
          data: { labelNl: p.labelNl, labelEn: p.labelEn, category: p.category },
        });
      }
    }
  }

  const registryCodes = new Set<string>(PERMISSIONS.map((p) => p.code));
  const orphans = existing.filter((p) => !registryCodes.has(p.code));
  for (const orphan of orphans) {
    if (prune) {
      note(`- permissie "${orphan.code}" verwijderd (niet meer in de registry)`);
      if (!dryRun) await prisma.permission.delete({ where: { code: orphan.code } });
    } else {
      warn(
        `permissie "${orphan.code}" staat in de DB maar niet in de registry; ` +
          "draai met --prune om ze te verwijderen",
      );
    }
  }
}

/**
 * De systeemrol `admin` bundelt alle rechten. Zonder deze stap is een nieuwe
 * permissie wel aanwezig, maar heeft niemand ze: het scherm blijft dicht tot
 * iemand ze handmatig aanvinkt. We maken de rol NIET aan als ze ontbreekt; dat
 * is een seed-taak op een verse DB.
 */
async function syncAdminRolePermissions() {
  console.log("Admin-systeemrol (alle rechten)...");
  const adminRole = await prisma.role.findUnique({
    where: { code: "admin" },
    include: { permissions: true },
  });
  if (!adminRole) {
    warn("rol \"admin\" bestaat niet; sla over (verse DB? draai eenmalig de seed)");
    return;
  }

  const held = new Set(adminRole.permissions.map((rp) => rp.permissionId));
  const all = await prisma.permission.findMany();
  const missing = all.filter((p) => !held.has(p.id));

  for (const perm of missing) {
    note(`+ admin krijgt "${perm.code}"`);
    if (!dryRun) {
      await prisma.rolePermission.create({
        data: { roleId: adminRole.id, permissionId: perm.id },
      });
    }
  }
}

/**
 * Rapporteer-only: posten, werkgroepen en header tabs zijn GUI-beheerd. Als een
 * code uit de seed hier ontbreekt is dat meestal bewust (verwijderd via de
 * GUI), dus we melden het en schrijven niets.
 */
async function reportGuiManagedDrift() {
  console.log("GUI-beheerde data (enkel rapport)...");
  const groups = await prisma.group.findMany({ select: { code: true } });
  const groupCodes = new Set(groups.map((g) => g.code));
  const missingGroups = [...GROUP_SEEDS, ...WERKGROEP_SEEDS]
    .filter((g) => !groupCodes.has(g.code))
    .map((g) => g.code);
  if (missingGroups.length > 0) {
    warn(`posten/werkgroepen uit de seed ontbreken in de DB: ${missingGroups.join(", ")}`);
  }

  const tabs = await prisma.headerTab.findMany({ select: { code: true } });
  const tabCodes = new Set(tabs.map((t) => t.code));
  const missingTabs = HEADER_TABS.filter((t) => !tabCodes.has(t.code)).map((t) => t.code);
  if (missingTabs.length > 0) {
    warn(`header tabs uit de seed ontbreken in de DB: ${missingTabs.join(", ")}`);
  }
}

async function main() {
  if (dryRun) console.log("Dry run: er wordt niets geschreven.\n");

  await syncPermissions();
  await syncAdminRolePermissions();
  await reportGuiManagedDrift();

  console.log("");
  if (changes.length === 0) {
    console.log("Config sync: DB was al in lijn met de registries.");
  } else {
    console.log(
      `Config sync: ${changes.length} wijziging(en)${dryRun ? " gevonden (niet toegepast)" : " toegepast"}.`,
    );
  }
  if (warnings.length > 0) {
    console.log(`Config sync: ${warnings.length} waarschuwing(en), zie hierboven.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
