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
import { computeIncomeChecks, groupPayouts, monthsBetween, payoutState } from "@/lib/inkomsten/overview";

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

  it("geeft in het controlebestand elke bron met regels een eigen tabblad, na Transacties", () => {
    expect(controlWorkbook(sample).map((sheet) => sheet.sheet)).toEqual([
      "Kwartaalblad",
      "Transacties",
      "Mollie",
      "Payconiq",
      "Per groep",
      "Per uitbetaling",
      "Na te kijken",
      "Telt niet mee",
      "Bestanden",
    ]);
  });

  it("zet op het tabblad van een bron haar regels en een controleblok tegen het kwartaalblad", () => {
    const mollie = controlWorkbook(sample).find((sheet) => sheet.sheet === "Mollie")!;
    expect(mollie.data[0].slice(0, 4).map(text)).toEqual(["Datum", "Kanaal", "Omschrijving", "Bedrag"]);
    expect(mollie.data[0][14]).toMatchObject({ value: "Controle Mollie" });
    // Drie regels: de betaling, de kosten en de reserve.
    expect(mollie.data.slice(1, 4).map((row) => text(row[3]))).toEqual([55, -1.85, -2.5]);
    const block = mollie.data.slice(1).map((row) => [text(row[14]), text(row[15])]);
    expect(block).toEqual([
      ["Betalingen", 'SUMIFS($D$2:$D$4,$K$2:$K$4,"Betaling",$L$2:$L$4,"ja")'],
      ["Kosten", 'SUMIFS($D$2:$D$4,$K$2:$K$4,"Kosten",$L$2:$L$4,"ja")'],
      ["Reserve", 'SUMIFS($D$2:$D$4,$K$2:$K$4,"Reserve",$L$2:$L$4,"ja")'],
      ["Telt mee", 'SUMIFS($D$2:$D$4,$L$2:$L$4,"ja")'],
      // Vijf regels in het kwartaalblad (rij 4 tot 8), dus TOTAAL GEHEEL op rij 9; Mollie is kolom D.
      ["In het kwartaalblad", "SUM('Kwartaalblad'!D9)"],
      ["Verschil (hoort 0 te zijn)", "ROUND(P5-P6,2)"],
    ]);
  });

  it("telt bij een bron met twee rekeningen beide kolommen, en toont wat niet meetelt", () => {
    const payconiq = controlWorkbook(sample).find((sheet) => sheet.sheet === "Payconiq")!;
    const block = new Map(payconiq.data.slice(1).map((row) => [text(row[14]), text(row[15])]));
    expect(block.get("Telt niet mee")).toBe('SUMIFS($D$2:$D$5,$L$2:$L$5,"nee")');
    expect(block.get("In het kwartaalblad")).toBe("SUM('Kwartaalblad'!E9,'Kwartaalblad'!F9)");
  });

  it("zet de naam van het kwartaalblad tussen aanhalingstekens, ook in het Engels", () => {
    const english = { ...model([tx({ accountingCode: "700110", amountCents: 100 })]), nl: false };
    const payconiq = controlWorkbook(english).find((sheet) => sheet.sheet === "Payconiq")!;
    const block = new Map(payconiq.data.slice(1).map((row) => [text(row[14]), text(row[15])]));
    expect(block.get("In the quarter sheet")).toBe("SUM('Quarter sheet'!D5)");
  });

  it("toont de Brusselse tijd, niet UTC", () => {
    // 00:18 op 1 oktober in Brussel is 22:18 op 30 september in UTC.
    expect(wallClock(new Date("2026-09-30T22:18:00Z")).toISOString()).toBe("2026-10-01T00:18:00.000Z");
  });

  it("noemt kolommen zoals Excel", () => {
    expect([0, 25, 26, 27].map(columnLetter)).toEqual(["A", "Z", "AA", "AB"]);
  });
});

describe("per uitbetaling", () => {
  it("telt per uitbetaling alles, ook wat niet meetelt, per bron en in volgorde", () => {
    const at = new Date("2026-10-01T10:00:00Z");
    const later = new Date("2026-10-02T10:00:00Z");
    const payouts = groupPayouts([
      { source: "SUMUP", reference: "AB PID2", kind: "PAYMENT", amountCents: 250, occurredAt: later },
      { source: "MOLLIE", reference: "1.2610.02", kind: "PAYMENT", amountCents: 5500, occurredAt: later },
      { source: "MOLLIE", reference: "1.2610.02", kind: "REFUND", amountCents: -1400, occurredAt: later },
      { source: "MOLLIE", reference: "1.2610.02", kind: "FEE", amountCents: -185, occurredAt: later },
      { source: "MOLLIE", reference: "1.2610.01", kind: "PAYMENT", amountCents: 1000, occurredAt: at },
      { source: "SUMUP", reference: "AB PID1", kind: "PAYMENT", amountCents: 300, occurredAt: at },
      { source: "SUMUP", reference: "AB PID1", kind: "FEE", amountCents: -5, occurredAt: at },
    ]);
    expect(payouts.map((payout) => [payout.source, payout.reference, payout.total, payout.refunds])).toEqual([
      ["MOLLIE", "1.2610.01", 1000, 0],
      ["MOLLIE", "1.2610.02", 3915, -1400],
      ["SUMUP", "AB PID1", 295, 0],
      ["SUMUP", "AB PID2", 250, 0],
    ]);
  });

  it("neemt de overschrijving van Mollie als bewijs, maar laat een vinkje voorgaan", () => {
    expect(payoutState(21955, null, 21955)).toBe("provider");
    expect(payoutState(22000, null, 21955)).toBe("differs");
    expect(payoutState(22000, 22000, 21955)).toBe("checked");
    expect(payoutState(22000, 21000, null)).toBe("changed");
    expect(payoutState(22000, null, null)).toBe("open");
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
    channelsInUse: [],
    rowsPerChannelMonth: new Map<string, number>(),
    molliePaymentMonths: new Set(["2026-08", "2026-09"]),
    mollieFeeMonths: new Set(["2026-09"]),
    mollieFeeMonthsTwice: new Set<string>(),
    payouts: [
      { total: 1000, checkedAmount: 1000, providerAmount: null },
      { total: 2000, checkedAmount: 1500, providerAmount: null },
      { total: 3000, checkedAmount: null, providerAmount: null },
      { total: 4000, checkedAmount: null, providerAmount: 4000 },
      { total: 5000, checkedAmount: null, providerAmount: 4900 },
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
    expect(checks.payouts).toMatchObject({ ok: false, total: 5, checked: 2, changed: 1, differs: 1 });
    expect(checks.mollieFeesTwice).toMatchObject({ ok: true });
    expect(checks.open).toMatchObject({ ok: true });
    expect(checks.accounts).toMatchObject({ ok: false, count: 2 });
    expect(checks.feeCode).toMatchObject({ ok: false });
  });

  it("kijkt per SumUp-account of per terminal, niet enkel per bron", () => {
    const checks = computeIncomeChecks({
      ...base,
      months: ["2026-09"],
      sourcesInUse: new Set(["SUMUP"] as const),
      rowsPerSourceMonth: new Map([["SUMUP:2026-09", 851]]),
      channelsInUse: [
        { id: "theo", source: "SUMUP", name: "Theokot" },
        { id: "fak", source: "SUMUP", name: "Fakbar" },
      ],
      rowsPerChannelMonth: new Map([["theo:2026-09", 851]]),
    });
    expect(checks.find((check) => check.key === "coverage")).toMatchObject({
      ok: false,
      missing: [{ source: "SUMUP", month: "2026-09", channel: "Fakbar" }],
    });
  });

  it("vindt Mollie-kosten uit twee soorten bestanden in dezelfde maand", () => {
    const checks = computeIncomeChecks({ ...base, mollieFeeMonthsTwice: new Set(["2026-09"]) });
    expect(checks.find((check) => check.key === "mollieFeesTwice")).toMatchObject({ ok: false, months: ["2026-09"] });
  });

  it("meldt geen gat voor een maand die nog loopt", () => {
    const checks = computeIncomeChecks({ ...base, months: ["2026-10"], rowsPerSourceMonth: new Map() });
    expect(checks.find((check) => check.key === "coverage")).toMatchObject({ ok: true });
  });

  it("telt de maanden van een periode", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});
