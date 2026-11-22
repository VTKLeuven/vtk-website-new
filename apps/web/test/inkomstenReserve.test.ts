import { describe, expect, it } from "vitest";
import { lineRulesOf, parseIncomeConfig } from "@/lib/inkomsten/config";
import { computeMollieReserve, type MollieCompleteness, type ReserveRow, type ReserveTransfer } from "@/lib/inkomsten/reserve";

// Verzonnen gegevens: geen echte namen, rekeningnummers of betaal-ID's. De
// bedragen zijn de som per soort van het derde kwartaal van 2026 van Beheer.

const complete: MollieCompleteness = { missingInBalance: { count: 0, cents: 0 }, missingInExport: { count: 0, cents: 0 } };
const row = (partial: Partial<ReserveRow>): ReserveRow => ({ kind: "PAYMENT", amountCents: 0, bankAccount: "…6140", notCounted: false, ...partial });
const transfer = (amountCents: number, paidOn: string, bankAccount = "…6140"): ReserveTransfer => ({
  reference: `12345678.${paidOn.slice(2, 4)}${paidOn.slice(5, 7)}.01`,
  paidOn,
  amountCents,
  bankAccount,
});

const q3Rows = [
  row({ amountCents: 913050 }),
  row({ kind: "FEE", amountCents: -14217 }),
  row({ kind: "FEE", amountCents: 16 }),
  row({ kind: "RESERVE", amountCents: -28570 }),
  row({ kind: "RESERVE", amountCents: 28570 }),
];
const q3Transfers = [transfer(500000, "2026-08-31"), transfer(376160, "2026-09-28")];

describe("de wijziging van de dynamische reserve", () => {
  it("is overgeschreven min alles van Mollie: -226,89 voor het derde kwartaal", () => {
    const result = computeMollieReserve({ rows: q3Rows, transfers: q3Transfers, completeness: complete });
    if (result.status !== "known") throw new Error(result.status);
    expect(result.cents).toBe(-22689);
    expect(result.transfersCents).toBe(876160);
    expect(result.transferCount).toBe(2);
    const [account] = result.accounts;
    expect(account).toMatchObject({ bankAccount: "…6140", paymentsCents: 913050, feesCents: -14201, storedReserveCents: 0, lastTransferOn: "2026-09-28" });
    // De regel in het overzicht: Mollies eigen reserveregels plus het berekende bedrag.
    expect(account.lineCents).toBe(-22689);
    // Betalingen, kosten en reserve samen zijn dan precies wat Mollie overschreef.
    expect(913050 - 14201 + account.lineCents).toBe(876160);
  });

  it("laat een uitgesloten betaling niet als reserve terugkomen", () => {
    const rows = [...q3Rows, row({ amountCents: 1000, notCounted: true })];
    const result = computeMollieReserve({ rows, transfers: q3Transfers, completeness: complete });
    if (result.status !== "known") throw new Error(result.status);
    // Wat meetelt (zonder de 1000) plus de reserve is de overschrijving min de uitgesloten betaling.
    const counted = 913050 - 14201;
    expect(counted + result.cents).toBe(876160 - 1000);
    expect(result.accounts[0].notCountedCents).toBe(1000);
  });

  it("met de Mollie-kosten op een aparte factuur is de kolom de overschrijving plus die kosten", () => {
    const rows = q3Rows.map((line) => (line.kind === "FEE" ? { ...line, notCounted: true } : line));
    const result = computeMollieReserve({ rows, transfers: q3Transfers, completeness: complete });
    if (result.status !== "known") throw new Error(result.status);
    expect(913050 + result.cents).toBe(890361);
    expect(913050 + result.cents).toBe(876160 + 14201);
  });

  it("rekent per rekening, ook na een wissel midden in de periode", () => {
    const rows = [row({ amountCents: 600, bankAccount: "…1111" }), row({ amountCents: 400, bankAccount: "…2222" })];
    const transfers = [transfer(550, "2026-08-10", "…1111"), transfer(300, "2026-09-14", "…2222")];
    const result = computeMollieReserve({ rows, transfers, completeness: complete });
    if (result.status !== "known") throw new Error(result.status);
    expect(result.accounts.map((account) => [account.bankAccount, account.cents])).toEqual([
      ["…1111", -50],
      ["…2222", -100],
    ]);
    expect(result.cents).toBe(-150);
  });

  it("is positief wanneer Mollie betalingen van de vorige periode overschrijft", () => {
    const result = computeMollieReserve({ rows: [row({ amountCents: 70200 })], transfers: [transfer(70200 + 2800, "2026-10-05")], completeness: complete });
    expect(result).toMatchObject({ status: "known", cents: 2800 });
  });

  it("is onbekend zolang de betalingenexport en het balansrapport niet dezelfde betalingen noemen", () => {
    const missing = { ...complete, missingInBalance: { count: 3, cents: 4200 } };
    expect(computeMollieReserve({ rows: q3Rows, transfers: q3Transfers, completeness: missing })).toEqual({ status: "unknown", completeness: missing });
    const extra = { ...complete, missingInExport: { count: 1, cents: 1400 } };
    expect(computeMollieReserve({ rows: q3Rows, transfers: q3Transfers, completeness: extra })).toMatchObject({ status: "unknown" });
  });

  it("is er niet zonder Mollie in de periode", () => {
    expect(computeMollieReserve({ rows: [], transfers: [], completeness: complete })).toEqual({ status: "none" });
  });
});

describe("de instellingen", () => {
  it("lezen voorzichtig: onbekende bronnen en vreemde waarden vallen weg", () => {
    expect(parseIncomeConfig(null)).toEqual({ feeAccountingCodeId: null, separateFeeSources: [] });
    expect(parseIncomeConfig({ feeAccountingCodeId: 12, separateFeeSources: "SUMUP" })).toEqual({ feeAccountingCodeId: null, separateFeeSources: [] });
    expect(parseIncomeConfig({ feeAccountingCodeId: "code-1", separateFeeSources: ["SUMUP", "PAYCONIQ", "IETS", "MOLLIE"] })).toEqual({
      feeAccountingCodeId: "code-1",
      separateFeeSources: ["MOLLIE", "SUMUP"],
    });
  });

  it("geven de regels voor wat meetelt", () => {
    expect([...lineRulesOf(parseIncomeConfig({ separateFeeSources: ["SUMUP"] })).separateFeeSources]).toEqual(["SUMUP"]);
    expect(lineRulesOf(parseIncomeConfig({})).separateFeeSources.size).toBe(0);
  });
});
