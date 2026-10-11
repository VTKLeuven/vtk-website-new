import { describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import { readWorkbook, XlsxError } from "@/lib/praesidiumShifts/xlsx";
import { analyzeEventWorkbook, analyzeWeeklyWorkbook, formatPhone } from "@/lib/praesidiumShifts/analyze";
import {
  isAmbiguousFirstName,
  looksLikeName,
  nameKey,
  parseTimeRange,
  proposeMatch,
  rangeHours,
  splitTimePrefix,
  suggestListName,
  type RosterPerson,
} from "@/lib/praesidiumShifts/names";
import {
  detectedOpenSlots,
  entryWeight,
  memberTotals,
  summarizeList,
  type StatsList,
} from "@/lib/praesidiumShifts/stats";

/*
 * Het shiftenoverzicht van het praesidium. De echte shiftenlijsten staan vol
 * telefoonnummers, dus die gaan de repository niet in: de werkboeken hier zijn
 * nagebouwd met dezelfde vorm (uren bovenaan, kleuren per kring, een
 * overzichtstabblad met nummers, een rooster met een rij per dag).
 */

const GREEN = "#B7E1CD"; // VTK op de cantuslijst
const BLUE = "#6D9EEB"; // Apolloon
const HEADER = "#0B5394";

type Cell = { value: string | number | boolean | Date; type?: unknown; backgroundColor?: string; columnSpan?: number; rowSpan?: number } | null;

function cell(value: string, backgroundColor?: string, extra: Partial<NonNullable<Cell>> = {}): Cell {
  return { value, type: String, ...(backgroundColor ? { backgroundColor } : {}), ...extra };
}

async function xlsx(sheets: { sheet: string; data: Cell[][] }[]): Promise<Buffer> {
  // De bibliotheek kent geen gemengde types per kolom; elke cel draagt het zijne.
  const result = await writeXlsxFile(sheets as never).toBuffer();
  return Buffer.from(result);
}

const roster: RosterPerson[] = [
  { userId: "u-jarne-p", name: "Jarne Plessers", firstName: "Jarne", lastName: "Plessers" },
  { userId: "u-jarne-n", name: "Jarne Neyens", firstName: "Jarne", lastName: "Neyens" },
  { userId: "u-lore-b", name: "Lore Bellen", firstName: "Lore", lastName: "Bellen" },
  { userId: "u-lore-v", name: "Lore Verbeke", firstName: "Lore", lastName: "Verbeke" },
  { userId: "u-emma", name: "Emma Van den Broeck", firstName: "Emma", lastName: "Van den Broeck" },
  { userId: "u-kato", name: "Kato Cuenen", firstName: null, lastName: null },
  { userId: "u-victor", name: "Victor Christiaens", firstName: "Victor", lastName: "Christiaens" },
  { userId: "u-viktor", name: "Viktor Tousseyn", firstName: "Viktor", lastName: "Tousseyn" },
];

describe("tijden op een shiftenlijst", () => {
  it.each([
    ["13u00–14u30", 1.5],
    ["8:00 - 10:00", 2],
    ["21h-23h - Parking E", 2],
    ["19-21h Fietspad Ring", 2],
    ["23u00-00u00", 1],
    ["23u-1u", 2],
    ["12u-1u", 1],
    ["Fak bekers afwassen 12-3u", 3],
    ["Containerpark 14u30-16u30", 2],
  ])("leest %s als %s uur", (text, hours) => {
    expect(rangeHours(parseTimeRange(text))).toBe(hours);
  });

  it("kent een open einde, maar geen datum of een los getal", () => {
    expect(parseTimeRange("22u00-einde")).toMatchObject({ end: null });
    expect(parseTimeRange("2026-09-22")).toBeNull();
    expect(parseTimeRange("We gokken dat het tot 17u duurt")).toBeNull();
    expect(parseTimeRange("1 shift = 2u")).toBeNull();
  });

  it("splitst een eigen uur voor een naam af", () => {
    const { range, rest } = splitTimePrefix("23u-1u: Maxime Van Insberghe");
    expect(rest).toBe("Maxime Van Insberghe");
    expect(rangeHours(range)).toBe(2);
  });
});

describe("namen herkennen", () => {
  it("normaliseert hoofdletters, accenten, punten en opmerkingen", () => {
    expect(nameKey("Lore B.")).toBe("lore b");
    expect(nameKey("Amélie van den Heuvel")).toBe("amelie van den heuvel");
    expect(nameKey("Lore J (pno tot 18.30)")).toBe("lore j");
    expect(nameKey("  Rosalie ")).toBe("rosalie");
  });

  it("laat labels, opmerkingen en tellers vallen", () => {
    for (const text of ["HOW TO SCAFF", "met opleiding!!", "30 min op voorrand aan", "Driver", "Gecanceled", "/", "Logi", "Praesidium"]) {
      expect(looksLikeName(text), text).toBe(false);
    }
    for (const text of ["Mekkie", "Jarne P", "Lore B.", "Emma Van den Broeck", "Luke Drummond Smith", "kato"]) {
      expect(looksLikeName(text), text).toBe(true);
    }
  });

  it("stelt een naam voor uit de bestandsnaam", () => {
    expect(suggestListName("Shiftenlijst 24UL '26-'27.xlsx")).toBe("24UL");
    expect(suggestListName("Shifts StudentenWelkom 2026.xlsx")).toBe("StudentenWelkom");
    expect(suggestListName("Shiftenlijst Eersteplaatscantus.xlsx")).toBe("Eersteplaatscantus");
  });

  it("formatteert een Belgisch gsm-nummer dat zijn nul verloor", () => {
    expect(formatPhone("483478016")).toBe("0483 47 80 16");
    expect(formatPhone("32470632808")).toBe("0470 63 28 08");
    expect(formatPhone("0472 19 58 67")).toBe("0472 19 58 67");
    expect(formatPhone("/")).toBeNull();
  });
});

describe("koppelen aan een praesidiumlid", () => {
  const none = new Map();

  it("koppelt voornaam plus letter wanneer er twee Jarnes zijn", () => {
    expect(proposeMatch("jarne p", roster, none)).toMatchObject({ status: "MATCHED", userId: "u-jarne-p", source: "INITIAL" });
    expect(proposeMatch("jarne n", roster, none)).toMatchObject({ status: "MATCHED", userId: "u-jarne-n" });
  });

  it("vraagt het na bij een voornaam die twee mensen hebben", () => {
    const proposal = proposeMatch("jarne", roster, none);
    expect(proposal.status).toBe("UNRESOLVED");
    expect(proposal.candidates.sort()).toEqual(["u-jarne-n", "u-jarne-p"]);
    expect(isAmbiguousFirstName("jarne", roster)).toBe(true);
    expect(isAmbiguousFirstName("kato", roster)).toBe(false);
  });

  it("koppelt een unieke voornaam, ook zonder aparte voor- en achternaam", () => {
    expect(proposeMatch("kato", roster, none)).toMatchObject({ status: "MATCHED", userId: "u-kato", source: "FIRST_NAME" });
  });

  it("laat een bijnaam open tot de vice kiest, en onthoudt ze daarna", () => {
    expect(proposeMatch("mekkie", roster, none)).toMatchObject({ status: "UNRESOLVED", source: "NONE" });
    const aliases = new Map([["mekkie", { userId: "u-emma" }], ["laute", { userId: null }]]);
    expect(proposeMatch("mekkie", roster, aliases)).toMatchObject({ status: "MATCHED", userId: "u-emma", source: "ALIAS" });
    expect(proposeMatch("laute", roster, aliases)).toMatchObject({ status: "IGNORED", source: "ALIAS" });
  });

  it("vangt een tikfout in een volledige naam op", () => {
    expect(proposeMatch(nameKey("Victor Chistiaens"), roster, none)).toMatchObject({ userId: "u-victor", source: "FUZZY" });
    expect(proposeMatch(nameKey("Emma van den brpeck"), roster, none)).toMatchObject({ userId: "u-emma", source: "FUZZY" });
  });

  it("negeert een volledige naam die bij niemand past, en wie bij een andere kring hoort", () => {
    expect(proposeMatch(nameKey("Siebe De Keijser"), roster, none)).toMatchObject({ status: "IGNORED", source: "NOT_PRAESIDIUM" });
    const kring = new Map([["kato", "Industria"]]);
    expect(proposeMatch("kato", roster, none, kring)).toMatchObject({ status: "IGNORED", source: "OTHER_KRING" });
  });
});

describe("een shiftenlijst inlezen", () => {
  it("weigert iets wat geen xlsx is", () => {
    expect(() => readWorkbook(Buffer.from("geen zip"))).toThrow(XlsxError);
  });

  it("leest namen onder de uren, met kleur, rol, duur en de lege VTK-vakjes", async () => {
    const buffer = await xlsx([
      {
        sheet: "Blad1",
        data: [
          [cell("Shiftenlijst - Cantus", HEADER)],
          [cell("Datum:"), { value: new Date(Date.UTC(2026, 9, 12)), type: Date, format: "dd/mm/yyyy" } as Cell],
          [cell("Op te vullen Apolloon", BLUE)],
          [cell("Locatie", HEADER), cell("", HEADER), cell("13u00-14u30", HEADER), cell("20u00-20u30", HEADER), cell("Opmerkingen", HEADER)],
          [cell("loods"), cell("Bijrijden", HEADER), cell("Jarne P", GREEN), cell("Mekkie", GREEN), cell("HOW TO SCAFF")],
          [null, cell("Bijrijden", HEADER), cell("Thiago", BLUE), cell("", GREEN), null],
          [null, cell("Steward", HEADER), cell("Lore J (pno tot 14u)", GREEN), cell("", BLUE), null],
        ],
      },
    ]);
    const analysis = analyzeEventWorkbook(readWorkbook(buffer));

    expect(analysis.entries.map((e) => e.label)).toEqual(["Jarne P", "Mekkie", "Thiago", "Lore J"]);
    expect(analysis.eventDate?.toISOString().slice(0, 10)).toBe("2026-10-12");
    const jarne = analysis.entries[0];
    expect(jarne).toMatchObject({ color: "B7E1CD", slot: "13u00-14u30", hours: 1.5, role: "loods · Bijrijden" });
    expect(analysis.entries[3].note).toBe("pno tot 14u");
    expect(analysis.colors.map((c) => [c.color, c.names])).toEqual([["B7E1CD", 3], ["6D9EEB", 1]]);
    // De legende "Op te vullen Apolloon" is geen open vakje, de lege cellen eronder wel.
    expect(analysis.slots).toEqual(
      expect.arrayContaining([
        { sheet: "Blad1", color: "B7E1CD", empty: 1 },
        { sheet: "Blad1", color: "6D9EEB", empty: 1 },
      ]),
    );
  });

  it("herkent het overzichtstabblad met nummers en kringen, en telt het niet", async () => {
    const buffer = await xlsx([
      {
        sheet: "Contact Details",
        data: [
          [cell("Kring"), cell("First Name"), cell("Last Name"), cell("Number")],
          [cell("VTK"), cell("Kato"), cell("Cuenen"), { value: 472769828, type: Number } as Cell],
          [cell("Industria"), cell("Adrien"), cell("Barel"), { value: 475393247, type: Number } as Cell],
          [cell("VTK"), cell("Lore"), cell("Bellen"), cell("0468 12 34 56")],
        ],
      },
      {
        sheet: "Tuesday",
        data: [
          [null, cell("8:00 - 10:00", "#D0D4D9", { columnSpan: 2 }), null],
          [cell("Stage"), cell("Adrien Barel", "#FF0000", { columnSpan: 2 }), null],
          [null, cell("Kato Cuenen", "#FF0000", { columnSpan: 2 }), null],
        ],
      },
    ]);
    const analysis = analyzeEventWorkbook(readWorkbook(buffer));
    expect(analysis.sheets.map((s) => [s.name, s.kind, s.counted])).toEqual([
      ["Contact Details", "CONTACTS", false],
      ["Tuesday", "SHIFTS", true],
    ]);
    expect(analysis.contacts).toEqual([
      { name: "Kato Cuenen", nameKey: "kato cuenen", kring: "VTK", phone: "0472 76 98 28", email: null },
      { name: "Adrien Barel", nameKey: "adrien barel", kring: "Industria", phone: "0475 39 32 47", email: null },
      { name: "Lore Bellen", nameKey: "lore bellen", kring: "VTK", phone: "0468 12 34 56", email: null },
    ]);
    // Twee halfuurkolommen samengevoegd onder een kop van twee uur.
    expect(analysis.entries.map((e) => [e.label, e.hours])).toEqual([
      ["Adrien Barel", 2],
      ["Kato Cuenen", 2],
    ]);
  });

  it("zet een tabblad dat zegt dat het niet meetelt standaard uit, en leest een tabel met chauffeurs", async () => {
    const buffer = await xlsx([
      {
        sheet: "Afbraak",
        data: [
          [cell("Shiftenlijst - 24UL")],
          [cell("Deze shiften tellen niet mee in de counter")],
          [null, cell("22u00 - 00u00")],
          [cell("Afbraak"), cell("Lore V")],
        ],
      },
      {
        sheet: "Transport",
        data: [
          [cell("Ritje"), cell("Startuur"), cell("Einduur"), cell("Chauffeur"), cell("Bijrijder 1"), cell("Extra info")],
          [cell("KUL depot"), cell("11u"), cell("12u30"), cell("Wout S"), cell("Victor"), null],
          [cell("Afbraakrit"), cell("21u"), cell("23u"), cell("Emile"), cell("/"), cell("Telt niet mee in de counter")],
        ],
      },
    ]);
    const analysis = analyzeEventWorkbook(readWorkbook(buffer));
    expect(analysis.sheets.find((s) => s.name === "Afbraak")).toMatchObject({ kind: "SHIFTS", counted: false });
    const transport = analysis.entries.filter((e) => e.sheet === "Transport");
    expect(transport.map((e) => [e.label, e.role, e.hours, e.excluded])).toEqual([
      ["Wout S", "KUL depot", 1.5, false],
      ["Victor", "KUL depot", 1.5, false],
      ["Emile", "Afbraakrit", 2, true],
    ]);
  });

  it("leest het rooster van de wekelijkse praesidiumshiften", async () => {
    const day = (d: number) => ({ value: new Date(Date.UTC(2026, 8, d)), type: Date, format: "dd/mm/yyyy" }) as Cell;
    const buffer = await xlsx([
      {
        sheet: "Semester 1",
        data: [
          [null, null, cell("Fak kuisen"), cell("Containerpark 14u30-16u30"), cell("Done?")],
          [cell("S1W1"), null, null, null, { value: false, type: Boolean } as Cell],
          [cell("Zondag"), day(20), cell("23u-1u: Jarne Plessers\n1u-3u: Lore Bellen"), null, { value: false, type: Boolean } as Cell],
          [cell("maandag"), day(21), cell("Kato Cuenen\nEmma Van den Broeck"), cell("Victor Christiaens"), { value: true, type: Boolean } as Cell, cell("niet doorgegaan")],
          [cell("dinsdag"), day(22), null, null, { value: false, type: Boolean } as Cell],
        ],
      },
    ]);
    const analysis = analyzeWeeklyWorkbook(readWorkbook(buffer));
    expect(analysis.entries.map((e) => [e.label, e.role, e.slot, e.hours])).toEqual([
      ["Jarne Plessers", "Fak kuisen", "23u-1u", 2],
      ["Lore Bellen", "Fak kuisen", "1u-3u", 2],
      ["Kato Cuenen", "Fak kuisen", null, null],
      ["Emma Van den Broeck", "Fak kuisen", null, null],
      ["Victor Christiaens", "Containerpark 14u30-16u30", "14u30-16u30", 2],
    ]);
    expect(analysis.entries[4]).toMatchObject({ note: "niet doorgegaan", done: true });
  });
});

describe("tellen", () => {
  const list: StatsList = {
    id: "l1",
    kind: "EVENT",
    name: "24UL",
    eventDate: null,
    expectedPerMember: 6,
    countMode: "BY_DURATION",
    hoursPerShift: 2,
    sheets: [
      { name: "Di", kind: "SHIFTS", names: 3, date: null, counted: true },
      { name: "Afbraak", kind: "SHIFTS", names: 1, date: null, counted: false },
    ],
    colors: [
      { color: "B7E1CD", names: 3, samples: [], counted: true },
      { color: "6D9EEB", names: 1, samples: [], counted: false },
    ],
  };
  const entries = [
    { listId: "l1", nameKey: "jarne p", sheet: "Di", color: "B7E1CD", hours: 2, excluded: false },
    { listId: "l1", nameKey: "jarne p", sheet: "Di", color: "B7E1CD", hours: 1, excluded: false },
    { listId: "l1", nameKey: "mekkie", sheet: "Di", color: "B7E1CD", hours: null, excluded: false },
    { listId: "l1", nameKey: "laute", sheet: "Di", color: "B7E1CD", hours: 2, excluded: false },
    { listId: "l1", nameKey: "thiago", sheet: "Di", color: "6D9EEB", hours: 2, excluded: false },
    { listId: "l1", nameKey: "jarne p", sheet: "Afbraak", color: "B7E1CD", hours: 2, excluded: false },
    { listId: "l1", nameKey: "jarne p", sheet: "Di", color: "B7E1CD", hours: 2, excluded: true },
  ];
  const names = [
    { listId: "l1", nameKey: "jarne p", status: "MATCHED" as const, userId: "u-jarne-p" },
    { listId: "l1", nameKey: "mekkie", status: "UNRESOLVED" as const, userId: null },
    { listId: "l1", nameKey: "laute", status: "IGNORED" as const, userId: null },
    { listId: "l1", nameKey: "thiago", status: "UNRESOLVED" as const, userId: null },
  ];

  it("telt naar duur: een uur is een halve shift, een open einde één", () => {
    expect(entryWeight(list, { hours: 1 })).toBe(0.5);
    expect(entryWeight(list, { hours: 1.5 })).toBe(0.75);
    expect(entryWeight(list, { hours: null })).toBe(1);
    expect(entryWeight({ ...list, countMode: "PER_NAME" }, { hours: 3.5 })).toBe(1);
  });

  it("slaat andere kleuren, uitgezette tabbladen en wat de lijst zelf uitsluit over", () => {
    const summary = summarizeList(list, entries, names);
    expect(summary.perUser.get("u-jarne-p")).toBe(1.5);
    expect(summary.praesidium).toBe(1.5);
    expect(summary.others).toBe(1);
    expect(summary.unresolvedNames).toBe(1);
    expect(summary.counted).toBe(3.5);
  });

  it("geeft iedereen uit het praesidium een rij, ook met nul, en splitst /shift in noodzaak en vrije wil", () => {
    const rows = memberTotals({
      memberIds: ["u-jarne-p", "u-kato"],
      eventLists: [list],
      weeklyLists: [],
      entries,
      names,
      siteShifts: [
        { shiftId: "s1", userId: "u-kato", necessary: true },
        { shiftId: "s2", userId: "u-kato", necessary: false },
        { shiftId: "s3", userId: "u-jarne-p", necessary: false },
      ],
      now: new Date("2026-10-11T12:00:00Z"),
    });
    expect(rows.find((r) => r.userId === "u-jarne-p")).toMatchObject({ lists: 1.5, siteVoluntary: 1, total: 2.5 });
    expect(rows.find((r) => r.userId === "u-kato")).toMatchObject({ lists: 0, siteNecessary: 1, siteVoluntary: 1, total: 2 });
  });

  it("noemt de lege vakjes pas 'open voor VTK' wanneer er een kleur gekozen is", () => {
    const slots = [
      { sheet: "Di", color: "B7E1CD", empty: 8 },
      { sheet: "Di", color: "6D9EEB", empty: 33 },
    ];
    expect(detectedOpenSlots(list, slots)).toBe(8);
    const allColors = { ...list, colors: list.colors.map((c) => ({ ...c, counted: true })) };
    expect(detectedOpenSlots(allColors, slots)).toBeNull();
  });
});
