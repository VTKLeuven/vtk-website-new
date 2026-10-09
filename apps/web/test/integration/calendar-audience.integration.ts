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
    customCat: randomUUID(),
    sideEntrantCat: randomUUID(),
    plainEvent: randomUUID(),
    firstYearEvent: randomUUID(),
    intlEvent: randomUUID(),
    lastYearsEvent: randomUUID(),
    alumniEvent: randomUUID(),
    bothEvent: randomUUID(),
    customEvent: randomUUID(),
    firstYearAndCustomEvent: randomUUID(),
    sideEntrantEvent: randomUUID(),
    firstYearUser: randomUUID(),
    masterUser: randomUUID(),
    intlUser: randomUUID(),
    finalMasterUser: randomUUID(),
    alumniUser: randomUUID(),
    sideEntrantUser: randomUUID(),
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
        {
          id: ids.customCat,
          slug: `cu-${ids.customCat}`,
          nameNl: "Masterstudenten Architectuur",
          nameEn: "Architecture master's students",
          audience: "CUSTOM",
        },
        {
          id: ids.sideEntrantCat,
          slug: `zi-${ids.sideEntrantCat}`,
          nameNl: "Zij-instromers",
          nameEn: "Lateral entrants",
          audience: "SIDE_ENTRANTS",
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
      [ids.customEvent, [ids.customCat]],
      [ids.firstYearAndCustomEvent, [ids.firstYearCat, ids.customCat]],
      [ids.sideEntrantEvent, [ids.sideEntrantCat]],
    ] as const) {
      await prisma.calendarEvent.create({
        data: {
          id,
          slug: id,
          titleNl: id,
          start,
          end,
          groupId: ids.group,
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
    await makeUser(ids.sideEntrantUser, { studyYears: ["MASTER_1"], sideEntrant: true });
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
            ids.customEvent,
            ids.firstYearAndCustomEvent,
            ids.sideEntrantEvent,
          ],
        },
      },
    });
    await prisma.calendarCategory.deleteMany({
      where: {
        id: {
          in: [
            ids.firstYearCat,
            ids.intlCat,
            ids.lastYearsCat,
            ids.alumniCat,
            ids.themeCat,
            ids.customCat,
            ids.sideEntrantCat,
          ],
        },
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
            ids.sideEntrantUser,
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
            ids.customEvent,
            ids.firstYearAndCustomEvent,
            ids.sideEntrantEvent,
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
    expect(await audiencesForUser(ids.sideEntrantUser)).toEqual(["SIDE_ENTRANTS"]);
  });

  it("toont zonder doelgroep enkel evenementen zonder profielgebonden doelgroep", async () => {
    const seen = await visible([]);
    // Een doelgroep zonder profielregel (`CUSTOM`) valt niet na te gaan en
    // blijft dus staan, ook naast een doelgroep die wel aan het profiel hangt.
    expect(seen).toEqual(
      new Set([ids.plainEvent, ids.customEvent, ids.firstYearAndCustomEvent]),
    );
  });

  it("voegt bij een eerstejaars zijn eigen evenementen toe", async () => {
    const seen = await visible(["FIRST_YEARS"]);
    // Het event met twee doelgroepen telt mee: één match volstaat.
    expect(seen).toEqual(
      new Set([
        ids.plainEvent,
        ids.firstYearEvent,
        ids.bothEvent,
        ids.customEvent,
        ids.firstYearAndCustomEvent,
      ]),
    );
    expect(seen.has(ids.intlEvent)).toBe(false);
  });

  it("houdt de doelgroepen uit elkaar", async () => {
    const seen = await visible(["INTERNATIONALS"]);
    expect(seen).toEqual(
      new Set([
        ids.plainEvent,
        ids.intlEvent,
        ids.bothEvent,
        ids.customEvent,
        ids.firstYearAndCustomEvent,
      ]),
    );
    expect(seen.has(ids.firstYearEvent)).toBe(false);
  });

  it("toont laatstejaarsevents enkel aan laatstejaars", async () => {
    const seen = await visible(["LAST_YEARS"]);
    expect(seen).toEqual(
      new Set([ids.plainEvent, ids.lastYearsEvent, ids.customEvent, ids.firstYearAndCustomEvent]),
    );
  });

  it("toont alumnievenementen in het alumni-profiel", async () => {
    const seen = await visible(["ALUMNI"]);
    expect(seen).toEqual(
      new Set([ids.plainEvent, ids.alumniEvent, ids.customEvent, ids.firstYearAndCustomEvent]),
    );
  });

  it("toont zij-instromersevents enkel aan zij-instromers", async () => {
    const seen = await visible(["SIDE_ENTRANTS"]);
    expect(seen).toEqual(
      new Set([
        ids.plainEvent,
        ids.sideEntrantEvent,
        ids.customEvent,
        ids.firstYearAndCustomEvent,
      ]),
    );
  });

  it("toont alles aan wie bij beide doelgroepen hoort", async () => {
    const seen = await visible(["FIRST_YEARS", "INTERNATIONALS"]);
    expect(seen).toEqual(
      new Set([
        ids.plainEvent,
        ids.firstYearEvent,
        ids.intlEvent,
        ids.bothEvent,
        ids.customEvent,
        ids.firstYearAndCustomEvent,
      ]),
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
      ids.customEvent,
      ids.firstYearAndCustomEvent,
      ids.sideEntrantEvent,
    ]) {
      expect(feed).toContain(`SUMMARY:${eventId}`);
    }
  });
});
