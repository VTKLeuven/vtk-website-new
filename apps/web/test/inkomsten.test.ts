import { describe, expect, it } from "vitest";
import {
  cleanDescription,
  parseDecimalCents,
  parseIncomeExport,
  parseLocalDateTime,
  payoutMonth,
  type ParsedIncomeRow,
} from "@/lib/inkomsten/parse";
import { codeAtStart, incomeRuleText, matchTransaction, nameRuleKey, type MatchContext } from "@/lib/inkomsten/match";
import { accountOn, computeIncomeOverview, type OverviewTransaction } from "@/lib/inkomsten/overview";

// Verzonnen gegevens: geen echte namen, rekeningnummers of betaal-ID's.

const PAYCONIQ = [
  "id;date;time;amount;status;technology;type;description;reference;debtor_iban;debtor_name;shop_name;bulk_id",
  "txaaaaaaaaaaaaaaaaaaaaa1;13/09/2026;19:31:42;1.20;SUCCEEDED;WERO;CREDIT;;;BE00000000000001;PERSOON A;A: Evenement 3;",
  "txaaaaaaaaaaaaaaaaaaaaa2;13/09/2026;20:15:59;4.80;FAILED;WERO;CREDIT;;;BE00000000000002;PERSOON B;A: Evenement 3;",
  "txaaaaaaaaaaaaaaaaaaaaa3;01/10/2026;00:18:00;12.00;SUCCEEDED;BANCONTACT;CREDIT;1 ticket Cantus;700100 10001;BE00000000000003;PERSOON C;Ticketsysteem;700100 10001",
  "txaaaaaaaaaaaaaaaaaaaaa4;02/10/2026;10:00:00;3.00;SUCCEEDED;WERO;DEBIT;terug;;BE00000000000004;PERSOON D;A: Theokot;",
].join("\n");

const MOLLIE_EN = [
  'Date,"Payment method",Currency,Amount,Status,ID,Description,"Consumer name","Consumer bank account","Consumer BIC","Settlement currency","Settlement amount","Settlement reference","Amount refunded"',
  '"2026-09-30 22:10:00",creditcard,EUR,55.00,paidout,tr_test1,"700100 10001 Cantus der Cantussen",,BE00000000000005,TESTBEBB,EUR,55.00,12345678.2610.01,0.00',
  '"2026-09-30 22:11:00",kbc,EUR,10.00,expired,tr_test2,"Iets",,,,,,,',
  '"2026-08-31 23:59:59",,EUR,-43.42,,,"Withheld fees MOL-NL-R2026.0001",,,,EUR,-43.42,12345678.2609.01,',
  '"2026-08-31 23:59:59",rollingreserve,EUR,-11.00,,,"Withheld of Credit card rolling reserve",,,,EUR,-11.00,12345678.2609.01,',
  '"2026-09-24 17:46:29",creditcard,EUR,10.00,paid,tr_test3,"Uniflow Printer Credit: iemand@student.kuleuven.be",,,,EUR,10.00,,0.00',
].join("\n");

// Zoals het Mollie-tabblad van Beheer: Nederlandse koppen, drie eigen kolommen vooraan.
const MOLLIE_NL = [
  "Naam event,Uitbetalingsperiode,Boekhoudcode,Datum,Betaalmethode,Valuta,Bedrag,Status,ID,Omschrijving,Naam consument,Rekening consument,BIC consument,Uitbetalingsvaluta,Uitbetalingsbedrag,Uitbetalingsreferentie,Teruggestort bedrag",
  'Onthaaldagen,2508,700100,4-8-2025 6:14:00,mistercash,EUR,"50,00",paidout,tr_test4,AB12CD34 - 1 ticket(s) for event Onthaaldagen,,,,EUR,"50,00",12345678.2508.01,',
  'Onthaaldagen,2508,700100,5-8-2025 9:00:00,mistercash,EUR,"50,00",refunded,tr_test5,AB12CD35 - 1 ticket(s) for event Onthaaldagen,,,,EUR,"50,00",12345678.2508.01,"50,00"',
  ',2509,,6-9-2025 6:14:00,refund,EUR,"-50,00",,re_test6,AB12CD35 - 1 ticket(s) for event Onthaaldagen,,,,EUR,"-50,00",12345678.2509.01,',
].join("\n");

function rowsOf(text: string): ParsedIncomeRow[] {
  const result = parseIncomeExport(text);
  if (!result.ok) throw new Error(result.error);
  return result.rows;
}

describe("bedragen, datums en tekst", () => {
  it("leest bedragen met komma of punt en met teken", () => {
    expect(parseDecimalCents("19.20")).toBe(1920);
    expect(parseDecimalCents("19,20")).toBe(1920);
    expect(parseDecimalCents("-1.17")).toBe(-117);
    expect(parseDecimalCents("1.234,56")).toBe(123456);
    expect(parseDecimalCents("1,234.56")).toBe(123456);
    expect(parseDecimalCents("")).toBeNull();
    expect(parseDecimalCents("abc")).toBeNull();
  });

  it("leest de datums van de exports en van Google Sheets", () => {
    expect(parseLocalDateTime("2026-08-01 03:35:15")).toEqual({ year: 2026, month: 8, day: 1, minutes: 215, seconds: 15 });
    expect(parseLocalDateTime("16/08/2026", "00:52:40")).toEqual({ year: 2026, month: 8, day: 16, minutes: 52, seconds: 40 });
    expect(parseLocalDateTime("4-8-2025 6:14:00")).toEqual({ year: 2025, month: 8, day: 4, minutes: 374, seconds: 0 });
    expect(parseLocalDateTime("5/3/2026")).toEqual({ year: 2026, month: 3, day: 5, minutes: 0, seconds: 0 });
    expect(parseLocalDateTime("31/02/20026")).toBeNull();
  });

  it("haalt de maand uit een Mollie-uitbetalingsreferentie", () => {
    expect(payoutMonth("17112539.2510.03")).toBe("2025-10");
    expect(payoutMonth("")).toBeNull();
    expect(payoutMonth("17112539.2513.01")).toBeNull();
  });

  it("haalt e-mailadressen uit een omschrijving", () => {
    expect(cleanDescription("Uniflow Printer Credit: iemand@student.kuleuven.be")).toBe("Uniflow Printer Credit");
    expect(cleanDescription("  ")).toBeNull();
  });
});

describe("Payconiq", () => {
  it("telt enkel geslaagde betalingen, en een DEBIT als terugbetaling", () => {
    const result = parseIncomeExport(PAYCONIQ);
    expect(result.ok && result.format).toBe("payconiq");
    if (!result.ok) return;
    expect(result.total).toBe(4);
    expect(result.skipped).toBe(1);
    expect(result.rows.map((row) => [row.kind, row.amountCents, row.channel])).toEqual([
      ["PAYMENT", 120, "A: Evenement 3"],
      ["PAYMENT", 1200, "Ticketsysteem"],
      ["REFUND", -300, "A: Theokot"],
    ]);
  });

  it("rekent op de Brusselse klok: 1 oktober 00:18 is oktober, ook al is het in UTC nog september", () => {
    const row = rowsOf(PAYCONIQ)[1];
    expect(row.periodMonth).toBe("2026-10");
    expect(row.occurredAt.toISOString()).toBe("2026-09-30T22:18:00.000Z");
    expect(row.reference).toBe("700100 10001");
    expect(row.externalKey).toBe("PAYMENT:txaaaaaaaaaaaaaaaaaaaaa3");
  });

  it("bewaart geen namen of rekeningnummers van wie betaalde", () => {
    const text = JSON.stringify(rowsOf(PAYCONIQ));
    expect(text).not.toContain("PERSOON");
    expect(text).not.toContain("BE00000000000001");
  });
});

describe("Mollie", () => {
  it("herkent betalingen, kosten en reserve, en slaat vervallen betalingen over", () => {
    const result = parseIncomeExport(MOLLIE_EN);
    expect(result.ok && result.format).toBe("mollie");
    if (!result.ok) return;
    expect(result.skipped).toBe(1);
    expect(result.rows.map((row) => [row.kind, row.amountCents, row.periodMonth])).toEqual([
      ["PAYMENT", 5500, "2026-10"],
      ["FEE", -4342, "2026-09"],
      ["RESERVE", -1100, "2026-09"],
      ["PAYMENT", 1000, null],
    ]);
  });

  it("telt een betaling in de maand van haar uitbetaling", () => {
    // Betaald op 30 september, uitbetaald in oktober: telt in oktober, zoals het rekenblad.
    expect(rowsOf(MOLLIE_EN)[0].periodMonth).toBe("2026-10");
  });

  it("leest de Nederlandse koppen van het tabblad van Beheer", () => {
    const rows = rowsOf(MOLLIE_NL);
    expect(rows.map((row) => [row.kind, row.amountCents, row.refundedCents, row.periodMonth])).toEqual([
      ["PAYMENT", 5000, 0, "2025-08"],
      ["PAYMENT", 5000, 5000, "2025-08"],
      ["REFUND", -5000, 0, "2025-09"],
    ]);
  });

  it("telt een terugbetaling in de uitbetaling waarvan ze afging, met haar eigen ID", () => {
    const refund = rowsOf(MOLLIE_NL)[2];
    expect(refund.externalKey).toBe("REFUND:re_test6");
    expect(refund.providerId).toBe("re_test6");
  });

  it("geeft een regel zonder ID een vaste sleutel, ook twee keer opgeladen", () => {
    const first = rowsOf(MOLLIE_EN).find((row) => row.kind === "FEE")!;
    const second = rowsOf(MOLLIE_EN).find((row) => row.kind === "FEE")!;
    expect(first.externalKey).toBe(second.externalKey);
    expect(first.externalKey.startsWith("FEE:h:")).toBe(true);
  });

  it("zegt het wanneer het balansrapport opgeladen wordt", () => {
    const balance = 'Date,"Transaction type","Payment method","Transaction reference",Description,"Settlement amount"\n"2026-08-03 06:31:33",transfer,,1.2608.01,x,-1.00';
    expect(parseIncomeExport(balance)).toEqual({ ok: false, error: "MOLLIE_BALANCE" });
  });

  it("weigert een bestand met een onleesbaar bedrag in plaats van het over te slaan", () => {
    const broken = MOLLIE_EN.replace("55.00,12345678.2610.01", "veel,12345678.2610.01");
    const result = parseIncomeExport(broken);
    expect(result.ok).toBe(false);
  });
});

describe("koppelregels", () => {
  const codes = new Map([
    ["700100", { code: "700100", name: "Activiteiten" }],
    ["70010010001", { code: "700100 10001", name: "Cantussen" }],
    ["700000", { code: "700000", name: "Cursusdienst" }],
  ]);
  const context: MatchContext = {
    website: new Map([
      ["tr_site", { code: "730000", name: "Lidgelden", membershipPaymentId: "mp1" }],
      ["tr_uitleen", { code: null, name: null, uitleenPaymentId: "up1" }],
    ]),
    codes,
    nameRules: new Map([[nameRuleKey("MOLLIE", "vtk uitleendienst"), { code: "700000", name: "Cursusdienst" }]]),
    ownAccountChannels: new Map([["kanaal-theokot", "Theokot"]]),
  };
  const base = {
    source: "MOLLIE" as const,
    kind: "PAYMENT" as const,
    providerId: null,
    description: null,
    reference: null,
    bulkId: null,
    channelId: null,
  };

  it("koppelt een betaling van de site op haar ID, met de code van de bestelling", () => {
    const result = matchTransaction({ ...base, providerId: "tr_site", description: "700100 Iets anders" }, context);
    expect(result.rule).toBe("WEBSITE");
    expect(result.code?.code).toBe("730000");
    expect(result.membershipPaymentId).toBe("mp1");
  });

  it("vindt de code vooraan in de omschrijving, ook aaneengeschreven", () => {
    expect(codeAtStart("700100 10001 Cantus", codes)?.code).toBe("700100 10001");
    expect(codeAtStart("70010010001 Cantus", codes)?.code).toBe("700100 10001");
    expect(codeAtStart("700100 99999 Onbekend", codes)?.code).toBe("700100");
    expect(codeAtStart("1234567 iets", codes)).toBeNull();
    const result = matchTransaction({ ...base, source: "PAYCONIQ", reference: "700100 10001" }, context);
    expect(result).toMatchObject({ rule: "CODE_IN_TEXT", code: { code: "700100 10001" } });
  });

  it("valt voor een betaling van de site zonder code terug op een onthouden tekst", () => {
    const result = matchTransaction({ ...base, providerId: "tr_uitleen", description: "VTK uitleendienst - 3F9A21BC" }, context);
    expect(result).toMatchObject({ rule: "NAME_RULE", code: { code: "700000" }, uitleenPaymentId: "up1" });
  });

  it("laat een kanaal op de eigen rekening van een post niet meetellen", () => {
    const result = matchTransaction({ ...base, source: "PAYCONIQ", channelId: "kanaal-theokot", description: "broodje" }, context);
    expect(result).toMatchObject({ rule: "OWN_ACCOUNT", code: null });
  });

  it("laat een exacte koppeling voorgaan op de eigen rekening", () => {
    const result = matchTransaction(
      { ...base, source: "PAYCONIQ", channelId: "kanaal-theokot", reference: "700100 10001" },
      context,
    );
    expect(result.rule).toBe("CODE_IN_TEXT");
  });

  it("laat de rest na te kijken, en koppelt geen kosten", () => {
    expect(matchTransaction({ ...base, description: "Iets nieuws" }, context).rule).toBeNull();
    expect(matchTransaction({ ...base, kind: "FEE", description: "700100 Withheld" }, context).rule).toBeNull();
  });

  it("maakt een onthouden tekst zonder ordernummer", () => {
    expect(incomeRuleText("BE3A8577 - 1 ticket(s) for event Onthaaldagen")).toBe("onthaaldagen");
    expect(incomeRuleText("Oktoberfest - VTK-26-4A15A3AB89")).toBe("oktoberfest");
    expect(incomeRuleText("Uniflow Printer Credit")).toBe("uniflow printer credit");
    expect(incomeRuleText("Cantus - 2026")).toBe("cantus - 2026");
  });
});

describe("overzicht", () => {
  const tx = (partial: Partial<OverviewTransaction>): OverviewTransaction => ({
    source: "MOLLIE",
    kind: "PAYMENT",
    accountingCode: null,
    accountingCodeName: null,
    excluded: false,
    rule: null,
    amountCents: 0,
    bankAccount: "…6140",
    ...partial,
  });

  it("laat het Mollie-totaal kloppen met de uitbetalingen: betalingen, kosten en reserve", () => {
    const overview = computeIncomeOverview(
      [
        tx({ accountingCode: "700100", accountingCodeName: "Activiteiten", amountCents: 913050 }),
        tx({ kind: "FEE", amountCents: -14201 }),
        tx({ kind: "RESERVE", amountCents: -22689 }),
      ],
      new Map(),
    );
    expect(overview.totals.bySource.MOLLIE).toBe(876160);
    expect(overview.fees.total).toBe(-14201);
    expect(overview.reserve.total).toBe(-22689);
  });

  it("zet de codes in de volgorde van het register, met wat na te kijken is apart", () => {
    const overview = computeIncomeOverview(
      [
        tx({ accountingCode: "700110", accountingCodeName: "Cultuur", amountCents: 100 }),
        tx({ accountingCode: "700100 10001", accountingCodeName: "Cantussen", amountCents: 200, source: "PAYCONIQ" }),
        tx({ amountCents: 50 }),
        tx({ amountCents: 999, excluded: true, accountingCode: "700100" }),
      ],
      new Map([
        ["70010010001", 0],
        ["700110", 1],
      ]),
    );
    expect(overview.codes.map((row) => row.code)).toEqual(["700100 10001", "700110"]);
    expect(overview.unassigned.total).toBe(50);
    expect(overview.excluded.total).toBe(999);
    expect(overview.totals.total).toBe(350);
  });

  it("telt een transactie op de eigen rekening van een post niet mee", () => {
    const overview = computeIncomeOverview(
      [
        tx({ accountingCode: "700100", accountingCodeName: "Activiteiten", amountCents: 500, source: "PAYCONIQ" }),
        tx({ rule: "OWN_ACCOUNT", amountCents: 250, source: "PAYCONIQ", bankAccount: "…9348" }),
      ],
      new Map(),
    );
    expect(overview.totals.total).toBe(500);
    expect(overview.ownAccount.total).toBe(250);
    expect(overview.accounts.map((account) => account.bankAccount)).toEqual(["…6140"]);
  });

  it("kiest de rekening die op die dag gold", () => {
    const accounts = [
      { from: "2025-09-01", bankAccount: "…7337" },
      { from: "2025-11-26", bankAccount: "…9348" },
    ];
    expect(accountOn(accounts, "2025-11-25")).toBe("…7337");
    expect(accountOn(accounts, "2025-11-26")).toBe("…9348");
    expect(accountOn(accounts, "2025-08-31")).toBeNull();
  });

});
