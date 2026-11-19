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
 *     een nieuwe permissie moet er meteen aan hangen. Behalve wat in
 *     `ADMIN_EXCLUDED_PERMISSIONS` staat: dat is bewust voor één post.
 *   - `Building` en `Room`: de gebouwen en lokalen van de KU Leuven komen uit
 *     `fixtures/gebouwen.json`, geschreven door `scripts/scrape-kulag.ts`. Ze
 *     zijn niet GUI-beheerd, en zonder deze sync maakt een deploy wel de
 *     tabellen aan maar blijven ze leeg; de lokalenzoeker toont dan niets.
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
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";
import { GROUP_SEEDS, WERKGROEP_SEEDS, HEADER_TABS } from "../src/groups";
import { ADMIN_EXCLUDED_PERMISSIONS, PERMISSIONS } from "../src/permissions";
import { envSaysProduction, markDatabaseAsProduction } from "../src/productionGuard";

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

async function syncPermissions(): Promise<Set<string>> {
  console.log("Permissions (registry -> DB)...");
  const existing = await prisma.permission.findMany();
  const byCode = new Map(existing.map((p) => [p.code, p]));
  const createdCodes = new Set<string>();

  for (const p of PERMISSIONS) {
    const current = byCode.get(p.code);
    if (!current) {
      note(`+ permissie "${p.code}" (${p.category})`);
      createdCodes.add(p.code);
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

  return createdCodes;
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
  // Op de uitzonderingen na: die horen bij één post en krijgen een eigen rol.
  const all = await prisma.permission.findMany({
    where: { code: { notIn: [...ADMIN_EXCLUDED_PERMISSIONS] } },
  });
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
 * Zorgt dat de bestaande `praesidium`-rol op productie en dev `mcp.use` krijgt
 * wanneer `mcp.use` in deze run nieuw werd aangemaakt (create-only, zodat
 * handmatig intrekken via `/admin/roles` behouden blijft).
 */
async function syncPraesidiumMcpPermission(createdCodes: Set<string>) {
  if (!createdCodes.has("mcp.use")) return;
  console.log("Praesidium-rol (mcp.use)...");
  const praesidiumRole = await prisma.role.findUnique({
    where: { code: "praesidium" },
    include: { permissions: { include: { permission: { select: { code: true } } } } },
  });
  if (!praesidiumRole) {
    warn("rol \"praesidium\" bestaat niet; sla mcp.use-sync over");
    return;
  }

  const hasMcpUse = praesidiumRole.permissions.some((rp) => rp.permission.code === "mcp.use");
  if (hasMcpUse) return;

  const perm = await prisma.permission.findUnique({ where: { code: "mcp.use" } });
  if (!perm) {
    warn("permissie \"mcp.use\" ontbreekt in de DB; sla praesidium-sync over");
    return;
  }

  note('+ praesidium krijgt "mcp.use"');
  if (!dryRun) {
    await prisma.rolePermission.create({
      data: { roleId: praesidiumRole.id, permissionId: perm.id },
    });
  }
}

const MCP_RESOURCE_ALLOWED_SCOPES = ["mcp:read", "mcp:create", "offline_access"];

function resolveMcpResourceUrl(): string | null {
  const raw = process.env.BETTER_AUTH_URL ?? process.env.VTK_MAIN_URL;
  if (!raw) return null;
  try {
    return `${new URL(raw).origin}/api/mcp`;
  } catch {
    return null;
  }
}

/**
 * RFC 8707 protected resource voor `/api/mcp`. `@better-auth/oauth-provider`
 * controleert `resource` tegen `oauthResource` en koppelt nieuwe DCR-clients via
 * `oauthClientResource`.
 */
async function syncMcpOauthResource() {
  console.log("MCP OAuth resource (oauthResource)...");
  const identifier = resolveMcpResourceUrl();
  if (!identifier) {
    warn("BETTER_AUTH_URL/VTK_MAIN_URL ontbreekt of is ongeldig; oauthResource voor /api/mcp niet gesynct.");
    return;
  }

  const existing = await prisma.oauthResource.findUnique({
    where: { identifier },
    select: { id: true, allowedScopes: true, disabled: true },
  });
  if (!existing) {
    note(`+ oauthResource "${identifier}"`);
    if (!dryRun) {
      const now = new Date();
      await prisma.oauthResource.create({
        data: {
          id: randomUUID(),
          identifier,
          name: "VTK MCP Server",
          allowedScopes: MCP_RESOURCE_ALLOWED_SCOPES,
          disabled: false,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    return;
  }

  if (existing.disabled) return;

  const missingScopes = MCP_RESOURCE_ALLOWED_SCOPES.filter(
    (scope) => !existing.allowedScopes.includes(scope),
  );
  if (missingScopes.length > 0) {
    const mergedScopes = [...new Set([...existing.allowedScopes, ...MCP_RESOURCE_ALLOWED_SCOPES])];
    note(`~ oauthResource "${identifier}" scopes aangevuld`);
    if (!dryRun) {
      await prisma.oauthResource.update({
        where: { id: existing.id },
        data: { allowedScopes: mergedScopes, updatedAt: new Date() },
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

type FixtureRoom = {
  id: string;
  code: string | null;
  name: string;
  category: string;
  url: string;
};

type FixtureBuilding = {
  id: string;
  name: string;
  shortCode: string | null;
  address: string;
  zipcode: string;
  city: string;
  lat: number | null;
  lng: number | null;
  outline: [number, number][];
  photoUrl: string | null;
  kulagUrl: string;
  plans: { title: string; url: string }[];
  rooms: FixtureRoom[];
};

/** "00.06" wordt 0, "01.100" wordt 1. Null wanneer het nummer die vorm niet heeft. */
function floorOf(code: string | null): number | null {
  if (!code) return null;
  const match = /^(\d+)\./.exec(code);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * De gebouwen en lokalen uit de fixture.
 *
 * **Create-or-update op de natuurlijke sleutel, nooit deleten.** `Building.notes`
 * en `Room.aliases` worden door VTK ingevuld en staan niet in de fixture; die
 * mogen door een herimport niet verdwijnen. Een lokaal dat KULag niet meer
 * vermeldt blijft dus staan, en dat is de veilige kant: een verdwenen rij zou
 * stil een zoekresultaat wegnemen.
 */
async function syncBuildings() {
  const path = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "gebouwen.json");

  let buildings: FixtureBuilding[];
  try {
    buildings = (JSON.parse(await readFile(path, "utf8")) as { buildings: FixtureBuilding[] })
      .buildings;
  } catch {
    warn("fixtures/gebouwen.json ontbreekt of is onleesbaar; gebouwen niet gesynct.");
    return;
  }

  let created = 0;
  let rooms = 0;
  for (const item of buildings) {
    const fields = {
      shortCode: item.shortCode,
      name: item.name,
      address: item.address,
      zipcode: item.zipcode,
      city: item.city,
      lat: item.lat,
      lng: item.lng,
      outline: item.outline,
      photoUrl: item.photoUrl,
      kulagUrl: item.kulagUrl,
      plans: item.plans,
    };

    if (dryRun) {
      const existing = await prisma.building.findUnique({ where: { kulagId: item.id } });
      if (!existing) created += 1;
      rooms += item.rooms.length;
      continue;
    }

    const building = await prisma.building.upsert({
      where: { kulagId: item.id },
      create: { kulagId: item.id, ...fields },
      update: fields,
    });

    for (const room of item.rooms) {
      const roomFields = {
        buildingId: building.id,
        code: room.code,
        name: room.name,
        category: room.category,
        floor: floorOf(room.code),
        kulagUrl: room.url,
      };
      await prisma.room.upsert({
        where: { kulagId: room.id },
        create: { kulagId: room.id, ...roomFields },
        update: roomFields,
      });
      rooms += 1;
    }
  }

  note(`gebouwen gesynct: ${buildings.length} gebouwen, ${rooms} lokalen${created ? ` (${created} nieuw)` : ""}`);
}

/**
 * Zet op productie de markering waarop de seed weigert, zodat die ook weigert
 * wanneer iemand ze van buiten de container tegen deze database draait. Zie
 * packages/db/src/productionGuard.ts. Haalt de markering nooit weg.
 */
async function markProduction() {
  if (!envSaysProduction()) return;
  if (dryRun) {
    console.log("Productie: markering instance.environment zou gecontroleerd worden.");
    return;
  }
  if (await markDatabaseAsProduction(prisma)) note("database gemarkeerd als productie (instance.environment)");
}

async function main() {
  if (dryRun) console.log("Dry run: er wordt niets geschreven.\n");

  await markProduction();

  const createdPermissionCodes = await syncPermissions();
  await syncAdminRolePermissions();
  await syncPraesidiumMcpPermission(createdPermissionCodes);
  await syncMcpOauthResource();
  await syncBuildings();
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
