import { describe, expect, it } from "vitest";
import {
  EXPORT_COLUMNS,
  SUMUP_CHANNEL,
  cleanDescription,
  compactTime,
  headerKey,
  parseDecimalCents,
  parseIncomeExport,
  parseLocalDateTime,
  type ParsedIncomeRow,
} from "@/lib/inkomsten/parse";
import { codeAtStart, deviceAt, incomeRuleText, lendingOn, matchTransaction, nameRuleKey, type MatchContext, type MatchInput } from "@/lib/inkomsten/match";
import { accountOn, computeIncomeOverview, reviewDay, type OverviewTransaction } from "@/lib/inkomsten/overview";
import { NO_SEPARATE_FEES } from "@/lib/inkomsten/lines";
import { combineImportSummaries } from "@/lib/inkomsten/importSummary";
import {
  controlSpanLabel,
  deviceWindow,
  importAmountOf,
  kassaCheck,
  kassaControlState,
  kassaControlWindow,
  type DeviceUse,
} from "@/lib/inkomsten/kassa";
import type { ImportSummary } from "@/lib/inkomsten/server";

// Verzonnen gegevens: geen echte namen, rekeningnummers of betaal-ID's.

const PAYCONIQ = [
  "id;date;time;amount;status;technology;type;description;reference;debtor_iban;debtor_name;shop_name;bulk_id",
  "txaaaaaaaaaaaaaaaaaaaaa1;13/09/2026;19:31:42;1.20;SUCCEEDED;WERO;CREDIT;;;BE00000000000001;PERSOON A;A: Evenement 3;",
  "txaaaaaaaaaaaaaaaaaaaaa2;13/09/2026;20:15:59;4.80;FAILED;WERO;CREDIT;;;BE00000000000002;PERSOON B;A: Evenement 3;",
  "txaaaaaaaaaaaaaaaaaaaaa3;01/10/2026;00:18:00;12.00;SUCCEEDED;BANCONTACT;CREDIT;1 ticket Cantus;700100 10001;BE00000000000003;PERSOON C;Ticketsysteem;700100 10001",
  "txaaaaaaaaaaaaaaaaaaaaa4;02/10/2026;10:00:00;3.00;SUCCEEDED;WERO;DEBIT;terug;;BE00000000000004;PERSOON D;A: Theokot;",
].join("\n");

// De tweede export van het portaal: andere koppen, andere volgorde, komma's,
// en per betaling haar uitbetaling (`payoutId`).
const PAYCONIQ_2026 = [
  "id,date,time,amount,type,status,shopName,technology,description,reference,debtorIban,debtorName,bulkId,payoutId",
  "txbbbbbbbbbbbbbbbbbbbbb1,13/10/2026,19:31:42,12.00,CREDIT,SUCCEEDED,VTK Tickets,WERO,1 ticket Cantus,700100 10001,BE00000000000011,PERSOON Z,700100 10001,PAAAAAAAAAAAAAAAAAAAAAAAAAA1",
  "txbbbbbbbbbbbbbbbbbbbbb2,13/10/2026,20:15:59,1.20,CREDIT,SUCCEEDED,A: Evenement 3,BANCONTACT,,,BE00000000000012,PERSOON Y,,PAAAAAAAAAAAAAAAAAAAAAAAAAA2",
  "txbbbbbbbbbbbbbbbbbbbbb3,13/10/2026,20:16:00,4.80,CREDIT,FAILED,A: Evenement 3,WERO,,,BE00000000000013,PERSOON X,,",
  "txbbbbbbbbbbbbbbbbbbbbb4,14/10/2026,10:00:00,3.00,DEBIT,SUCCEEDED,A: Theokot,WERO,terug,,BE00000000000014,PERSOON W,,PAAAAAAAAAAAAAAAAAAAAAAAAAA3",
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

// Het balansrapport: elke beweging op het saldo, niet op volgorde, met de
// maandfactuur op het einde van de maand en een correctie van een paar cent.
const MOLLIE_BALANCE = [
  'Date,"Transaction type","Payment method","Transaction reference","Consumer name","Consumer bank account",Description,"Settlement amount","Settlement currency"',
  '"2026-09-07 06:20:36",transfer,,12345678.2609.01,,,"12345678.2609.01 Payout",-1813.35,EUR',
  '"2026-08-02 20:00:00",payment,mistercash,tr_test7,"PERSOON E",BE00000000000007,"1 ticket",50.00,EUR',
  '"2026-08-03 06:31:33",transfer,,12345678.2608.01,,,"12345678.2608.01 Payout",-219.55,EUR',
  '"2026-08-31 23:59:59",invoice,,,,,"Invoiced fees",-43.42,EUR',
  '"2026-08-31 23:59:59",invoice,,MOL-XX-I0000.0000000001,,,"Invoice correction MOL-XX-I0000.0000000001",0.03,EUR',
  '"2026-08-31 23:59:59","rolling reserves",rollingreserve,,,,"Withheld of rolling reserve",-11.00,EUR',
  '"2026-09-30 23:59:59",invoice,,,,,"Invoiced fees",-98.75,EUR',
  '"2026-09-02 12:00:00",refund,,re_test8,,,"Refund of tr_test7",-14.00,EUR',
].join("\n");

const SUMUP = [
  "email,Datum,Transactie-ID,Transactietype,Status,Kaarttype,Laatste 4 cijfers,Verwerken als,Betaalmethode,Invoerwijze,Autorisatiecode,Beschrijving,Totaal bedrag,Netto verkoop,Belastingbedrag,Bedrag fooi,Transactiekosten,Uitbetaling,Uitbetaling datum,Uitbetalingsnummer,Kenmerk",
  "kassa@voorbeeld.be,2026-10-01 00:20:00,TTEST000001,Omzet,Succesvol,VISA,4321,DEBIT,POS,CONTACTLESS,AUTHX1,,3.40,3.40,0.0,0.0,0.03,3.37,,,",
  "kassa@voorbeeld.be,2026-10-01 12:00:00,TTEST000002,Omzet,Mislukt,VISA,4321,DEBIT,POS,CONTACTLESS,,,2.80,2.80,0.0,0.0,0.0,0.0,,,",
  "kassa@voorbeeld.be,2026-10-02 09:15:00,TTEST000003,Terugbetaling,Succesvol,VISA,4321,DEBIT,POS,CONTACTLESS,,,3.40,3.40,0.0,0.0,0.0,-3.40,,,",
  "kassa@voorbeeld.be,2026-10-03 18:30:00,TTEST000004,Omzet,Terugbetaald,MASTERCARD,8765,DEBIT,POS,CHIP,AUTHX2,,5.00,5.00,0.0,0.0,0.05,4.95,,,",
  "kassa@voorbeeld.be,2026-10-01 00:20:03,TTEST000001,Uitbetaling,Betaald,VISA,4321,DEBIT,POS,CONTACTLESS,AUTHX1,,3.40,3.40,0.0,0.0,0.03,3.37,2026-10-02,XYZ PID0000001,",
].join("\n");

// De opmaak tot maart 2026, zoals het tabblad van Beheer: "Datum en tijd" is een formule.
const EUROPABANK_OUD = [
  "Datum en tijd,Datum,Tijd,Terminal,Ticket/Uw ref,Origineel bedrag (EUR),Resterend bedrag (EUR),Betaalmiddel,Aard toeslag,Kaartnr/Tx-id,Land,Resultaat,Autorisatie nr,EB-ref,Boekingsdatum,OV-ref,Commissie (EUR),E-commerce (EUR),Interchange (EUR),Schema kost (EUR)",
  '5-3-2026 9:30:15,5/3/2026,93015,1000000001,,"2,3","2,3",Visa,,999999******4321,BE,Sale,012345,EBREF1,6/03/2026,100,"-0,02",0,"-0,001","-0,012"',
  "5-3-2026 10:00:00,5/3/2026,100000,1000000001,,4,4,MasterCard,,999999******8765,BE,Denied,,EBREF2,6/03/2026,100,0,0,0,0",
].join("\n");

// De opmaak van daarna: de commissie is positief, en dezelfde betaling als de eerste hierboven staat er ook in.
const EUROPABANK_NIEUW = [
  "Datum en tijd,Datum,Tijd,Terminal,Brand,Kaarttype,Bedrag,Commissie (EUR),Interchange (EUR),Schemakost (EUR),Applicatiekost (EUR),Uw ref,Kaart,Authorisatie nr,Land,Transactietype,Resultaat,Boekingsdatum,OV-ref",
  '5-3-2026 9:30:15,05/03/2026,093015,1000000001,Visa,Debit,"2,3","0,02","-0,001","-0,012",0,,4321,12345,BE,Verkoop,Goedgekeurd,06/03/2026,200',
  '6-3-2026 12:23:18,06/03/2026,122318,1000000001,Visa,Debit,1,"0,02","-0,001","-0,012",0,,4321,631875,BE,Verkoop,Goedgekeurd,09/03/2026,200',
  '6-3-2026 12:23:18,06/03/2026,122318,1000000001,Visa,Debit,1,"0,02","-0,001","-0,012",0,,4321,631875,BE,Verkoop,Goedgekeurd,09/03/2026,200',
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

  it("haalt e-mailadressen uit een omschrijving", () => {
    expect(cleanDescription("Uniflow Printer Credit: iemand@student.kuleuven.be")).toBe("Uniflow Printer Credit");
    expect(cleanDescription("  ")).toBeNull();
  });
});

describe("de kolomkoppen", () => {
  it("vergelijkt koppen zonder hoofdletters, spaties, underscores of accenten", () => {
    expect(headerKey("shop_name")).toBe(headerKey("shopName"));
    expect(headerKey("Commissie (EUR)")).toBe(headerKey("commissie  (eur)"));
    expect(headerKey("\uFEFFDatum")).toBe("datum");
    expect(headerKey("Résultat")).toBe("resultat");
    expect(headerKey("E-mail")).not.toBe(headerKey("email"));
  });

  it("herkent elk testbestand nog als zijn eigen formaat", () => {
    const cases: Array<[string, string]> = [
      [PAYCONIQ, "payconiq"],
      [PAYCONIQ_2026, "payconiq"],
      [MOLLIE_EN, "mollie"],
      [MOLLIE_NL, "mollie"],
      [MOLLIE_BALANCE, "mollie-balance"],
      [SUMUP, "sumup"],
      [EUROPABANK_OUD, "europabank"],
      [EUROPABANK_NIEUW, "europabank"],
    ];
    for (const [text, format] of cases) {
      const result = parseIncomeExport(text);
      expect(result.ok && result.format).toBe(format);
    }
  });

  it("leest koppen die een portaal anders schrijft", () => {
    const shouting = PAYCONIQ.replace(/^[^\n]*/, (header) => header.toUpperCase().replaceAll("_", " "));
    expect(rowsOf(shouting)).toEqual(rowsOf(PAYCONIQ));
  });

  it("zegt bij een onbekend bestand waar het op lijkt en wat er ontbreekt", () => {
    const withoutShop = PAYCONIQ.replace("shop_name", "winkel");
    const result = parseIncomeExport(withoutShop);
    expect(result).toMatchObject({ ok: false, error: "UNKNOWN_FORMAT", closest: { format: "payconiq", missing: ["shop_name"] } });
  });

  it("noemt niets wanneer een bestand op geen enkel formaat lijkt", () => {
    const result = parseIncomeExport("a;b;c\n1;2;3");
    expect(result).toMatchObject({ ok: false, error: "UNKNOWN_FORMAT" });
    expect(!result.ok && result.closest).toBeUndefined();
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

  it("de gewone export kent geen uitbetaling", () => {
    expect(rowsOf(PAYCONIQ).map((row) => row.payoutReference)).toEqual([null, null, null]);
  });

  describe("de export met payoutId", () => {
    it("leest dezelfde soorten, bedragen en kanalen als de gewone", () => {
      const result = parseIncomeExport(PAYCONIQ_2026);
      expect(result.ok && result.format).toBe("payconiq");
      if (!result.ok) return;
      expect(result.total).toBe(4);
      expect(result.skipped).toBe(1);
      expect(result.payouts).toEqual([]);
      expect(result.rows.map((row) => [row.kind, row.amountCents, row.channel])).toEqual([
        ["PAYMENT", 1200, "VTK Tickets"],
        ["PAYMENT", 120, "A: Evenement 3"],
        ["REFUND", -300, "A: Theokot"],
      ]);
    });

    it("leest bulkId, de referentie en de uitbetaling", () => {
      const [ticket, sticker, refund] = rowsOf(PAYCONIQ_2026);
      expect(ticket.reference).toBe("700100 10001");
      expect(ticket.bulkId).toBe("700100 10001");
      expect(ticket.externalKey).toBe("PAYMENT:txbbbbbbbbbbbbbbbbbbbbb1");
      expect([ticket, sticker, refund].map((row) => row.payoutReference)).toEqual([
        "PAAAAAAAAAAAAAAAAAAAAAAAAAA1",
        "PAAAAAAAAAAAAAAAAAAAAAAAAAA2",
        "PAAAAAAAAAAAAAAAAAAAAAAAAAA3",
      ]);
    });

    it("bewaart geen namen of rekeningnummers van wie betaalde", () => {
      const text = JSON.stringify(rowsOf(PAYCONIQ_2026));
      expect(text).not.toContain("PERSOON");
      expect(text).not.toContain("BE000000000000");
    });

    it("leest ze ook met puntkomma's en met een BOM", () => {
      const expected = rowsOf(PAYCONIQ_2026);
      const semicolons = PAYCONIQ_2026.split("\n")
        .map((line) => line.replaceAll(",", ";"))
        .join("\n");
      expect(rowsOf(semicolons)).toEqual(expected);
      expect(rowsOf(`﻿${PAYCONIQ_2026}`)).toEqual(expected);
    });
  });
});

describe("Mollie", () => {
  it("herkent betalingen, kosten en reserve, en slaat vervallen betalingen over", () => {
    const result = parseIncomeExport(MOLLIE_EN);
    expect(result.ok && result.format).toBe("mollie");
    if (!result.ok) return;
    expect(result.skipped).toBe(1);
    expect(result.rows.map((row) => [row.kind, row.amountCents, row.periodMonth])).toEqual([
      ["PAYMENT", 5500, "2026-09"],
      ["FEE", -4342, "2026-08"],
      ["RESERVE", -1100, "2026-08"],
      ["PAYMENT", 1000, "2026-09"],
    ]);
  });

  it("telt een betaling in de maand van de betaling, niet in die van haar uitbetaling", () => {
    // Betaald op 30 september, uitbetaald in oktober: telt in september (Beheer,
    // november 2026). De uitbetaling blijft erbij, voor de lijst per uitbetaling.
    const [paid, , , unpaid] = rowsOf(MOLLIE_EN);
    expect([paid.periodMonth, paid.payoutReference]).toEqual(["2026-09", "12345678.2610.01"]);
    // Nog niet uitbetaald: telt toch in haar eigen maand.
    expect([unpaid.periodMonth, unpaid.payoutReference]).toEqual(["2026-09", null]);
  });

  it("rekent de maand op de Brusselse klok: 1 oktober 00:18 is oktober", () => {
    const rows = rowsOf([MOLLIE_EN.split("\n")[0], '"2026-10-01 00:18:00",kbc,EUR,12.00,paidout,tr_test9,"Iets",,,,EUR,12.00,12345678.2610.01,0.00'].join("\n"));
    expect(rows[0].periodMonth).toBe("2026-10");
    expect(rows[0].occurredAt.toISOString()).toBe("2026-09-30T22:18:00.000Z");
  });

  it("leest de Nederlandse koppen van het tabblad van Beheer", () => {
    const rows = rowsOf(MOLLIE_NL);
    expect(rows.map((row) => [row.kind, row.amountCents, row.refundedCents, row.periodMonth])).toEqual([
      ["PAYMENT", 5000, 0, "2025-08"],
      ["PAYMENT", 5000, 5000, "2025-08"],
      ["REFUND", -5000, 0, "2025-09"],
    ]);
  });

  it("telt een balance correction en haar terugdraaiing als kosten, in hun eigen uitbetaling", () => {
    // Zonder status of betaalmethode: zo staan ze in het tabblad van Beheer,
    // die ze als kosten telde. Overgeslagen klopte het kwartaal toevallig nog,
    // maar elke uitbetaling week 19,68 af.
    const rows = rowsOf(
      [
        MOLLIE_NL.split("\n")[0],
        ',,657000,2-11-2025 20:19:00,,EUR,"19,68",,,Balance correction for October incorrect Minimum invoice amount fee,,,,,,12345678.2511.01,',
        ',,657000,13-11-2025 17:02:00,,EUR,"-19,68",,,Reverting Balance correction for October Minimum invoice amount fee,,,,,,12345678.2511.03,',
      ].join("\n"),
    );
    expect(rows.map((row) => [row.kind, row.amountCents, row.payoutReference, row.periodMonth])).toEqual([
      ["FEE", 1968, "12345678.2511.01", "2025-11"],
      ["FEE", -1968, "12345678.2511.03", "2025-11"],
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

  describe("het balansrapport", () => {
    it("neemt de overschrijvingen als uitbetalingen en slaat de betalingen over", () => {
      const result = parseIncomeExport(MOLLIE_BALANCE);
      expect(result.ok && [result.format, result.source]).toEqual(["mollie-balance", "MOLLIE"]);
      if (!result.ok) return;
      expect([result.total, result.ignored, result.skipped]).toEqual([8, 1, 0]);
      expect(result.payouts).toEqual([
        { reference: "12345678.2609.01", paidOn: "2026-09-07", amountCents: 181335 },
        { reference: "12345678.2608.01", paidOn: "2026-08-03", amountCents: 21955 },
      ]);
    });

    it("geeft de betalingen door om de betalingenexport na te kijken, zonder naam of rekening", () => {
      const result = parseIncomeExport(MOLLIE_BALANCE);
      if (!result.ok) throw new Error(result.error);
      expect(result.balancePayments).toEqual([{ paymentId: "tr_test7", month: "2026-08", amountCents: 5000 }]);
      expect(JSON.stringify(result)).not.toContain("PERSOON");
      expect(JSON.stringify(result)).not.toContain("BE00000000000007");
    });

    it("telt de maandfactuur en de reserve in hun eigen maand, en een terugbetaling bij de eerstvolgende overschrijving", () => {
      // De factuur van 31 augustus om 23:59:59 is augustus, niet de eerste
      // uitbetaling van september; die van 30 september heeft geen
      // overschrijving meer na zich in het bestand, en telt toch in september.
      expect(rowsOf(MOLLIE_BALANCE).map((row) => [row.kind, row.amountCents, row.payoutReference, row.periodMonth])).toEqual([
        ["FEE", -4342, null, "2026-08"],
        ["FEE", 3, null, "2026-08"],
        ["RESERVE", -1100, null, "2026-08"],
        ["FEE", -9875, null, "2026-09"],
        ["REFUND", -1400, "12345678.2609.01", "2026-09"],
      ]);
    });

    it("geeft een kost een vaste sleutel die zegt dat ze uit het balansrapport komt", () => {
      const first = rowsOf(MOLLIE_BALANCE).map((row) => row.externalKey);
      expect(rowsOf(MOLLIE_BALANCE).map((row) => row.externalKey)).toEqual(first);
      const fees = first.filter((key) => !key.startsWith("REFUND:"));
      expect(fees.length).toBe(4);
      expect(fees.every((key) => key.startsWith("FEE:bal:") || key.startsWith("RESERVE:bal:"))).toBe(true);
    });

    it("bewaart geen namen of rekeningnummers", () => {
      const text = JSON.stringify(parseIncomeExport(MOLLIE_BALANCE));
      expect(text).not.toContain("PERSOON");
      expect(text).not.toContain("BE00000000000007");
    });
  });

  it("weigert een bestand met een onleesbaar bedrag in plaats van het over te slaan", () => {
    const broken = MOLLIE_EN.replace("55.00,12345678.2610.01", "veel,12345678.2610.01");
    const result = parseIncomeExport(broken);
    expect(result.ok).toBe(false);
  });
});

describe("SumUp", () => {
  it("telt geslaagde verkopen met hun kosten als eigen regel, en slaat mislukte en uitbetalingsregels over", () => {
    const result = parseIncomeExport(SUMUP);
    expect(result.ok && result.format).toBe("sumup");
    if (!result.ok) return;
    expect(result.total).toBe(5);
    expect(result.skipped).toBe(1);
    // Hetzelfde geld als de verkoop ernaast: niet meegeteld, en ook niet "mislukt".
    expect(result.ignored).toBe(1);
    expect(result.rows.map((row) => [row.kind, row.amountCents, row.externalKey])).toEqual([
      ["PAYMENT", 340, "PAYMENT:TTEST000001"],
      ["FEE", -3, "FEE:TTEST000001"],
      ["REFUND", -340, "REFUND:TTEST000003"],
      ["PAYMENT", 500, "PAYMENT:TTEST000004"],
      ["FEE", -5, "FEE:TTEST000004"],
    ]);
  });

  it("geeft een verkoop het nummer van haar uitbetaling, uit de regel Uitbetaling ernaast", () => {
    const result = parseIncomeExport(SUMUP);
    if (!result.ok) throw new Error(result.error);
    expect(result.rows.map((row) => [row.externalKey, row.payoutReference])).toEqual([
      ["PAYMENT:TTEST000001", "XYZ PID0000001"],
      ["FEE:TTEST000001", "XYZ PID0000001"],
      ["REFUND:TTEST000003", null],
      ["PAYMENT:TTEST000004", null],
      ["FEE:TTEST000004", null],
    ]);
    expect(result.payouts).toEqual([{ reference: "XYZ PID0000001", paidOn: "2026-10-02", amountCents: null }]);
    // De maand blijft die van de verkoop.
    expect(result.rows[0].periodMonth).toBe("2026-10");
  });

  it("neemt het account als kanaal en rekent op de Brusselse klok", () => {
    const [payment, fee] = rowsOf(SUMUP);
    expect(payment.channel).toBe("kassa@voorbeeld.be");
    expect(payment.occurredAt.toISOString()).toBe("2026-09-30T22:20:00.000Z");
    expect(payment.periodMonth).toBe("2026-10");
    expect([fee.channel, fee.periodMonth]).toEqual([payment.channel, payment.periodMonth]);
  });

  it("valt zonder accountkolom terug op één kanaal", () => {
    const withoutAccount = SUMUP.split("\n")
      .map((line) => line.slice(line.indexOf(",") + 1))
      .join("\n");
    expect(rowsOf(withoutAccount)[0].channel).toBe(SUMUP_CHANNEL);
  });

  it("herkent een bestand pas met elke verplichte kolom", () => {
    const required = Object.values(EXPORT_COLUMNS.sumup).filter((column) => column.required);
    expect(required.map((column) => column.names[0])).toContain("Transactie-ID");
    const withoutId = SUMUP.replace("Transactie-ID", "Nummer");
    expect(parseIncomeExport(withoutId)).toEqual({
      ok: false,
      error: "UNKNOWN_FORMAT",
      closest: { format: "sumup", missing: ["Transactie-ID"] },
    });
  });

  it("bewaart geen kaartgegevens of autorisatiecodes", () => {
    const text = JSON.stringify(rowsOf(SUMUP));
    expect(text).not.toContain("AUTHX1");
    expect(text).not.toContain("VISA");
  });
});

describe("Europabank", () => {
  it("leest de oude opmaak: enkel Sale telt, en de commissie wordt een kost", () => {
    const result = parseIncomeExport(EUROPABANK_OUD);
    expect(result.ok && result.format).toBe("europabank");
    if (!result.ok) return;
    expect(result.skipped).toBe(1);
    expect(result.rows.map((row) => [row.kind, row.amountCents, row.channel])).toEqual([
      ["PAYMENT", 230, "1000000001"],
      ["FEE", -2, "1000000001"],
    ]);
    // 9:30:15 op 5 maart, in de winter een uur voor UTC.
    expect(result.rows[0].occurredAt.toISOString()).toBe("2026-03-05T08:30:15.000Z");
    expect(result.rows[0].periodMonth).toBe("2026-03");
  });

  it("leest de nieuwe opmaak, waar de commissie positief staat", () => {
    expect(rowsOf(EUROPABANK_NIEUW).map((row) => [row.kind, row.amountCents])).toEqual([
      ["PAYMENT", 230],
      ["FEE", -2],
      ["PAYMENT", 100],
      ["FEE", -2],
      ["PAYMENT", 100],
      ["FEE", -2],
    ]);
  });

  it("geeft dezelfde betaling in beide opmaken dezelfde sleutel, en twee gelijke regels elk een eigen", () => {
    const [old] = rowsOf(EUROPABANK_OUD);
    const rows = rowsOf(EUROPABANK_NIEUW);
    expect(rows[0].externalKey).toBe(old.externalKey);
    expect(rows[2].externalKey).not.toBe(rows[4].externalKey);
    expect(rowsOf(EUROPABANK_NIEUW)[4].externalKey).toBe(rows[4].externalKey);
  });

  it("leest het uur zoals Europabank het schrijft", () => {
    expect(compactTime("103804")).toBe("10:38:04");
    expect(compactTime("93015")).toBe("09:30:15");
    expect(compactTime("103804.0")).toBe("10:38:04");
    expect(compactTime("10:38")).toBeNull();
  });

  it("neemt het uur uit Tijd, ook als een rekenblad 00:00:00 achter de datum zette", () => {
    const fromSheet = EUROPABANK_OUD.replace(",5/3/2026,93015,", ",2026-03-05 00:00:00,93015,");
    expect(rowsOf(fromSheet)[0].occurredAt.toISOString()).toBe("2026-03-05T08:30:15.000Z");
  });

  it("bewaart geen kaartgegevens", () => {
    const text = JSON.stringify([...rowsOf(EUROPABANK_OUD), ...rowsOf(EUROPABANK_NIEUW)]);
    expect(text).not.toContain("******");
    expect(text).not.toContain("EBREF1");
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
    channelCodes: new Map([
      [
        "kanaal-post",
        [
          { from: "2026-09-01", code: { code: "700110", name: "Cultuur" } },
          // Een andere post gebruikte het toestel een week: vanaf die dag geen standaardcode.
          { from: "2026-09-20", code: null },
          { from: "2026-09-30", code: { code: "700110", name: "Cultuur" } },
        ],
      ],
    ]),
    cashRegisters: new Map([
      [
        // Een gedeelde sticker: elke kassa heeft ze tot de volgende ze neemt.
        "kanaal-gedeeld",
        [
          { id: "kassa-td", start: new Date("2026-10-01T16:00:00Z"), end: new Date("2026-10-01T22:00:00Z"), code: { code: "700100", name: "Activiteiten" } },
          { id: "kassa-zonder-code", start: new Date("2026-10-16T15:00:00Z"), end: new Date("2026-10-16T20:00:00Z"), code: null },
        ],
      ],
      [
        // Het toestel van een post, een avond geleend door een andere post.
        "kanaal-post",
        [{ id: "kassa-caraoke", start: new Date("2026-10-02T16:00:00Z"), end: new Date("2026-10-03T02:00:00Z"), code: { code: "700100 10001", name: "Cantussen" } }],
      ],
      [
        // Een uitgeleende sticker met een avondkassa op de tweede dag.
        "kanaal-uitgeleend",
        [{ id: "kassa-uitleen", start: new Date("2026-11-11T17:00:00Z"), end: new Date("2026-11-11T21:00:00Z"), code: { code: "700100", name: "Activiteiten" } }],
      ],
    ]),
    channelLendings: new Map([
      // De SumUp van een post een week aan de cursusdienst geleend.
      ["kanaal-post", [{ id: "uitlening-week", from: "2026-11-02", to: "2026-11-06", code: { code: "700000", name: "Cursusdienst" } }]],
      // Een gedeelde sticker (geen standaardcode), twee dagen uitgeleend.
      ["kanaal-uitgeleend", [{ id: "uitlening-sticker", from: "2026-11-10", to: "2026-11-11", code: { code: "700000", name: "Cursusdienst" } }]],
      // Een uitlening waarvan de code uit het register verdween.
      ["kanaal-zonder-code", [{ id: "uitlening-weg", from: "2026-11-01", to: "2026-11-30", code: null }]],
    ]),
  };
  const base = {
    source: "MOLLIE" as const,
    kind: "PAYMENT" as const,
    providerId: null,
    description: null,
    reference: null,
    bulkId: null,
    channelId: null,
    occurredAt: new Date("2026-10-01T10:00:00Z"),
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

  it("geeft wat geen andere regel koppelt de standaardcode van het kanaal", () => {
    const result = matchTransaction({ ...base, source: "PAYCONIQ", channelId: "kanaal-post", description: "broodje" }, context);
    expect(result).toMatchObject({ rule: "CHANNEL_DEFAULT", code: { code: "700110" } });
    const refund = matchTransaction({ ...base, source: "PAYCONIQ", kind: "REFUND", channelId: "kanaal-post" }, context);
    expect(refund).toMatchObject({ rule: "CHANNEL_DEFAULT", code: { code: "700110" } });
  });

  it("laat een exacte koppeling en een onthouden tekst voorgaan op de standaardcode", () => {
    const inText = matchTransaction({ ...base, source: "PAYCONIQ", channelId: "kanaal-post", reference: "700100 10001" }, context);
    expect(inText.rule).toBe("CODE_IN_TEXT");
    const remembered = matchTransaction({ ...base, channelId: "kanaal-post", description: "VTK uitleendienst - 3F9A21BC" }, context);
    expect(remembered).toMatchObject({ rule: "NAME_RULE", code: { code: "700000" } });
  });

  it("neemt de standaardcode van de dag, op de Brusselse klok", () => {
    const on = (iso: string) =>
      matchTransaction({ ...base, source: "PAYCONIQ", channelId: "kanaal-post", occurredAt: new Date(iso) }, context);
    // Voor de eerste regel: nog geen standaardcode.
    expect(on("2026-08-31T12:00:00Z").rule).toBeNull();
    expect(on("2026-09-10T12:00:00Z").code?.code).toBe("700110");
    // In de week van de andere post: geen standaardcode, dus Na te kijken.
    expect(on("2026-09-25T12:00:00Z").rule).toBeNull();
    // 00:30 op 30 september in Brussel is in UTC nog 29 september.
    expect(on("2026-09-29T22:30:00Z").code?.code).toBe("700110");
    expect(on("2026-09-29T21:30:00Z").rule).toBeNull();
  });

  it("geeft een betaling op een gedeeld toestel de code van de kassa die avond/nacht, en zet latere dagen zonder kassa bij Na te kijken", () => {
    const at = (iso: string) =>
      matchTransaction({ ...base, source: "PAYCONIQ", channelId: "kanaal-gedeeld", occurredAt: new Date(iso) }, context);
    expect(at("2026-10-01T17:00:00Z")).toMatchObject({ rule: "CASH_REGISTER", code: { code: "700100" }, cashRegisterId: "kassa-td" });
    // Later diezelfde nacht (01:30 in Brussel, voor 09:00): hoort nog bij de uitloop van die avondkassa.
    expect(at("2026-10-01T23:30:00Z")).toMatchObject({ rule: "CASH_REGISTER", cashRegisterId: "kassa-td" });
    // Dagen later zonder nieuwe kassa: Na te kijken, niet stilzwijgend de vorige kassa.
    expect(at("2026-10-05T12:00:00Z")).toMatchObject({ rule: null, cashRegisterId: null });
    // De volgende kassa heeft nog geen code: Na te kijken.
    expect(at("2026-10-16T18:00:00Z")).toMatchObject({ rule: null, cashRegisterId: null });
    // Voor de eerste kassa hoort de sticker bij niemand.
    expect(at("2026-09-30T12:00:00Z").rule).toBeNull();
  });

  it("noemt voor Na te kijken de kassa zonder code die het toestel die dag had", () => {
    const at = (channelId: string, iso: string) => deviceAt({ channelId, occurredAt: new Date(iso) }, context).kassa;
    // Dezelfde kassa als regel 4: die van 16 oktober (en haar nachtuitloop), nog zonder code.
    expect(at("kanaal-gedeeld", "2026-10-16T21:00:00Z")).toMatchObject({ id: "kassa-zonder-code", code: null });
    expect(at("kanaal-gedeeld", "2026-10-01T23:30:00Z")?.id).toBe("kassa-td");
    expect(at("kanaal-gedeeld", "2026-10-05T12:00:00Z")).toBeNull();
    // Het toestel van een post: buiten de uren van de kassa geen.
    expect(at("kanaal-post", "2026-10-03T10:00:00Z")).toBeNull();
  });

  it("geeft een kassa op het toestel van een post enkel tijdens haar uren voorrang", () => {
    const at = (iso: string) =>
      matchTransaction({ ...base, source: "PAYCONIQ", channelId: "kanaal-post", occurredAt: new Date(iso) }, context);
    expect(at("2026-10-02T20:00:00Z")).toMatchObject({ rule: "CASH_REGISTER", code: { code: "700100 10001" }, cashRegisterId: "kassa-caraoke" });
    expect(at("2026-10-03T08:00:00Z")).toMatchObject({ rule: "CHANNEL_DEFAULT", code: { code: "700110" }, cashRegisterId: null });
  });

  it("laat een code in de tekst voorgaan op de kassa", () => {
    const result = matchTransaction(
      { ...base, source: "PAYCONIQ", channelId: "kanaal-gedeeld", reference: "700100 10001", occurredAt: new Date("2026-10-01T17:00:00Z") },
      context,
    );
    expect(result).toMatchObject({ rule: "CODE_IN_TEXT", cashRegisterId: null });
  });

  describe("uitlening van een toestel", () => {
    const at = (channelId: string, iso: string, extra: Partial<MatchInput> = {}) =>
      matchTransaction({ ...base, source: "SUMUP", channelId, occurredAt: new Date(iso), ...extra }, context);

    it("gaat voor de standaardcode op haar dagen, niet ervoor of erna", () => {
      expect(at("kanaal-post", "2026-11-03T12:00:00Z")).toMatchObject({
        rule: "CHANNEL_LENDING",
        code: { code: "700000" },
        channelLendingId: "uitlening-week",
      });
      expect(at("kanaal-post", "2026-11-01T12:00:00Z")).toMatchObject({ rule: "CHANNEL_DEFAULT", code: { code: "700110" }, channelLendingId: null });
      expect(at("kanaal-post", "2026-11-07T12:00:00Z")).toMatchObject({ rule: "CHANNEL_DEFAULT", channelLendingId: null });
      // Een terugbetaling op die dagen hoort er ook bij.
      expect(at("kanaal-post", "2026-11-03T12:00:00Z", { kind: "REFUND" }).rule).toBe("CHANNEL_LENDING");
    });

    it("loopt van 9:00 op de eerste dag tot 9:00 na de laatste, op de Brusselse klok", () => {
      // 2 november 2026 is wintertijd (UTC+1): 8:59 hoort nog bij 1 november.
      expect(at("kanaal-post", "2026-11-02T07:59:00Z").rule).toBe("CHANNEL_DEFAULT");
      expect(at("kanaal-post", "2026-11-02T08:00:00Z").rule).toBe("CHANNEL_LENDING");
      // 3:00 in de nacht na de laatste dag hoort nog bij de uitlening, 9:00 niet meer.
      expect(at("kanaal-post", "2026-11-07T02:00:00Z").rule).toBe("CHANNEL_LENDING");
      expect(at("kanaal-post", "2026-11-07T08:00:00Z").rule).toBe("CHANNEL_DEFAULT");
    });

    it("laat de site, een code in de tekst en een onthouden tekst voorgaan", () => {
      expect(at("kanaal-post", "2026-11-03T12:00:00Z", { providerId: "tr_site" }).rule).toBe("WEBSITE");
      expect(at("kanaal-post", "2026-11-03T12:00:00Z", { source: "PAYCONIQ", reference: "700100 10001" }).rule).toBe("CODE_IN_TEXT");
      expect(at("kanaal-post", "2026-11-03T12:00:00Z", { source: "MOLLIE", description: "VTK uitleendienst - 3F9A21BC" }).rule).toBe(
        "NAME_RULE",
      );
    });

    it("geeft een kassa enkel haar uren: daarna geldt de uitlening, niet de uitloop tot 9:00", () => {
      expect(at("kanaal-uitgeleend", "2026-11-11T19:00:00Z")).toMatchObject({ rule: "CASH_REGISTER", cashRegisterId: "kassa-uitleen" });
      // Op een gedeeld toestel zonder uitlening hield de kassa het tot 9:00;
      // de uitlening zegt wie het toestel die nacht had.
      expect(at("kanaal-uitgeleend", "2026-11-11T23:30:00Z")).toMatchObject({
        rule: "CHANNEL_LENDING",
        channelLendingId: "uitlening-sticker",
        cashRegisterId: null,
      });
      expect(deviceAt({ channelId: "kanaal-uitgeleend", occurredAt: new Date("2026-11-11T23:30:00Z") }, context).kassa).toBeNull();
      // Na de uitlening, zonder kassa en zonder standaardcode: Na te kijken.
      expect(at("kanaal-uitgeleend", "2026-11-12T12:00:00Z").rule).toBeNull();
    });

    it("koppelt niets zonder code, en dan geldt wat eronder staat", () => {
      expect(at("kanaal-zonder-code", "2026-11-03T12:00:00Z")).toMatchObject({ rule: null, channelLendingId: null });
      expect(deviceAt({ channelId: "kanaal-zonder-code", occurredAt: new Date("2026-11-03T12:00:00Z") }, context).lending).toBeNull();
    });

    it("koppelt geen kosten", () => {
      expect(at("kanaal-post", "2026-11-03T12:00:00Z", { kind: "FEE" }).rule).toBeNull();
    });

    it("vindt de uitlening van een dag", () => {
      const spans = [
        { id: "a", from: "2026-09-16", to: "2026-09-23", code: null },
        { id: "b", from: "2026-10-01", to: "2026-10-01", code: null },
      ];
      expect(lendingOn(spans, "2026-09-16")?.id).toBe("a");
      expect(lendingOn(spans, "2026-09-23")?.id).toBe("a");
      expect(lendingOn(spans, "2026-09-24")).toBeNull();
      expect(lendingOn(spans, "2026-10-01")?.id).toBe("b");
    });
  });

  it("laat een kanaal zonder standaardcode na te kijken", () => {
    const result = matchTransaction({ ...base, source: "PAYCONIQ", channelId: "kanaal-zonder-code", description: "broodje" }, context);
    expect(result).toMatchObject({ rule: null, code: null });
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
      NO_SEPARATE_FEES,
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
      NO_SEPARATE_FEES,
    );
    expect(overview.codes.map((row) => row.code)).toEqual(["700100 10001", "700110"]);
    expect(overview.unassigned.total).toBe(50);
    expect(overview.excluded.total).toBe(999);
    expect(overview.totals.total).toBe(350);
  });

  it("telt SumUp en Europabank in hun eigen kolom, met hun kosten bij de kosten", () => {
    const overview = computeIncomeOverview(
      [
        tx({ source: "SUMUP", accountingCode: "700110", accountingCodeName: "Cultuur", amountCents: 340 }),
        tx({ source: "SUMUP", kind: "FEE", amountCents: -3 }),
        tx({ source: "EUROPABANK", amountCents: 230 }),
        tx({ source: "EUROPABANK", kind: "FEE", amountCents: -2 }),
      ],
      new Map(),
      NO_SEPARATE_FEES,
    );
    expect(overview.codes[0].bySource.SUMUP).toBe(340);
    expect(overview.unassigned.bySource.EUROPABANK).toBe(230);
    expect(overview.fees.bySource).toMatchObject({ SUMUP: -3, EUROPABANK: -2 });
    expect(overview.totals.total).toBe(565);
  });

  it("laat de kosten met een aparte factuur uit het totaal en uit de rekeningen", () => {
    const overview = computeIncomeOverview(
      [
        tx({ source: "SUMUP", accountingCode: "700110", accountingCodeName: "Cultuur", amountCents: 340 }),
        tx({ source: "SUMUP", kind: "FEE", amountCents: -3 }),
        tx({ source: "EUROPABANK", amountCents: 230 }),
        tx({ source: "EUROPABANK", kind: "FEE", amountCents: -2 }),
      ],
      new Map(),
      { separateFeeSources: new Set(["SUMUP"] as const) },
    );
    expect(overview.separateFees.bySource.SUMUP).toBe(-3);
    expect(overview.fees.bySource).toMatchObject({ SUMUP: 0, EUROPABANK: -2 });
    expect(overview.totals.total).toBe(568);
    expect(overview.accounts).toEqual([{ bankAccount: "…6140", total: 568 }]);
    expect(overview.excluded.count).toBe(0);
  });

  it("telt ook mee wat op de rekening van een post binnenkomt, met een totaal per rekening", () => {
    const overview = computeIncomeOverview(
      [
        tx({ accountingCode: "700100", accountingCodeName: "Activiteiten", amountCents: 500, source: "PAYCONIQ" }),
        tx({ accountingCode: "700110", accountingCodeName: "Cultuur", amountCents: 250, source: "PAYCONIQ", bankAccount: "…9348" }),
      ],
      new Map(),
      NO_SEPARATE_FEES,
    );
    expect(overview.totals.total).toBe(750);
    expect(overview.accounts).toEqual([
      { bankAccount: "…6140", total: 500 },
      { bankAccount: "…9348", total: 250 },
    ]);
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

describe("meerdere bestanden tegelijk opladen", () => {
  const rules = (open: number): ImportSummary["rules"] => ({
    WEBSITE: 0,
    CODE_IN_TEXT: 0,
    CASH_REGISTER: 0,
    NAME_RULE: 0,
    CHANNEL_LENDING: 0,
    CHANNEL_DEFAULT: 0,
    OPEN: open,
  });
  const summary = (partial: Partial<ImportSummary>): ImportSummary => ({
    format: "europabank",
    source: "EUROPABANK",
    fileName: "dag.csv",
    total: 0,
    skipped: 0,
    ignored: 0,
    created: 0,
    duplicates: 0,
    updated: 0,
    locked: 0,
    rules: rules(0),
    feeRows: 0,
    firstAt: null,
    lastAt: null,
    newChannels: [],
    payouts: 0,
    balancePayments: 0,
    ...partial,
  });

  it("telt de dagbestanden samen, met elk nieuw kanaal één keer", () => {
    const totals = combineImportSummaries([
      summary({ total: 2, created: 2, rules: rules(2), firstAt: new Date("2026-10-09T18:05:11Z"), lastAt: new Date("2026-10-09T19:15:42Z"), newChannels: ["1000000001"] }),
      // Uit de server action komt een datum als tekst terug.
      summary({ total: 1, created: 1, rules: rules(1), firstAt: "2026-10-10T20:01:03.000Z" as unknown as Date, lastAt: "2026-10-10T20:01:03.000Z" as unknown as Date, newChannels: ["1000000001"] }),
      // Dezelfde dag nog eens: al gekend.
      summary({ total: 2, duplicates: 2 }),
    ]);
    expect(totals).toMatchObject({ sources: ["EUROPABANK"], total: 5, created: 3, duplicates: 2, newChannels: ["1000000001"], mollieWithoutFees: false });
    expect(totals.rules.OPEN).toBe(3);
    expect(totals.firstAt?.toISOString()).toBe("2026-10-09T18:05:11.000Z");
    expect(totals.lastAt?.toISOString()).toBe("2026-10-10T20:01:03.000Z");
  });

  it("zegt het wanneer een Mollie-bestand geen kosten heeft", () => {
    const totals = combineImportSummaries([summary({ format: "mollie", source: "MOLLIE", created: 4 }), summary({ created: 1, feeRows: 0 })]);
    expect(totals.mollieWithoutFees).toBe(true);
    expect(totals.sources).toEqual(["MOLLIE", "EUROPABANK"]);
  });

  it("zwijgt over de kosten wanneer het balansrapport mee gekozen is, en telt de uitbetalingen", () => {
    const totals = combineImportSummaries([
      summary({ format: "mollie", source: "MOLLIE", created: 4 }),
      summary({ format: "mollie-balance", source: "MOLLIE", created: 3, feeRows: 3, payouts: 9 }),
    ]);
    expect(totals.mollieWithoutFees).toBe(false);
    expect(totals.payouts).toBe(9);
  });
});

describe("Na te kijken", () => {
  it("laat een dag om 9:00 beginnen, zodat een avond tot 4 uur één groep blijft", () => {
    // Brussel is in oktober UTC+2.
    expect(reviewDay(new Date("2026-10-09T18:00:00Z"))).toBe("2026-10-09");
    expect(reviewDay(new Date("2026-10-10T02:00:00Z"))).toBe("2026-10-09");
    expect(reviewDay(new Date("2026-10-10T06:59:00Z"))).toBe("2026-10-09");
    expect(reviewDay(new Date("2026-10-10T07:00:00Z"))).toBe("2026-10-10");
    // Over de maandgrens: de nacht van 30 september hoort bij 30 september.
    expect(reviewDay(new Date("2026-09-30T23:30:00Z"))).toBe("2026-09-30");
  });
});

describe("de kassacontrole", () => {
  // `date` is een @db.Date: middernacht UTC van de kalenderdag. Op 7 oktober
  // 2026 is het in Brussel nog zomertijd, twee uur voor UTC.
  const date = new Date("2026-10-07T00:00:00Z");
  const startsAt = new Date("2026-10-07T18:00:00Z"); // 20:00
  const endsAt = new Date("2026-10-08T01:00:00Z"); // 03:00 de dag erna

  it("telt de uren van de kassa wanneer een andere kassa het toestel dezelfde dag had", () => {
    expect(kassaControlWindow({ date, startsAt, endsAt }, true)).toEqual({ start: startsAt, end: endsAt, wholeDay: false });
  });

  it("telt anders de hele dag, tot het einde van een kassa die over middernacht loopt", () => {
    const night = kassaControlWindow({ date, startsAt, endsAt }, false);
    expect(night.wholeDay).toBe(true);
    expect(night.start.toISOString()).toBe("2026-10-06T22:00:00.000Z"); // 00:00 in Brussel
    expect(night.end).toEqual(endsAt);
    const evening = kassaControlWindow({ date, startsAt, endsAt: new Date("2026-10-07T21:00:00Z") }, false);
    expect(evening.end.toISOString()).toBe("2026-10-07T22:00:00.000Z"); // 24:00 in Brussel
  });

  it("telt een kassa zonder uren altijd de hele dag", () => {
    expect(kassaControlWindow({ date, startsAt: null, endsAt: null }, true).wholeDay).toBe(true);
  });

  it("zet het ingetikte bedrag naast de import, zonder het te wijzigen", () => {
    expect(kassaCheck(null, { cents: 0, count: 0 })).toEqual({ state: "nothing" });
    expect(kassaCheck(null, { cents: 51240, count: 132 })).toEqual({ state: "empty", importCents: 51240 });
    expect(kassaCheck(51240, { cents: 51240, count: 132 })).toEqual({ state: "match", importCents: 51240 });
    expect(kassaCheck(49840, { cents: 51240, count: 132 })).toEqual({
      state: "differs",
      importCents: 51240,
      typedCents: 49840,
      differenceCents: -1400,
    });
  });

  describe("voor de lijst met afwijkingen", () => {
    const avond = { id: "kassa-avond", date, startsAt, endsAt };
    const use = (registerId: string, terminal: string, day = date): DeviceUse => ({
      registerId,
      date: new Date(day),
      method: "BANCONTACT",
      terminal,
    });

    it("telt enkel de uren wanneer een andere kassa hetzelfde toestel die dag had, ook als die de dag ervoor begon", () => {
      const placed = deviceWindow(avond, "BANCONTACT", "Evenementen", [use("kassa-avond", "Evenementen"), use("kassa-middag", "Evenementen")]);
      expect(placed).toEqual({ window: { start: startsAt, end: endsAt, wholeDay: false }, sharedThatDay: true });
      // Zoals 24UL Eetstandje (20/10 20:00 tot 21/10 19:00) en Overwinningsfeestje (21/10 22:00 tot 22/10 05:00).
      const eetstand: DeviceUse = {
        registerId: "kassa-24ul",
        date: new Date("2026-10-06T00:00:00Z"),
        startsAt: new Date("2026-10-06T18:00:00Z"),
        endsAt: new Date("2026-10-07T17:00:00Z"),
        method: "BANCONTACT",
        terminal: "Evenementen",
      };
      expect(deviceWindow(avond, "BANCONTACT", "Evenementen", [eetstand])).toEqual({
        window: { start: startsAt, end: endsAt, wholeDay: false },
        sharedThatDay: true,
      });
    });

    it("telt de hele dag wanneer de andere kassa een ander toestel of een andere dag had", () => {
      expect(deviceWindow(avond, "BANCONTACT", "Evenementen", [use("kassa-avond", "Evenementen")]).sharedThatDay).toBe(false);
      expect(deviceWindow(avond, "BANCONTACT", "Evenementen", [use("kassa-middag", "Cudi")]).sharedThatDay).toBe(false);
      expect(
        deviceWindow(avond, "BANCONTACT", "Evenementen", [use("kassa-gisteren", "Evenementen", new Date("2026-10-06T00:00:00Z"))])
          .sharedThatDay,
      ).toBe(false);
      expect(
        deviceWindow(avond, "PAYCONIQ", "Evenementen", [{ ...use("kassa-middag", "Evenementen"), method: "BANCONTACT" }]).sharedThatDay,
      ).toBe(false);
    });

    it("telt de betalingen min de terugbetalingen op de kanalen van het toestel, binnen het venster", () => {
      const placed = deviceWindow(avond, "BANCONTACT", "Evenementen", [use("kassa-middag", "Evenementen")]);
      const amount = importAmountOf("BANCONTACT", "Evenementen", placed, ["terminal-1", "terminal-2"], [
        { channelId: "terminal-1", occurredAt: new Date("2026-10-07T18:05:00Z"), amountCents: 1250 },
        { channelId: "terminal-2", occurredAt: new Date("2026-10-07T23:30:00Z"), amountCents: 800 },
        // Een terugbetaling telt af.
        { channelId: "terminal-1", occurredAt: new Date("2026-10-07T20:00:00Z"), amountCents: -300 },
        // Het begin telt mee, het einde niet.
        { channelId: "terminal-2", occurredAt: startsAt, amountCents: 100 },
        { channelId: "terminal-2", occurredAt: endsAt, amountCents: 5000 },
        // Voor de kassa, en op een ander toestel.
        { channelId: "terminal-1", occurredAt: new Date("2026-10-07T15:00:00Z"), amountCents: 7000 },
        { channelId: "sticker-theo", occurredAt: new Date("2026-10-07T19:00:00Z"), amountCents: 450 },
      ]);
      expect(amount).toMatchObject({ method: "BANCONTACT", terminal: "Evenementen", cents: 1850, count: 4, sharedThatDay: true });
    });

    it("geeft een toestel zonder kanaal een eigen stand", () => {
      const placed = deviceWindow(avond, "PAYCONIQ", "Evenementen 2", []);
      const amount = importAmountOf("PAYCONIQ", "Evenementen 2", placed, ["sticker-2"], [
        { channelId: "sticker-2", occurredAt: new Date("2026-10-07T19:00:00Z"), amountCents: 2050 },
      ]);
      expect(kassaControlState(null, null)).toBe("unlinked");
      expect(kassaControlState(2000, amount)).toBe("differs");
      expect(kassaControlState(2050, amount)).toBe("match");
      expect(kassaControlState(null, amount)).toBe("empty");
    });

    it("zegt over welke tijd het telde, op de Brusselse klok", () => {
      const hours = deviceWindow(avond, "BANCONTACT", "Evenementen", [use("kassa-middag", "Evenementen")]);
      expect(controlSpanLabel(hours, true)).toBe("van 20:00 tot 03:00");
      const day = deviceWindow({ ...avond, startsAt: null, endsAt: null }, "BANCONTACT", "Evenementen", [use("kassa-middag", "Evenementen")]);
      expect(controlSpanLabel(day, true)).toBe("de hele dag, ook die van een andere kassa");
      // Zoals ze in de browser aankomt: als tekst.
      const travelled = { ...hours, window: { ...hours.window, start: hours.window.start.toISOString() as unknown as Date } };
      expect(controlSpanLabel(travelled, false)).toBe("from 20:00 to 03:00");
    });
  });
});
