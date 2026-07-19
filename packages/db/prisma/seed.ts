import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { GROUP_SEEDS, WERKGROEP_SEEDS, HEADER_TABS } from "../src/groups";
import { PERMISSIONS } from "../src/permissions";

const prisma = new PrismaClient();

/** Strip whitespace and optional surrounding quotes from env (Docker / shell quirks). */
function readSeedEnv(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  let s = raw.trim();
  if (s === "") return undefined;
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s === "" ? undefined : s;
}

function richText(paragraphs: string[]): object {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

function headingDoc(title: string, paragraphs: string[]): object {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: title }],
      },
      ...paragraphs.map((text) => ({
        type: "paragraph",
        content: [{ type: "text", text }],
      })),
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeSettingItemsById(existingValue: unknown, defaultValue: unknown): object {
  const defaults = isRecord(defaultValue) ? defaultValue : {};
  const existing = isRecord(existingValue) ? existingValue : {};
  const defaultItems = Array.isArray(defaults.items) ? defaults.items : [];
  const existingItems = Array.isArray(existing.items) ? existing.items : [];
  const existingIds = new Set(
    existingItems.flatMap((item) =>
      isRecord(item) && typeof item.id === "string" ? [item.id] : [],
    ),
  );
  const missingItems = defaultItems.filter(
    (item) => !isRecord(item) || typeof item.id !== "string" || !existingIds.has(item.id),
  );

  return {
    ...defaults,
    ...existing,
    items: [...existingItems, ...missingItems],
  };
}

async function main() {
  console.log("Seeding groups...");
  // Create-only: een reseed op een DB met data mag bestaande groepen (naam,
  // slug, volgorde) niet overschrijven. Nieuwe codes worden nog wel aangemaakt.
  for (const g of [...GROUP_SEEDS, ...WERKGROEP_SEEDS]) {
    await prisma.group.upsert({
      where: { code: g.code },
      update: {},
      create: g,
    });
  }

  console.log("Seeding header tabs...");
  // Header tabs zijn na hun eerste aanmaak volledig admin-beheerd: labels, volgorde
  // (dragbaar, zie /admin/inhoud), zichtbaarheid, slug, intro en CTA worden daar
  // bewerkt. De seed draait niet automatisch bij een deploy (enkel met RUN_SEED=true,
  // zie web.Dockerfile CMD), maar ook een handmatige reseed mag die aanpassingen niet
  // terugdraaien. Daarom enkel ontbrekende tabs aanmaken en bestaande rijen NIET
  // overschrijven. Een verse of gereset DB krijgt nog steeds alle defaults via
  // `create`; nieuwe standaardtabs (nieuw `code`) worden nog wel toegevoegd.
  for (const tab of HEADER_TABS) {
    await prisma.headerTab.upsert({
      where: { code: tab.code },
      update: {},
      create: tab,
    });
  }

  console.log("Seeding permissions...");
  // Labels en categorie volgen de registry (packages/db/src/permissions.ts): die
  // is de bron van waarheid en permissies zijn niet via de GUI bewerkbaar, dus
  // een reseed mag ze gewoon bijwerken.
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { labelNl: p.labelNl, labelEn: p.labelEn, category: p.category },
      create: { code: p.code, labelNl: p.labelNl, labelEn: p.labelEn, category: p.category },
    });
  }

  console.log("Seeding roles...");
  // De admin-rol is een systeemrol: ze bundelt alle rechten en kan niet via de
  // GUI verwijderd worden. Ze reset niet apart; roltoewijzingen gaan per
  // werkingsjaar, dus admin wordt elk jaar opnieuw toegekend (isSuperAdmin op de
  // user blijft de harde, niet-resettende uitzondering). Andere rollen maak je
  // aan via /admin/roles.
  const adminRole = await prisma.role.upsert({
    where: { code: "admin" },
    update: { nameNl: "Admin", nameEn: "Admin", system: true },
    create: {
      code: "admin",
      nameNl: "Admin",
      nameEn: "Admin",
      system: true,
      order: 0,
      descriptionNl: "Volledige toegang tot het beheer.",
      descriptionEn: "Full access to administration.",
    },
  });
  const allPermsForAdmin = await prisma.permission.findMany();
  for (const perm of allPermsForAdmin) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: perm.id },
    });
  }

  console.log("Seeding roles and post role grants...");
  // Posten kennen rechten niet meer direct toe: ze verlenen ROLLEN aan hun leden
  // (GroupRole, kind DEFAULT = elk lid). De geseede rolset:
  //   - admin (alle rechten, systeemrol)                 -> IT + Groep 5
  //   - praesidium (calendar.create + photos.upload +    -> elke post
  //       tickets.create)
  //   - werkgroep, medewerker                            -> beschikbaar, nog niet toegekend
  //   - theokot (theokot.manage + theokot.pickup)        -> Theokot
  //   - één rol per post, met de postnaam                -> die post zelf
  //       (Communicatie krijgt meteen media.manage)
  // Alles als DEFAULT, zodat elk lid van de post de rol krijgt. Rechten voor de
  // lege rollen (werkgroep, medewerker, per-post) stel je in via /admin/roles.

  /** Zet (idempotent) de rechten van een rol op exact `permCodes`. */
  async function setRolePermissions(roleId: string, permCodes: string[]) {
    const perms = await prisma.permission.findMany({ where: { code: { in: permCodes } } });
    for (const perm of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: perm.id } },
        update: {},
        create: { roleId, permissionId: perm.id },
      });
    }
  }

  /** Kent (idempotent) een rol toe aan een post via GroupRole. */
  async function grantRoleToGroup(groupCode: string, roleId: string, kind: "DEFAULT" | "LEADER" = "DEFAULT") {
    const group = await prisma.group.findUnique({ where: { code: groupCode } });
    if (!group) return;
    await prisma.groupRole.upsert({
      where: { groupId_roleId_kind: { groupId: group.id, roleId, kind } },
      update: {},
      create: { groupId: group.id, roleId, kind },
    });
  }

  /** Maakt/behoudt een rol. `update` raakt enkel de labels aan, zodat GUI-edits
   *  aan volgorde/beschrijving/kleur bij een herseed niet teruggedraaid worden. */
  async function upsertRole(
    code: string,
    nameNl: string,
    nameEn: string,
    order: number,
    descriptionNl: string,
    descriptionEn: string,
  ) {
    return prisma.role.upsert({
      where: { code },
      update: { nameNl, nameEn },
      create: { code, nameNl, nameEn, order, descriptionNl, descriptionEn },
    });
  }

  // basis-werkgroep is vervangen door praesidium; verwijder de oude rol (en zo via
  // cascade haar grants) op bestaande DB's. Idempotent: no-op als ze al weg is.
  await prisma.role.deleteMany({ where: { code: "basis-werkgroep" } });

  // admin (systeemrol, alle rechten) -> IT en Groep 5, elk lid.
  for (const code of ["IT", "GROEP5"]) {
    await grantRoleToGroup(code, adminRole.id, "DEFAULT");
  }

  // praesidium: de basisrol voor elk praesidiumlid, op elke post.
  const praesidiumRole = await upsertRole(
    "praesidium",
    "Praesidium",
    "Praesidium",
    1,
    "Basisrol voor elk praesidiumlid: evenementen (incl. ticketevents) voor de eigen groep aanmaken en foto's uploaden.",
    "Base role for every praesidium member: create events (incl. ticket events) for the own group and upload photos.",
  );
  await setRolePermissions(praesidiumRole.id, ["calendar.create", "photos.upload", "tickets.create"]);
  for (const g of GROUP_SEEDS) {
    await grantRoleToGroup(g.code, praesidiumRole.id, "DEFAULT");
  }

  // werkgroep en medewerker: beschikbare rollen, nog zonder rechten of grants.
  await upsertRole(
    "werkgroep",
    "Werkgroep",
    "Work group",
    2,
    "Rol voor werkgroepleden. Rechten stel je in via het rollenbeheer.",
    "Role for work group members. Set permissions in the roles admin.",
  );
  await upsertRole(
    "medewerker",
    "Medewerker",
    "Collaborator",
    3,
    "Rol voor medewerkers die een werkgroep helpen. Rechten stel je in via het rollenbeheer.",
    "Role for collaborators helping a work group. Set permissions in the roles admin.",
  );

  // theokot: het broodjes-reservatiesysteem beheren en de afhaalbalie bedienen.
  const theokotRole = await upsertRole(
    "theokot",
    "Theokot",
    "Theokot",
    4,
    "Theokot beheren (sessies, aanbod, bans, instellingen) en de afhaalbalie bedienen.",
    "Manage Theokot (sessions, offering, bans, settings) and operate the pickup counter.",
  );
  await setRolePermissions(theokotRole.id, ["theokot.manage", "theokot.pickup"]);
  await grantRoleToGroup("THEOKOT", theokotRole.id, "DEFAULT");

  // logistiek: de uitleendienst op logistiek.vtk.be beheren.
  const logistiekRole = await upsertRole(
    "logistiek",
    "Logistiek",
    "Logistics",
    5,
    "Uitleendienst beheren op logistiek.vtk.be: inventaris, aanvragen en de camionette.",
    "Manage the equipment rental on logistiek.vtk.be: inventory, requests and the van.",
  );
  await setRolePermissions(logistiekRole.id, ["logistiek.manage", "modules.logistiek.access"]);
  await grantRoleToGroup("LOGISTIEK", logistiekRole.id, "DEFAULT");

  // Eén rol per post, met de postnaam, toegekend aan die post zelf (elk lid).
  // Meestal een lege container om er later rechten aan te hangen; enkele posten
  // krijgen meteen hun vaste, postspecifieke recht(en) mee (zie postRolePerms).
  const postRolePerms: Record<string, string[]> = {
    // Communicatie beheert de publieke mediapagina (magazines, promovideo's, albums).
    COMMUNICATIE: ["media.manage"],
  };
  for (const g of GROUP_SEEDS) {
    const postRole = await upsertRole(
      `post-${g.code.toLowerCase()}`,
      g.nameNl,
      g.nameEn,
      10 + g.orderInPraesidium,
      `Rol voor de post ${g.nameNl}.`,
      `Role for the ${g.nameEn} post.`,
    );
    const perms = postRolePerms[g.code];
    if (perms) await setRolePermissions(postRole.id, perms);
    await grantRoleToGroup(g.code, postRole.id, "DEFAULT");
  }

  // Eén lege rol-container per werkgroep, aan elk lid toegekend (DEFAULT). Zo
  // hebben werkgroepen meteen "hun eigen rol" om er later rechten aan te hangen.
  for (const g of WERKGROEP_SEEDS) {
    const role = await upsertRole(
      `werkgroep-${g.code.toLowerCase()}`,
      g.nameNl,
      g.nameEn,
      30 + g.orderInPraesidium,
      `Rol voor werkgroep ${g.nameNl}.`,
      `Role for werkgroep ${g.nameEn}.`,
    );
    await grantRoleToGroup(g.code, role.id, "DEFAULT");
  }

  console.log("Seeding default homepage settings...");
  const defaultSettings: Array<{
    key: string;
    value: unknown;
    preserveExisting?: boolean;
    mergeItemsById?: boolean;
  }> = [
    {
      key: "home.openingHours.cursusdienst",
      value: {
        titleNl: "Openingsuren Cursusdienst",
        titleEn: "Course Shop opening hours",
        entries: [
          { dayNl: "Maandag", dayEn: "Monday", hours: "12:30 – 13:30" },
          { dayNl: "Dinsdag", dayEn: "Tuesday", hours: "12:30 – 13:30" },
          { dayNl: "Woensdag", dayEn: "Wednesday", hours: "12:30 – 13:30" },
          { dayNl: "Donderdag", dayEn: "Thursday", hours: "12:30 – 13:30" },
          { dayNl: "Vrijdag", dayEn: "Friday", hours: "Gesloten" },
        ],
      },
    },
    {
      key: "home.openingHours.theokot",
      value: {
        titleNl: "Openingsuren Theokot",
        titleEn: "Theokot opening hours",
        entries: [
          { dayNl: "Maandag", dayEn: "Monday", hours: "10:30 – 18:00" },
          { dayNl: "Dinsdag", dayEn: "Tuesday", hours: "10:30 – 18:00" },
          { dayNl: "Woensdag", dayEn: "Wednesday", hours: "10:30 – 18:00" },
          { dayNl: "Donderdag", dayEn: "Thursday", hours: "10:30 – 18:00" },
          { dayNl: "Vrijdag", dayEn: "Friday", hours: "10:30 – 18:00" },
        ],
      },
    },
    {
      key: "home.career",
      value: {
        titleNl: "VTK Career",
        titleEn: "VTK Career",
        bodyNl:
          "Ontdek stages, jobs en bedrijfsevents bij VTK Career, de brug tussen studenten en industrie.",
        bodyEn:
          "Discover internships, jobs and corporate events through VTK Career, the bridge between students and industry.",
        ctaLabelNl: "Bekijk VTK Career",
        ctaLabelEn: "Visit VTK Career",
        ctaUrl: "https://career.vtk.be",
      },
    },
    {
      key: "home.aftermovies",
      value: {
        titleNl: "Aftermovies & sfeerbeelden",
        titleEn: "Aftermovies & photos",
        items: [
          {
            type: "video",
            url: "https://www.youtube.com/watch?v=WdGqhrVUJog",
            titleNl: "Galabal aftermovie",
            titleEn: "Gala aftermovie",
          },
          {
            type: "video",
            url: "https://www.youtube.com/watch?v=9CyqfzXWYME",
            titleNl: "Jobfair aftermovie",
            titleEn: "Job fair aftermovie",
          },
        ] as Array<{ type: "video" | "image"; url: string; titleNl?: string; titleEn?: string }>,
      },
    },
    // `home.featuredAlbums` staat hier bewust niet: die wordt na het seeden van de
    // albums create-only gezet (zie verderop), zodat een verse DB de seed-albums
    // krijgt maar een admin-selectie niet overschreven wordt.
    // Theokot-configuratie: waarden die niet elke week wijzigen. maxItemsPerOrder = X,
    // maxWeeklySpecialPerOrder = Y (X > Y). Tijden zijn "HH:mm" in Brussel-tijd.
    {
      key: "media.aftermovies",
      preserveExisting: true,
      value: {
        titleNl: "Aftermovies",
        titleEn: "Aftermovies",
        items: [
          {
            id: "rondleiding-campus-arenberg",
            type: "video",
            url: "https://www.youtube.com/watch?v=SzDa_109lMI",
            titleNl: "Rondleiding Campus Arenberg 25-26",
            titleEn: "Campus Arenberg tour 25-26",
          },
          {
            id: "galabal-2025",
            type: "video",
            url: "https://www.youtube.com/watch?v=WdGqhrVUJog",
            titleNl: "Galabal VTK Leuven 2025",
            titleEn: "Galabal VTK Leuven 2025",
          },
          {
            id: "24-urenloop-2024",
            type: "video",
            url: "https://www.youtube.com/watch?v=AdUriTc6RB4",
            titleNl: "24 Urenloop Aftermovie 2024",
            titleEn: "24 Urenloop aftermovie 2024",
          },
        ],
      },
    },
    {
      key: "media.magazines",
      mergeItemsById: true,
      value: {
        items: [
          {
            id: "bakske-2025-2026-s2w6",
            kind: "bakske",
            titleNl: "Het Bakske",
            titleEn: "Het Bakske",
            issueNl: "Week 6 / Semester 2, 2025-2026",
            issueEn: "Week 6 / Semester 2, 2025-2026",
            publishedAt: "2026-03-15",
            pdfUrl:
              "https://vtk.be/_publications/pdf/a88e502ea825c3395a47cbb28d3a3ee96f9b81ee.pdf",
          },
          {
            id: "bakske-2025-2026-s2w4",
            kind: "bakske",
            titleNl: "Het Bakske",
            titleEn: "Het Bakske",
            issueNl: "Week 4 / Semester 2, 2025-2026",
            issueEn: "Week 4 / Semester 2, 2025-2026",
            publishedAt: "2026-03-01",
            pdfUrl:
              "https://vtk.be/_publications/pdf/9a4677aa5dea8e0f3a7bf2a0c1812a6eae49142c.pdf",
          },
          {
            id: "bakske-2025-2026-s2w3",
            kind: "bakske",
            titleNl: "Het Bakske",
            titleEn: "Het Bakske",
            issueNl: "Week 3 / Semester 2, 2025-2026",
            issueEn: "Week 3 / Semester 2, 2025-2026",
            publishedAt: "2026-02-22",
            pdfUrl:
              "https://vtk.be/_publications/pdf/a7f09c8575986b9b010d7ce5348b6d76fd13b3de.pdf",
          },
          {
            id: "bakske-2025-2026-s1w2",
            kind: "bakske",
            titleNl: "Het Bakske",
            titleEn: "Het Bakske",
            issueNl: "Week 2 / Semester 1, 2025-2026",
            issueEn: "Week 2 / Semester 1, 2025-2026",
            publishedAt: "2025-09-29",
            pdfUrl:
              "https://vtk.be/_publications/pdf/a5251f173ff84324bef666dabc03484b91b35f15.pdf",
          },
          {
            id: "ir-reeel-2025-september",
            kind: "ir-reeel",
            titleNl: "Ir.Reëel",
            titleEn: "Ir.Reëel",
            issueNl: "September 2025, 2025-2026",
            issueEn: "September 2025, 2025-2026",
            publishedAt: "2025-09-01",
            pdfUrl:
              "https://vtk.be/_publications/pdf/bea5a73905a541b43900d7529c0793a5e24a957a.pdf",
          },
          {
            id: "ir-reeel-2024-2025-2",
            kind: "ir-reeel",
            titleNl: "Ir.Reëel",
            titleEn: "Ir.Reëel",
            issueNl: "Editie 2, 2024-2025",
            issueEn: "Issue 2, 2024-2025",
            publishedAt: "2024-12-03",
            pdfUrl:
              "https://vtk.be/_publications/pdf/fc365177942f2411e10340faf2613ba70d1221b8.pdf",
          },
          {
            id: "ir-reeel-2023-2024-4",
            kind: "ir-reeel",
            titleNl: "Ir.Reëel",
            titleEn: "Ir.Reëel",
            issueNl: "Editie 4, 2023-2024",
            issueEn: "Issue 4, 2023-2024",
            publishedAt: "2024-04-25",
            pdfUrl:
              "https://vtk.be/_publications/pdf/81d2550a98e49f4bd35962a62e3d2c992e415b6d.pdf",
          },
        ],
      },
    },
    {
      key: "theokot.config",
      value: {
        maxItemsPerOrder: 5,
        maxWeeklySpecialPerOrder: 1,
        orderLeadDays: 2,
        orderOpenTime: "12:00",
        cancelDeadline: "10:30",
        pickupDefaultStart: "12:00",
        pickupDefaultEnd: "16:00",
        noShowGraceMinutes: 15,
        noShowThreshold: 3,
        banDurationDays: 14,
      },
    },
    {
      key: "theokot.orderMessage",
      value: {
        bodyNl: "",
        bodyEn: "",
      },
    },
  ];
  // Net als de header tabs zijn deze settings admin-beheerd (openingsuren, career,
  // aftermovies, theokot-config ...) en worden ze in /admin bewerkt. Enkel
  // ontbrekende keys aanmaken en bestaande niet overschrijven, zodat ook een
  // handmatige reseed die aanpassingen niet terugdraait naar de defaults.
  // Een verse of gereset DB krijgt nog steeds alle defaults via `create`.
  for (const s of defaultSettings) {
    if (s.mergeItemsById) {
      const existing = await prisma.setting.findUnique({ where: { key: s.key } });
      const value = existing ? mergeSettingItemsById(existing.value, s.value) : (s.value as object);
      await prisma.setting.upsert({
        where: { key: s.key },
        update: { value },
        create: { key: s.key, value },
      });
      continue;
    }

    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value as object },
    });
  }

  console.log("Seeding partners...");
  // Mirrors the hoofdpartners strip on vtk.be. logoKey points at placeholder
  // paths — the UI falls back to the partner name as text when the object
  // isn't present in the S3 bucket, so the seed stays bucket-agnostic.
  // Partners zijn admin-beheerd (naam, url, logo, volgorde, actief): enkel
  // ontbrekende aanmaken en bestaande NIET overschrijven, zodat een handmatige
  // reseed die aanpassingen niet terugdraait.
  const partnerSeeds: Array<{ name: string; url: string; logoKey: string; order: number }> = [
    { name: "Deloitte",                    url: "https://mycareer.deloitte.com",                           logoKey: "partners/seed/deloitte.svg",     order: 0 },
    { name: "Sweco Belgium",               url: "https://swecobelgium.be",                                 logoKey: "partners/seed/sweco.svg",        order: 1 },
    { name: "Renotec",                     url: "https://renotec.be",                                      logoKey: "partners/seed/renotec.svg",      order: 2 },
    { name: "DEME Group",                  url: "https://deme-group.com",                                  logoKey: "partners/seed/deme.svg",         order: 3 },
    { name: "ExxonMobil",                  url: "https://corporate.exxonmobil.com/locations/belgium",      logoKey: "partners/seed/exxonmobil.svg",   order: 4 },
    { name: "Eiffage Construction Belux",  url: "https://eiffageconstructionbelux.be",                     logoKey: "partners/seed/eiffage.svg",      order: 5 },
    { name: "Devoteam",                    url: "https://devoteam.com/nl",                                 logoKey: "partners/seed/devoteam.svg",     order: 6 },
    { name: "Revolut",                     url: "https://revolut.com/en-BE/metal",                         logoKey: "partners/seed/revolut.svg",      order: 7 },
    { name: "McKinsey",                    url: "https://mckinsey.com/be/careers",                         logoKey: "partners/seed/mckinsey.svg",     order: 8 },
  ];
  for (const p of partnerSeeds) {
    const existing = await prisma.partner.findFirst({ where: { name: p.name } });
    if (existing) continue;
    await prisma.partner.create({
      data: { name: p.name, url: p.url, logoKey: p.logoKey, order: p.order, active: true },
    });
  }

  console.log("Seeding prototype users and memberships...");
  const prototypePasswordHash = await hash(readSeedEnv(process.env.SEED_PROTOTYPE_PASSWORD) ?? "prototype");
  const prototypeUsers = [
    {
      email: "praeses@vtk.prototype",
      name: "Lotte Peeters",
      locale: "NL" as const,
      groups: [
        { code: "GROEP5" as const, role: "LEAD" as const, titleNl: "Praeses", titleEn: "President", year: 2026, displayOrder: 0 },
        { code: "LOGISTIEK" as const, role: "MEMBER" as const, titleNl: "Ritten", titleEn: "Trips", year: 2026, displayOrder: 2 },
      ],
    },
    {
      email: "vice@vtk.prototype",
      name: "Noah Janssens",
      locale: "NL" as const,
      groups: [
        { code: "GROEP5" as const, role: "LEAD" as const, titleNl: "Vice-praeses", titleEn: "Vice president", year: 2026, displayOrder: 1 },
      ],
    },
    {
      email: "career@vtk.prototype",
      name: "Mila Verbruggen",
      locale: "NL" as const,
      groups: [
        { code: "BEDRIJVENRELATIES" as const, role: "LEAD" as const, titleNl: "Bedrijvenrelaties", titleEn: "Corporate relations", year: 2026, displayOrder: 0 },
      ],
    },
    {
      email: "onderwijs@vtk.prototype",
      name: "Sam De Smet",
      locale: "NL" as const,
      groups: [
        { code: "ONDERWIJS" as const, role: "LEAD" as const, titleNl: "Onderwijs", titleEn: "Education", year: 2026, displayOrder: 0 },
      ],
    },
    {
      email: "theokot@vtk.prototype",
      name: "Emma Maes",
      locale: "NL" as const,
      groups: [
        { code: "THEOKOT" as const, role: "LEAD" as const, titleNl: "Theokot", titleEn: "Theokot", year: 2026, displayOrder: 0 },
      ],
    },
    {
      email: "logistiek@vtk.prototype",
      name: "Arthur Claes",
      locale: "NL" as const,
      groups: [
        { code: "LOGISTIEK" as const, role: "LEAD" as const, titleNl: "Logistiek", titleEn: "Logistics", year: 2026, displayOrder: 0 },
      ],
    },
    {
      email: "international@vtk.prototype",
      name: "Aisha Rahman",
      locale: "EN" as const,
      groups: [
        { code: "INTERNATIONAAL" as const, role: "LEAD" as const, titleNl: "Internationaal", titleEn: "International", year: 2026, displayOrder: 0 },
      ],
    },
    {
      email: "sport@vtk.prototype",
      name: "Lucas Goossens",
      locale: "NL" as const,
      groups: [
        { code: "SPORT" as const, role: "LEAD" as const, titleNl: "Sport", titleEn: "Sports", year: 2026, displayOrder: 0 },
      ],
    },
    {
      email: "cultuur@vtk.prototype",
      name: "Sofia Martens",
      locale: "NL" as const,
      groups: [
        { code: "CULTUUR" as const, role: "LEAD" as const, titleNl: "Cultuur", titleEn: "Culture", year: 2026, displayOrder: 0 },
      ],
    },
    {
      email: "it@vtk.prototype",
      name: "Jonas Willems",
      locale: "NL" as const,
      groups: [
        { code: "IT" as const, role: "LEAD" as const, titleNl: "Webteam", titleEn: "Web team", year: 2026, displayOrder: 0 },
      ],
    },
  ];

  // Create-only: bestaande prototype-gebruikers, hun wachtwoord en lidmaatschappen
  // niet overschrijven bij een reseed op een DB met data.
  const prototypeUserByEmail = new Map<string, { id: string; email: string; name: string }>();
  for (const u of prototypeUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        locale: u.locale,
        active: true,
      },
    });
    await prisma.account.upsert({
      where: {id: `credentials:${user.id}`},
      update: {},
      create: {
        id: `credentials:${user.id}`,
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: prototypePasswordHash,
      }
    });

    prototypeUserByEmail.set(u.email, user);
    for (const membership of u.groups) {
      const group = await prisma.group.findUnique({ where: { code: membership.code } });
      if (!group) continue;
      await prisma.groupMembership.upsert({
        where: {
          userId_groupId_year: {
            userId: user.id,
            groupId: group.id,
            year: membership.year,
          },
        },
        update: {},
        create: {
          userId: user.id,
          groupId: group.id,
          role: membership.role,
          titleNl: membership.titleNl,
          titleEn: membership.titleEn,
          year: membership.year,
          displayOrder: membership.displayOrder,
        },
      });
    }
  }

  console.log("Seeding prototype POCs...");
  const pocSeeds = [
    {
      slug: "computerwetenschappen",
      nameNl: "Computerwetenschappen",
      nameEn: "Computer Science",
      studyProgrammes: ["COMPUTER_SCIENCE"] as const,
      email: "cw-poc@vtk.be",
      order: 0,
      representatives: [
        { email: "onderwijs@vtk.prototype", order: 0 },
        { email: "it@vtk.prototype", order: 1 },
      ],
    },
    {
      slug: "werktuigkunde",
      nameNl: "Werktuigkunde",
      nameEn: "Mechanical Engineering",
      studyProgrammes: ["MECHANICAL"] as const,
      email: "wtk-poc@vtk.be",
      order: 1,
      representatives: [
        { email: "sport@vtk.prototype", order: 0 },
      ],
    },
    {
      slug: "elektrotechniek",
      nameNl: "Elektrotechniek",
      nameEn: "Electrical Engineering",
      studyProgrammes: ["ELECTRICAL"] as const,
      email: "elt-poc@vtk.be",
      order: 2,
      representatives: [
        { email: "vice@vtk.prototype", order: 0 },
      ],
    },
    {
      slug: "chemische-technologie",
      nameNl: "Chemische technologie",
      nameEn: "Chemical Engineering",
      studyProgrammes: ["CHEMICAL"] as const,
      email: "chem-poc@vtk.be",
      order: 3,
      representatives: [
        { email: "theokot@vtk.prototype", order: 0 },
      ],
    },
  ];

  // POC's en hun vertegenwoordigers zijn admin-beheerd (namen, beschrijvingen,
  // volgorde, wie welke rol heeft): enkel ontbrekende aanmaken en bestaande NIET
  // overschrijven, zodat een handmatige reseed die aanpassingen niet terugdraait.
  for (const poc of pocSeeds) {
    const row = await prisma.poc.upsert({
      where: { slug: poc.slug },
      update: {},
      create: {
        slug: poc.slug,
        nameNl: poc.nameNl,
        nameEn: poc.nameEn,
        email: poc.email,
        order: poc.order,
        studyProgrammes: [...poc.studyProgrammes],
      },
    });
    // `studyProgrammes` is een nieuw veld: POC's die al bestonden hebben nog
    // geen richtingen, waardoor ze op de homepage bij niemand zouden opduiken.
    // Een lege lijst betekent hier "nog niet ingevuld", niet "bewust leeg", dus
    // vullen we de standaard aan zolang niemand ze zelf heeft gezet.
    if (row.studyProgrammes.length === 0) {
      await prisma.poc.update({
        where: { id: row.id },
        data: { studyProgrammes: [...poc.studyProgrammes] },
      });
    }
    for (const rep of poc.representatives) {
      const user = prototypeUserByEmail.get(rep.email);
      if (!user) continue;
      await prisma.pocRepresentative.upsert({
        where: { pocId_userId: { pocId: row.id, userId: user.id } },
        update: {},
        create: { pocId: row.id, userId: user.id, order: rep.order },
      });
    }
  }

  console.log("Seeding prototype CMS pages...");
  const pageSeeds = [
    {
      headerCode: "AANBOD",
      slug: "theokot",
      titleNl: "Theokot",
      titleEn: "Theokot",
      excerptNl: "Broodjes, koffie en snelle campuslunch in de VTK-kelder.",
      excerptEn: "Sandwiches, coffee and quick campus lunch in the VTK basement.",
      order: 0,
      contentNl: richText([
        "Theokot is de dagelijkse stop voor broodjes, koffie en snelle snacks op Arenberg.",
        "In deze prototypeversie staan de openingsuren centraal op de homepage. Het definitieve menu en praktische details kunnen later via het CMS aangevuld worden.",
      ]),
      contentEn: richText([
        "Theokot is the daily stop for sandwiches, coffee and quick snacks on Arenberg.",
        "In this prototype, opening hours are highlighted on the homepage. The final menu and practical details can be filled in through the CMS later.",
      ]),
    },
    {
      headerCode: "AANBOD",
      slug: "shiften",
      titleNl: "Shiften",
      titleEn: "Shifts",
      excerptNl: "Help mee achter de schermen bij VTK-diensten en events.",
      excerptEn: "Help behind the scenes at VTK services and events.",
      order: 1,
      contentNl: richText([
        "Vrijwilligers houden Theokot, events en praktische werkingen draaiende.",
        "Voor het prototype verwijzen we naar het aparte shiftenplatform. Later kan deze pagina de belangrijkste uitleg, voorwaarden en contactinfo tonen.",
      ]),
      contentEn: richText([
        "Volunteers keep Theokot, events and practical services running.",
        "For the prototype, this page points towards the separate shifts platform. Later, it can contain the main explanation, conditions and contact details.",
      ]),
    },
    {
      headerCode: "AANBOD",
      slug: "reservaties-en-logistiek",
      titleNl: "Reservaties en logistiek",
      titleEn: "Reservations and logistics",
      excerptNl: "Praktische ondersteuning, materiaal en logistieke aanvragen.",
      excerptEn: "Practical support, materials and logistics requests.",
      order: 2,
      contentNl: richText([
        "VTK ondersteunt werkgroepen met materiaal, lokalen, transport en praktische voorbereiding.",
        "Deze prototypepagina toont hoe het aanbod als gewone CMS-categorie kan groeien zonder aparte layout.",
      ]),
      contentEn: richText([
        "VTK supports work groups with materials, rooms, transport and practical preparation.",
        "This prototype page shows how the offer section can grow as a normal CMS category without a separate layout.",
      ]),
    },
    {
      headerCode: "EERSTEJAARS",
      slug: "startweek",
      titleNl: "Startweek voor eerstejaars",
      titleEn: "Freshers start week",
      excerptNl: "Alles wat je nodig hebt in je eerste week op de campus.",
      excerptEn: "Everything you need in your first week on campus.",
      order: 0,
      contentNl: headingDoc("Welkom in Heverlee", [
        "Tijdens de startweek helpt VTK je met aula's vinden, cursussen bestellen en mensen leren kennen.",
        "Kom langs aan de infostand voor je welkomstpakket, praktische vragen en een snelle rondleiding door de belangrijkste plekken op Arenberg.",
      ]),
      contentEn: headingDoc("Welcome to Heverlee", [
        "During start week, VTK helps you find lecture halls, order courses and meet other students.",
        "Drop by the info desk for your welcome kit, practical questions and a short tour of the most important places on Arenberg.",
      ]),
    },
    {
      headerCode: "CAREER",
      slug: "career-fair",
      titleNl: "VTK Career Fair",
      titleEn: "VTK Career Fair",
      excerptNl: "Onze grootste ontmoetingsplek voor studenten en bedrijven.",
      excerptEn: "Our largest meeting point for students and companies.",
      order: 0,
      contentNl: richText([
        "De VTK Career Fair brengt ingenieursstudenten en partnerbedrijven samen voor stages, thesisvoorstellen en eerste jobs.",
        "In deze prototypeversie tonen we hoe partnerinformatie, praktische details en calls-to-action in het nieuwe ontwerp aanvoelen.",
      ]),
      contentEn: richText([
        "The VTK Career Fair brings engineering students and partner companies together for internships, thesis topics and first jobs.",
        "In this prototype version, partner information, practical details and calls-to-action show how the new design feels.",
      ]),
    },
    {
      headerCode: "CURSUSDIENST",
      slug: "boeken-en-tweedehands",
      titleNl: "Boeken en tweedehands",
      titleEn: "Books and second-hand",
      excerptNl: "Cursussen, syllabi en tweedehandsboeken aan studententarief.",
      excerptEn: "Courses, syllabi and second-hand books at student prices.",
      order: 0,
      contentNl: richText([
        "De Cursusdienst verzamelt cursusmateriaal voor ingenieursstudenten en houdt de verkoop praktisch en betaalbaar.",
        "Tweedehandsboeken kunnen in de drukke weken via dezelfde balie opgevolgd worden.",
      ]),
      contentEn: richText([
        "The Course Shop collects course material for engineering students and keeps sales practical and affordable.",
        "Second-hand books can be handled through the same desk during peak weeks.",
      ]),
    },
    {
      headerCode: "INTERNATIONAAL",
      slug: "exchange-buddies",
      titleNl: "Exchange & buddies",
      titleEn: "Exchange & buddies",
      excerptNl: "Voor internationale studenten en Leuvense studenten op uitwisseling.",
      excerptEn: "For incoming exchange students and Leuven students going abroad.",
      order: 0,
      contentNl: richText([
        "Internationaal helpt exchange-studenten landen in Leuven en wijst lokale studenten de weg naar buitenlandse mogelijkheden.",
        "Buddy-avonden, praktische sessies en laagdrempelige activiteiten zorgen voor een zachte landing.",
      ]),
      contentEn: richText([
        "International helps exchange students settle in Leuven and points local students toward opportunities abroad.",
        "Buddy evenings, practical sessions and accessible activities make the landing easier.",
      ]),
    },
    {
      headerCode: "OVER_VTK",
      slug: "praesidium-en-werking",
      titleNl: "Praesidium en werking",
      titleEn: "Praesidium and organisation",
      excerptNl: "Hoe VTK draait, van werkgroepen tot dagelijkse werking.",
      excerptEn: "How VTK works, from work groups to day-to-day operations.",
      order: 0,
      contentNl: richText([
        "VTK wordt gedragen door studenten uit verschillende werkgroepen. Elke groep neemt een deel van het dagelijkse studentenleven op.",
        "Deze pagina is prototype-inhoud en helpt de nieuwe typografie, downloads en CMS-pagina's beoordelen.",
      ]),
      contentEn: richText([
        "VTK is run by students across different work groups. Each group takes care of part of daily student life.",
        "This page contains prototype content and helps evaluate the new typography, downloads and CMS pages.",
      ]),
    },
    {
      headerCode: "CONTACT",
      slug: "contact",
      titleNl: "Contact",
      titleEn: "Contact",
      excerptNl: "Wie je waarvoor kan bereiken.",
      excerptEn: "Who to reach for what.",
      order: 0,
      contentNl: richText([
        "Algemene vragen kan je sturen naar info@vtk.be. Voor cursusvragen, events of partnerwerking gebruik je best het specifieke contactadres.",
        "In het prototype houden we deze pagina bewust kort zodat de layout voor eenvoudige CMS-content zichtbaar is.",
      ]),
      contentEn: richText([
        "General questions can be sent to info@vtk.be. For course questions, events or partnerships, use the specific contact address.",
        "In the prototype we keep this page intentionally short so the layout for simple CMS content is visible.",
      ]),
    },
  ];

  // CMS-pagina's zijn admin-beheerd: titel, inhoud, categorie (headerTabId),
  // zichtbaarheid in de header en volgorde worden in /admin/inhoud bewerkt. Enkel
  // ontbrekende pagina's aanmaken en bestaande NIET overschrijven, zodat een
  // handmatige reseed die aanpassingen (bv. verplaatst, verborgen of herschikt)
  // niet terugdraait naar de defaults.
  for (const page of pageSeeds) {
    const tab = await prisma.headerTab.findUnique({ where: { code: page.headerCode } });
    if (!tab) continue;
    await prisma.page.upsert({
      where: { slug: page.slug },
      update: {},
      create: {
        slug: page.slug,
        headerTabId: tab.id,
        visibleInHeader: true,
        titleNl: page.titleNl,
        titleEn: page.titleEn,
        excerptNl: page.excerptNl,
        excerptEn: page.excerptEn,
        contentJsonNl: page.contentNl,
        contentJsonEn: page.contentEn,
        publishedAt: new Date("2026-05-18T00:00:00+02:00"),
        order: page.order,
      },
    });
  }

  console.log("Seeding prototype photo albums...");
  const albumSeeds = [
    {
      slug: "galabal-2026",
      titleNl: "Galabal 2026",
      titleEn: "Gala 2026",
      descriptionNl: "Prototype-album voor de fotopagina. Upload echte beelden via het adminpaneel.",
      descriptionEn: "Prototype album for the photo page. Upload real images through the admin panel.",
      eventDate: "2026-03-14T20:00:00+01:00",
      publishedAt: "2026-05-18T00:00:00+02:00",
    },
    {
      slug: "vtk-ski-2026",
      titleNl: "Skireis 2026",
      titleEn: "Ski trip 2026",
      descriptionNl: "Sfeerbeelden van de jaarlijkse VTK-skireis.",
      descriptionEn: "Atmosphere shots from the yearly VTK ski trip.",
      eventDate: "2026-02-08T08:00:00+01:00",
      publishedAt: "2026-05-18T00:00:00+02:00",
    },
    {
      slug: "cantus-lente-2026",
      titleNl: "Lentecantus 2026",
      titleEn: "Spring cantus 2026",
      descriptionNl: "Een lege prototypecollectie zodat albumlijsten gevuld zijn voor review.",
      descriptionEn: "An empty prototype collection so album lists are populated for review.",
      eventDate: "2026-04-24T20:00:00+02:00",
      publishedAt: "2026-05-18T00:00:00+02:00",
    },
    {
      slug: "career-fair-2026",
      titleNl: "Career Fair 2026",
      titleEn: "Career Fair 2026",
      descriptionNl: "Prototype-album voor partner- en careercontent.",
      descriptionEn: "Prototype album for partner and career content.",
      eventDate: "2026-03-04T10:00:00+01:00",
      publishedAt: "2026-05-18T00:00:00+02:00",
    },
  ];
  // Create-only: bestaande albums (titel, beschrijving, datums) niet overschrijven.
  for (const album of albumSeeds) {
    await prisma.photoAlbum.upsert({
      where: { slug: album.slug },
      update: {},
      create: {
        slug: album.slug,
        titleNl: album.titleNl,
        titleEn: album.titleEn,
        descriptionNl: album.descriptionNl,
        descriptionEn: album.descriptionEn,
        eventDate: new Date(album.eventDate),
        publishedAt: new Date(album.publishedAt),
      },
    });
  }

  // Create-only: op een verse DB de featured-albums vullen met de seed-albums;
  // een bestaande (admin-gekozen) selectie niet overschrijven. Deze key staat
  // daarom bewust NIET in `defaultSettings` hierboven (die zou hem eerst leeg
  // aanmaken en deze create-branch nooit laten vuren).
  await prisma.setting.upsert({
    where: { key: "home.featuredAlbums" },
    update: {},
    create: { key: "home.featuredAlbums", value: { albumSlugs: albumSeeds.map((a) => a.slug) } },
  });

  console.log("Seeding calendar events...");
  // Pulled from the vtk.be /nl/calendar iCal feed. Times are Europe/Brussels
  // (CEST, +02:00 in April). GroupCode assignments are best-effort based on
  // the event name — adjust in the admin when the real owners are known.
  const eventSeeds: Array<{
    titleNl: string;
    titleEn: string;
    location: string;
    start: string;
    end: string;
    url: string;
    groupCode: string;
    descriptionNl?: string;
    descriptionEn?: string;
  }> = [
    {
      titleNl: "Theokot lunch deluxe",
      titleEn: "Theokot lunch deluxe",
      location: "Theokot · Arenberg",
      start: "2026-05-19T11:30:00+02:00",
      end: "2026-05-19T14:00:00+02:00",
      url: "https://vtk.be/nl/theokot",
      groupCode: "THEOKOT",
      descriptionNl: "Een extra uitgebreide lunchshift met broodjes, koffie en warme snacks in de VTK-kelder.",
      descriptionEn: "An extended lunch shift with sandwiches, coffee and warm snacks in the VTK basement.",
    },
    {
      titleNl: "VTK × Industria TD Quantum",
      titleEn: "VTK × Industria TD Quantum",
      location: "Albatros",
      start: "2026-05-19T20:00:00+02:00",
      end: "2026-05-20T03:00:00+02:00",
      url: "https://vtk.be/nl/kalender",
      groupCode: "ACTIVITEITEN",
      descriptionNl: "Een gezamenlijke TD van VTK en Industria. Verwacht stevige muziek, een late avond en praktische updates via de organiserende kring.",
      descriptionEn: "A joint TD by VTK and Industria. Expect a loud night, a late finish and practical updates through the organising association.",
    },
    {
      titleNl: "Burgie-info sessie jaar 2",
      titleEn: "Engineering info session year 2",
      location: "Aula De Molen",
      start: "2026-05-20T12:30:00+02:00",
      end: "2026-05-20T14:00:00+02:00",
      url: "https://vtk.be/nl/studies",
      groupCode: "ONDERWIJS",
      descriptionNl: "Infosessie voor tweedejaars burgies over keuzes, trajecten en praktische vragen rond het vervolg van je opleiding.",
      descriptionEn: "Information session for second-year engineering students about choices, tracks and practical study questions.",
    },
    {
      titleNl: "Doopcantus Wina × VTK",
      titleEn: "Initiation cantus Wina × VTK",
      location: "Alma 2",
      start: "2026-05-21T19:30:00+02:00",
      end: "2026-05-22T01:00:00+02:00",
      url: "https://vtk.be/nl/kalender",
      groupCode: "CULTUUR",
      descriptionNl: "Een cantus samen met Wina. De definitieve praktische info, inschrijvingen en prijzen worden later aangevuld.",
      descriptionEn: "A cantus together with Wina. Final practical information, registration and pricing will be added later.",
    },
    {
      titleNl: "Galabal ticket drop + apero",
      titleEn: "Gala ticket drop + apero",
      location: "'t Elixir",
      start: "2026-05-22T18:00:00+02:00",
      end: "2026-05-22T21:00:00+02:00",
      url: "https://vtk.be/nl/kalender",
      groupCode: "GROEP5",
      descriptionNl: "Ticketmoment voor het galabal met een apero in 't Elixir. Ideaal om praktisch af te spreken met je tafelgenoten.",
      descriptionEn: "Ticket moment for the gala with an apero at 't Elixir. A good moment to coordinate with your table group.",
    },
    {
      titleNl: "International buddy night",
      titleEn: "International buddy night",
      location: "Pangaea",
      start: "2026-05-26T19:00:00+02:00",
      end: "2026-05-26T22:00:00+02:00",
      url: "https://vtk.be/en/internationaal",
      groupCode: "INTERNATIONAAL",
      descriptionNl: "Een laagdrempelige buddy night voor internationale studenten en Leuvense studenten die nieuwe mensen willen leren kennen.",
      descriptionEn: "An accessible buddy night for international students and Leuven students who want to meet new people.",
    },
    {
      titleNl: "CV review evening",
      titleEn: "CV review evening",
      location: "Thermotechnisch Instituut",
      start: "2026-05-28T18:30:00+02:00",
      end: "2026-05-28T21:30:00+02:00",
      url: "https://vtk.be/nl/career",
      groupCode: "BEDRIJVENRELATIES",
      descriptionNl: "Laat je CV nalezen en krijg concrete feedback voor stages, thesisgesprekken en eerste sollicitaties.",
      descriptionEn: "Get your CV reviewed and receive concrete feedback for internships, thesis interviews and first applications.",
    },
    {
      titleNl: "Sportdag Arenberg",
      titleEn: "Arenberg sports day",
      location: "Sportkot",
      start: "2026-06-03T13:00:00+02:00",
      end: "2026-06-03T18:00:00+02:00",
      url: "https://vtk.be/nl/kalender",
      groupCode: "SPORT",
      descriptionNl: "Een sportieve namiddag op Arenberg met teams, losse deelnemers en activiteiten voor verschillende niveaus.",
      descriptionEn: "A sporty afternoon on Arenberg with teams, individual participants and activities for different levels.",
    },
    {
      titleNl: "Logistiek: busje onboarding",
      titleEn: "Logistics: van onboarding",
      location: "VTK kelder",
      start: "2026-06-05T17:00:00+02:00",
      end: "2026-06-05T18:30:00+02:00",
      url: "https://logistiek.vtk.be",
      groupCode: "LOGISTIEK",
      descriptionNl: "Onboarding voor logistieke vrijwilligers rond materiaal, busjes en praktische afspraken.",
      descriptionEn: "Onboarding for logistics volunteers about materials, vans and practical agreements.",
    },
    {
      titleNl: "Blokbar kickoff",
      titleEn: "Study bar kickoff",
      location: "Fakbar",
      start: "2026-06-08T20:00:00+02:00",
      end: "2026-06-09T01:00:00+02:00",
      url: "https://vtk.be/nl/kalender",
      groupCode: "FAKBAR",
      descriptionNl: "Startmoment voor de blokbar met praktische info over openingsuren, shiften en sfeer tijdens de examenperiode.",
      descriptionEn: "Kickoff for the study bar with practical information about hours, shifts and atmosphere during exams.",
    },
    {
      titleNl: "AflsuitBBQ",
      titleEn: "Closing BBQ",
      location: "Grasveld voor Alma III",
      start: "2026-04-20T18:00:00+02:00",
      end:   "2026-04-20T22:00:00+02:00",
      url: "https://vtk.be/nl/calendar/view/20_04_2026_18_00_00_aflsuitbbq/",
      groupCode: "ACTIVITEITEN",
      descriptionNl: "Een afsluitende barbecue om het semester samen buiten af te ronden.",
      descriptionEn: "A closing barbecue to wrap up the semester outside together.",
    },
    {
      titleNl: "Croquantus",
      titleEn: "Croquantus",
      location: "Waaiberg",
      start: "2026-04-22T20:30:00+02:00",
      end:   "2026-04-23T01:00:00+02:00",
      url: "https://vtk.be/nl/calendar/view/22_04_2026_20_30_00_croquantus/",
      groupCode: "CULTUUR",
      descriptionNl: "Een cantusavond op de Waaiberg. Praktische info wordt door de organiserende ploeg bevestigd.",
      descriptionEn: "A cantus evening at Waaiberg. Practical details are confirmed by the organising team.",
    },
    {
      titleNl: "Cantus V",
      titleEn: "Cantus V",
      location: "Waaiberg",
      start: "2026-04-23T20:00:00+02:00",
      end:   "2026-04-24T01:00:00+02:00",
      url: "https://vtk.be/nl/calendar/view/23_04_2026_20_00_00_cantus-v/",
      groupCode: "INTERNATIONAAL",
      descriptionNl: "Cantus V op de Waaiberg met prototype-inhoud voor de eventdetailpagina.",
      descriptionEn: "Cantus V at Waaiberg with prototype content for the event detail page.",
    },
    {
      titleNl: "Rewind Cantus",
      titleEn: "Rewind Cantus",
      location: "Waaiberg",
      start: "2026-04-28T20:30:00+02:00",
      end:   "2026-04-29T01:00:00+02:00",
      url: "https://vtk.be/nl/calendar/view/28_04_2026_20_30_00_rewind-cantus/",
      groupCode: "CULTUUR",
      descriptionNl: "Een rewind-cantus met prototypebeschrijving voor het nieuwe calendardesign.",
      descriptionEn: "A rewind cantus with prototype copy for the new calendar design.",
    },
  ];
  // Create-only: een bestaand event (zelfde titel + start) niet overschrijven,
  // zodat admin-bewerkingen aan locatie, tijden of beschrijving blijven staan.
  for (const e of eventSeeds) {
    const group = await prisma.group.findUnique({ where: { code: e.groupCode } });
    if (!group) continue;
    const start = new Date(e.start);
    const end = new Date(e.end);
    const existing = await prisma.calendarEvent.findFirst({
      where: { titleNl: e.titleNl, start },
    });
    if (existing) continue;
    await prisma.calendarEvent.create({
      data: {
        titleNl: e.titleNl,
        titleEn: e.titleEn,
        location: e.location,
        start,
        end,
        url: e.url,
        descriptionNl: e.descriptionNl,
        descriptionEn: e.descriptionEn,
        visibility: "PUBLIC" as const,
        groupId: group.id,
      },
    });
  }

  const seedEmail = readSeedEnv(process.env.SEED_ADMIN_EMAIL);
  const seedPassword = readSeedEnv(process.env.SEED_ADMIN_PASSWORD);

  if (seedEmail && seedPassword) {
    console.log("Seeding initial admin...");
    // Match apps/web loginAction: email is trimmed + lowercased on sign-in.
    const adminEmail = seedEmail.toLowerCase();
    const adminPassword = seedPassword;
    const passwordHash = await hash(adminPassword);
    // Create-only: enkel een nieuwe admin aanmaken. Een reseed reset het
    // wachtwoord of de superadmin-vlag van een BESTAANDE admin NIET meer (dat was
    // een destructieve update op bestaande data). Wachtwoord kwijt? Reset het in
    // de admin-UI of verwijder de rij eerst en herseed.
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        name: "VTK Admin",
        isSuperAdmin: true,
      },
    });
    await prisma.account.upsert({
      where: {id: `credential:${admin.id}`},
      update: {},
      create: {
        id: `credential:${admin.id}`,
        accountId: admin.id,
        providerId: "credential",
        userId: admin.id,
        password: passwordHash
      },
    })
    const itGroup = await prisma.group.findUnique({ where: { code: "IT" } });
    if (itGroup) {
      await prisma.groupMembership.upsert({
        where: {
          userId_groupId_year: { userId: admin.id, groupId: itGroup.id, year: 2026 },
        },
        update: {},
        create: { userId: admin.id, groupId: itGroup.id, role: "LEAD", year: 2026 },
      });
    }
  } else {
    console.log(
      "Skipping initial admin: SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must both be set in the process environment.\n" +
        "  Docker: ensure repo-root .env defines them, then recreate web so it loads that file:\n" +
        "    docker compose -f infra/docker-compose.yml up -d --force-recreate web\n" +
        "  Then: docker compose -f infra/docker-compose.yml exec web sh -c \"cd /app && npx tsx packages/db/prisma/seed.ts\""
    );
  }

  console.log("Seeding global dashboard tiles...");
  const dashboardTiles = [
    { id: "seed-tile-wiki", label: "Praesidium Wiki", url: "https://praesidium.wiki.vtk.be", icon: "book", color: "navy", order: 0 },
    { id: "seed-tile-burgieclan", label: "Burgieclan", url: "https://burgieclan.vtk.be", icon: "users", color: "blue", order: 1 },
    { id: "seed-tile-drive", label: "Google Drive", url: "https://drive.google.com", icon: "cloud", color: "green", order: 2 },
    { id: "seed-tile-tickets", label: "Tickets", url: "https://tickets.vtk.be", icon: "ticket", color: "yellow", order: 3 },
  ] as const;
  // Create-only: bestaande tiles (label, url, icoon, kleur, volgorde) niet
  // overschrijven bij een reseed.
  for (const t of dashboardTiles) {
    await prisma.dashboardTile.upsert({
      where: { id: t.id },
      update: {},
      create: { id: t.id, label: t.label, url: t.url, icon: t.icon, color: t.color, order: t.order, scope: "GLOBAL" },
    });
  }

  console.log("Seeding shifts...");
  // On a fresh DB these shifts are dropped in the coming 7 days (scheduled
  // relative to *now*). Create-only: a reseed on a DB that already has them does
  // NOT reschedule or overwrite them, so admin edits and sign-ups are preserved.
  const shiftNow = new Date();
  const shiftAt = (dayOffset: number, hour: number, minute = 0): Date => {
    const d = new Date(shiftNow);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const shiftSeeds: Array<{
    id: string;
    name: string;
    dayOffset: number;
    startHour: number;
    endHour: number;
    location: string;
    description: string;
    maxParticipants: number;
    reward: number;
    post: string | null;
  }> = [
    { id: "seed-shift-1", name: "Tapshift", dayOffset: 1, startHour: 20, endHour: 23, location: "Fakbar", description: "Tapshift donderdagavond", maxParticipants: 4, reward: 2, post: "FAKBAR" },
    { id: "seed-shift-2", name: "Cursusverkoop", dayOffset: 2, startHour: 9, endHour: 12, location: "Cursusdienst", description: "Cursussen verkopen tijdens de ochtend", maxParticipants: 3, reward: 1, post: "CURSUSDIENST" },
    { id: "seed-shift-3", name: "Quiz opbouw", dayOffset: 3, startHour: 18, endHour: 22, location: "Aula Q", description: "Opbouw quiz-avond", maxParticipants: 6, reward: 3, post: "ACTIVITEITEN" },
    { id: "seed-shift-4", name: "Sporttoernooi", dayOffset: 4, startHour: 13, endHour: 17, location: "Sporthal", description: "Begeleiding sporttoernooi", maxParticipants: 5, reward: 2, post: "SPORT" },
    { id: "seed-shift-5", name: "Cantus laden", dayOffset: 5, startHour: 8, endHour: 11, location: "Loods", description: "Materiaal laden voor cantus", maxParticipants: 4, reward: 3, post: "LOGISTIEK" },
    { id: "seed-shift-6", name: "Galabal onthaal", dayOffset: 6, startHour: 19, endHour: 23, location: "Onthaal", description: "Onthaal en kaartcontrole galabal", maxParticipants: 8, reward: 2, post: null },
  ];
  for (const s of shiftSeeds) {
    const data = {
      name: s.name,
      startTime: shiftAt(s.dayOffset, s.startHour),
      endTime: shiftAt(s.dayOffset, s.endHour),
      location: s.location,
      description: s.description,
      maxParticipants: s.maxParticipants,
      reward: s.reward,
      post: s.post,
    };
    await prisma.shift.upsert({
      where: { id: s.id },
      update: {},
      create: { id: s.id, ...data },
    });
  }

  console.log("Seeding completed shifts + participants...");
  // Voltooide (verleden) shiften met deelnemers, gemengd betaald/onbetaald, zodat
  // de admin-ranglijst en -vergoedingen data hebben. Negatieve dayOffsets houden ze
  // relatief in het verleden; de laatste twee vallen in het vorige academiejaar.
  const pastShiftSeeds: Array<{
    id: string;
    name: string;
    dayOffset: number;
    startHour: number;
    endHour: number;
    location: string;
    description: string;
    maxParticipants: number;
    reward: number;
    post: string | null;
    participants: Array<{ email: string; payedOut: boolean }>;
  }> = [
    { id: "seed-shift-past-1", name: "Openingscantus tap", dayOffset: -4, startHour: 21, endHour: 24, location: "Fakbar", description: "Tappen op de openingscantus", maxParticipants: 5, reward: 3, post: "FAKBAR",
      participants: [ { email: "logistiek@vtk.prototype", payedOut: true }, { email: "sport@vtk.prototype", payedOut: false }, { email: "it@vtk.prototype", payedOut: false } ] },
    { id: "seed-shift-past-2", name: "Cursusverkoop ochtend", dayOffset: -11, startHour: 9, endHour: 12, location: "Cursusdienst", description: "Ochtendverkoop cursussen", maxParticipants: 3, reward: 1, post: "CURSUSDIENST",
      participants: [ { email: "onderwijs@vtk.prototype", payedOut: true }, { email: "career@vtk.prototype", payedOut: true } ] },
    { id: "seed-shift-past-3", name: "Bedrijvendag opbouw", dayOffset: -20, startHour: 8, endHour: 12, location: "Aula 200", description: "Standen opbouwen bedrijvendag", maxParticipants: 6, reward: 2, post: "BEDRIJVENRELATIES",
      participants: [ { email: "career@vtk.prototype", payedOut: false }, { email: "vice@vtk.prototype", payedOut: false }, { email: "logistiek@vtk.prototype", payedOut: true } ] },
    { id: "seed-shift-past-4", name: "Interfacultair sporttoernooi", dayOffset: -35, startHour: 13, endHour: 18, location: "Sporthal", description: "Begeleiding sporttoernooi", maxParticipants: 5, reward: 2, post: "SPORT",
      participants: [ { email: "sport@vtk.prototype", payedOut: true }, { email: "praeses@vtk.prototype", payedOut: false } ] },
    { id: "seed-shift-past-5", name: "Galabal kaartcontrole", dayOffset: -60, startHour: 19, endHour: 24, location: "Onthaal", description: "Onthaal en kaartcontrole galabal", maxParticipants: 8, reward: 3, post: null,
      participants: [ { email: "cultuur@vtk.prototype", payedOut: true }, { email: "international@vtk.prototype", payedOut: true }, { email: "theokot@vtk.prototype", payedOut: false } ] },
    // Vorig academiejaar (~13 maanden geleden).
    { id: "seed-shift-past-6", name: "Cantus tap (vorig jaar)", dayOffset: -400, startHour: 21, endHour: 24, location: "Fakbar", description: "Tappen vorig academiejaar", maxParticipants: 5, reward: 3, post: "FAKBAR",
      participants: [ { email: "logistiek@vtk.prototype", payedOut: true }, { email: "sport@vtk.prototype", payedOut: true } ] },
    { id: "seed-shift-past-7", name: "Doopcafé (vorig jaar)", dayOffset: -430, startHour: 20, endHour: 23, location: "Fakbar", description: "Doopcafé vorig academiejaar", maxParticipants: 4, reward: 2, post: "ACTIVITEITEN",
      participants: [ { email: "praeses@vtk.prototype", payedOut: true }, { email: "it@vtk.prototype", payedOut: false } ] },
  ];

  for (const s of pastShiftSeeds) {
    const data = {
      name: s.name,
      startTime: shiftAt(s.dayOffset, s.startHour),
      endTime: shiftAt(s.dayOffset, s.endHour),
      location: s.location,
      description: s.description,
      maxParticipants: s.maxParticipants,
      reward: s.reward,
      post: s.post,
    };
    // Create-only, net als de andere shiften: bestaande rijen en hun deelnemers
    // (incl. payedOut-status) blijven staan bij een reseed.
    await prisma.shift.upsert({ where: { id: s.id }, update: {}, create: { id: s.id, ...data } });

    for (const p of s.participants) {
      const user = prototypeUserByEmail.get(p.email);
      if (!user) continue;
      await prisma.shiftParticipant.upsert({
        where: { shiftId_userId: { shiftId: s.id, userId: user.id } },
        update: {},
        create: { shiftId: s.id, userId: user.id, payedOut: p.payedOut },
      });
    }
  }

  console.log("Seeding Theokot standard offering...");
  // Standaardaanbod voor de broodjesbar. Prijzen in eurocent. Deze catalogus wordt
  // bij het aanmaken van een verkoopweek naar sessie-items gekopieerd (snapshot).
  // De laatste rij is het "broodje van de week"-slot; welk broodje dat concreet is
  // wordt per week ingesteld op de sessie zelf.
  const theokotProducts: Array<{
    key: string;
    nameNl: string;
    nameEn: string;
    priceCents: number;
    defaultQuantity: number;
    isWeeklySpecialSlot?: boolean;
  }> = [
    { key: "brie", nameNl: "Broodje Brie", nameEn: "Brie sandwich", priceCents: 260, defaultQuantity: 10 },
    { key: "boulet", nameNl: "Broodje Boulet", nameEn: "Meatball sandwich", priceCents: 280, defaultQuantity: 12 },
    { key: "hesp", nameNl: "Broodje Hesp", nameEn: "Ham sandwich", priceCents: 230, defaultQuantity: 10 },
    { key: "kaas-hesp", nameNl: "Broodje Kaas & Hesp", nameEn: "Cheese & ham sandwich", priceCents: 260, defaultQuantity: 15 },
    { key: "italiaans", nameNl: "Broodje Italiaans", nameEn: "Italian sandwich", priceCents: 280, defaultQuantity: 10 },
    { key: "kaas", nameNl: "Broodje Kaas", nameEn: "Cheese sandwich", priceCents: 230, defaultQuantity: 10 },
    { key: "kip-curry", nameNl: "Broodje Kip Curry", nameEn: "Chicken curry sandwich", priceCents: 260, defaultQuantity: 5 },
    { key: "mpt", nameNl: "Broodje Mozarella-Pesto-Tomaat", nameEn: "Mozzarella-pesto-tomato sandwich", priceCents: 260, defaultQuantity: 13 },
    { key: "humus", nameNl: "Bruin broodje humus", nameEn: "Brown roll with hummus", priceCents: 230, defaultQuantity: 5 },
    { key: "pasta-pesto", nameNl: "Pasta Pesto", nameEn: "Pasta pesto", priceCents: 260, defaultQuantity: 8 },
    { key: "van-de-week", nameNl: "Broodje van de week", nameEn: "Sandwich of the week", priceCents: 280, defaultQuantity: 20, isWeeklySpecialSlot: true },
  ];
  for (let i = 0; i < theokotProducts.length; i += 1) {
    const p = theokotProducts[i];
    const id = `seed-theokot-product-${p.key}`;
    const data = {
      nameNl: p.nameNl,
      nameEn: p.nameEn,
      priceCents: p.priceCents,
      defaultQuantity: p.defaultQuantity,
      isWeeklySpecialSlot: p.isWeeklySpecialSlot ?? false,
      order: i,
      active: true,
    };
    // Create-only: een bestaand product (prijs, naam, hoeveelheid, volgorde) niet
    // overschrijven bij een reseed.
    await prisma.theokotProduct.upsert({ where: { id }, update: {}, create: { id, ...data } });
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
