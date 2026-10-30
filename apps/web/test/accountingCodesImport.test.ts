import { describe, expect, it } from "vitest";
import { parseAccountingCodesCsv, planAccountingCodeImport, type ExistingCode } from "@/lib/accounting/import";

const existing: ExistingCode[] = [
  { id: "a", code: "700100", name: "Activiteiten opbrengsten", parentId: null },
  { id: "b", code: "700100 10001", name: "Cantussen", parentId: "a" },
  { id: "c", code: "740100", name: "Logistiek opbrengsten", parentId: null },
];

function plan(text: string) {
  const parsed = parseAccountingCodesCsv(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return planAccountingCodeImport(parsed, existing);
}

describe("boekhoudcodes opladen", () => {
  it("leest code, subcode en naam, met puntkomma of komma", () => {
    const result = parseAccountingCodesCsv("Boekhoudcode;Subcode;Naam\n700 100;;Activiteiten opbrengsten\n700100;10002;TD\n");
    expect(result).toEqual({
      ok: true,
      errors: [],
      rows: [
        { line: 2, main: "700100", sub: null, name: "Activiteiten opbrengsten" },
        { line: 3, main: "700100", sub: "10002", name: "TD" },
      ],
    });
  });

  it("leest een subcode in dezelfde cel als de code, met of zonder spatie", () => {
    const result = parseAccountingCodesCsv("Code,Naam\n700100 10003,Partybus\n70010010004,Toernooitjes\n");
    expect(result.ok && result.rows.map((row) => [row.main, row.sub])).toEqual([
      ["700100", "10003"],
      ["700100", "10004"],
    ]);
  });

  it("verkiest de kolom Naam boven een kolom Post", () => {
    const result = parseAccountingCodesCsv("Post,Boekhoudcode,Naam\nActiviteiten,700100,Activiteiten opbrengsten\n");
    expect(result.ok && result.rows[0].name).toBe("Activiteiten opbrengsten");
  });

  it("zegt welke kolommen het verwacht", () => {
    expect(parseAccountingCodesCsv("Iets,Anders\n1,2\n")).toEqual({ ok: false, error: "COLUMNS" });
  });

  it("toont wat nieuw is, wat hernoemd wordt en wat niet in het bestand staat", () => {
    const result = plan("Boekhoudcode,Subcode,Naam\n700100,,Activiteiten\n700100,10001,Cantussen\n700100,10002,TD\n700110,,Cultuur opbrengsten\n700110,11001,Quiz\n");
    expect(result.create).toEqual([
      { code: "700110", name: "Cultuur opbrengsten", parentCode: null },
      { code: "700100 10002", name: "TD", parentCode: "700100" },
      { code: "700110 11001", name: "Quiz", parentCode: "700110" },
    ]);
    expect(result.rename).toEqual([{ code: "700100", from: "Activiteiten opbrengsten", to: "Activiteiten" }]);
    expect(result.unchanged).toBe(1);
    // Niet in het bestand: blijft staan, wordt nooit vanzelf verwijderd.
    expect(result.missing).toEqual([{ code: "740100", name: "Logistiek opbrengsten" }]);
    expect(result.order).toEqual(["700100", "700100 10001", "700100 10002", "700110", "700110 11001"]);
    expect(result.errors).toEqual([]);
    // 740100 staat niet in het bestand: dan bepaalt het bestand de volgorde niet.
    expect(result.reorder).toBe(false);
  });

  it("neemt de volgorde van het bestand over als het de hele lijst bevat", () => {
    const result = plan("Boekhoudcode,Subcode,Naam\n740100,,Logistiek opbrengsten\n700100,,Activiteiten opbrengsten\n700100,10001,Cantussen\n");
    expect(result.reorder).toBe(true);
    expect(result.order).toEqual(["740100", "700100", "700100 10001"]);
  });

  it("weigert een foute regel, een dubbele code en een subcode zonder hoofdrekening", () => {
    const result = plan("Boekhoudcode,Subcode,Naam\n12345,,Te kort\n700100,1,Te korte subcode\n700100,10001,Cantussen\n700100,10001,Nog eens\n799999,10001,Wees\n");
    expect(result.errors.map((error) => error.line)).toEqual([2, 3, 5, 6]);
  });
});
