import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { GROUP_SEEDS, HEADER_TABS } from "../src/groups";
import { PERMISSIONS } from "../src/permissions";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding groups...");
  for (const g of GROUP_SEEDS) {
    await prisma.group.upsert({
      where: { code: g.code },
      update: {
        slug: g.slug,
        nameNl: g.nameNl,
        nameEn: g.nameEn,
        orderInPraesidium: g.orderInPraesidium,
      },
      create: g,
    });
  }

  console.log("Seeding header tabs...");
  for (const tab of HEADER_TABS) {
    await prisma.headerTab.upsert({
      where: { code: tab.code },
      update: {
        slug: tab.slug,
        labelNl: tab.labelNl,
        labelEn: tab.labelEn,
        order: tab.order,
        visible: true,
      },
      create: tab,
    });
  }

  console.log("Seeding permissions...");
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { labelNl: p.labelNl, labelEn: p.labelEn, category: p.category },
      create: { code: p.code, labelNl: p.labelNl, labelEn: p.labelEn, category: p.category },
    });
  }

  // IT and Groep 5 get elevated permissions by default.
  const elevatedGroupCodes = ["IT", "GROEP5"] as const;
  const everyPermission = await prisma.permission.findMany();
  for (const code of elevatedGroupCodes) {
    const group = await prisma.group.findUnique({ where: { code } });
    if (!group) continue;
    for (const perm of everyPermission) {
      await prisma.groupPermission.upsert({
        where: { groupId_permissionId: { groupId: group.id, permissionId: perm.id } },
        update: {},
        create: { groupId: group.id, permissionId: perm.id },
      });
    }
  }

  // Baseline permissions for all other groups: create events for own group + upload photos.
  const baselinePermCodes = ["calendar.create", "photos.upload"];
  const baselinePerms = await prisma.permission.findMany({
    where: { code: { in: baselinePermCodes } },
  });
  const otherGroups = await prisma.group.findMany({
    where: { code: { notIn: [...elevatedGroupCodes] } },
  });
  for (const group of otherGroups) {
    for (const perm of baselinePerms) {
      await prisma.groupPermission.upsert({
        where: { groupId_permissionId: { groupId: group.id, permissionId: perm.id } },
        update: {},
        create: { groupId: group.id, permissionId: perm.id },
      });
    }
  }

  console.log("Seeding default homepage settings...");
  const defaultSettings: Array<{ key: string; value: unknown }> = [
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
          { dayNl: "Maandag", dayEn: "Monday", hours: "11:30 – 14:00" },
          { dayNl: "Dinsdag", dayEn: "Tuesday", hours: "11:30 – 14:00" },
          { dayNl: "Woensdag", dayEn: "Wednesday", hours: "11:30 – 14:00" },
          { dayNl: "Donderdag", dayEn: "Thursday", hours: "11:30 – 14:00" },
          { dayNl: "Vrijdag", dayEn: "Friday", hours: "11:30 – 14:00" },
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
        ctaUrl: "/career",
      },
    },
    {
      key: "home.aftermovies",
      value: {
        titleNl: "Aftermovies & sfeerbeelden",
        titleEn: "Aftermovies & photos",
        items: [] as Array<{ type: "video" | "image"; url: string; titleNl?: string; titleEn?: string }>,
      },
    },
    {
      key: "home.featuredAlbums",
      value: { albumSlugs: [] as string[] },
    },
  ];
  for (const s of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value as object },
      create: { key: s.key, value: s.value as object },
    });
  }

  console.log("Seeding partners...");
  // Mirrors the hoofdpartners strip on vtk.be. logoKey points at placeholder
  // paths — the UI falls back to the partner name as text when the object
  // isn't present in the S3 bucket, so the seed stays bucket-agnostic.
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
    if (existing) {
      await prisma.partner.update({
        where: { id: existing.id },
        data: { url: p.url, logoKey: p.logoKey, order: p.order, active: true },
      });
    } else {
      await prisma.partner.create({
        data: { name: p.name, url: p.url, logoKey: p.logoKey, order: p.order, active: true },
      });
    }
  }

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
    groupCode: "ACTIVITEITEN" | "CULTUUR" | "INTERNATIONAAL" | "FAKBAR" | "THEOKOT";
  }> = [
    {
      titleNl: "AflsuitBBQ",
      titleEn: "Closing BBQ",
      location: "Grasveld voor Alma III",
      start: "2026-04-20T18:00:00+02:00",
      end:   "2026-04-20T22:00:00+02:00",
      url: "https://vtk.be/nl/calendar/view/20_04_2026_18_00_00_aflsuitbbq/",
      groupCode: "ACTIVITEITEN",
    },
    {
      titleNl: "Croquantus",
      titleEn: "Croquantus",
      location: "Waaiberg",
      start: "2026-04-22T20:30:00+02:00",
      end:   "2026-04-23T01:00:00+02:00",
      url: "https://vtk.be/nl/calendar/view/22_04_2026_20_30_00_croquantus/",
      groupCode: "CULTUUR",
    },
    {
      titleNl: "Cantus V",
      titleEn: "Cantus V",
      location: "Waaiberg",
      start: "2026-04-23T20:00:00+02:00",
      end:   "2026-04-24T01:00:00+02:00",
      url: "https://vtk.be/nl/calendar/view/23_04_2026_20_00_00_cantus-v/",
      groupCode: "INTERNATIONAAL",
    },
    {
      titleNl: "Rewind Cantus",
      titleEn: "Rewind Cantus",
      location: "Waaiberg",
      start: "2026-04-28T20:30:00+02:00",
      end:   "2026-04-29T01:00:00+02:00",
      url: "https://vtk.be/nl/calendar/view/28_04_2026_20_30_00_rewind-cantus/",
      groupCode: "CULTUUR",
    },
  ];
  for (const e of eventSeeds) {
    const group = await prisma.group.findUnique({ where: { code: e.groupCode } });
    if (!group) continue;
    const start = new Date(e.start);
    const end = new Date(e.end);
    const existing = await prisma.calendarEvent.findFirst({
      where: { titleNl: e.titleNl, start },
    });
    const data = {
      titleNl: e.titleNl,
      titleEn: e.titleEn,
      location: e.location,
      start,
      end,
      url: e.url,
      visibility: "PUBLIC" as const,
      groupId: group.id,
    };
    if (existing) {
      await prisma.calendarEvent.update({ where: { id: existing.id }, data });
    } else {
      await prisma.calendarEvent.create({ data });
    }
  }

  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    console.log("Seeding initial admin...");
    // Match apps/web loginAction: email is trimmed + lowercased on sign-in.
    const adminEmail = process.env.SEED_ADMIN_EMAIL.trim().toLowerCase();
    const adminPassword = process.env.SEED_ADMIN_PASSWORD.trim();
    const passwordHash = await hash(adminPassword);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        email: adminEmail,
        isSuperAdmin: true,
        active: true,
        passwordHash,
      },
      create: {
        email: adminEmail,
        name: "VTK Admin",
        passwordHash,
        isSuperAdmin: true,
      },
    });
    const itGroup = await prisma.group.findUnique({ where: { code: "IT" } });
    if (itGroup) {
      await prisma.groupMembership.upsert({
        where: { userId_groupId: { userId: admin.id, groupId: itGroup.id } },
        update: { role: "LEAD" },
        create: { userId: admin.id, groupId: itGroup.id, role: "LEAD" },
      });
    }
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
