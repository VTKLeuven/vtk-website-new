import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@vtk/db";
import { searchSite } from "@/lib/search-server";
import { audienceFilter } from "@/lib/calendar/audience";

/**
 * Zoeken tegen een echte database.
 *
 * De rest van de zoekfunctie valt met unit tests te dekken; dit niet. Wat hier
 * bewezen moet worden is dat conceptinhoud en een evenement dat niet voor deze
 * bezoeker bestemd is nergens in de uitkomst opduiken, ook niet als fragment.
 * Dat hangt aan de tsvector-trigger, aan de where-regels van beide stappen en
 * aan het samenspel ertussen; een mock zou precies dat wegnemen.
 */

/** Verzonnen woord: het mag in geen enkele echte pagina of activiteit staan. */
const TERM = "kwibusfluitketel";

/** Een tweede verzonnen woord, enkel in de Engelse velden. */
const TERM_EN = "wobblegantry";

/**
 * Een samenstelling met een dubbele klinker erin, en het halve woord ervoor.
 *
 * Dit paar bewijst waarom de tweede zoekpoging twee configuraties naast elkaar
 * nodig heeft. De Nederlandse stammer maakt van `...veer` het woord `...ver`, en
 * `...ver:*` matcht de opgeslagen lexeme `...veerdienst` niet. Precies zo vond
 * "uitleen" de uitleendienst niet. Zonder een woord met die vorm slaagt de test
 * ook met alleen de Nederlandse configuratie, en bewaakt ze niets.
 */
const COMPOUND = `${TERM}veerdienst`;
const COMPOUND_PREFIX = `${TERM}veer`;

/**
 * Zonder deze instelling toont `searchSite` geen materiaal: er valt dan nergens
 * naartoe te linken. De test zet ze zelf, zodat ze niet afhangt van wat er
 * toevallig in de omgeving staat.
 */
const LOGISTIEK_URL = "https://logistiek.test";
process.env.LOGISTIEK_PUBLIC_URL = LOGISTIEK_URL;

describe.sequential("zoeken", () => {
  const ids = {
    tab: randomUUID(),
    group: randomUUID(),
    firstYearCat: randomUUID(),
    publishedPage: randomUUID(),
    draftPage: randomUUID(),
    loosePage: randomUUID(),
    compoundPage: randomUUID(),
    publicEvent: randomUUID(),
    draftEvent: randomUUID(),
    audienceEvent: randomUUID(),
    material: randomUUID(),
    inactiveMaterial: randomUUID(),
  };

  const slugs = {
    tab: `zoekproef-${ids.tab}`,
    publishedPage: `gepubliceerd-${ids.publishedPage}`,
    draftPage: `concept-${ids.draftPage}`,
    loosePage: `los-${ids.loosePage}`,
    compoundPage: `samen-${ids.compoundPage}`,
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
    categoryIds: string[] = [],
    published = true,
  ) {
    await prisma.calendarEvent.create({
      data: {
        id,
        titleNl,
        descriptionNl: `Een avond rond de ${TERM}.`,
        start,
        end,
        publishedAt: published ? new Date() : null,
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
    await makePage(ids.compoundPage, slugs.compoundPage, `Samenstelling: ${COMPOUND}`, true);

    await makeEvent(ids.publicEvent, `Publiek: ${TERM}`);
    await makeEvent(ids.draftEvent, `Conceptactiviteit: ${TERM}`, [], false);
    await makeEvent(ids.audienceEvent, `Eerstejaars: ${TERM}`, [ids.firstYearCat]);

    await prisma.uitleenItem.createMany({
      data: [
        {
          id: ids.material,
          name: `Beamer ${TERM}`,
          description: `Een beamer voor de ${TERM}.`,
          active: true,
        },
        {
          id: ids.inactiveMaterial,
          name: `Kapotte beamer ${TERM}`,
          description: `Uit de catalogus gehaald, maar de ${TERM} staat er nog in.`,
          active: false,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.uitleenItem.deleteMany({
      where: { id: { in: [ids.material, ids.inactiveMaterial] } },
    });
    await prisma.calendarEvent.deleteMany({
      where: {
        id: { in: [ids.publicEvent, ids.draftEvent, ids.audienceEvent] },
      },
    });
    await prisma.calendarCategory.delete({ where: { id: ids.firstYearCat } });
    await prisma.group.delete({ where: { id: ids.group } });
    await prisma.page.deleteMany({
      where: { id: { in: [ids.publishedPage, ids.draftPage, ids.loosePage, ids.compoundPage] } },
    });
    await prisma.headerTab.delete({ where: { id: ids.tab } });
  });

  /** De testset zoals een niet-ingelogde bezoeker ze ziet. */
  async function visitorSearch(query: string, locale: "nl" | "en" = "nl") {
    return searchSite({ query, locale, audienceWhere: {}, signedIn: false });
  }

  /** Dezelfde zoekopdracht, maar dan als ingelogd lid. */
  async function memberSearch(query: string, locale: "nl" | "en" = "nl") {
    return searchSite({ query, locale, audienceWhere: {}, signedIn: true });
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

  it("laat een concept-evenement nergens opduiken", async () => {
    const { results } = await visitorSearch(TERM);
    expect(results.map((r) => r.id)).not.toContain(ids.draftEvent);
    expect(results.map((r) => r.title).join(" ")).not.toContain("Conceptactiviteit");
  });

  it("toont een doelgroepevenement standaard aan iedereen", async () => {
    // Een doelgroep is een label, geen slot: elk gepubliceerd evenement is
    // publiek en hoort dus vindbaar te zijn, ook voor wie er niet bij hoort.
    const anoniem = await visitorSearch(TERM);
    expect(anoniem.results.map((r) => r.id)).toContain(ids.audienceEvent);
  });

  it("respecteert de persoonlijke doelgroepfilter wanneer die aanstaat", async () => {
    // Wie op /account koos zijn kalender toe te spitsen, krijgt hier hetzelfde
    // where-fragment mee als de kalender en de homepage.
    const anders = await searchSite({
      query: TERM,
      locale: "nl",
      audienceWhere: audienceFilter([]),
      signedIn: false,
    });
    expect(anders.results.map((r) => r.id)).not.toContain(ids.audienceEvent);

    const eerstejaars = await searchSite({
      query: TERM,
      locale: "nl",
      audienceWhere: audienceFilter(["FIRST_YEARS"]),
      signedIn: false,
    });
    expect(eerstejaars.results.map((r) => r.id)).toContain(ids.audienceEvent);
    // De rest van de regels blijft ook voor een eerstejaars gelden.
    expect(eerstejaars.results.map((r) => r.id)).not.toContain(ids.draftPage);
    expect(eerstejaars.results.map((r) => r.id)).not.toContain(ids.draftEvent);
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
      const uitkomst = await searchSite({ query, locale: "nl", audienceWhere: {}, signedIn: false });
      expect(uitkomst.results.map((r) => r.id)).not.toContain(ids.draftPage);
      expect(uitkomst.results.map((r) => r.id)).not.toContain(ids.draftEvent);
    }

    // De tabel staat er nog: de zoekterm ging als parameter mee, niet als SQL.
    expect(await prisma.page.count({ where: { id: ids.publishedPage } })).toBe(1);
  });

  it("vindt een vaste route die in geen enkele tabel staat", async () => {
    // De klacht waarmee dit begon: /piano is een eigen route zonder Page-rij,
    // dus geen enkele zoekopdracht in de database kon hem ooit vinden.
    const { results } = await visitorSearch("piano");
    const piano = results.find((r) => r.href === "/piano");
    expect(piano).toBeDefined();
    expect(piano?.kind).toBe("page");
    // En hij staat vooraan: een exacte bestemming wint van een tekstpagina waar
    // het woord toevallig in voorkomt.
    expect(results[0]?.href).toBe("/piano");
  });

  it("vindt diezelfde route ook halverwege het woord", async () => {
    const { results } = await visitorSearch("kalen");
    expect(results.some((r) => r.href === "/kalender")).toBe(true);
  });

  it("valt terug op zoeken per woordbegin wanneer het hele woord niets geeft", async () => {
    // `websearch_to_tsquery` zoekt via de stammer op hele woorden, dus een
    // half woord levert niets op. Dan pas komt de tweede poging met `:*`.
    const half = TERM.slice(0, 8);
    const { results } = await visitorSearch(half);
    expect(results.map((r) => r.id)).toContain(ids.publishedPage);
  });

  it("vindt ook een half woord dat de stammer zou verminken", async () => {
    // Dit is het geval waar "uitleen" op stukliep: de stammer maakt van `veer`
    // het woord `ver`, en `...ver:*` matcht `...veerdienst` niet. Slaagt deze
    // test, dan draait de tweede poging naast de taalconfiguratie ook op
    // `simple`, die niet stemt.
    const { results } = await visitorSearch(COMPOUND_PREFIX);
    expect(results.map((r) => r.id)).toContain(ids.compoundPage);
  });

  it("houdt de zichtbaarheidsregels ook in die tweede poging aan", async () => {
    // De tweede poging is een tweede query; als daar de where-regels ontbreken,
    // lekt er een concept-pagina of een concept-evenement doorheen.
    const half = TERM.slice(0, 8);
    const { results } = await visitorSearch(half);
    expect(results.map((r) => r.id)).not.toContain(ids.draftPage);
    expect(results.map((r) => r.id)).not.toContain(ids.draftEvent);
  });

  it("toont een adres maar één keer", async () => {
    const { results } = await visitorSearch("piano");
    const hrefs = results.map((r) => r.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("houdt uitleenmateriaal weg bij een niet-ingelogde bezoeker", async () => {
    // De catalogus zit in de logistiek-app achter een login. Materiaalnamen in
    // een publieke resultatenlijst zetten zou die keuze langs de achterdeur
    // ongedaan maken, dus dit is de regel die bewaakt moet worden.
    const { results } = await visitorSearch(TERM);
    expect(results.map((r) => r.id)).not.toContain(ids.material);
    const alleTekst = results
      .map((r) => `${r.title} ${r.snippet.map((p) => p.text).join(" ")}`)
      .join(" ");
    expect(alleTekst).not.toContain("Beamer");
  });

  it("toont het wel aan een ingelogd lid, met een link naar de logistiek-app", async () => {
    const { results } = await memberSearch(TERM);
    const materiaal = results.find((r) => r.id === ids.material);
    expect(materiaal).toBeDefined();
    expect(materiaal?.kind).toBe("material");
    expect(materiaal?.href).toBe(`${LOGISTIEK_URL}/materiaal/${ids.material}`);
  });

  it("laat materiaal dat uit de catalogus gehaald is nergens zien", async () => {
    const { results } = await memberSearch(TERM);
    expect(results.map((r) => r.id)).not.toContain(ids.inactiveMaterial);
  });
});
