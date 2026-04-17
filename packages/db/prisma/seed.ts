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

  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    console.log("Seeding initial admin...");
    const passwordHash = await hash(process.env.SEED_ADMIN_PASSWORD);
    const admin = await prisma.user.upsert({
      where: { email: process.env.SEED_ADMIN_EMAIL },
      update: { isSuperAdmin: true, active: true },
      create: {
        email: process.env.SEED_ADMIN_EMAIL,
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
