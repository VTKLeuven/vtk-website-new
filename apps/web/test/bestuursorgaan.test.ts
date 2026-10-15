import { describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import { figuresFromXlsx } from "@/lib/bo/figures";
import { buildOverview, statsOf, type DocInput, type MeetingInput, type PostRow } from "@/lib/bo/dossiers";
import {
  folderKind,
  normalizeKey,
  parseDocumentName,
  parseDriveId,
  parseMeetingFolderName,
  parseYearFolderName,
  resolveMeetingDate,
} from "@/lib/bo/names";
import { resolvePost, splitPost } from "@/lib/bo/posts";
import { toExplorerData } from "@/lib/bo/explorer";
import { groupByMeeting, groupDossiers, matchesFilters } from "@/lib/bo/list";

/*
 * Het overzicht van het Bestuursorgaan. De namen hieronder komen letterlijk uit
 * de BO-map van 26-27; de rekenbladen zijn nagebouwd met de vorm van het
 * sjabloon van de penning, want de echte dragen namen van verantwoordelijken.
 */

describe("bestandsnamen", () => {
  it.each([
    ["26-27_Budget_Theokot_Frigo", { year: 2026, kind: "BUDGET", post: "Theokot", activity: "Frigo" }],
    ["26-27_budget_cursusdienst_zakjes", { year: 2026, kind: "BUDGET", post: "cursusdienst", activity: "zakjes" }],
    ["26-27_Budget_Sport: VTKlimmen", { year: 2026, kind: "BUDGET", post: "Sport", activity: "VTKlimmen" }],
    ["26-27_Budget_Fakbar_Pirates of the fakbar.xlsx", { year: 2026, kind: "BUDGET", post: "Fakbar", activity: "Pirates of the fakbar" }],
    ["26-27_Budget_Statix_Ontbijt .xlsx", { year: 2026, kind: "BUDGET", post: "Statix", activity: "Ontbijt" }],
    ["26-27_Cultuur_Budget_VTK-Reis_Vluchten.xlsx", { year: 2026, kind: "BUDGET", post: "Cultuur", activity: "VTK-Reis Vluchten" }],
    ["26-27_Development_ECC.xlsx", { year: 2026, kind: null, post: "Development", activity: "ECC" }],
    ["26-27_Resultaat_Vice_Teambuilding_Onthaaldagen", { year: 2026, kind: "RESULT", post: "Vice", activity: "Teambuilding Onthaaldagen" }],
    ["25-26_Resultaat_Onthaal_flyers.xlsx", { year: 2025, kind: "RESULT", post: "Onthaal", activity: "flyers" }],
    ["Budget Sport VTKlimmen", { year: null, kind: "BUDGET", post: "Sport", activity: "VTKlimmen" }],
  ])("%s", (name, expected) => {
    expect(parseDocumentName(name)).toEqual(expected);
  });

  it("ziet 'Budget' in een activiteit niet als het soort", () => {
    expect(parseDocumentName("26-27_Resultaat_IT_Budget_Router").kind).toBe("RESULT");
    expect(parseDocumentName("26-27_Resultaat_IT_Budget_Router").activity).toBe("Budget Router");
  });

  it("maakt van schrijfwijzen dezelfde sleutel", () => {
    expect(normalizeKey("Familie- en vriendencantus")).toBe(normalizeKey("Familie en Vriendencantus"));
    expect(normalizeKey("Praatcafé zij-instromers")).toBe("praatcafezijinstromers");
    expect(normalizeKey("Studiesessies TTT s")).toBe(normalizeKey("Studiesessies TTT's"));
  });

  it("leest Budgetten en Resultaten uit een mapnaam", () => {
    expect(folderKind("Budgetten")).toBe("BUDGET");
    expect(folderKind("Resultaten")).toBe("RESULT");
    expect(folderKind("Verslagen")).toBeNull();
  });
});

describe("mappen", () => {
  it.each([
    ["BO 5 - 20/09", { kind: "MEETING", number: 5, day: 20, month: 9 }],
    ["BO 7 - 4/10", { kind: "MEETING", number: 7, day: 4, month: 10 }],
    ["BO 4 - Begrotings BO - 11/09", { kind: "BUDGET_MEETING", number: 4, day: 11, month: 9 }],
    ["Schriftelijke goedkeuring", { kind: "WRITTEN", number: null, day: null, month: null }],
  ])("%s", (name, expected) => {
    expect(parseMeetingFolderName(name)).toEqual(expected);
  });

  it("slaat een map over die geen vergadering is", () => {
    expect(parseMeetingFolderName("Sjablonen")).toBeNull();
  });

  it("vindt het werkingsjaar van een jaarmap", () => {
    expect(parseYearFolderName("2026 - 2027 Tortubois")).toBe(2026);
    expect(parseYearFolderName("26-27")).toBe(2026);
    expect(parseYearFolderName("2026 - 2028")).toBeNull();
    expect(parseYearFolderName("Archief")).toBeNull();
  });

  it("legt BO 0 in juni vóór het werkingsjaar, en een BO in juni aan het eind erna", () => {
    // BO 0 - 25/06: de map werd eind mei aangemaakt.
    expect(resolveMeetingDate(25, 6, 2026, new Date("2026-05-31")).toISOString().slice(0, 10)).toBe("2026-06-25");
    // Een BO op 20/06 aan het eind van het jaar, map een week ervoor aangemaakt.
    expect(resolveMeetingDate(20, 6, 2026, new Date("2027-06-12")).toISOString().slice(0, 10)).toBe("2027-06-20");
    expect(resolveMeetingDate(18, 10, 2026, new Date("2026-10-11")).toISOString().slice(0, 10)).toBe("2026-10-18");
    expect(resolveMeetingDate(15, 1, 2026, new Date("2027-01-08")).toISOString().slice(0, 10)).toBe("2027-01-15");
  });

  it("haalt de id uit een link", () => {
    expect(parseDriveId("https://drive.google.com/drive/folders/0AGJBiNbDO55LUk9PVA")).toBe("0AGJBiNbDO55LUk9PVA");
    expect(parseDriveId("https://drive.google.com/drive/u/1/folders/1abcDEFghiJKLmno?usp=sharing")).toBe("1abcDEFghiJKLmno");
    expect(parseDriveId("1abcDEFghiJKLmno")).toBe("1abcDEFghiJKLmno");
    expect(parseDriveId("https://example.com")).toBeNull();
  });
});

const POSTS: PostRow[] = [
  { id: "g5", code: "GROEP5", slug: "groep-5", nameNl: "Groep 5", nameEn: "Group 5", orderInPraesidium: 1, type: "PRAESIDIUM" },
  { id: "acti", code: "ACTIVITEITEN", slug: "activiteiten", nameNl: "Activiteiten", nameEn: "Activities", orderInPraesidium: 2, type: "PRAESIDIUM" },
  { id: "cult", code: "CULTUUR", slug: "cultuur", nameNl: "Cultuur", nameEn: "Culture", orderInPraesidium: 5, type: "PRAESIDIUM" },
  { id: "curs", code: "CURSUSDIENST", slug: "cursusdienst", nameNl: "Cursusdienst", nameEn: "Course Shop", orderInPraesidium: 6, type: "PRAESIDIUM" },
  { id: "it", code: "IT", slug: "it", nameNl: "IT", nameEn: "IT", orderInPraesidium: 10, type: "PRAESIDIUM" },
  { id: "onth", code: "ONTHAAL", slug: "onthaal", nameNl: "Onthaal", nameEn: "Welcome", orderInPraesidium: 13, type: "PRAESIDIUM" },
  { id: "sport", code: "SPORT", slug: "sport", nameNl: "Sport", nameEn: "Sports", orderInPraesidium: 14, type: "PRAESIDIUM" },
];

describe("posten", () => {
  const none = new Map<string, string>();

  it("herkent een naam, een code en een afkorting", () => {
    expect(resolvePost("Onthaal", POSTS, none)).toBe("onth");
    expect(resolvePost("cursusdienst", POSTS, none)).toBe("curs");
    expect(resolvePost("IT", POSTS, none)).toBe("it");
    expect(resolvePost("Acti", POSTS, none)).toBe("acti");
  });

  it("laat een afkorting van twee posten open", () => {
    // "Cu" is te kort, "Cul" past enkel op Cultuur, "Cur" enkel op Cursusdienst.
    expect(resolvePost("Cu", POSTS, none)).toBeNull();
    expect(resolvePost("Cul", POSTS, none)).toBe("cult");
    const twins = [...POSTS, { ...POSTS[2], id: "cult2", code: "CULTUURRAAD", slug: "cultuurraad", nameNl: "Cultuurraad", nameEn: "Culture council" }];
    expect(resolvePost("Cult", twins, none)).toBeNull();
  });

  it("volgt een alias van Groep 5", () => {
    expect(resolvePost("Vice", POSTS, none)).toBeNull();
    expect(resolvePost("Vice", POSTS, new Map([["vice", "g5"]]))).toBe("g5");
  });

  it("splitst een post met een spatie in plaats van een underscore", () => {
    expect(splitPost("Sport VTKlimmen", null, POSTS, none)).toEqual({ label: "Sport", groupId: "sport", activity: "VTKlimmen" });
    expect(splitPost("Vice", "LOKO", POSTS, none)).toEqual({ label: "Vice", groupId: null, activity: "LOKO" });
  });
});

// ---------------------------------------------------------------------------
// Rekenbladen
// ---------------------------------------------------------------------------

type XCell = { value: string | number | Date; type?: unknown; format?: string } | null;
const t = (value: string): XCell => ({ value, type: String });
const n = (value: number): XCell => ({ value, type: Number });

/** Een rij met cellen op hun kolom (1 = A). */
function row(cells: Record<number, XCell>, width = 16): XCell[] {
  return Array.from({ length: width }, (_, i) => cells[i + 1] ?? null);
}

/**
 * Het sjabloon zoals het in de BO-map staat: de post en de activiteit op rij 1,
 * het blok Overzicht vanaf rij 4, Info rechts, en `totalRow` waar de regel
 * Totaal staat (die schuift mee met het aantal kostenposten).
 */
function templateRows({
  post = "Activiteiten",
  title = "VTKarttornooi",
  income = [240, 0],
  expenses = [1435.6, 0],
  total = [-1195.6, 0],
  allocation = -1200,
  totalRow = 20,
  share,
  date = new Date(Date.UTC(2026, 10, 4)),
}: {
  post?: string;
  title?: string;
  income?: [number, number];
  expenses?: [number, number];
  total?: [number, number];
  allocation?: number;
  totalRow?: number;
  share?: [number, number];
  date?: Date | string;
} = {}): XCell[][] {
  const rows: XCell[][] = Array.from({ length: 30 }, () => row({}));
  rows[0] = row({ 1: t(post), 3: t(title), 16: t("BUDGET") });
  rows[1] = row({ 1: t("Vlaamse Technische Kring VZW") });
  rows[3] = row({ 1: t("Overzicht"), 3: t("Budget"), 4: t("Resultaat"), 6: t("Parameters"), 13: t("Info") });
  rows[4] = row({ 1: t("Inkom"), 3: n(income[0]), 4: n(income[1]), 13: t("Datum"), 14: t("Locatie") });
  rows[5] = row({
    13: date instanceof Date ? { value: date, type: Date, format: "dd/mm/yyyy" } : t(date),
    14: t("Waver"),
  });
  rows[9] = row({ 1: t("Inkomsten"), 3: n(income[0]), 4: n(income[1]) });
  rows[10] = row({ 1: t("Offerte"), 3: n(expenses[0]), 4: n(expenses[1]), 13: t("Organisatie"), 14: t("Verdeling") });
  rows[11] = row(share ? { 13: t("VTK"), 14: n(share[0]) } : { 13: t("VTK"), 14: n(1) });
  if (share) rows[12] = row({ 13: t("Industria"), 14: n(share[1]) });
  rows[totalRow - 3] = row({ 1: t("Uitgaven"), 3: n(expenses[0]), 4: n(expenses[1]) });
  rows[totalRow - 1] = row({ 1: t("Totaal"), 3: n(total[0]), 4: n(total[1]) });
  rows[totalRow] = row({ 1: t("Begroting"), 3: n(allocation), 4: n(allocation) });
  rows[totalRow + 1] = row({ 1: t("Verschil met begroting"), 3: n(total[0] - allocation) });
  // Een kostentabel verder naar onder heeft haar eigen "Totaal" in kolom E.
  rows[28] = row({ 5: t("Totaal"), 10: n(1386) });
  return rows;
}

async function workbook(sheets: { sheet: string; data: XCell[][] }[]): Promise<Buffer> {
  return Buffer.from(await writeXlsxFile(sheets as never).toBuffer());
}

describe("bedragen uit het rekenblad", () => {
  it("leest het blok Overzicht en de info ernaast", async () => {
    const result = figuresFromXlsx(await workbook([{ sheet: "BUDGET - overzicht", data: templateRows() }]));
    expect(result).toEqual({
      figures: {
        sheetPost: "Activiteiten",
        sheetTitle: "VTKarttornooi",
        eventDate: new Date(Date.UTC(2026, 10, 4)),
        budgetIncomeCents: 24000,
        budgetExpenseCents: 143560,
        budgetTotalCents: -119560,
        resultIncomeCents: 0,
        resultExpenseCents: 0,
        resultTotalCents: 0,
        allocationCents: -120000,
        vtkSharePercent: null,
        lines: [
          { label: "Inkom", side: "in", budgetCents: 24000, resultCents: 0 },
          { label: "Offerte", side: "out", budgetCents: 143560, resultCents: 0 },
        ],
        location: "Waver",
      },
    });
  });

  it("vindt Totaal ook wanneer het lager staat, en leest het resultaat", async () => {
    const data = templateRows({ totalRow: 22, total: [-334.56, -205.52], expenses: [490.56, 374.82], income: [156, 169.3] });
    const result = figuresFromXlsx(await workbook([{ sheet: "Blad1", data }]));
    if (!("figures" in result)) throw new Error(result.error);
    expect(result.figures.budgetTotalCents).toBe(-33456);
    expect(result.figures.resultTotalCents).toBe(-20552);
    expect(result.figures.resultIncomeCents).toBe(16930);
  });

  it("neemt het tabblad met het overzicht, ook als er een ander voor staat", async () => {
    const prices = [row({ 1: t("Prijzen") }), row({ 1: t("Bier"), 2: n(1.2) })];
    const result = figuresFromXlsx(
      await workbook([
        { sheet: "Prijzen", data: prices },
        { sheet: "BUDGET - overzicht", data: templateRows() },
      ]),
    );
    expect("figures" in result && result.figures.budgetTotalCents).toBe(-119560);
  });

  it("geeft het deel van VTK bij een gedeelde activiteit", async () => {
    const result = figuresFromXlsx(await workbook([{ sheet: "Blad1", data: templateRows({ share: [0.5, 0.5] }) }]));
    expect("figures" in result && result.figures.vtkSharePercent).toBe(50);
  });

  it("neemt de eerste dag van een datumbereik en negeert het sjabloon", async () => {
    const trip = figuresFromXlsx(await workbook([{ sheet: "Blad1", data: templateRows({ date: "6/7/2027-18/7/2027" }) }]));
    expect("figures" in trip && trip.figures.eventDate).toEqual(new Date(Date.UTC(2027, 6, 6)));
    const empty = figuresFromXlsx(await workbook([{ sheet: "Blad1", data: templateRows({ date: "DD/MM/YYYY" }) }]));
    expect("figures" in empty && empty.figures.eventDate).toBeNull();
  });

  it("zegt waarom er geen bedragen zijn", async () => {
    expect(figuresFromXlsx(await workbook([{ sheet: "Blad1", data: [row({ 1: t("Iets anders") })] }]))).toEqual({
      error: "NO_OVERVIEW",
    });
    expect(figuresFromXlsx(Buffer.from("geen zip"))).toEqual({ error: "UNREADABLE" });
  });
});

// ---------------------------------------------------------------------------
// Het overzicht
// ---------------------------------------------------------------------------

let nextId = 0;
function doc(name: string, extra: Partial<DocInput> & { bo?: number; year?: number } = {}): DocInput {
  const { bo = 5, year = 2026, ...rest } = extra;
  nextId += 1;
  return {
    id: `d${nextId}`,
    name,
    webUrl: `https://drive.google.com/file/d/f${nextId}/view`,
    folderKind: null,
    meeting: {
      id: `m${year}-${bo}`,
      name: `BO ${bo}`,
      kind: "MEETING",
      number: bo,
      date: new Date(Date.UTC(year, 8, bo)),
      workingYear: year,
    },
    sheetPost: null,
    sheetTitle: null,
    eventDate: null,
    budgetTotalCents: null,
    resultTotalCents: null,
    allocationCents: null,
    vtkSharePercent: null,
    figuresError: null,
    missing: false,
    pairedBudgetId: null,
    ...rest,
  };
}

const TODAY = new Date(Date.UTC(2026, 9, 15));

describe("budgetten en resultaten samenleggen", () => {
  it("koppelt een resultaat aan zijn budget, ook met een andere schrijfwijze", () => {
    const overview = buildOverview(
      [
        doc("26-27_Budget_Acti_Familie- en vriendencantus", { budgetTotalCents: -97575, allocationCents: -105000 }),
        doc("26-27_Resultaat_Activiteiten_Familie en Vriendencantus", { bo: 9, resultTotalCents: -90000 }),
      ],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    expect(overview.posts).toHaveLength(1);
    const [dossier] = overview.posts[0].dossiers;
    expect(dossier.status).toBe("DONE");
    expect(dossier.budgetCents).toBe(-97575);
    expect(dossier.resultCents).toBe(-90000);
    expect(dossier.allocationCents).toBe(-105000);
    expect(dossier.budgets.map((b) => b.meetingLabel)).toEqual(["BO 5"]);
    expect(dossier.results.map((r) => r.meetingLabel)).toEqual(["BO 9"]);
  });

  it("onderscheidt een activiteit die nog komt van een waarvan het resultaat ontbreekt", () => {
    const overview = buildOverview(
      [
        doc("26-27_Budget_Acti_VTKarttornooi", { eventDate: new Date(Date.UTC(2026, 10, 4)) }),
        doc("26-27_Budget_Onthaal_Eerstejaarsreceptie", { eventDate: new Date(Date.UTC(2026, 8, 16)) }),
        doc("26-27_Budget_Cultuur_VTKwis"),
      ],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    const status = Object.fromEntries(overview.posts.flatMap((p) => p.dossiers.map((d) => [d.activity, d.status])));
    expect(status).toEqual({ VTKarttornooi: "UPCOMING", Eerstejaarsreceptie: "OPEN", VTKwis: "OPEN" });
    expect(overview.totals.open).toBe(2);
  });

  it("laat de naam winnen van de map, en de map beslissen als de naam zwijgt", () => {
    const overview = buildOverview(
      [
        doc("26-27_Budget_Statix_Ontbijt .xlsx", { folderKind: "RESULT" }),
        doc("26-27_Development_ECC.xlsx", { folderKind: "BUDGET" }),
      ],
      [...POSTS, { id: "dev", code: "DEVELOPMENT", slug: "development", nameNl: "Development", nameEn: "Development", orderInPraesidium: 7, type: "PRAESIDIUM" }],
      new Map(),
      2026,
      TODAY,
    );
    const dossiers = overview.posts.flatMap((p) => p.dossiers);
    const ontbijt = dossiers.find((d) => d.activity === "Ontbijt")!;
    expect(ontbijt.budgets).toHaveLength(1);
    expect(ontbijt.budgets[0].folderConflict).toBe(true);
    expect(dossiers.find((d) => d.activity === "ECC")!.budgets).toHaveLength(1);
  });

  it("vraagt welke post een onbekende naam is, en volgt daarna de alias", () => {
    const docs = [
      doc("26-27_Resultaat_Vice_LOKOMidweek"),
      doc("26-27_Resultaat_Vice_Teambuilding_Onthaaldagen"),
    ];
    const before = buildOverview(docs, POSTS, new Map(), 2026, TODAY);
    expect(before.unknownPosts).toEqual([
      { key: "vice", label: "Vice", files: ["26-27_Resultaat_Vice_LOKOMidweek", "26-27_Resultaat_Vice_Teambuilding_Onthaaldagen"] },
    ]);
    expect(before.posts[0].name).toBe("Vice");

    const after = buildOverview(docs, POSTS, new Map([["vice", "g5"]]), 2026, TODAY);
    expect(after.unknownPosts).toEqual([]);
    expect(after.posts[0].name).toBe("Groep 5");
  });

  it("stelt voor een resultaat zonder budget de open budgetten van de post voor, en volgt een handmatige koppeling", () => {
    const budget = doc("26-27_Budget_Bedrijvenrelaties_SN_Achitectuurontwerp", { budgetTotalCents: 11013 });
    const result = doc("26-27_Resultaat_Bedrijvenrelaties_Sectornight_Architectuur", { bo: 9, resultTotalCents: 9000 });
    const posts = [...POSTS, { id: "br", code: "BEDRIJVENRELATIES", slug: "bedrijvenrelaties", nameNl: "Bedrijvenrelaties", nameEn: "Corporate Relations", orderInPraesidium: 3, type: "PRAESIDIUM" }];

    const loose = buildOverview([budget, result], posts, new Map(), 2026, TODAY);
    expect(loose.pairable).toHaveLength(1);
    expect(loose.pairable[0].candidates).toEqual([{ id: budget.id, label: "SN Achitectuurontwerp (BO 5)" }]);

    const paired = buildOverview([budget, { ...result, pairedBudgetId: budget.id }], posts, new Map(), 2026, TODAY);
    expect(paired.pairable).toEqual([]);
    const [dossier] = paired.posts[0].dossiers;
    expect(dossier.status).toBe("DONE");
    expect(dossier.results[0].paired).toBe(true);
  });

  it("stelt een resultaat van vorig jaar geen budget van dit jaar voor", () => {
    const overview = buildOverview(
      [doc("26-27_Budget_Onthaal_Praatcafé"), doc("25-26_Resultaat_Onthaal_flyers.xlsx", { bo: 6 })],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    expect(overview.pairable).toEqual([]);
    const flyers = overview.posts[0].dossiers.find((d) => d.activity === "flyers")!;
    expect(flyers).toMatchObject({ status: "NO_BUDGET", year: 2025 });
  });

  it("rondt een budget van dit jaar af met een resultaat uit een BO van volgend jaar", () => {
    const overview = buildOverview(
      [doc("26-27_Budget_Sport_VTKlimmen"), doc("26-27_Resultaat_Sport_VTKlimmen", { year: 2027, bo: 1 })],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    expect(overview.posts[0].dossiers[0].status).toBe("DONE");
  });

  it("zet een bestand zonder soort of post bij Na te kijken", () => {
    const overview = buildOverview([doc("Offerte karting")], POSTS, new Map(), 2026, TODAY);
    expect(overview.unclassified.map((u) => u.name)).toEqual(["Offerte karting"]);
    expect(overview.posts).toEqual([]);
  });
});

describe("de cijfers van de verkenner", () => {
  const meetings: MeetingInput[] = [5, 7, 9, 11].map((nr) => ({
    id: `m2026-${nr}`,
    name: `BO ${nr}`,
    kind: "MEETING",
    number: nr,
    date: new Date(Date.UTC(2026, 8, nr)),
    workingYear: 2026,
    webUrl: "https://drive.google.com/drive/folders/x",
    missing: false,
  }));

  it("telt per post enkel wat voorbij is, en rekent dagen tot het resultaat", () => {
    const overview = buildOverview(
      [
        // Afgerond: activiteit 1 sep, resultaat op BO 9 (9 sep): 8 dagen.
        doc("26-27_Budget_IT_Router", { bo: 5, eventDate: new Date(Date.UTC(2026, 8, 1)), budgetTotalCents: -40000, allocationCents: -45000 }),
        doc("26-27_Resultaat_IT_Router", { bo: 9, resultTotalCents: -38000 }),
        // Open: activiteit 1 okt, vandaag 15 okt: 14 dagen.
        doc("26-27_Budget_IT_Server", { bo: 7, eventDate: new Date(Date.UTC(2026, 9, 1)), budgetTotalCents: -120000, allocationCents: -100000 }),
        // Komt nog: telt niet mee in het percentage.
        doc("26-27_Budget_IT_Hackathon", { bo: 7, eventDate: new Date(Date.UTC(2026, 10, 20)), budgetTotalCents: -5000 }),
      ],
      POSTS,
      new Map(),
      2026,
      TODAY,
      true,
      meetings,
    );
    const [it] = overview.posts;
    expect(it.stats).toMatchObject({ due: 2, done: 1, pct: 0.5, open: 1, upcoming: 1, sumDev: 2000, better: 1, avgLagDays: 8, overAllocation: 1 });
    expect(it.stats.oldest).toMatchObject({ activity: "Server", days: 14 });
    const router = it.dossiers.find((d) => d.activity === "Router")!;
    expect(router).toMatchObject({ devCents: 2000, lagDays: 8, overdueDays: null });
    expect(overview.global.pct).toBe(0.5);
  });

  it("zegt per BO wat er passeerde, en welke de volgende is", () => {
    const overview = buildOverview(
      [
        doc("26-27_Budget_IT_Router", { bo: 5, budgetTotalCents: -40000 }),
        doc("26-27_Budget_Sport_VTKlimmen", { bo: 5, budgetTotalCents: -21000 }),
        doc("26-27_Resultaat_IT_Router", { bo: 9, resultTotalCents: -38000 }),
      ],
      POSTS,
      new Map(),
      2026,
      new Date(Date.UTC(2026, 8, 8)),
      true,
      meetings,
    );
    const bo5 = overview.meetings.find((m) => m.id === "m2026-5")!;
    expect(bo5).toMatchObject({ label: "BO 5", sumBudget: -61000, upcoming: false });
    expect(bo5.budgets).toHaveLength(2);
    expect(bo5.postKeys.sort()).toEqual(["g:it", "g:sport"]);
    // Nieuwste eerst, ook een BO waar niets passeerde.
    expect(overview.meetings.map((m) => m.label)).toEqual(["BO 11", "BO 9", "BO 7", "BO 5"]);
    expect(overview.meetings.find((m) => m.id === "m2026-9")).toMatchObject({ upcoming: true, sumResult: -38000 });
  });

  it("neemt de posten uit het resultaat als dat er is", () => {
    const lines = [{ label: "Drank", side: "out" as const, budgetCents: 10000, resultCents: null }];
    const resultLines = [{ label: "Drank", side: "out" as const, budgetCents: 10000, resultCents: 9000 }];
    const overview = buildOverview(
      [
        doc("26-27_Budget_Theokot_Frigo", { lines, location: "Theokot" }),
        doc("26-27_Resultaat_Theokot_Frigo", { bo: 9, lines: resultLines }),
      ],
      POSTS.concat([{ id: "theo", code: "THEOKOT", slug: "theokot", nameNl: "Theokot", nameEn: "Theokot", orderInPraesidium: 15, type: "PRAESIDIUM" }]),
      new Map(),
      2026,
      TODAY,
    );
    expect(overview.posts[0].dossiers[0]).toMatchObject({ lines: resultLines, location: "Theokot" });
  });

  it("geeft lege cijfers zonder dossiers", () => {
    expect(statsOf([])).toMatchObject({ due: 0, pct: null, sumBudget: 0, avgLagDays: null, oldest: null });
  });
});


describe("de lijstweergave", () => {
  const meetings: MeetingInput[] = [5, 9].map((nr) => ({
    id: `m2026-${nr}`,
    name: `BO ${nr}`,
    kind: "MEETING",
    number: nr,
    date: new Date(Date.UTC(2026, 8, nr)),
    workingYear: 2026,
    webUrl: "https://drive.google.com/drive/folders/x",
    missing: false,
  }));
  const data = toExplorerData(
    buildOverview(
      [
        doc("26-27_Budget_IT_Router", { bo: 5, eventDate: new Date(Date.UTC(2026, 8, 1)), budgetTotalCents: -40000 }),
        doc("26-27_Resultaat_IT_Router", { bo: 9, resultTotalCents: -45000 }),
        doc("26-27_Budget_IT_Server", { bo: 5, eventDate: new Date(Date.UTC(2026, 9, 1)), budgetTotalCents: -120000, allocationCents: -100000 }),
        doc("26-27_Budget_Sport_VTKlimmen", { bo: 9, eventDate: new Date(Date.UTC(2026, 10, 20)), budgetTotalCents: -21000 }),
      ],
      POSTS,
      new Map(),
      2026,
      TODAY,
      true,
      meetings,
    ),
    2026,
    TODAY,
  );

  it("filtert met een 'of' tussen de filters, en zoekt in activiteit en post", () => {
    const names = (filters: Parameters<typeof matchesFilters>[1], q = "") =>
      data.dossiers.filter((d) => matchesFilters(d, filters, q)).map((d) => d.activity).sort();
    expect(names(["open"])).toEqual(["Server"]);
    expect(names(["open", "komt"])).toEqual(["Server", "VTKlimmen"]);
    expect(names(["slechter"])).toEqual(["Router"]);
    expect(names(["boven"])).toEqual(["Server"]);
    expect(names([], "sport")).toEqual(["VTKlimmen"]);
  });

  it("groepeert op post, stand en maand, met de cijfers per groep", () => {
    const byPost = groupDossiers(data.dossiers, "post", data.posts, true);
    expect(byPost.map((g) => [g.label, g.stats.done, g.stats.due])).toEqual([
      ["IT", 1, 2],
      ["Sport", 0, 0],
    ]);
    expect(groupDossiers(data.dossiers, "stand", data.posts, true).map((g) => g.label)).toEqual([
      "Resultaat open",
      "Komt nog",
      "Resultaat binnen",
    ]);
    expect(groupDossiers(data.dossiers, "maand", data.posts, true).map((g) => g.label)).toEqual([
      "September 2026",
      "Oktober 2026",
      "November 2026",
    ]);
  });

  it("geeft per BO de bestanden die er passeerden, nieuwste BO eerst", () => {
    const groups = groupByMeeting(data.dossiers, data.meetings);
    expect(groups.map((g) => [g.meeting.label, g.rows.map((r) => `${r.doc.kind} ${r.dossier.activity}`)])).toEqual([
      ["BO 9", ["BUDGET VTKlimmen", "RESULT Router"]],
      ["BO 5", ["BUDGET Router", "BUDGET Server"]],
    ]);
  });
});
