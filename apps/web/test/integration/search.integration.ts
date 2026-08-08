import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@vtk/db";
import { searchSite } from "@/lib/search-server";

/**
 * Zoeken tegen een echte database.
 *
 * De rest van de zoekfunctie valt met unit tests te dekken; dit niet. Wat hier
 * bewezen moet worden is dat een **concept-pagina** en een evenement dat niet
 * voor deze bezoeker bestemd is, nergens in de uitkomst opduiken, ook niet als
 * fragment. Dat hangt aan de tsvector-trigger, aan de where-regels van beide
 * stappen en aan het samenspel ertussen; een mock zou precies dat wegnemen.
 */

/** Verzonnen woord: het mag in geen enkele echte pagina of activiteit staan. */
const TERM = "kwibusfluitketel";

/** Een tweede verzonnen woord, enkel in de Engelse velden. */
const TERM_EN = "wobblegantry";

describe.sequential("zoeken", () => {
  const ids = {
    tab: randomUUID(),
    group: randomUUID(),
    firstYearCat: randomUUID(),
    publishedPage: randomUUID(),
    draftPage: randomUUID(),
    loosePage: randomUUID(),
    publicEvent: randomUUID(),
    membersEvent: randomUUID(),
    audienceEvent: randomUUID(),
  };

  const slugs = {
    tab: `zoekproef-${ids.tab}`,
    publishedPage: `gepubliceerd-${ids.publishedPage}`,
    draftPage: `concept-${ids.draftPage}`,
    loosePage: `los-${ids.loosePage}`,
    firstYearCat: `ej-${ids.firstYearCat}`,
  };

  const start = new Date("2027-04-01T18:00:00.000Z");
  const end = new Date("2027-04-01T22:00:00.000Z");

  async function makePage(
    id: string,
    slug: string,
    titleNl: string,
    published: boolean,
    extra: Record<string, unknown> = {},
  ) {
    await prisma.page.create({
      data: {
        id,
        slug,
        titleNl,
        contentJsonNl: {},
        contentMdNl: `Deze pagina gaat over de ${TERM} en over niets anders. Een **${TERM}** is verzonnen.`,
        excerptNl: `Alles over de ${TERM}.`,
        publishedAt: published ? new Date() : null,
        ...extra,
      },
    });
  }

  async function makeEvent(
    id: string,
    titleNl: string,
    visibility: "PUBLIC" | "MEMBERS",
    categoryIds: string[] = [],
  ) {
    await prisma.calendarEvent.create({
      data: {
        id,
        titleNl,
        descriptionNl: `Een avond rond de ${TERM}.`,
        start,
        end,
        visibility,
        groupId: ids.group,
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      },
    });
  }

  beforeAll(async () => {
    await prisma.headerTab.create({
      data: {
        id: ids.tab,
        code: `ZOEKPROEF_${ids.tab}`,
        slug: slugs.tab,
        labelNl: "Zoekproef",
        labelEn: "Search test",
      },
    });
    await prisma.group.create({
      data: {
        id: ids.group,
        code: `zoek-${ids.group}`,
        slug: `zoek-${ids.group}`,
        nameNl: "Zoekproef",
        nameEn: "Search test",
      },
    });
    await prisma.calendarCategory.create({
      data: {
        id: ids.firstYearCat,
        slug: slugs.firstYearCat,
        nameNl: "Eerstejaars",
        nameEn: "First years",
        audience: "FIRST_YEARS",
      },
    });

    await makePage(ids.publishedPage, slugs.publishedPage, `Gepubliceerd: ${TERM}`, true, {
      headerTabId: ids.tab,
      titleEn: `Published: ${TERM_EN}`,
      contentMdEn: `This page is about the ${TERM_EN} and nothing else.`,
    });
    await makePage(ids.draftPage, slugs.draftPage, `Concept: ${TERM}`, false, {
      headerTabId: ids.tab,
    });
    // Een gepubliceerde pagina zonder categorie: die hoort via /p/<slug> gevonden
    // te worden, niet via een categoriepad dat niet bestaat.
    await makePage(ids.loosePage, slugs.loosePage, `Los: ${TERM}`, true);

    await makeEvent(ids.publicEvent, `Publiek: ${TERM}`, "PUBLIC");
    await makeEvent(ids.membersEvent, `Intern: ${TERM}`, "MEMBERS");
    await makeEvent(ids.audienceEvent, `Eerstejaars: ${TERM}`, "PUBLIC", [ids.firstYearCat]);
  });

  afterAll(async () => {
    await prisma.calendarEvent.deleteMany({
      where: { id: { in: [ids.publicEvent, ids.membersEvent, ids.audienceEvent] } },
    });
    await prisma.calendarCategory.delete({ where: { id: ids.firstYearCat } });
    await prisma.group.delete({ where: { id: ids.group } });
    await prisma.page.deleteMany({
      where: { id: { in: [ids.publishedPage, ids.draftPage, ids.loosePage] } },
    });
    await prisma.headerTab.delete({ where: { id: ids.tab } });
  });

  /** De testset zoals een niet-ingelogde bezoeker ze ziet. */
  async function visitorSearch(query: string, locale: "nl" | "en" = "nl") {
    return searchSite({ query, locale, audiences: [] });
  }

  it("vult de zoekvector bij het aanmaken, zonder dat er iets opnieuw opgeslagen wordt", async () => {
    const rows = await prisma.$queryRaw<Array<{ filled: boolean }>>`
      SELECT "searchNl" IS NOT NULL AS filled FROM "Page" WHERE "id" = ${ids.publishedPage}
    `;
    expect(rows[0]?.filled).toBe(true);
  });

  it("vindt de gepubliceerde pagina en het publieke evenement", async () => {
    const { results } = await visitorSearch(TERM);
    const ids_ = results.map((r) => r.id);
    expect(ids_).toContain(ids.publishedPage);
    expect(ids_).toContain(ids.loosePage);
    expect(ids_).toContain(ids.publicEvent);
  });

  it("laat een concept-pagina nergens opduiken, ook niet als fragment", async () => {
    const { results } = await visitorSearch(TERM);
    expect(results.map((r) => r.id)).not.toContain(ids.draftPage);
    // Ook geen spoor in de titels of de fragmenten van de andere resultaten.
    const alleTekst = results
      .map((r) => `${r.title} ${r.snippet.map((p) => p.text).join(" ")}`)
      .join(" ");
    expect(alleTekst).not.toContain("Concept");
  });

  it("laat een ledenexclusief evenement niet terugkomen", async () => {
    const { results } = await visitorSearch(TERM);
    expect(results.map((r) => r.id)).not.toContain(ids.membersEvent);
  });

  it("houdt een doelgroepevenement weg bij wie niet tot die doelgroep hoort", async () => {
    const anoniem = await visitorSearch(TERM);
    expect(anoniem.results.map((r) => r.id)).not.toContain(ids.audienceEvent);

    const eerstejaars = await searchSite({
      query: TERM,
      locale: "nl",
      audiences: ["FIRST_YEARS"],
    });
    expect(eerstejaars.results.map((r) => r.id)).toContain(ids.audienceEvent);
    // De rest van de regels blijft ook voor een eerstejaars gelden.
    expect(eerstejaars.results.map((r) => r.id)).not.toContain(ids.draftPage);
    expect(eerstejaars.results.map((r) => r.id)).not.toContain(ids.membersEvent);
  });

  it("linkt naar de canonieke vorm van een pagina", async () => {
    const { results } = await visitorSearch(TERM);
    const onder = results.find((r) => r.id === ids.publishedPage);
    const los = results.find((r) => r.id === ids.loosePage);
    expect(onder?.href).toBe(`/${slugs.tab}/${slugs.publishedPage}`);
    expect(los?.href).toBe(`/p/${slugs.loosePage}`);
  });

  it("markeert de gevonden term in het fragment", async () => {
    const { results } = await visitorSearch(TERM);
    const page = results.find((r) => r.id === ids.publishedPage);
    const gemarkeerd = page?.snippet.filter((p) => p.highlight).map((p) => p.text.toLowerCase());
    expect(gemarkeerd?.length).toBeGreaterThan(0);
    expect(gemarkeerd?.join(" ")).toContain(TERM);
    // De markdown-sterretjes uit `**kwibusfluitketel**` horen niet op het scherm.
    expect(page?.snippet.map((p) => p.text).join("")).not.toContain("*");
  });

  it("zoekt in het Engels in de Engelse velden, met terugval op het Nederlands", async () => {
    const engels = await visitorSearch(TERM_EN, "en");
    expect(engels.results.map((r) => r.id)).toContain(ids.publishedPage);

    // De losse pagina heeft geen Engelse versie; ze is op /en toch vindbaar,
    // want daar staat dan gewoon de Nederlandse tekst op het scherm.
    const terugval = await visitorSearch(TERM, "en");
    expect(terugval.results.map((r) => r.id)).toContain(ids.loosePage);
    expect(terugval.results.map((r) => r.id)).not.toContain(ids.draftPage);
  });

  it("werkt de zoekvector bij wanneer de inhoud verandert", async () => {
    const nieuw = `${TERM}variant`;
    await prisma.page.update({
      where: { id: ids.loosePage },
      data: { contentMdNl: `Deze tekst gaat nu over de ${nieuw}.` },
    });

    const na = await visitorSearch(nieuw);
    expect(na.results.map((r) => r.id)).toContain(ids.loosePage);
  });

  it("houdt stand bij rommelige en absurd lange invoer", async () => {
    for (const query of [
      `'; DROP TABLE "Page"; --`,
      `${TERM} & | ! ( )`,
      `"${TERM}"`,
      `${TERM} `.repeat(200),
    ]) {
      const uitkomst = await searchSite({ query, locale: "nl", audiences: [] });
      expect(uitkomst.results.map((r) => r.id)).not.toContain(ids.draftPage);
      expect(uitkomst.results.map((r) => r.id)).not.toContain(ids.membersEvent);
    }

    // De tabel staat er nog: de zoekterm ging als parameter mee, niet als SQL.
    expect(await prisma.page.count({ where: { id: ids.publishedPage } })).toBe(1);
  });
});
