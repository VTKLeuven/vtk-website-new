import { describe, expect, it } from "vitest";
import { paramGetter, parseTransactionFilter, transactionWhere } from "@/lib/inkomsten/transactionFilter";

const parse = (query: string) => parseTransactionFilter(paramGetter(new URLSearchParams(query)));

describe("parseTransactionFilter", () => {
  it("leest elke parameter van de lijst", () => {
    expect(parse("bron=sumup&kanaal=ch1&status=standaardcode&soort=betaling&van=2026-07&tot=2026-09&code=%20700100%2010002%20&q=quiz")).toEqual({
      source: "SUMUP",
      channelId: "ch1",
      state: { type: "rule", rule: "CHANNEL_DEFAULT" },
      kind: "PAYMENT",
      from: "2026-07",
      to: "2026-09",
      // De spatie in de code blijft: zo staat ze in het register en op de transactie.
      code: "700100 10002",
      query: "quiz",
    });
  });

  it("valt terug op alles bij een onbekende of lege waarde", () => {
    const filter = parse("bron=paypal&status=constructor&soort=toString&van=2026-13");
    expect(filter.source).toBeNull();
    expect(filter.state).toEqual({ type: "all" });
    expect(filter.kind).toBeNull();
    expect(filter.from).toBeNull();
  });

  it("leest de searchParams van een pagina", () => {
    const filter = parseTransactionFilter(paramGetter({ status: "telt-niet-mee", bron: ["mollie", "sumup"] }));
    expect(filter.state).toEqual({ type: "excluded" });
    expect(filter.source).toBeNull();
  });
});

describe("transactionWhere", () => {
  it("na te kijken is enkel een betaling of terugbetaling zonder regel", () => {
    expect(transactionWhere(parse("status=na-te-kijken")).AND).toEqual([
      { rule: null, excluded: false, kind: { in: ["PAYMENT", "REFUND"] } },
      {},
    ]);
  });

  it("een stand en een soort moeten allebei gelden", () => {
    // Na te kijken en kosten samen is niets: kosten krijgen nooit een code.
    expect(transactionWhere(parse("status=na-te-kijken&soort=kosten")).AND).toEqual([
      { rule: null, excluded: false, kind: { in: ["PAYMENT", "REFUND"] } },
      { kind: "FEE" },
    ]);
  });

  it("een regel telt enkel wat meetelt", () => {
    expect(transactionWhere(parse("status=met-de-hand")).AND).toEqual([{ rule: "MANUAL", excluded: false }, {}]);
  });

  it("de periode gaat op de maand waarin een transactie telt", () => {
    const where = transactionWhere(parse("van=2026-07&tot=2026-09&bron=mollie&code=700100"));
    expect(where.periodMonth).toEqual({ gte: new Date("2026-07-01T00:00:00Z"), lte: new Date("2026-09-01T00:00:00Z") });
    expect(where.source).toBe("MOLLIE");
    expect(where.accountingCode).toBe("700100");
  });
});
