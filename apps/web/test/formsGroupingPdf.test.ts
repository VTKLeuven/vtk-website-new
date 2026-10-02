import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateGroupsPdf, isListColumn } from "@/lib/forms/grouping/pdf";

function group(number: number, rows: number) {
  return {
    number,
    memberPeople: rows,
    anchorPeople: 2,
    profile: ["Richting: Met burgies (12/15)"],
    rows: Array.from({ length: rows }, (_, index) => ({
      name: `Deelnemer ${number}.${index}`,
      isAnchor: index < 2,
      size: 1,
      companions: index === 0 ? ["Anna", "Bert"] : [],
      cells: [`r08${number}${index}`, "0470 00 00 00"],
    })),
  };
}

const columns = [
  { label: "R-nummer", weight: 1 },
  { label: "Gsm", weight: 1 },
];

describe("groepjes als PDF", () => {
  it("geeft elke groep een eigen pagina", async () => {
    const bytes = await generateGroupsPdf({
      locale: "nl",
      formTitle: "Peter-metergroepjes",
      anchorLabel: "Kern",
      columns,
      groups: [group(1, 14), group(2, 15), group(3, 12)],
      generatedAt: new Date("2027-02-01T10:00:00Z"),
    });

    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
  });

  it("zet een grote groep voort op een volgende pagina", async () => {
    const bytes = await generateGroupsPdf({
      locale: "nl",
      formTitle: "Peter-metergroepjes",
      anchorLabel: "Kern",
      columns,
      groups: [group(1, 60)],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });

  it("levert een leesbare PDF zonder groepen", async () => {
    const bytes = await generateGroupsPdf({
      locale: "nl",
      formTitle: "Peter-metergroepjes",
      anchorLabel: null,
      columns: [],
      groups: [],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("verdraagt een naam die niet in WinAnsi past", async () => {
    const bytes = await generateGroupsPdf({
      locale: "nl",
      formTitle: "Peter-metergroepjes 🎉",
      anchorLabel: "Kern",
      columns,
      groups: [
        {
          ...group(1, 1),
          rows: [
            {
              name: "Zoë 🎈 Vandenberghe-Vermeulen-Lambrechts",
              isAnchor: false,
              size: 2,
              companions: ["Björn"],
              cells: ["r0812345", "0470 11 22 33"],
            },
          ],
        },
      ],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe("welke vragen een kolom krijgen", () => {
  it("neemt herkenning, telefoon en e-mail, en laat de keuzevragen aan de CSV", () => {
    expect(isListColumn({ type: "SHORT_TEXT", role: "IDENTIFIER" })).toBe(true);
    expect(isListColumn({ type: "PHONE", role: null })).toBe(true);
    expect(isListColumn({ type: "EMAIL", role: null })).toBe(true);
    expect(isListColumn({ type: "SINGLE_CHOICE", role: "SIMILAR" })).toBe(false);
    expect(isListColumn({ type: "SHORT_TEXT", role: "NAME" })).toBe(false);
    expect(isListColumn({ type: "FILE", role: null })).toBe(false);
  });
});
