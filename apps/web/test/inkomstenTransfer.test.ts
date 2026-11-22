import { describe, expect, it } from "vitest";
import type { CellObject } from "write-excel-file/node";
import { checkTransfer, parseTransferAmount, transferMoment } from "@/lib/inkomsten/transfer";
import { computeIncomeChecks, computeIncomeOverview, monthsBetween, type OverviewTransaction } from "@/lib/inkomsten/overview";
import { NO_SEPARATE_FEES } from "@/lib/inkomsten/lines";
import { controlWorkbook, quarterSheet, type WorkbookModel, type WorkbookTransaction } from "@/lib/inkomsten/workbook";

// Verzonnen gegevens: geen echte namen of rekeningnummers.

describe("een overschrijving invoeren", () => {
  it("leest een bedrag zoals Beheer het tikt, negatief voor een terugbetaling", () => {
    expect(parseTransferAmount("12,50")).toBe(1250);
    expect(parseTransferAmount("1.234,56")).toBe(123456);
    expect(parseTransferAmount("12.50")).toBe(1250);
    expect(parseTransferAmount("€ 5")).toBe(500);
    expect(parseTransferAmount("-12,50")).toBe(-1250);
    expect(parseTransferAmount("−8")).toBe(-800);
    expect(parseTransferAmount("")).toBeNull();
    expect(parseTransferAmount("-")).toBeNull();
    expect(parseTransferAmount("0")).toBeNull();
    expect(parseTransferAmount("twaalf")).toBeNull();
  });

  it("kijkt dag, bedrag en rekening na, en kort de omschrijving in", () => {
    expect(checkTransfer({ day: "2026-09-16", amount: "25", bankAccount: " BE00 0000 0000 1754 ", description: "  inschrijving\n galabal " })).toEqual({
      ok: true,
      day: "2026-09-16",
      amountCents: 2500,
      bankAccount: "BE00 0000 0000 1754",
      description: "inschrijving galabal",
    });
    expect(checkTransfer({ day: "2026-02-30", amount: "25", bankAccount: "x", description: "" })).toEqual({ ok: false, error: "BAD_DATE" });
    expect(checkTransfer({ day: "2026-09-16", amount: "abc", bankAccount: "x", description: "" })).toEqual({ ok: false, error: "BAD_AMOUNT" });
    expect(checkTransfer({ day: "2026-09-16", amount: "25", bankAccount: " ", description: "" })).toEqual({
      ok: false,
      error: "ACCOUNT_REQUIRED",
    });
    const long = checkTransfer({ day: "2026-09-16", amount: "25", bankAccount: "x", description: "a".repeat(300) });
    expect(long.ok && long.description?.length).toBe(200);
    const empty = checkTransfer({ day: "2026-09-16", amount: "25", bankAccount: "x", description: "   " });
    expect(empty.ok && empty.description).toBeNull();
  });

  it("zet een overschrijving om 12:00 op de Brusselse klok, zodat ze nooit van maand verschuift", () => {
    // Zomertijd (UTC+2) en wintertijd (UTC+1), ook op de laatste dag van een kwartaal.
    expect(transferMoment("2026-09-30").toISOString()).toBe("2026-09-30T10:00:00.000Z");
    expect(transferMoment("2026-12-31").toISOString()).toBe("2026-12-31T11:00:00.000Z");
  });
});

describe("overschrijvingen in het overzicht", () => {
  const row = (partial: Partial<OverviewTransaction>): OverviewTransaction => ({
    source: "TRANSFER",
    kind: "PAYMENT",
    accountingCode: "700100",
    accountingCodeName: "Activiteiten opbrengsten",
    excluded: false,
    amountCents: 0,
    bankAccount: "BE00 0000 0000 1754",
    ...partial,
  });

  it("telt ze in een eigen kolom, per rekening, onder hun code", () => {
    const overview = computeIncomeOverview(
      [
        row({ amountCents: 6875 }),
        row({ amountCents: 2000, bankAccount: "BE00 0000 0000 6140" }),
        row({ amountCents: -500, kind: "REFUND" }),
        row({ amountCents: 1200, source: "PAYCONIQ", bankAccount: "BE00 0000 0000 6140" }),
      ],
      new Map([["700100", 0]]),
      NO_SEPARATE_FEES,
    );
    expect(overview.codes).toHaveLength(1);
    expect(overview.codes[0].bySource).toMatchObject({ TRANSFER: 8375, PAYCONIQ: 1200 });
    expect(overview.totals.bySource.TRANSFER).toBe(8375);
    expect(overview.accounts).toEqual([
      { bankAccount: "BE00 0000 0000 1754", total: 6375 },
      { bankAccount: "BE00 0000 0000 6140", total: 3200 },
    ]);
  });

  it("verwacht geen overschrijving elke maand", () => {
    const checks = computeIncomeChecks({
      months: monthsBetween("2026-07", "2026-09"),
      currentMonth: "2026-10",
      sourcesInUse: new Set(["PAYCONIQ", "TRANSFER"] as const),
      rowsPerSourceMonth: new Map([
        ["PAYCONIQ:2026-07", 3],
        ["PAYCONIQ:2026-08", 3],
        ["PAYCONIQ:2026-09", 3],
        ["TRANSFER:2026-09", 1],
      ]),
      channelsInUse: [],
      rowsPerChannelMonth: new Map(),
      molliePaymentMonths: new Set(),
      mollieFeeMonths: new Set(),
      mollieFeeMonthsTwice: new Set(),
      payouts: [],
      open: { count: 0, cents: 0 },
      withoutAccount: { count: 0, cents: 0 },
      hasFees: false,
      feeCodeChosen: false,
      mollieReserve: { status: "none" },
    });
    expect(checks.find((check) => check.key === "coverage")).toMatchObject({ ok: true, missing: [] });
  });
});

describe("overschrijvingen in de Excel-bestanden", () => {
  const tx = (partial: Partial<WorkbookTransaction>): WorkbookTransaction => ({
    occurredAt: new Date("2026-09-16T10:00:00Z"),
    source: "TRANSFER",
    kind: "PAYMENT",
    channel: "BE00 0000 0000 1754",
    description: "inschrijving",
    amountCents: 0,
    periodMonth: "2026-09",
    payoutReference: null,
    bankAccount: "BE00 0000 0000 1754",
    accountingCode: "700100",
    accountingCodeName: "Activiteiten opbrengsten",
    excluded: false,
    reason: "Overschrijving, met de hand ingevoerd",
    ...partial,
  });
  const model: WorkbookModel = {
    title: "Online inkomsten september 2026",
    nl: true,
    transactions: [
      tx({ amountCents: 6875 }),
      tx({ amountCents: 2000, bankAccount: "BE00 0000 0000 6140", channel: "BE00 0000 0000 6140" }),
      tx({ amountCents: 1200, source: "PAYCONIQ", channel: "A: Evenement 1", bankAccount: "BE00 0000 0000 6140" }),
    ],
    codeOrder: new Map([["700100", 0]]),
    mainNames: new Map([["700100", "Activiteiten opbrengsten"]]),
    lineRules: NO_SEPARATE_FEES,
    mollieTransfers: null,
    feeCode: null,
    groups: [],
    payouts: [],
    imports: [],
  };
  const text = (cell: unknown) => (cell && typeof cell === "object" ? (cell as CellObject).value : cell);

  it("zet de Overschrijvingen achteraan, met een kolom per rekening", () => {
    const sheet = quarterSheet(model, { formulas: false });
    expect(sheet.data[1].slice(3, 6).map(text)).toEqual(["Payconiq", "Overschrijvingen", "Overschrijvingen"]);
    expect(sheet.data[2].slice(3, 6).map(text)).toEqual(["BE00 0000 0000 6140", "BE00 0000 0000 1754", "BE00 0000 0000 6140"]);
    const line = sheet.data.find((row) => text(row[1]) === 700100)!;
    expect(line.slice(3, 6).map(text)).toEqual([12, 68.75, 20]);
  });

  it("geeft ze een eigen tabblad met het controleblok in het controlebestand", () => {
    const sheets = controlWorkbook(model);
    const transfers = sheets.find((sheet) => sheet.sheet === "Overschrijvingen");
    expect(transfers).toBeDefined();
    expect(transfers!.data[0][14]).toMatchObject({ value: "Controle Overschrijvingen" });
    // "In het kwartaalblad" telt de twee kolommen van de Overschrijvingen (E en F).
    const quarterCell = transfers!.data.map((row) => row[15] as CellObject | null).find((cell) => cell && String(cell.value).includes("SUM("));
    expect(String(quarterCell?.value)).toMatch(/!E\d+,'?[^,]*'?!F\d+\)/);
  });
});
