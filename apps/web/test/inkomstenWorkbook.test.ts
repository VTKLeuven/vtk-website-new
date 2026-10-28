import { describe, expect, it } from "vitest";
import type { CellObject } from "write-excel-file/node";
import {
  SHEET_STYLE,
  columnLetter,
  controlWorkbook,
  quarterLineKey,
  quarterSheet,
  wallClock,
  type WorkbookModel,
  type WorkbookTransaction,
} from "@/lib/inkomsten/workbook";
import { computeIncomeChecks, groupMolliePayouts, monthsBetween } from "@/lib/inkomsten/overview";

// Verzonnen gegevens: geen echte namen, rekeningnummers of betaal-ID's.

const tx = (partial: Partial<WorkbookTransaction>): WorkbookTransaction => ({
  occurredAt: new Date("2026-10-02T18:00:00Z"),
  source: "PAYCONIQ",
  kind: "PAYMENT",
  channel: "A: Evenement 1",
  description: null,
  amountCents: 0,
  periodMonth: "2026-10",
  payoutReference: null,
  bankAccount: "BE00 0000 0000 6140",
  accountingCode: null,
  accountingCodeName: null,
  excluded: false,
  reason: "",
  ...partial,
});

const model = (transactions: WorkbookTransaction[]): WorkbookModel => ({
  title: "Online inkomsten oktober 2026",
  nl: true,
  transactions,
  codeOrder: new Map([
    ["700100", 0],
    ["70010010001", 1],
    ["700110", 2],
  ]),
  mainNames: new Map([
    ["700100", "Activiteiten opbrengsten"],
    ["700110", "Cultuur opbrengsten"],
  ]),
  feeCode: { code: "657000", name: "Financiële kosten" },
  groups: [],
  payouts: [],
  imports: [],
});

const sample = model([
  tx({ accountingCode: "700110", accountingCodeName: "Cultuur opbrengsten", amountCents: 1200 }),
  tx({ accountingCode: "700100 10001", accountingCodeName: "Cantussen", amountCents: 5500, source: "MOLLIE", channel: "Mollie" }),
  tx({ accountingCode: "700100 10001", accountingCodeName: "Cantussen", amountCents: 300, bankAccount: null }),
  tx({ kind: "FEE", amountCents: -185, source: "MOLLIE", channel: "Mollie" }),
  tx({ kind: "RESERVE", amountCents: -250, source: "MOLLIE", channel: "Mollie" }),
  tx({ amountCents: 750 }),
  tx({ amountCents: 999, excluded: true }),
]);

const text = (cell: unknown) => (cell && typeof cell === "object" ? (cell as CellObject).value : cell);

describe("het kwartaalblad", () => {
  it("telt enkel wat meetelt, onder de juiste regel", () => {
    expect(quarterLineKey(tx({ accountingCode: "700100" }))).toBe("700100");
    expect(quarterLineKey(tx({ kind: "FEE" }))).toBe("Kosten");
    expect(quarterLineKey(tx({}))).toBe("Na te kijken");
    expect(quarterLineKey(tx({ excluded: true }))).toBeNull();
  });

  it("zet de kolommen per bron en per rekening, Mollie eerst, en een totaalblok per rekening", () => {
    const sheet = quarterSheet(sample, { formulas: false });
    const sourceRow = sheet.data[1].map(text);
    const accountRow = sheet.data[2].map(text);
    expect(sourceRow.slice(3)).toEqual(["Mollie", "Payconiq", "Payconiq", "BE00 0000 0000 6140", "Rekening niet ingesteld"]);
    expect(accountRow.slice(0, 5)).toEqual(["Post", "Boekhoudcode", "Analytische code", "BE00 0000 0000 6140", "BE00 0000 0000 6140"]);
    expect(accountRow[5]).toBe("Rekening niet ingesteld");
  });

  it("zet Europabank en SumUp voor Mollie en Payconiq, zoals het rekenblad", () => {
    const sheet = quarterSheet(
      model([
        tx({ accountingCode: "700110", amountCents: 100 }),
        tx({ accountingCode: "700110", amountCents: 100, source: "MOLLIE", channel: "Mollie" }),
        tx({ accountingCode: "700110", amountCents: 100, source: "SUMUP", channel: "kassa@voorbeeld.be", bankAccount: "BE00 0000 0000 9348" }),
        tx({ kind: "FEE", amountCents: -1, source: "SUMUP", channel: "kassa@voorbeeld.be", bankAccount: "BE00 0000 0000 9348" }),
        tx({ accountingCode: "700110", amountCents: 100, source: "EUROPABANK", channel: "1000000001" }),
      ]),
      { formulas: false },
    );
    expect(sheet.data[1].slice(3, 7).map(text)).toEqual(["Europabank", "SumUp", "Mollie", "Payconiq"]);
    const fees = sheet.data.find((row) => text(row[0]) === "Financiële kosten")!;
    expect(text(fees[4])).toBe(-0.01);
  });

  it("zet de codes in de volgorde van het register, dan kosten, reserve en wat na te kijken is", () => {
    const sheet = quarterSheet(sample, { formulas: false });
    const lines = sheet.data.slice(3).map((row) => [text(row[0]), text(row[1]), text(row[2])]);
    expect(lines).toEqual([
      ["Cantussen", 700100, "10001"],
      ["Cultuur opbrengsten", 700110, ""],
      ["Financiële kosten", 657000, ""],
      ["Wijziging dynamische reserve", "x", ""],
      ["Na te kijken (nog geen code)", "", ""],
      ["", "TOTAAL GEHEEL", ""],
    ]);
  });

  it("rekent het totaal zonder wat niet meetelt", () => {
    const sheet = quarterSheet(sample, { formulas: false });
    const total = sheet.data.at(-1)!;
    // Kolommen: Mollie (6140), Payconiq (6140), Payconiq (niet ingesteld), dan het totaalblok.
    expect(total.slice(3).map(text)).toEqual([50.65, 19.5, 3, 70.15, 3]);
  });

  it("neemt de kleuren en de euronotatie van het rekenblad over", () => {
    const sheet = quarterSheet(sample, { formulas: false });
    const title = sheet.data[0][0] as CellObject;
    expect(title).toMatchObject({ backgroundColor: SHEET_STYLE.headFill, textColor: SHEET_STYLE.headText, fontWeight: "bold" });
    const amount = sheet.data[3][3] as CellObject;
    expect(amount).toMatchObject({ backgroundColor: SHEET_STYLE.rowFill, format: SHEET_STYLE.euro, fontWeight: "bold" });
    const totalHead = sheet.data[1][6] as CellObject;
    expect(totalHead).toMatchObject({ backgroundColor: SHEET_STYLE.totalHeadFill, rowSpan: 2 });
  });

  it("laat in het controlebestand elke cel rekenen op het tabblad Transacties", () => {
    const [quarter, transactions] = controlWorkbook(sample);
    const cell = quarter.data[3][3] as CellObject;
    expect(cell.type).toBe("Formula");
    expect(cell.value).toBe(
      'SUMIFS(Transacties!$E:$E,Transacties!$I:$I,"700100 10001",Transacties!$B:$B,"Mollie",Transacties!$H:$H,"BE00 0000 0000 6140")',
    );
    const accountTotal = quarter.data[3][6] as CellObject;
    expect(accountTotal.value).toBe('SUMIF($D$3:$F$3,"BE00 0000 0000 6140",$D4:$F4)');
    expect(transactions.sheet).toBe("Transacties");
    const header = transactions.data[0].map(text);
    expect([header[1], header[4], header[7], header[8]]).toEqual(["Bron", "Bedrag", "Rekening", "Regel in kwartaalblad"]);
  });

  it("toont de Brusselse tijd, niet UTC", () => {
    // 00:18 op 1 oktober in Brussel is 22:18 op 30 september in UTC.
    expect(wallClock(new Date("2026-09-30T22:18:00Z")).toISOString()).toBe("2026-10-01T00:18:00.000Z");
  });

  it("noemt kolommen zoals Excel", () => {
    expect([0, 25, 26, 27].map(columnLetter)).toEqual(["A", "Z", "AA", "AB"]);
  });
});

describe("Mollie per uitbetaling", () => {
  it("telt per uitbetaling alles, ook wat niet meetelt", () => {
    const at = new Date("2026-10-01T10:00:00Z");
    const payouts = groupMolliePayouts([
      { reference: "1.2610.02", kind: "PAYMENT", amountCents: 5500, occurredAt: at },
      { reference: "1.2610.02", kind: "REFUND", amountCents: -1400, occurredAt: at },
      { reference: "1.2610.02", kind: "FEE", amountCents: -185, occurredAt: at },
      { reference: "1.2610.01", kind: "PAYMENT", amountCents: 1000, occurredAt: at },
    ]);
    expect(payouts.map((payout) => [payout.reference, payout.total, payout.refunds])).toEqual([
      ["1.2610.01", 1000, 0],
      ["1.2610.02", 3915, -1400],
    ]);
  });
});

describe("de controlelijst", () => {
  const base = {
    months: monthsBetween("2026-07", "2026-09"),
    currentMonth: "2026-10",
    sourcesInUse: new Set(["PAYCONIQ", "MOLLIE"] as const),
    rowsPerSourceMonth: new Map([
      ["PAYCONIQ:2026-08", 1],
      ["PAYCONIQ:2026-09", 1141],
      ["MOLLIE:2026-08", 75],
      ["MOLLIE:2026-09", 164],
    ]),
    molliePaymentMonths: new Set(["2026-08", "2026-09"]),
    mollieFeeMonths: new Set(["2026-09"]),
    payouts: [
      { total: 1000, checkedAmount: 1000 },
      { total: 2000, checkedAmount: 1500 },
      { total: 3000, checkedAmount: null },
    ],
    open: { count: 0, cents: 0 },
    withoutAccount: { count: 2, cents: 450 },
    hasFees: true,
    feeCodeChosen: false,
  };

  it("vindt een vergeten maand, ontbrekende kosten en uitbetalingen die niet afgevinkt zijn", () => {
    const checks = Object.fromEntries(computeIncomeChecks(base).map((check) => [check.key, check]));
    expect(checks.coverage).toMatchObject({
      ok: false,
      missing: [
        { source: "PAYCONIQ", month: "2026-07" },
        { source: "MOLLIE", month: "2026-07" },
      ],
    });
    expect(checks.mollieFees).toMatchObject({ ok: false, months: ["2026-08"] });
    expect(checks.payouts).toMatchObject({ ok: false, total: 3, checked: 1, changed: 1 });
    expect(checks.open).toMatchObject({ ok: true });
    expect(checks.accounts).toMatchObject({ ok: false, count: 2 });
    expect(checks.feeCode).toMatchObject({ ok: false });
  });

  it("meldt geen gat voor een maand die nog loopt", () => {
    const checks = computeIncomeChecks({ ...base, months: ["2026-10"], rowsPerSourceMonth: new Map() });
    expect(checks.find((check) => check.key === "coverage")).toMatchObject({ ok: true });
  });

  it("telt de maanden van een periode", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});
