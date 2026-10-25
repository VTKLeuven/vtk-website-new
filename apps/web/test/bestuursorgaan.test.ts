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
import { postOptions, resolvePost, resolvePostKeys, splitPost } from "@/lib/bo/posts";
import { findDossier, toExplorerData } from "@/lib/bo/explorer";
import { groupByMeeting, groupDossiers, matchesFilters } from "@/lib/bo/list";
import { buildSummary } from "@/lib/bo/summary";
import { openResults, ownPostKeys, ownPosts } from "@/lib/bo/own";

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
    // Het jaar anders geschreven dan 26-27.
    ["26_27_Resultaat_Internationaal_Introduction Cantus", { year: 2026, kind: "RESULT", post: "Internationaal", activity: "Introduction Cantus" }],
    ["2627_Budget_Biomedix_SportActivity", { year: 2026, kind: "BUDGET", post: "Biomedix", activity: "SportActivity" }],
    ["2026-2027_Budget_IT_5G router", { year: 2026, kind: "BUDGET", post: "IT", activity: "5G router" }],
    ["26 - 27 Budget IT Router", { year: 2026, kind: "BUDGET", post: "IT", activity: "Router" }],
    // Een datum vooraan en het soort achteraan.
    ["2026/09/07 Eetstand Wiskundeweek Begroting", { year: null, kind: "BUDGET", post: "Eetstand", activity: "Wiskundeweek" }],
    // Het soort en de post in één stuk, met twee posten.
    ["26-27_Budget Cultuur+Onthaal_Jeneverwandeling", { year: 2026, kind: "BUDGET", post: "Cultuur+Onthaal", activity: "Jeneverwandeling" }],
  ])("%s", (name, expected) => {
    expect(parseDocumentName(name)).toEqual(expected);
  });

  it.each([
    ["26-27_BUDGET_WERKGROEPEN_werkgroepen-feestje_v2", "werkgroepen-feestje", 2],
    ["26-27_Budget_Sport_VTKlimmen versie 3.xlsx", "VTKlimmen", 3],
    ["26-27_Budget_Sport_VTKlimmen (1).xlsx", "VTKlimmen", 1],
    ["26-27_Budget_Sport_VTKlimmen_final", "VTKlimmen", 100],
    ["Kopie van 26-27_Budget_Sport_VTKlimmen", "VTKlimmen", 1],
    ["26-27_Budget_Sport_VTKlimmen", "VTKlimmen", undefined],
    // Een woord dat op v2 eindigt, of een activiteit die enkel een versie is, blijft.
    ["26-27_Budget_IT_Serverv2", "Serverv2", undefined],
  ])("haalt de versie uit %s", (name, activity, version) => {
    const parsed = parseDocumentName(name);
    expect(parsed.activity).toBe(activity);
    expect(parsed.version).toBe(version);
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
    // Een datum meteen na BO is geen nummer: dit is geen "BO 30".
    ["BO 30/08", { kind: "MEETING", number: null, day: 30, month: 8 }],
    ["BO 30-06", { kind: "MEETING", number: null, day: 30, month: 6 }],
    ["BO5 - 20/09", { kind: "MEETING", number: 5, day: 20, month: 9 }],
  ])("%s", (name, expected) => {
    expect(parseMeetingFolderName(name)).toEqual(expected);
  });

  it("slaat een map over die geen vergadering is", () => {
    expect(parseMeetingFolderName("Sjablonen")).toBeNull();
    expect(parseMeetingFolderName("BO's oud")).toBeNull();
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

const WERKGROEPEN: PostRow[] = [
  { id: "statix", code: "STATIX", slug: "statix", nameNl: "Statix", nameEn: "Statix", orderInPraesidium: 0, type: "WERKGROEP" },
  { id: "biomedix", code: "BIOMEDIX", slug: "biomedix", nameNl: "Biomedix", nameEn: "Biomedix", orderInPraesidium: 0, type: "WERKGROEP" },
];

describe("posten", () => {
  const none = new Map<string, string[]>();

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

  it("volgt een alias van Groep 5, ook naar twee posten", () => {
    expect(resolvePostKeys("Kringraad", POSTS, none)).toEqual([]);
    expect(resolvePost("Kringraad", POSTS, new Map([["kringraad", ["g:g5"]]]))).toBe("g5");
    expect(resolvePostKeys("WERKGROEPEN", POSTS, new Map([["werkgroepen", ["g:statix", "g:biomedix"]]]))).toEqual([]);
    expect(resolvePostKeys("WERKGROEPEN", [...POSTS, ...WERKGROEPEN], new Map([["werkgroepen", ["g:statix", "g:biomedix"]]]))).toEqual([
      "g:statix",
      "g:biomedix",
    ]);
  });

  it("kent de vier rollen van Groep 5 en de vakken Jaarwerkingen en Overige", () => {
    expect(resolvePostKeys("Praeses", POSTS, none)).toEqual(["x:praeses"]);
    expect(resolvePostKeys("Vice", POSTS, none)).toEqual(["x:vice"]);
    expect(resolvePostKeys("Secretaris", POSTS, none)).toEqual(["x:secretaris"]);
    expect(resolvePostKeys("Beheer", POSTS, none)).toEqual(["x:beheer"]);
    expect(resolvePostKeys("Overige", POSTS, none)).toEqual(["x:overige"]);
    // De rol van Groep 5 wint van een post met dezelfde naam.
    const withBeheer = [...POSTS, { ...POSTS[1], id: "beheer", code: "BEHEER", slug: "beheer", nameNl: "Beheer", nameEn: "Management" }];
    expect(resolvePostKeys("Beheer", withBeheer, none)).toEqual(["x:beheer"]);
  });

  it("herkent twee posten in één naam, maar enkel als beide bestaan", () => {
    expect(resolvePostKeys("Cultuur+Onthaal", POSTS, none)).toEqual(["g:cult", "g:onth"]);
    expect(resolvePostKeys("Cultuur & Onthaal", POSTS, none)).toEqual(["g:cult", "g:onth"]);
    expect(resolvePostKeys("Cultuur+Kringraad", POSTS, none)).toEqual([]);
  });

  it("splitst een post met een spatie of streepje in plaats van een underscore", () => {
    const all = [...POSTS, ...WERKGROEPEN];
    expect(splitPost("Sport VTKlimmen", null, all, none)).toEqual({ label: "Sport", postKeys: ["g:sport"], activity: "VTKlimmen" });
    expect(splitPost("Statix-Talks", null, all, none)).toEqual({ label: "Statix", postKeys: ["g:statix"], activity: "Talks" });
    expect(splitPost("Kringraad", "LOKO", all, none)).toEqual({ label: "Kringraad", postKeys: [], activity: "LOKO" });
  });

  it("geeft elke jaarwerking haar eigen vak", () => {
    expect(splitPost("Halftime", "GoGlobal", POSTS, none)).toEqual({ label: "Halftime", postKeys: ["x:halftime"], activity: "GoGlobal" });
    expect(splitPost("Studentenwelkom", null, POSTS, none)).toEqual({ label: "Studentenwelkom", postKeys: ["x:studentenwelkom"], activity: null });
    expect(splitPost("Skireis", "Bus", POSTS, none)).toEqual({ label: "Skireis", postKeys: ["x:skireis"], activity: "Bus" });
    // Een jaarwerking die er niet bij staat: de naam gaat voor de activiteit.
    expect(splitPost("Jaarwerkingen", "Galabal", POSTS, none)).toEqual({ label: "Jaarwerkingen", postKeys: ["x:jaarwerkingen"], activity: "Galabal" });
  });

  it("leest WG en JW als het soort post, met de post erna", () => {
    const all = [...POSTS, ...WERKGROEPEN];
    expect(splitPost("WG", "Statix Day", all, none)).toEqual({ label: "Statix", postKeys: ["g:statix"], activity: "Day" });
    expect(splitPost("WG - Statix", "Day", all, none)).toEqual({ label: "Statix", postKeys: ["g:statix"], activity: "Day" });
    expect(splitPost("JW", "Halftime GoGlobal", all, none)).toEqual({ label: "Halftime", postKeys: ["x:halftime"], activity: "GoGlobal" });
    // "WERKGROEPEN" is alle werkgroepen samen, geen soort.
    expect(splitPost("WERKGROEPEN", "feestje", all, none).postKeys).toEqual([]);
  });

  it("biedt de posten aan per vak, Groep 5 met haar rollen eerst", () => {
    const options = postOptions([...POSTS, ...WERKGROEPEN], true);
    expect(options.slice(0, 5).map((o) => o.name)).toEqual(["Groep 5", "Praeses", "Vice-praeses", "Secretaris", "Beheer"]);
    expect([...new Set(options.map((o) => o.group))]).toEqual(["Groep 5", "Posten", "Werkgroepen", "Jaarwerkingen", "Overige"]);
    expect(options.filter((o) => o.group === "Jaarwerkingen").map((o) => o.name)).toEqual([
      "Kanweek",
      "Parttime",
      "Halftime",
      "Fulltime",
      "Overtime",
      "Duplex",
      "Triplex",
      "Skireis",
      "Studentenwelkom",
      "Andere jaarwerking",
    ]);
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

  it("laat een onmogelijke datum weg in plaats van te falen", async () => {
    // Een typfout in het jaar gaf "+020026-03-05", en Postgres weigerde de rij.
    const typo = figuresFromXlsx(await workbook([{ sheet: "Blad1", data: templateRows({ date: "5/3/20026" }) }]));
    expect("figures" in typo && typo.figures.eventDate).toBeNull();
    const serial = figuresFromXlsx(await workbook([{ sheet: "Blad1", data: templateRows({ date: new Date(Date.UTC(20026, 2, 5)) }) }]));
    expect("figures" in serial && serial.figures.eventDate).toBeNull();
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

  it("rekent op de BO van het budget, niet op de datum in het rekenblad", () => {
    // Vandaag 10 september: BO 5 was, BO 12 komt nog.
    const today = new Date(Date.UTC(2026, 8, 10));
    const overview = buildOverview(
      [
        // Een activiteit in november op een BO die al was: open sinds die BO.
        doc("26-27_Budget_Acti_VTKarttornooi", { bo: 5, eventDate: new Date(Date.UTC(2026, 10, 4)) }),
        doc("26-27_Budget_Cultuur_VTKwis", { bo: 5 }),
        // Op een BO die nog moet komen: niemand wacht al op een resultaat.
        doc("26-27_Budget_Onthaal_Eerstejaarsreceptie", { bo: 12 }),
      ],
      POSTS,
      new Map(),
      2026,
      today,
    );
    const dossiers = overview.posts.flatMap((p) => p.dossiers);
    const status = Object.fromEntries(dossiers.map((d) => [d.activity, [d.status, d.overdueDays]]));
    expect(status).toEqual({ VTKarttornooi: ["OPEN", 5], VTKwis: ["OPEN", 5], Eerstejaarsreceptie: ["UPCOMING", null] });
    expect(dossiers.find((d) => d.activity === "VTKarttornooi")).toMatchObject({
      date: new Date(Date.UTC(2026, 8, 5)),
      eventDate: new Date(Date.UTC(2026, 10, 4)),
    });
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
    const docs = [doc("26-27_Resultaat_Kringraad_LOKOMidweek"), doc("26-27_Resultaat_Kringraad_Teambuilding_Onthaaldagen")];
    const before = buildOverview(docs, POSTS, new Map(), 2026, TODAY);
    expect(before.unknownPosts).toEqual([
      {
        key: "kringraad",
        label: "Kringraad",
        files: docs.map((d) => ({ id: d.id, name: d.name })),
        perDocument: false,
      },
    ]);
    expect(before.posts[0]).toMatchObject({ name: "Kringraad", section: "unknown" });

    const after = buildOverview(docs, POSTS, new Map([["kringraad", ["g:g5"]]]), 2026, TODAY);
    expect(after.unknownPosts).toEqual([]);
    expect(after.posts[0]).toMatchObject({ name: "Groep 5", section: "g5" });
  });

  it("vraagt een naam met enkel een datum per bestand", () => {
    const overview = buildOverview([doc("2026/09/07 Begroting")], POSTS, new Map(), 2026, TODAY);
    expect(overview.unknownPosts.map((u) => u.perDocument)).toEqual([true]);
  });

  it("zet de rollen van Groep 5 voor de posten, en Jaarwerkingen achteraan", () => {
    const overview = buildOverview(
      [
        doc("26-27_Budget_Halftime_GoGlobal"),
        doc("26-27_Budget_Sport_VTKlimmen"),
        doc("26-27_Budget_Praeses_Faculteitsetentje"),
        doc("26-27_Budget_Vice_LOKO"),
      ],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    expect(overview.posts.map((p) => [p.name, p.section])).toEqual([
      ["Praeses", "g5"],
      ["Vice-praeses", "g5"],
      ["Sport", "post"],
      ["Halftime", "jaarwerking"],
    ]);
    expect(overview.posts[3].dossiers[0].activity).toBe("GoGlobal");
  });

  it("telt een budget van twee posten bij elk, en één keer in het totaal", () => {
    const overview = buildOverview(
      [
        doc("26-27_Budget Cultuur+Onthaal_Jeneverwandeling", { budgetTotalCents: -30000, eventDate: new Date(Date.UTC(2026, 9, 1)) }),
        doc("26-27_Resultaat_Cultuur_Jeneverwandeling", { bo: 9, resultTotalCents: -25000 }),
      ],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    expect(overview.posts.map((p) => p.name)).toEqual(["Cultuur", "Onthaal"]);
    const [cultuur, onthaal] = overview.posts;
    expect(cultuur.dossiers[0].key).toBe(onthaal.dossiers[0].key);
    expect(cultuur.dossiers[0]).toMatchObject({ postKeys: ["g:cult", "g:onth"], status: "DONE", devCents: 5000 });
    expect(overview.global).toMatchObject({ budgets: 1, done: 1, sumBudget: -30000 });
    expect(overview.pairable).toEqual([]);
  });

  it("maakt van een tweede versie een nieuwe versie van hetzelfde budget", () => {
    const overview = buildOverview(
      [
        doc("26-27_Budget_Sport_VTKlimmen", { bo: 5, budgetTotalCents: -37094 }),
        doc("26-27_Budget_Sport_VTKlimmen_v2", { bo: 5, budgetTotalCents: -39400 }),
      ],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    const dossiers = overview.posts.flatMap((p) => p.dossiers);
    expect(dossiers).toHaveLength(1);
    // Op dezelfde BO wint de hoogste versie.
    expect(dossiers[0]).toMatchObject({ activity: "VTKlimmen", budgetCents: -39400 });
    expect(dossiers[0].budgets.map((b) => b.name)).toEqual(["26-27_Budget_Sport_VTKlimmen", "26-27_Budget_Sport_VTKlimmen_v2"]);
  });

  it("telt hetzelfde bestand in twee BO-mappen één keer, op de eerste BO", () => {
    const overview = buildOverview(
      [
        doc("26-27_Budget_Vice_Praesidiumweekend", { bo: 30, driveFileId: "same" }),
        doc("26-27_Budget_Vice_Praesidiumweekend", { bo: 1, driveFileId: "same" }),
      ],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    const [dossier] = overview.posts[0].dossiers;
    expect(dossier.budgets.map((b) => [b.meetingLabel, b.alsoIn])).toEqual([["BO 1", ["BO 30"]]]);
    expect(overview.global.budgets).toBe(1);
  });

  // Stadsspel van Onthaal in 26-27: de post vulde de kolom Resultaat in het
  // budgetblad in, hernoemde het tot "Resultaat" en hing het in BO 9. De
  // snelkoppeling in BO 3 heet nog "Budget".
  const stadsspel = (extra: Partial<DocInput> & { bo?: number } = {}) =>
    doc("26-27_Resultaat_Onthaal_Stadsspel", {
      driveFileId: "stadsspel",
      budgetTotalCents: -6000,
      resultTotalCents: -5123,
      ...extra,
    });

  it("leest een blad dat later tot resultaat hernoemd werd als budget op de eerste BO", () => {
    const overview = buildOverview(
      [
        stadsspel({ bo: 3, folderKind: "BUDGET", linkName: "26-27_Budget_Onthaal_Stadsspel" }),
        stadsspel({ bo: 9, folderKind: "RESULT", linkName: "26-27_Resultaat_Onthaal_Stadsspel" }),
      ],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    const [dossier] = overview.posts[0].dossiers;
    expect(dossier).toMatchObject({ activity: "Stadsspel", status: "DONE", budgetCents: -6000, resultCents: -5123, devCents: 877 });
    expect(dossier.budgets.map((b) => [b.name, b.meetingLabel, b.sharedSheet, b.folderConflict])).toEqual([
      ["26-27_Budget_Onthaal_Stadsspel", "BO 3", true, false],
    ]);
    expect(dossier.results.map((r) => [r.name, r.meetingLabel, r.sharedSheet, r.alsoIn])).toEqual([
      ["26-27_Resultaat_Onthaal_Stadsspel", "BO 9", true, []],
    ]);
    expect(overview.pairable).toEqual([]);
    expect(overview.totals).toMatchObject({ budgets: 1, results: 1 });
  });

  it("volgt de map wanneer de oude naam nergens meer staat", () => {
    // Een werkgroep hangt haar map in de BO-map: geen snelkoppeling per blad,
    // en voor de scan de nieuwe naam liest, is er ook nog geen.
    const overview = buildOverview(
      [stadsspel({ bo: 3, folderKind: "BUDGET" }), stadsspel({ bo: 9, folderKind: "RESULT" })],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    const [dossier] = overview.posts[0].dossiers;
    expect(dossier.status).toBe("DONE");
    expect(dossier.budgets.map((b) => b.meetingLabel)).toEqual(["BO 3"]);
    expect(dossier.results.map((r) => r.meetingLabel)).toEqual(["BO 9"]);
  });

  it("houdt een hernoemd budget open tot het resultaat op een BO komt", () => {
    const overview = buildOverview(
      [stadsspel({ bo: 3, folderKind: "BUDGET", linkName: "26-27_Budget_Onthaal_Stadsspel" })],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    expect(overview.posts[0].dossiers[0]).toMatchObject({ status: "OPEN", budgetCents: -6000, resultCents: null });
    expect(overview.pairable).toEqual([]);
  });

  it("laat de naam winnen bij een budget dat op een latere BO in Resultaten belandde", () => {
    const overview = buildOverview(
      [
        doc("26-27_Budget_Theokot_Frigo", { bo: 3, driveFileId: "frigo", folderKind: "BUDGET" }),
        doc("26-27_Budget_Theokot_Frigo", { bo: 9, driveFileId: "frigo", folderKind: "RESULT" }),
      ],
      [...POSTS, { id: "theo", code: "THEOKOT", slug: "theokot", nameNl: "Theokot", nameEn: "Theokot", orderInPraesidium: 15, type: "PRAESIDIUM" }],
      new Map(),
      2026,
      TODAY,
    );
    const [dossier] = overview.posts[0].dossiers;
    expect(dossier.status).toBe("OPEN");
    expect(dossier.budgets.map((b) => [b.meetingLabel, b.alsoIn, b.sharedSheet])).toEqual([["BO 3", ["BO 9"], false]]);
  });

  it("laat een bestand dat niet meetelt overal weg", () => {
    const overview = buildOverview(
      [doc("26-27_Budget_Sport_VTKlimmen", { budgetTotalCents: -21000 }), doc("Offerte karting", { hidden: true }), doc("26-27_Budget_Sport_Oud", { hidden: true })],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    expect(overview.posts.flatMap((p) => p.dossiers.map((d) => d.activity))).toEqual(["VTKlimmen"]);
    expect(overview.unclassified).toEqual([]);
    expect(overview.global.budgets).toBe(1);
  });

  it("houdt een naam die geen post is bij de activiteit, wanneer de post met de hand gekozen is", () => {
    const overview = buildOverview(
      [doc("2026/09/07 Eetstand Wiskundeweek Begroting", { postKeysOverride: ["g:onth"] })],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    expect(overview.posts.map((p) => p.name)).toEqual(["Onthaal"]);
    expect(overview.posts[0].dossiers[0].activity).toBe("Eetstand Wiskundeweek");
    expect(overview.unknownPosts).toEqual([]);
  });

  it("volgt een post die met de hand gekozen is, boven de naam", () => {
    const overview = buildOverview(
      [doc("26-27_Budget_Sport_Cantus", { postKeysOverride: ["g:cult"] })],
      POSTS,
      new Map(),
      2026,
      TODAY,
    );
    expect(overview.posts.map((p) => p.name)).toEqual(["Cultuur"]);
    expect(overview.posts[0].dossiers[0]).toMatchObject({ overridden: true });
  });

  it("rondt een resultaat af dat versneld door de grocomeet ging, zonder afwijking", () => {
    const result = doc("26-27_Resultaat_IT_5G router", { bo: 9, resultTotalCents: -12000, budgetWaiver: "grocomeet" });
    const overview = buildOverview([result], POSTS, new Map(), 2026, TODAY);
    expect(overview.pairable).toEqual([]);
    expect(overview.posts[0].dossiers[0]).toMatchObject({ status: "DONE", waiver: "grocomeet", devCents: null });
    expect(overview.global).toMatchObject({ done: 1, due: 1 });
  });

  it("toont geen datum uit het rekenblad die niet bij de BO's past, zoals uit een oud sjabloon", () => {
    const meetings: MeetingInput[] = [5].map((nr) => ({
      id: `m2026-${nr}`,
      name: `BO ${nr}`,
      kind: "MEETING",
      number: nr,
      date: new Date(Date.UTC(2026, 8, nr)),
      workingYear: 2026,
      webUrl: "https://drive.google.com/drive/folders/x",
      missing: false,
    }));
    const overview = buildOverview(
      [doc("26-27_Budget_Sport_VTKlimmen", { eventDate: new Date(Date.UTC(2004, 8, 1)) })],
      POSTS,
      new Map(),
      2026,
      TODAY,
      true,
      meetings,
    );
    const [dossier] = overview.posts[0].dossiers;
    expect(dossier.eventDate).toBeNull();
    // Open sinds de BO van het budget (5 sep), niet sinds 2004.
    expect(dossier).toMatchObject({ status: "OPEN", overdueDays: 40 });
  });

  it("stelt voor een resultaat zonder budget de open budgetten van de post voor, en volgt een handmatige koppeling", () => {
    const budget = doc("26-27_Budget_Bedrijvenrelaties_SN_Achitectuurontwerp", { budgetTotalCents: 11013 });
    const result = doc("26-27_Resultaat_Bedrijvenrelaties_Sectornight_Architectuur", { bo: 9, resultTotalCents: 9000 });
    const posts = [...POSTS, { id: "br", code: "BEDRIJVENRELATIES", slug: "bedrijvenrelaties", nameNl: "Bedrijvenrelaties", nameEn: "Corporate Relations", orderInPraesidium: 3, type: "PRAESIDIUM" }];

    const loose = buildOverview([budget, result], posts, new Map(), 2026, TODAY);
    expect(loose.pairable).toHaveLength(1);
    expect(loose.pairable[0].candidates).toEqual([{ id: budget.id, label: "SN Achitectuurontwerp (BO 5)", group: "Bedrijvenrelaties" }]);

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
    // Vandaag 10 september.
    const overview = buildOverview(
      [
        // Afgerond: budget op BO 5 (5 sep), resultaat op BO 9 (9 sep): 4 dagen.
        doc("26-27_Budget_IT_Router", { bo: 5, budgetTotalCents: -40000, allocationCents: -45000 }),
        doc("26-27_Resultaat_IT_Router", { bo: 9, resultTotalCents: -38000 }),
        // Open: budget op BO 7 (7 sep): 3 dagen.
        doc("26-27_Budget_IT_Server", { bo: 7, budgetTotalCents: -120000, allocationCents: -100000 }),
        // Op BO 11, die nog komt: telt niet mee in het percentage.
        doc("26-27_Budget_IT_Hackathon", { bo: 11, budgetTotalCents: -5000 }),
      ],
      POSTS,
      new Map(),
      2026,
      new Date(Date.UTC(2026, 8, 10)),
      true,
      meetings,
    );
    const [it] = overview.posts;
    expect(it.stats).toMatchObject({ due: 2, done: 1, pct: 0.5, open: 1, upcoming: 1, sumDev: 2000, better: 1, avgLagDays: 4, overAllocation: 1 });
    expect(it.stats.oldest).toMatchObject({ activity: "Server", days: 3 });
    const router = it.dossiers.find((d) => d.activity === "Router")!;
    expect(router).toMatchObject({ devCents: 2000, lagDays: 4, overdueDays: null });
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
  // BO 35 valt op 5 oktober en BO 70 op 9 november: Date.UTC telt door.
  const meetings: MeetingInput[] = [5, 9, 35, 70].map((nr) => ({
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
        doc("26-27_Budget_IT_Router", { bo: 5, budgetTotalCents: -40000 }),
        doc("26-27_Resultaat_IT_Router", { bo: 9, resultTotalCents: -45000 }),
        doc("26-27_Budget_IT_Server", { bo: 35, budgetTotalCents: -120000, allocationCents: -100000 }),
        doc("26-27_Budget_Sport_VTKlimmen", { bo: 70, budgetTotalCents: -21000 }),
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

  it("vindt een activiteit terug nadat haar post veranderde", () => {
    const router = data.dossiers.find((d) => d.activity === "Router")!;
    expect(findDossier(data.dossiers, router.key)).toBe(router);
    expect(findDossier(data.dossiers, router.key.replace("g:it", "g:sport"))).toBe(router);
    expect(findDossier(data.dossiers, "2026|g:it|bestaatniet")).toBeNull();
  });

  it("geeft per BO de bestanden die er passeerden, nieuwste BO eerst", () => {
    const groups = groupByMeeting(data.dossiers, data.meetings);
    expect(groups.map((g) => [g.meeting.label, g.rows.map((r) => `${r.doc.kind} ${r.dossier.activity}`)])).toEqual([
      ["BO 70", ["BUDGET VTKlimmen"]],
      ["BO 35", ["BUDGET Server"]],
      ["BO 9", ["RESULT Router"]],
      ["BO 5", ["BUDGET Router"]],
    ]);
  });
});

describe("het overzicht per post (voor de slide)", () => {
  const meetings: MeetingInput[] = [5, 9, 40].map((nr) => ({
    id: `m2026-${nr}`,
    name: `BO ${nr}`,
    kind: "MEETING",
    number: nr,
    date: new Date(Date.UTC(2026, 8, nr)),
    workingYear: 2026,
    webUrl: "https://drive.google.com/drive/folders/x",
    missing: false,
  }));
  const posts = [...POSTS, ...WERKGROEPEN];
  // Vandaag 15 oktober: BO 40 valt op 10 oktober, dus die was al.
  const data = toExplorerData(
    buildOverview(
      [
        doc("26-27_Budget_IT_Router", { bo: 5 }),
        doc("26-27_Resultaat_IT_Router", { bo: 9 }),
        doc("26-27_Budget_IT_Server", { bo: 9 }),
        doc("26-27_Budget_Statix_Talks", { bo: 9 }),
        doc("26-27_Budget_Kringraad_Iets", { bo: 40 }),
      ],
      posts,
      new Map(),
      2026,
      TODAY,
      true,
      meetings,
    ),
    2026,
    TODAY,
  );
  const summary = buildSummary(data, postOptions(posts, true));
  const rows = Object.fromEntries(summary.sections.flatMap((s) => s.rows.map((r) => [r.name, [r.due, r.done, r.missing, r.pct]])));

  it("toont elke post, ook zonder budget, en een vak voor uitzonderingen enkel als het gebruikt wordt", () => {
    expect(rows.IT).toEqual([2, 1, 1, 0.5]);
    expect(rows.Sport).toEqual([0, 0, 0, null]);
    expect(rows.Halftime).toEqual([0, 0, 0, null]);
    expect(rows.Overige).toBeUndefined();
    expect(rows["Groep 5"]).toBeUndefined();
    // Een naam die de site niet kent, staat er ook, onder Niet herkend.
    expect(summary.sections.at(-1)).toMatchObject({ section: "unknown", rows: [{ name: "Kringraad", due: 1 }] });
  });

  it("splitst de totalen in VTK en werkgroepen, en noemt de laatste BO", () => {
    expect(summary.total).toMatchObject({ due: 4, done: 1 });
    expect(summary.vtk).toMatchObject({ due: 3, done: 1 });
    expect(summary.werkgroepen).toMatchObject({ due: 1, done: 0, pct: 0 });
    expect(summary.lastMeeting).toBe("BO 40");
  });
});

describe("wat een post zelf ziet", () => {
  const ownGroups = (codes: string[]) =>
    POSTS.filter((p) => codes.includes(p.code)).map(({ id, code, slug, nameNl, nameEn }) => ({ id, code, slug, nameNl, nameEn }));
  const overview = buildOverview(
    [
      doc("26-27_Budget_Onthaal_Outdoor theokot", { bo: 2 }),
      doc("26-27_Budget_Onthaal_Cantusconvent", { bo: 10 }),
      doc("26-27_Budget_Onthaal_Stadsspel", { bo: 3 }),
      doc("26-27_Resultaat_Onthaal_Stadsspel", { bo: 9 }),
      doc("26-27_Budget_Cultuur+Onthaal_Jeneverwandeling", { bo: 5 }),
      doc("26-27_Budget_Cultuur_Toneel", { bo: 4 }),
      // BO 50 valt op 20 oktober, na vandaag.
      doc("26-27_Budget_Onthaal_Halloween", { bo: 50 }),
      doc("26-27_Budget_Vice_LOKO", { bo: 6 }),
    ],
    POSTS,
    new Map(),
    2026,
    TODAY,
  );
  const data = toExplorerData(overview, 2026, TODAY);

  it("toont enkel de eigen posten, met wat open staat bovenaan", () => {
    const own = ownGroups(["ONTHAAL"]);
    const [onthaal, ...rest] = ownPosts(data, ownPostKeys(own), own, true);
    expect(rest).toEqual([]);
    expect(onthaal.name).toBe("Onthaal");
    // Het langst open eerst, dan wat nog op een BO moet passeren, dan wat af is.
    expect(onthaal.dossiers.map((d) => [d.activity, d.status])).toEqual([
      ["Outdoor theokot", "OPEN"],
      ["Jeneverwandeling", "OPEN"],
      ["Cantusconvent", "OPEN"],
      ["Halloween", "UPCOMING"],
      ["Stadsspel", "DONE"],
    ]);
    expect(onthaal.stats).toMatchObject({ due: 4, done: 1, open: 3, upcoming: 1 });
    // Toneel is van Cultuur alleen en blijft weg.
    expect(onthaal.dossiers.some((d) => d.activity === "Toneel")).toBe(false);
  });

  it("geeft wie in Groep 5 zit ook de vakken van Groep 5, maar enkel als er iets in zit", () => {
    const own = ownGroups(["GROEP5"]);
    expect(ownPostKeys(own)).toEqual(["g:g5", "x:praeses", "x:vice", "x:secretaris", "x:beheer"]);
    // Groep 5 zelf staat er leeg bij: een post zonder budget is ook een antwoord.
    expect(ownPosts(data, ownPostKeys(own), own, true).map((p) => [p.name, p.dossiers.length])).toEqual([
      ["Vice-praeses", 1],
      ["Groep 5", 0],
    ]);
  });

  it("zet op het dashboard enkel de open resultaten", () => {
    const own = ownGroups(["ONTHAAL", "CULTUUR", "IT"]);
    expect(openResults(ownPosts(data, ownPostKeys(own), own, true)).map((p) => [p.name, p.dossiers.map((d) => d.activity)])).toEqual([
      ["Cultuur", ["Toneel", "Jeneverwandeling"]],
      ["Onthaal", ["Outdoor theokot", "Jeneverwandeling", "Cantusconvent"]],
    ]);
  });
});
