import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@vtk/db";
import { audienceFilter, audiencesForUser } from "@/lib/calendar/audience";
import { buildFeed } from "@/lib/calendar/feeds";

/**
 * De doelgroepfilter tegen een echte database. Dit is precies het stuk dat een
 * unit test niet dekt: het `OR`-fragment met een genest `none`/`some` op een
 * koppeltabel is makkelijk zo te schrijven dat het er goed uitziet en toch alles
 * of niets teruggeeft.
 */
describe.sequential("kalender-doelgroepen", () => {
  const ids = {
    group: randomUUID(),
    firstYearCat: randomUUID(),
    intlCat: randomUUID(),
    lastYearsCat: randomUUID(),
    alumniCat: randomUUID(),
    themeCat: randomUUID(),
    plainEvent: randomUUID(),
    firstYearEvent: randomUUID(),
    intlEvent: randomUUID(),
    lastYearsEvent: randomUUID(),
    alumniEvent: randomUUID(),
    bothEvent: randomUUID(),
    firstYearUser: randomUUID(),
    masterUser: randomUUID(),
    intlUser: randomUUID(),
    finalMasterUser: randomUUID(),
    alumniUser: randomUUID(),
  };

  const start = new Date("2027-03-01T18:00:00.000Z");
  const end = new Date("2027-03-01T22:00:00.000Z");

  async function makeUser(id: string, extra: Record<string, unknown>) {
    await prisma.user.create({
      data: {
        id,
        name: "Test Lid",
        email: `audience-${id}@student.kuleuven.be`,
        emailVerified: true,
        ...extra,
      },
    });
  }

  beforeAll(async () => {
    await prisma.group.create({
      data: {
        id: ids.group,
        code: `aud-${ids.group}`,
        slug: `aud-${ids.group}`,
        nameNl: "T",
        nameEn: "T",
      },
    });

    await prisma.calendarCategory.createMany({
      data: [
        {
          id: ids.firstYearCat,
          slug: `ey-${ids.firstYearCat}`,
          nameNl: "EJ",
          nameEn: "FY",
          audience: "FIRST_YEARS",
        },
        {
          id: ids.intlCat,
          slug: `in-${ids.intlCat}`,
          nameNl: "Int",
          nameEn: "Int",
          audience: "INTERNATIONALS",
        },
        {
          id: ids.lastYearsCat,
          slug: `ly-${ids.lastYearsCat}`,
          nameNl: "Laatstejaars",
          nameEn: "Last years",
          audience: "LAST_YEARS",
        },
        {
          id: ids.alumniCat,
          slug: `al-${ids.alumniCat}`,
          nameNl: "Alumni",
          nameEn: "Alumni",
          audience: "ALUMNI",
        },
        {
          id: ids.themeCat,
          slug: `th-${ids.themeCat}`,
          nameNl: "Thema",
          nameEn: "Theme",
          audience: null,
        },
      ],
    });

    for (const [id, categoryIds] of [
      // Zonder doelgroep, maar mét een gewoon thema: een thema mag een event
      // nooit uit de algemene kalender houden.
      [ids.plainEvent, [ids.themeCat]],
      [ids.firstYearEvent, [ids.firstYearCat]],
      [ids.intlEvent, [ids.intlCat]],
      [ids.lastYearsEvent, [ids.lastYearsCat]],
      [ids.alumniEvent, [ids.alumniCat]],
      [ids.bothEvent, [ids.firstYearCat, ids.intlCat]],
    ] as const) {
      await prisma.calendarEvent.create({
        data: {
          id,
          titleNl: id,
          start,
          end,
          groupId: ids.group,
          visibility: "PUBLIC",
          publishedAt: new Date(),
          categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
        },
      });
    }

    await makeUser(ids.firstYearUser, { studyYears: ["BACHELOR_1"] });
    await makeUser(ids.masterUser, { studyYears: ["MASTER_1"] });
    await makeUser(ids.intlUser, { studyYears: ["MASTER_1"], internationalStudent: true });
    await makeUser(ids.finalMasterUser, { studyYears: ["MASTER_2"] });
    await makeUser(ids.alumniUser, { alumni: true });
  });

  afterAll(async () => {
    await prisma.calendarEvent.deleteMany({
      where: {
        id: {
          in: [
            ids.plainEvent,
            ids.firstYearEvent,
            ids.intlEvent,
            ids.lastYearsEvent,
            ids.alumniEvent,
            ids.bothEvent,
          ],
        },
      },
    });
    await prisma.calendarCategory.deleteMany({
      where: {
        id: { in: [ids.firstYearCat, ids.intlCat, ids.lastYearsCat, ids.alumniCat, ids.themeCat] },
      },
    });
    await prisma.group.delete({ where: { id: ids.group } });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            ids.firstYearUser,
            ids.masterUser,
            ids.intlUser,
            ids.finalMasterUser,
            ids.alumniUser,
          ],
        },
      },
    });
  });

  /** De ids uit onze testset die door een filter heen komen. */
  async function visible(audiences: Parameters<typeof audienceFilter>[0]) {
    const rows = await prisma.calendarEvent.findMany({
      where: {
        id: {
          in: [
            ids.plainEvent,
            ids.firstYearEvent,
            ids.intlEvent,
            ids.lastYearsEvent,
            ids.alumniEvent,
            ids.bothEvent,
          ],
        },
        ...audienceFilter(audiences),
      },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  it("leidt de doelgroepen af uit het studieprofiel", async () => {
    expect(await audiencesForUser(ids.firstYearUser)).toEqual(["FIRST_YEARS"]);
    expect(await audiencesForUser(ids.masterUser)).toEqual([]);
    expect(await audiencesForUser(ids.intlUser)).toEqual(["INTERNATIONALS"]);
    expect(await audiencesForUser(ids.finalMasterUser)).toEqual(["LAST_YEARS"]);
    expect(await audiencesForUser(ids.alumniUser)).toEqual(["ALUMNI"]);
  });

  it("toont zonder doelgroep enkel evenementen zonder doelgroep", async () => {
    const seen = await visible([]);
    expect(seen).toEqual(new Set([ids.plainEvent]));
  });

  it("voegt bij een eerstejaars zijn eigen evenementen toe", async () => {
    const seen = await visible(["FIRST_YEARS"]);
    // Het event met twee doelgroepen telt mee: één match volstaat.
    expect(seen).toEqual(new Set([ids.plainEvent, ids.firstYearEvent, ids.bothEvent]));
    expect(seen.has(ids.intlEvent)).toBe(false);
  });

  it("houdt de doelgroepen uit elkaar", async () => {
    const seen = await visible(["INTERNATIONALS"]);
    expect(seen).toEqual(new Set([ids.plainEvent, ids.intlEvent, ids.bothEvent]));
    expect(seen.has(ids.firstYearEvent)).toBe(false);
  });

  it("toont laatstejaarsevents enkel aan laatstejaars", async () => {
    const seen = await visible(["LAST_YEARS"]);
    expect(seen).toEqual(new Set([ids.plainEvent, ids.lastYearsEvent]));
  });

  it("toont alumnievenementen in het alumni-profiel", async () => {
    const seen = await visible(["ALUMNI"]);
    expect(seen).toEqual(new Set([ids.plainEvent, ids.alumniEvent]));
  });

  it("toont alles aan wie bij beide doelgroepen hoort", async () => {
    const seen = await visible(["FIRST_YEARS", "INTERNATIONALS"]);
    expect(seen).toEqual(
      new Set([ids.plainEvent, ids.firstYearEvent, ids.intlEvent, ids.bothEvent]),
    );
  });

  it("neemt alle doelgroepen op in de publieke hoofdagenda-feed", async () => {
    const feed = await buildFeed({ kind: "all" }, "nl", new Date("2027-03-01T12:00:00.000Z"));
    for (const eventId of [
      ids.plainEvent,
      ids.firstYearEvent,
      ids.intlEvent,
      ids.lastYearsEvent,
      ids.alumniEvent,
      ids.bothEvent,
    ]) {
      expect(feed).toContain(`SUMMARY:${eventId}`);
    }
  });
});
