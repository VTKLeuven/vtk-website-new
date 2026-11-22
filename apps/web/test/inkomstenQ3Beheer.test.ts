/**
 * Het derde kwartaal van 2026, zoals Beheer het zelf uitrekende, nagespeeld met
 * de parser, het overzicht en de berekende reserve van de site. CLAUDE.md:
 * "Rekenen zoals het rekenblad ... Een wijziging daaraan toets je opnieuw aan
 * een kwartaal van Beheer." Dit is die toets.
 *
 * De bestanden hieronder zijn verzonnen (geen namen, rekeningen of echte
 * ID's), maar hebben de som per uitbetaling, per maand en per soort van de
 * bestanden van Beheer:
 * - Mollie-betalingen € 9.130,50: augustus € 4.785,00, september € 4.345,50.
 *   Per uitbetaling 220,00 tot 702,00; de 702,00 van uitbetaling 2610.01
 *   (betaald 23 tot 30 september) en twee betalingen van 14,00 die op 30
 *   september nog niet uitbetaald waren, tellen in september.
 * - Negen overschrijvingen, samen € 8.761,60.
 * - Kosten € -142,01: twee maandfacturen (-43,42 en -98,75) en twee
 *   compensaties (+0,03 en +0,13). Het script van Beheer liet die laatste twee
 *   weg uit de kosten maar telde ze wel in de reserve: daarom kwam Beheer op
 *   een kolom van € 8.761,44, € 0,16 onder de overschrijvingen.
 * - Reserveregels van Mollie die samen nul zijn.
 * - SumUp met transactiekosten van € -420,94 en € -75,51, die op een aparte
 *   factuur komen.
 */
import { describe, expect, it } from "vitest";
import { lineRulesOf, parseIncomeConfig } from "@/lib/inkomsten/config";
import { quarterLineKey } from "@/lib/inkomsten/lines";
import { computeIncomeOverview, groupPayouts, type OverviewTransaction } from "@/lib/inkomsten/overview";
import { parseIncomeExport, type IncomeParseResult, type ParsedIncomeRow } from "@/lib/inkomsten/parse";
import { computeMollieReserve } from "@/lib/inkomsten/reserve";

const ACCOUNT = "BE00 0000 0000 0001";

/** Per uitbetaling: de referentie, de dag van de overschrijving, het bedrag, en de betalingen (dag, bedrag). */
const MOLLIE_PAYOUTS: Array<{ reference: string; paidOn: string; transfer: string; payments: Array<[string, string]> }> = [
  { reference: "12345678.2608.01", paidOn: "2026-08-03", transfer: "219.55", payments: [["2026-08-01 14:00:00", "220.00"]] },
  { reference: "12345678.2608.02", paidOn: "2026-08-10", transfer: "382.27", payments: [["2026-08-05 10:00:00", "385.00"]] },
  { reference: "12345678.2608.03", paidOn: "2026-08-17", transfer: "336.74", payments: [["2026-08-12 10:00:00", "330.00"]] },
  { reference: "12345678.2608.04", paidOn: "2026-08-24", transfer: "1191.39", payments: [["2026-08-19 10:00:00", "1045.00"]] },
  { reference: "12345678.2608.05", paidOn: "2026-08-31", transfer: "2137.98", payments: [["2026-08-26 10:00:00", "2145.00"]] },
  {
    reference: "12345678.2609.01",
    paidOn: "2026-09-07",
    transfer: "1813.35",
    payments: [
      ["2026-08-31 20:00:00", "660.00"],
      ["2026-09-03 10:00:00", "1100.00"],
    ],
  },
  { reference: "12345678.2609.02", paidOn: "2026-09-14", transfer: "1606.88", payments: [["2026-09-10 10:00:00", "1485.00"]] },
  { reference: "12345678.2609.03", paidOn: "2026-09-21", transfer: "383.90", payments: [["2026-09-16 10:00:00", "275.00"]] },
  { reference: "12345678.2609.04", paidOn: "2026-09-28", transfer: "689.54", payments: [["2026-09-22 10:00:00", "755.50"]] },
  // Overgeschreven op 5 oktober: buiten het kwartaal, maar de betalingen tellen in september.
  {
    reference: "12345678.2610.01",
    paidOn: "2026-10-05",
    transfer: "690.12",
    payments: [
      ["2026-09-23 10:00:00", "500.00"],
      ["2026-09-30 23:10:00", "202.00"],
    ],
  },
];
/** Betaald, maar op 30 september nog niet uitbetaald. */
const UNPAID: Array<[string, string]> = [
  ["2026-09-29 11:00:00", "14.00"],
  ["2026-09-29 12:00:00", "14.00"],
];

function molliePayments(): string {
  const lines = [
    'Date,"Payment method",Currency,Amount,Status,ID,Description,"Consumer name","Consumer bank account","Consumer BIC","Settlement currency","Settlement amount","Settlement reference","Amount refunded"',
  ];
  let id = 0;
  for (const payout of MOLLIE_PAYOUTS) {
    for (const [date, amount] of payout.payments) {
      id += 1;
      lines.push(`"${date}",kbc,EUR,${amount},paidout,tr_q3test${id},"Ticket",,,,EUR,${amount},${payout.reference},0.00`);
    }
  }
  for (const [date, amount] of UNPAID) {
    id += 1;
    lines.push(`"${date}",kbc,EUR,${amount},paid,tr_q3test${id},"Ticket",,,,EUR,${amount},,0.00`);
  }
  // Een vervallen betaling telt nergens.
  lines.push(`"2026-09-15 10:00:00",kbc,EUR,10.00,expired,tr_q3expired,"Ticket",,,,,,,`);
  return lines.join("\n");
}

function mollieBalance(): string {
  const lines = ['Date,"Transaction type","Payment method","Transaction reference","Consumer name","Consumer bank account",Description,"Settlement amount","Settlement currency"'];
  let id = 0;
  for (const payout of MOLLIE_PAYOUTS) {
    for (const [date, amount] of payout.payments) {
      id += 1;
      // Het balansrapport zet een betaling soms een seconde later dan de export.
      lines.push(`"${date.replace(/:00$/, ":01")}",payment,kbc,tr_q3test${id},,,"Ticket",${amount},EUR`);
    }
    if (payout.paidOn <= "2026-09-30") {
      lines.push(`"${payout.paidOn} 06:30:00",transfer,,${payout.reference},,,"${payout.reference} Mollie",-${payout.transfer},EUR`);
    }
  }
  for (const [date, amount] of UNPAID) {
    id += 1;
    lines.push(`"${date}",payment,kbc,tr_q3test${id},,,"Ticket",${amount},EUR`);
  }
  lines.push(
    '"2026-08-31 23:59:59",invoice,,,,,"Withheld fees MOL-NL-R0000.0000000001",-43.42,EUR',
    '"2026-08-31 23:59:59",invoice,,,,,"Invoice Compensation MOL-NL-R0000.0000000001",0.03,EUR',
    '"2026-08-31 23:59:59","rolling reserves",rollingreserve,,,,"Withheld of Credit card rolling reserve",-11.00,EUR',
    '"2026-08-31 23:59:59","rolling reserves",rollingreserve,,,,"Settlement of Credit card rolling reserve",11.00,EUR',
    '"2026-09-30 23:59:59",invoice,,,,,"Withheld fees MOL-NL-R0000.0000000002",-98.75,EUR',
    '"2026-09-30 23:59:59",invoice,,,,,"Invoice Compensation MOL-NL-R0000.0000000002",0.13,EUR',
    '"2026-09-30 23:59:59","rolling reserves",rollingreserve,,,,"Withheld of Credit card rolling reserve",-274.70,EUR',
    '"2026-09-30 23:59:59","rolling reserves",rollingreserve,,,,"Settlement of Credit card rolling reserve",274.70,EUR',
  );
  return lines.join("\n");
}

/** Eén SumUp-account met één verkoop en haar uitbetaling. */
function sumup(account: string, total: string, fee: string, payout: string): string {
  const net = (Number(total) - Number(fee)).toFixed(2);
  return [
    "email,Datum,Transactie-ID,Transactietype,Status,Kaarttype,Laatste 4 cijfers,Verwerken als,Betaalmethode,Invoerwijze,Autorisatiecode,Beschrijving,Totaal bedrag,Netto verkoop,Belastingbedrag,Bedrag fooi,Transactiekosten,Uitbetaling,Uitbetaling datum,Uitbetalingsnummer,Kenmerk",
    `${account},2026-09-17 12:00:00,T${payout},Omzet,Succesvol,VISA,0000,DEBIT,POS,CONTACTLESS,AUTH,,${total},${total},0.0,0.0,${fee},${net},,,`,
    `${account},2026-09-17 12:00:03,T${payout},Uitbetaling,Betaald,VISA,0000,DEBIT,POS,CONTACTLESS,AUTH,,${total},${total},0.0,0.0,${fee},${net},2026-09-18,XYZ ${payout},`,
  ].join("\n");
}

function parsed(text: string): Extract<IncomeParseResult, { ok: true }> {
  const result = parseIncomeExport(text);
  if (!result.ok) throw new Error(result.error);
  return result;
}

const payments = parsed(molliePayments());
const balance = parsed(mollieBalance());
const sumupTheo = parsed(sumup("theo@voorbeeld.be", "41657.49", "420.94", "PID0000001"));
const sumupFak = parsed(sumup("fak@voorbeeld.be", "7000.00", "75.51", "PID0000002"));

const inQ3 = (row: ParsedIncomeRow) => row.periodMonth >= "2026-07" && row.periodMonth <= "2026-09";
const mollieRows = [...payments.rows, ...balance.rows].filter(inQ3);
const sumupRows = [...sumupTheo.rows, ...sumupFak.rows].filter(inQ3);
const transfers = balance.payouts.filter((payout) => payout.paidOn >= "2026-07-01" && payout.paidOn <= "2026-09-30");

// Beheer: SumUp met een aparte factuur, de Mollie-kosten (nog) niet.
const rules = lineRulesOf(parseIncomeConfig({ separateFeeSources: ["SUMUP"] }));
const coded = (row: ParsedIncomeRow): OverviewTransaction => ({
  source: row.source,
  kind: row.kind,
  // Elke betaling een code, zoals Beheer ze per evenement gaf.
  accountingCode: row.kind === "PAYMENT" || row.kind === "REFUND" ? "700100" : null,
  accountingCodeName: "Activiteiten opbrengsten",
  excluded: false,
  amountCents: row.amountCents,
  bankAccount: ACCOUNT,
});

const exportIds = new Set(payments.rows.filter((row) => row.kind === "PAYMENT").map((row) => row.providerId));
const balanceIds = new Set((balance.balancePayments ?? []).map((payment) => payment.paymentId));
const reserve = computeMollieReserve({
  rows: mollieRows.map((row) => ({ kind: row.kind, amountCents: row.amountCents, bankAccount: ACCOUNT, notCounted: quarterLineKey(coded(row), rules) === null })),
  transfers: transfers.map((transfer) => ({
    reference: transfer.reference,
    paidOn: transfer.paidOn,
    amountCents: transfer.amountCents ?? 0,
    bankAccount: ACCOUNT,
  })),
  completeness: {
    missingInBalance: { count: [...exportIds].filter((id) => !balanceIds.has(id ?? "")).length, cents: 0 },
    missingInExport: { count: [...balanceIds].filter((id) => !exportIds.has(id)).length, cents: 0 },
  },
});

describe("het derde kwartaal van 2026 van Beheer", () => {
  it("leest de verzonnen bestanden met de sommen van Beheer", () => {
    const sum = (rows: ParsedIncomeRow[], kind: string) => rows.filter((row) => row.kind === kind).reduce((total, row) => total + row.amountCents, 0);
    expect(sum(mollieRows, "PAYMENT")).toBe(913050);
    expect(sum(mollieRows.filter((row) => row.periodMonth === "2026-08"), "PAYMENT")).toBe(478500);
    expect(sum(mollieRows.filter((row) => row.periodMonth === "2026-09"), "PAYMENT")).toBe(434550);
    expect(sum(mollieRows, "FEE")).toBe(-14201);
    expect(sum(mollieRows, "RESERVE")).toBe(0);
    expect(transfers.reduce((total, transfer) => total + (transfer.amountCents ?? 0), 0)).toBe(876160);
    expect(transfers).toHaveLength(9);
  });

  it("zet niets van het derde kwartaal in oktober, ook niet wat in oktober uitbetaald werd", () => {
    expect([...payments.rows, ...balance.rows].filter((row) => row.periodMonth === "2026-10")).toEqual([]);
  });

  it("rekent een wijziging van de dynamische reserve van € -226,89 uit", () => {
    expect(reserve).toMatchObject({ status: "known", cents: -22689, transfersCents: 876160, transferCount: 9 });
  });

  it("maakt de Mollie-kolom gelijk aan wat Mollie overschreef: € 8.761,60", () => {
    if (reserve.status !== "known") throw new Error(reserve.status);
    const synthetic: OverviewTransaction[] = reserve.accounts.map((account) => ({
      source: "MOLLIE",
      kind: "RESERVE",
      accountingCode: null,
      accountingCodeName: null,
      excluded: false,
      amountCents: account.cents,
      bankAccount: account.bankAccount,
    }));
    const overview = computeIncomeOverview([...mollieRows.map(coded), ...sumupRows.map(coded), ...synthetic], new Map(), rules);
    expect(overview.codes[0].bySource.MOLLIE).toBe(913050);
    expect(overview.fees.bySource.MOLLIE).toBe(-14201);
    expect(overview.reserve.bySource.MOLLIE).toBe(-22689);
    expect(overview.totals.bySource.MOLLIE).toBe(876160);
    // Beheer kwam op 8.761,44: de twee compensaties (+0,16) zaten niet in de kosten.
    expect(overview.totals.bySource.MOLLIE - 876144).toBe(16);

    // De SumUp-kosten komen op een aparte factuur: niet in het overzicht.
    expect(overview.fees.bySource.SUMUP).toBe(0);
    expect(overview.separateFees.bySource.SUMUP).toBe(-42094 - 7551);
    expect(overview.totals.bySource.SUMUP).toBe(4165749 + 700000);
  });

  it("telt de SumUp-kosten wel in de uitbetalingen: die zijn wat op de bank kwam", () => {
    const payouts = groupPayouts(
      sumupRows.flatMap((row) =>
        row.payoutReference ? [{ source: row.source, reference: row.payoutReference, kind: row.kind, amountCents: row.amountCents, occurredAt: row.occurredAt }] : [],
      ),
    );
    expect(payouts.map((payout) => [payout.reference, payout.fees, payout.total])).toEqual([
      ["XYZ PID0000001", -42094, 4165749 - 42094],
      ["XYZ PID0000002", -7551, 700000 - 7551],
    ]);
  });

  it("met de Mollie-kosten ook op een aparte factuur is de kolom de overschrijvingen plus die kosten", () => {
    const both = lineRulesOf(parseIncomeConfig({ separateFeeSources: ["SUMUP", "MOLLIE"] }));
    const withMollie = computeMollieReserve({
      rows: mollieRows.map((row) => ({ kind: row.kind, amountCents: row.amountCents, bankAccount: ACCOUNT, notCounted: quarterLineKey(coded(row), both) === null })),
      transfers: transfers.map((transfer) => ({ reference: transfer.reference, paidOn: transfer.paidOn, amountCents: transfer.amountCents ?? 0, bankAccount: ACCOUNT })),
      completeness: { missingInBalance: { count: 0, cents: 0 }, missingInExport: { count: 0, cents: 0 } },
    });
    if (withMollie.status !== "known") throw new Error(withMollie.status);
    const overview = computeIncomeOverview(
      [
        ...mollieRows.map(coded),
        { source: "MOLLIE", kind: "RESERVE", accountingCode: null, accountingCodeName: null, excluded: false, amountCents: withMollie.cents, bankAccount: ACCOUNT },
      ],
      new Map(),
      both,
    );
    expect(overview.totals.bySource.MOLLIE).toBe(890361);
    expect(overview.totals.bySource.MOLLIE).toBe(876160 + 14201);
  });

  it("kent de reserve niet als het balansrapport een betaling mist", () => {
    const missing = computeMollieReserve({
      rows: mollieRows.map((row) => ({ kind: row.kind, amountCents: row.amountCents, bankAccount: ACCOUNT, notCounted: false })),
      transfers: [],
      completeness: { missingInBalance: { count: 2, cents: 2800 }, missingInExport: { count: 0, cents: 0 } },
    });
    expect(missing.status).toBe("unknown");
  });
});
