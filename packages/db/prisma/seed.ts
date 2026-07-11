import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import type { GroupCode } from "@prisma/client";
import { GROUP_SEEDS, HEADER_TABS } from "../src/groups";
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
    {
      key: "media.aftermovies",
      preserveExisting: true,
      value: {
        titleNl: "Aftermovies",
        titleEn: "Aftermovies",
        items: [
          {
            id: "galabal-aftermovie",
            type: "video",
            url: "https://www.youtube.com/watch?v=WdGqhrVUJog",
            titleNl: "Galabal aftermovie",
            titleEn: "Gala aftermovie",
          },
          {
            id: "jobfair-aftermovie",
            type: "video",
            url: "https://www.youtube.com/watch?v=9CyqfzXWYME",
            titleNl: "Jobfair aftermovie",
            titleEn: "Job fair aftermovie",
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
      key: "home.featuredAlbums",
      value: { albumSlugs: [] as string[] },
    },
  ];
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
      update: s.preserveExisting ? {} : { value: s.value as object },
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

  const prototypeUserByEmail = new Map<string, { id: string; email: string; name: string }>();
  for (const u of prototypeUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        locale: u.locale,
        active: true,
      },
      create: {
        email: u.email,
        name: u.name,
        locale: u.locale,
        active: true,
      },
    });
    await prisma.account.upsert({
      where: {id: `credentials:${user.id}`},
      update: {
        password: prototypePasswordHash
      },
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
        where: { userId_groupId: { userId: user.id, groupId: group.id } },
        update: {
          role: membership.role,
          titleNl: membership.titleNl,
          titleEn: membership.titleEn,
          year: membership.year,
          displayOrder: membership.displayOrder,
        },
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
      studyTrack: "Master Computer Science",
      descriptionNl: "Aanspreekpunt voor major-keuzes, ISP-vragen en feedback over softwarevakken.",
      descriptionEn: "Point of contact for major choices, ISP questions and feedback on software courses.",
      order: 0,
      representatives: [
        { email: "onderwijs@vtk.prototype", roleNl: "POC Computerwetenschappen", roleEn: "POC Computer Science", order: 0 },
        { email: "it@vtk.prototype", roleNl: "Studentenvertegenwoordiger", roleEn: "Student representative", order: 1 },
      ],
    },
    {
      slug: "werktuigkunde",
      nameNl: "Werktuigkunde",
      nameEn: "Mechanical Engineering",
      studyTrack: "Master Mechanical Engineering",
      descriptionNl: "Voor labo's, projectwerk, uurroosters en opleidingsfeedback.",
      descriptionEn: "For labs, project work, schedules and programme feedback.",
      order: 1,
      representatives: [
        { email: "sport@vtk.prototype", roleNl: "POC Werktuigkunde", roleEn: "POC Mechanical Engineering", order: 0 },
      ],
    },
    {
      slug: "elektrotechniek",
      nameNl: "Elektrotechniek",
      nameEn: "Electrical Engineering",
      studyTrack: "Master Electrical Engineering",
      descriptionNl: "Bundelt opmerkingen rond practica, examens en communicatie met professoren.",
      descriptionEn: "Collects remarks about practicals, exams and communication with professors.",
      order: 2,
      representatives: [
        { email: "vice@vtk.prototype", roleNl: "POC Elektrotechniek", roleEn: "POC Electrical Engineering", order: 0 },
      ],
    },
    {
      slug: "chemische-technologie",
      nameNl: "Chemische technologie",
      nameEn: "Chemical Engineering",
      studyTrack: "Master Chemical Engineering",
      descriptionNl: "Contactpunt voor practica, stages en facultaire overlegmomenten.",
      descriptionEn: "Contact point for labs, internships and faculty consultations.",
      order: 3,
      representatives: [
        { email: "theokot@vtk.prototype", roleNl: "POC Chemische technologie", roleEn: "POC Chemical Engineering", order: 0 },
      ],
    },
  ];

  for (const poc of pocSeeds) {
    const row = await prisma.poc.upsert({
      where: { slug: poc.slug },
      update: {
        nameNl: poc.nameNl,
        nameEn: poc.nameEn,
        studyTrack: poc.studyTrack,
        descriptionNl: poc.descriptionNl,
        descriptionEn: poc.descriptionEn,
        order: poc.order,
      },
      create: {
        slug: poc.slug,
        nameNl: poc.nameNl,
        nameEn: poc.nameEn,
        studyTrack: poc.studyTrack,
        descriptionNl: poc.descriptionNl,
        descriptionEn: poc.descriptionEn,
        order: poc.order,
      },
    });
    for (const rep of poc.representatives) {
      const user = prototypeUserByEmail.get(rep.email);
      if (!user) continue;
      await prisma.pocRepresentative.upsert({
        where: { pocId_userId: { pocId: row.id, userId: user.id } },
        update: { roleNl: rep.roleNl, roleEn: rep.roleEn, order: rep.order },
        create: { pocId: row.id, userId: user.id, roleNl: rep.roleNl, roleEn: rep.roleEn, order: rep.order },
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

  for (const page of pageSeeds) {
    const tab = await prisma.headerTab.findUnique({ where: { code: page.headerCode } });
    if (!tab) continue;
    await prisma.page.upsert({
      where: { slug: page.slug },
      update: {
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
  for (const album of albumSeeds) {
    await prisma.photoAlbum.upsert({
      where: { slug: album.slug },
      update: {
        titleNl: album.titleNl,
        titleEn: album.titleEn,
        descriptionNl: album.descriptionNl,
        descriptionEn: album.descriptionEn,
        eventDate: new Date(album.eventDate),
        publishedAt: new Date(album.publishedAt),
      },
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

  await prisma.setting.upsert({
    where: { key: "home.featuredAlbums" },
    update: { value: { albumSlugs: albumSeeds.map((a) => a.slug) } },
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
    groupCode: GroupCode;
    descriptionNl?: string;
    descriptionEn?: string;
  }> = [
    {
      titleNl: "Theokot lunch deluxe",
      titleEn: "Theokot lunch deluxe",
      location: "Theokot · Arenberg",
      start: "2026-05-19T11:30:00+02:00",
      end: "2026-05-19T14:00:00+02:00",
      url: "https://vtk.be/nl/aanbod",
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
      descriptionNl: e.descriptionNl,
      descriptionEn: e.descriptionEn,
      visibility: "PUBLIC" as const,
      groupId: group.id,
    };
    if (existing) {
      await prisma.calendarEvent.update({ where: { id: existing.id }, data });
    } else {
      await prisma.calendarEvent.create({ data });
    }
  }

  const seedEmail = readSeedEnv(process.env.SEED_ADMIN_EMAIL);
  const seedPassword = readSeedEnv(process.env.SEED_ADMIN_PASSWORD);

  if (seedEmail && seedPassword) {
    console.log("Seeding initial admin...");
    // Match apps/web loginAction: email is trimmed + lowercased on sign-in.
    const adminEmail = seedEmail.toLowerCase();
    const adminPassword = seedPassword;
    const passwordHash = await hash(adminPassword);
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        email: adminEmail,
        isSuperAdmin: true,
        active: true,
      },
      create: {
        email: adminEmail,
        name: "VTK Admin",
        isSuperAdmin: true,
      },
    });
    await prisma.account.upsert({
      where: {id: `credential:${admin.id}`},
      create: {
        id: `credential:${admin.id}`,
        accountId: admin.id,
        providerId: "credential",
        userId: admin.id,
        password: passwordHash
      },
      update: {
        password: passwordHash
      }
    })
    const itGroup = await prisma.group.findUnique({ where: { code: "IT" } });
    if (itGroup) {
      await prisma.groupMembership.upsert({
        where: { userId_groupId: { userId: admin.id, groupId: itGroup.id } },
        update: { role: "LEAD" },
        create: { userId: admin.id, groupId: itGroup.id, role: "LEAD" },
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
  for (const t of dashboardTiles) {
    await prisma.dashboardTile.upsert({
      where: { id: t.id },
      update: { label: t.label, url: t.url, icon: t.icon, color: t.color, order: t.order, scope: "GLOBAL" },
      create: { id: t.id, label: t.label, url: t.url, icon: t.icon, color: t.color, order: t.order, scope: "GLOBAL" },
    });
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
