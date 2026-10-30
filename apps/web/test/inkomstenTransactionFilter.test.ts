import { describe, expect, it } from "vitest";
import { codeWhere, paramGetter, parseTransactionFilter, transactionWhere } from "@/lib/inkomsten/transactionFilter";

const parse = (query: string) => parseTransactionFilter(paramGetter(new URLSearchParams(query)));

describe("parseTransactionFilter", () => {
  it("leest elke parameter van de lijst", () => {
    expect(parse("bron=sumup&kanaal=ch1&status=standaardcode&soort=betaling&van=2026-07&tot=2026-09&dag=2026-10-09&code=%20700100%2010002%20&q=quiz")).toEqual({
      source: "SUMUP",
      channelId: "ch1",
      state: { type: "rule", rule: "CHANNEL_DEFAULT" },
      kind: "PAYMENT",
      from: "2026-07",
      to: "2026-09",
      day: "2026-10-09",
      // De spatie in de code blijft: zo staat ze in het register en op de transactie.
      code: "700100 10002",
      query: "quiz",
    });
  });

  it("valt terug op alles bij een onbekende of lege waarde", () => {
    const filter = parse("bron=paypal&status=constructor&soort=toString&van=2026-13&dag=2026-02-31");
    expect(filter.source).toBeNull();
    expect(filter.state).toEqual({ type: "all" });
    expect(filter.kind).toBeNull();
    expect(filter.from).toBeNull();
    expect(filter.day).toBeNull();
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

  it("een dag loopt van 9:00 tot 9:00 de ochtend erna, zoals Na te kijken", () => {
    // 9 oktober 2026 is zomertijd (UTC+2), 10 oktober ook.
    expect(transactionWhere(parse("dag=2026-10-09")).occurredAt).toEqual({
      gte: new Date("2026-10-09T07:00:00Z"),
      lt: new Date("2026-10-10T07:00:00Z"),
    });
    // Over de overgang naar wintertijd (25 oktober 2026) blijft het 9:00 Brusselse tijd.
    expect(transactionWhere(parse("dag=2026-10-25")).occurredAt).toEqual({
      gte: new Date("2026-10-25T08:00:00Z"),
      lt: new Date("2026-10-26T08:00:00Z"),
    });
  });
});

describe("codeWhere", () => {
  it("een volledige code is die code en niet haar subcodes", () => {
    // Zo linkt een rij van het overzicht: het totaal moet gelijk blijven.
    expect(codeWhere("700100")).toEqual({ accountingCode: "700100" });
    expect(codeWhere(" 700100  10002 ")).toEqual({ accountingCode: "700100 10002" });
  });

  it("aaneen getypt zijn het beide schrijfwijzen", () => {
    expect(codeWhere("70010010002")).toEqual({ accountingCode: { in: ["700100 10002", "70010010002"] } });
  });

  it("een deel van een nummer is het begin van de code", () => {
    expect(codeWhere("7001")).toEqual({ accountingCode: { startsWith: "7001" } });
    expect(codeWhere("70010010")).toEqual({ accountingCode: { startsWith: "700100 10" } });
  });

  it("met letters zoekt het in de naam", () => {
    expect(codeWhere("Theokot")).toEqual({ accountingCodeName: { contains: "Theokot", mode: "insensitive" } });
  });
});
