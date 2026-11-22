import { describe, expect, it } from "vitest";
import { codeWhere, paramGetter, parseTransactionFilter, transactionWhere } from "@/lib/inkomsten/transactionFilter";

const parse = (query: string) => parseTransactionFilter(paramGetter(new URLSearchParams(query)));

describe("parseTransactionFilter", () => {
  it("leest elke parameter van de lijst", () => {
    expect(
      parse(
        "bron=sumup&kanaal=ch1&status=standaardcode&soort=betaling&van=2026-07&tot=2026-09&dag=2026-10-09&van-dag=2026-09-16&tot-dag=2026-09-23&uitlening=%20ln1%20&code=%20700100%2010002%20&q=quiz",
      ),
    ).toEqual({
      source: "SUMUP",
      channelId: "ch1",
      state: { type: "rule", rule: "CHANNEL_DEFAULT" },
      kind: "PAYMENT",
      from: "2026-07",
      to: "2026-09",
      day: "2026-10-09",
      dayFrom: "2026-09-16",
      dayTo: "2026-09-23",
      lendingId: "ln1",
      // De spatie in de code blijft: zo staat ze in het register en op de transactie.
      code: "700100 10002",
      query: "quiz",
    });
  });

  it("valt terug op alles bij een onbekende of lege waarde", () => {
    const filter = parse("bron=paypal&status=constructor&soort=toString&van=2026-13&dag=2026-02-31&van-dag=2026-02-30&tot-dag=morgen");
    expect(filter.source).toBeNull();
    expect(filter.state).toEqual({ type: "all" });
    expect(filter.kind).toBeNull();
    expect(filter.from).toBeNull();
    expect(filter.day).toBeNull();
    expect(filter.dayFrom).toBeNull();
    expect(filter.dayTo).toBeNull();
    expect(filter.lendingId).toBeNull();
  });

  it("draait een omgekeerde reeks van dagen om", () => {
    const filter = parse("van-dag=2026-10-05&tot-dag=2026-10-01");
    expect([filter.dayFrom, filter.dayTo]).toEqual(["2026-10-01", "2026-10-05"]);
  });

  it("leest de uitlening als stand", () => {
    expect(parse("status=uitlening").state).toEqual({ type: "rule", rule: "CHANNEL_LENDING" });
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
      {},
      {},
    ]);
  });

  it("een stand en een soort moeten allebei gelden", () => {
    // Na te kijken en kosten samen is niets: kosten krijgen nooit een code.
    expect(transactionWhere(parse("status=na-te-kijken&soort=kosten")).AND).toEqual([
      { rule: null, excluded: false, kind: { in: ["PAYMENT", "REFUND"] } },
      { kind: "FEE" },
      {},
      {},
    ]);
  });

  it("een regel telt enkel wat meetelt", () => {
    expect(transactionWhere(parse("status=met-de-hand")).AND).toEqual([{ rule: "MANUAL", excluded: false }, {}, {}, {}]);
  });

  it("de periode gaat op de maand waarin een transactie telt", () => {
    const where = transactionWhere(parse("van=2026-07&tot=2026-09&bron=mollie&code=700100"));
    expect(where.periodMonth).toEqual({ gte: new Date("2026-07-01T00:00:00Z"), lte: new Date("2026-09-01T00:00:00Z") });
    expect(where.source).toBe("MOLLIE");
    expect(where.accountingCode).toBe("700100");
  });

  const occurredAt = (query: string) => (transactionWhere(parse(query)).AND as Array<{ occurredAt?: unknown }>).map((part) => part.occurredAt);

  it("een dag loopt van 9:00 tot 9:00 de ochtend erna, zoals Na te kijken", () => {
    // 9 oktober 2026 is zomertijd (UTC+2), 10 oktober ook.
    expect(occurredAt("dag=2026-10-09")[2]).toEqual({
      gte: new Date("2026-10-09T07:00:00Z"),
      lt: new Date("2026-10-10T07:00:00Z"),
    });
    // Over de overgang naar wintertijd (25 oktober 2026) blijft het 9:00 Brusselse tijd.
    expect(occurredAt("dag=2026-10-25")[2]).toEqual({
      gte: new Date("2026-10-25T08:00:00Z"),
      lt: new Date("2026-10-26T08:00:00Z"),
    });
  });

  it("betaald van en tot en met loopt van 9:00 op de eerste tot 9:00 na de laatste", () => {
    expect(occurredAt("van-dag=2026-09-30&tot-dag=2026-09-30")[3]).toEqual({
      gte: new Date("2026-09-30T07:00:00Z"),
      lt: new Date("2026-10-01T07:00:00Z"),
    });
    // Over de nacht naar wintertijd: van 9:00 zomertijd tot 9:00 wintertijd, 25 uur.
    expect(occurredAt("van-dag=2026-10-24&tot-dag=2026-10-24")[3]).toEqual({
      gte: new Date("2026-10-24T07:00:00Z"),
      lt: new Date("2026-10-25T08:00:00Z"),
    });
    // En naar zomertijd (29 maart 2026): 23 uur.
    expect(occurredAt("van-dag=2026-03-28&tot-dag=2026-03-28")[3]).toEqual({
      gte: new Date("2026-03-28T08:00:00Z"),
      lt: new Date("2026-03-29T07:00:00Z"),
    });
  });

  it("een open grens begrenst niet", () => {
    expect(occurredAt("van-dag=2026-10-01")[3]).toEqual({ gte: new Date("2026-10-01T07:00:00Z") });
    expect(occurredAt("tot-dag=2026-10-31")[3]).toEqual({ lt: new Date("2026-11-01T08:00:00Z") });
  });

  it("een dag en een reeks gelden allebei", () => {
    // Beide begrenzen `occurredAt`: in één object zou de ene de andere overschrijven.
    const parts = occurredAt("dag=2026-10-09&van-dag=2026-10-01&tot-dag=2026-10-31");
    expect(parts[2]).toEqual({ gte: new Date("2026-10-09T07:00:00Z"), lt: new Date("2026-10-10T07:00:00Z") });
    expect(parts[3]).toEqual({ gte: new Date("2026-10-01T07:00:00Z"), lt: new Date("2026-11-01T08:00:00Z") });
  });

  it("een uitlening filtert op haar transacties", () => {
    expect(transactionWhere(parse("uitlening=ln1")).channelLendingId).toBe("ln1");
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
