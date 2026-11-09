import { describe, expect, it } from "vitest";
import { groupTicketCents, ticketTotalsPerCode, type TicketCodeSum } from "@/lib/accounting/ticketTotals";

const codes = [
  { id: "main", code: "700120" },
  { id: "sub", code: "700120 12002" },
];

function sum(accountingCode: string | null, totalCents: number, refundedCents = 0, accountingCodeName: string | null = null): TicketCodeSum {
  return { accountingCode, accountingCodeName, totalCents, refundedCents };
}

describe("ticketTotalsPerCode", () => {
  it("telt netto na terugbetalingen", () => {
    expect(ticketTotalsPerCode(codes, [sum("700120", 5000, 1500)]).byId.get("main")).toBe(3500);
  });

  it("voegt twee namen van dezelfde code samen", () => {
    const { byId, unlisted } = ticketTotalsPerCode(codes, [
      sum("700120 12002", 1000, 0, "Oude naam"),
      sum("700120 12002", 2000, 0, "Nieuwe naam"),
    ]);
    expect(byId.get("sub")).toBe(3000);
    expect(unlisted).toEqual([]);
  });

  it("laat niets verdwijnen: een oude code en geen code staan apart, zonder code onderaan", () => {
    const { byId, unlisted } = ticketTotalsPerCode(codes, [
      sum(null, 900),
      sum("700999", 400, 100, "Weg"),
      sum("700999", 100, 0, "Weg"),
    ]);
    expect(byId.size).toBe(0);
    expect(unlisted).toEqual([
      { code: "700999", name: "Weg", netCents: 400 },
      { code: null, name: null, netCents: 900 },
    ]);
  });

  it("een volledig terugbetaalde code blijft zichtbaar met nul", () => {
    expect(ticketTotalsPerCode(codes, [sum("700120", 500, 500)]).byId.get("main")).toBe(0);
  });
});

describe("groupTicketCents", () => {
  it("telt de hoofdrekening en haar subcodes samen", () => {
    expect(groupTicketCents([100, null, 250])).toBe(350);
  });

  it("zegt niets wanneer er nog niets verkocht is, maar wel nul bij een terugbetaling", () => {
    expect(groupTicketCents([null, null])).toBeNull();
    expect(groupTicketCents([0, null])).toBe(0);
  });
});
