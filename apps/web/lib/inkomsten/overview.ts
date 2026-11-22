/**
 * Het overzicht van /admin/inkomsten als pure som: per boekhoudcode een rij,
 * per bron een kolom, plus de kosten, de reserve en wat nog na te kijken is.
 * Elke transactie van de periode staat in precies één rij, op de regel die
 * `quarterLineKey` zegt, zodat het totaal van een kolom gelijk is aan wat er via
 * die bron binnenkwam. Bij Mollie zorgt de berekende wijziging van de dynamische
 * reserve (`reserve.ts`) ervoor dat dat ook gelijk is aan wat Mollie overschreef.
 */
import { quarterLineKey, type LineRules } from "./lines";
import { codeKey, REVIEW_DAY_START_HOUR, reviewDay } from "./match";
import type { CountAndCents, MollieReserve } from "./reserve";
import type { IncomeKindCode, IncomeSourceCode } from "./parse";

export { REVIEW_DAY_START_HOUR, reviewDay };

/** De bronnen met een export om op te laden. */
export const EXPORT_SOURCES: readonly IncomeSourceCode[] = ["PAYCONIQ", "MOLLIE", "SUMUP", "EUROPABANK"];

/** Elke bron, in de volgorde van de kolommen: de exports, dan de overschrijvingen met de hand. */
export const INCOME_SOURCES: readonly IncomeSourceCode[] = [...EXPORT_SOURCES, "TRANSFER"];

export type OverviewTransaction = {
  source: IncomeSourceCode;
  kind: IncomeKindCode;
  accountingCode: string | null;
  accountingCodeName: string | null;
  excluded: boolean;
  amountCents: number;
  /** De rekening van het kanaal op de dag van de transactie; null = niet ingesteld. */
  bankAccount: string | null;
};

export type SourceAmounts = Record<IncomeSourceCode, number>;

export type OverviewLine = { bySource: SourceAmounts; total: number; count: number };

export type OverviewCodeRow = OverviewLine & { code: string; name: string };

export type IncomeOverview = {
  codes: OverviewCodeRow[];
  /** Betalingen zonder code: Na te kijken. Telt mee in het totaal. */
  unassigned: OverviewLine;
  fees: OverviewLine;
  reserve: OverviewLine;
  /** Alles wat meetelt; "telt niet mee" zit er niet in. */
  totals: OverviewLine;
  excluded: OverviewLine;
  /** Kosten met een aparte factuur (Instellingen): niet in het totaal, wel in de uitbetalingen. */
  separateFees: OverviewLine;
  accounts: Array<{ bankAccount: string | null; total: number }>;
};

function emptyAmounts(): SourceAmounts {
  return { PAYCONIQ: 0, MOLLIE: 0, SUMUP: 0, EUROPABANK: 0, TRANSFER: 0 };
}

function emptyLine(): OverviewLine {
  return { bySource: emptyAmounts(), total: 0, count: 0 };
}

function add(line: OverviewLine, source: IncomeSourceCode, cents: number): void {
  line.bySource[source] += cents;
  line.total += cents;
  line.count += 1;
}

/**
 * @param codeOrder de plaats van elke code in het register (`codeKey` -> index),
 *   zodat de rijen in de volgorde van de penning staan, zoals overal.
 * @param rules wat Beheer in Instellingen bepaalde over wat meetelt.
 */
export function computeIncomeOverview(
  transactions: readonly OverviewTransaction[],
  codeOrder: ReadonlyMap<string, number>,
  rules: LineRules,
): IncomeOverview {
  const codes = new Map<string, OverviewCodeRow>();
  const unassigned = emptyLine();
  const fees = emptyLine();
  const reserve = emptyLine();
  const totals = emptyLine();
  const excluded = emptyLine();
  const separateFees = emptyLine();
  const accounts = new Map<string | null, number>();

  for (const tx of transactions) {
    const line = quarterLineKey(tx, rules);
    if (line === null) {
      add(tx.excluded ? excluded : separateFees, tx.source, tx.amountCents);
      continue;
    }
    add(totals, tx.source, tx.amountCents);
    accounts.set(tx.bankAccount, (accounts.get(tx.bankAccount) ?? 0) + tx.amountCents);

    if (line === "Kosten") add(fees, tx.source, tx.amountCents);
    else if (line === "Reserve") add(reserve, tx.source, tx.amountCents);
    else if (line === "Na te kijken") add(unassigned, tx.source, tx.amountCents);
    else {
      // De regel is hier de code zelf.
      let row = codes.get(line);
      if (!row) {
        row = { ...emptyLine(), code: line, name: tx.accountingCodeName ?? "" };
        codes.set(line, row);
      }
      add(row, tx.source, tx.amountCents);
    }
  }

  const rank = (code: string) => codeOrder.get(codeKey(code)) ?? Number.MAX_SAFE_INTEGER;
  return {
    codes: [...codes.values()].sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code)),
    unassigned,
    fees,
    reserve,
    totals,
    excluded,
    separateFees,
    accounts: [...accounts.entries()]
      .map(([bankAccount, total]) => ({ bankAccount, total }))
      // Niet ingesteld onderaan: dat is werk, geen rekening.
      .sort((a, b) => (a.bankAccount === null ? 1 : 0) - (b.bankAccount === null ? 1 : 0) || (a.bankAccount ?? "").localeCompare(b.bankAccount ?? "")),
  };
}

/**
 * De dag van een rekening of standaardcode die "vanaf het begin" geldt: de
 * eerste die Beheer instelt, zonder datum. Een export kan later oudere maanden
 * opladen, dus de vroegste transactie van nu is geen begin.
 */
export const CHANNEL_FROM_START = "2000-01-01";

/**
 * De rekening van een kanaal op een dag: de laatste wissel op of voor die dag.
 * `accounts` met `from` als "2026-11-26".
 */
export function accountOn(
  accounts: ReadonlyArray<{ from: string; bankAccount: string }>,
  day: string,
): string | null {
  let best: { from: string; bankAccount: string } | null = null;
  for (const account of accounts) {
    if (account.from <= day && (!best || account.from > best.from)) best = account;
  }
  return best?.bankAccount ?? null;
}

// -----------------------------------------------------------------------------
// Per uitbetaling (Mollie, SumUp)
// -----------------------------------------------------------------------------

export type PayoutRow = {
  source: IncomeSourceCode;
  reference: string;
  kind: IncomeKindCode;
  amountCents: number;
  occurredAt: Date;
};

export type PayoutGroup = {
  source: IncomeSourceCode;
  reference: string;
  firstAt: Date;
  lastAt: Date;
  count: number;
  payments: number;
  refunds: number;
  fees: number;
  reserve: number;
  /** Alles samen, ook wat niet meetelt: dit bedrag kwam op de bank. */
  total: number;
};

/**
 * De regels per uitbetaling. Het totaal telt elke regel, ook een betaling die
 * "telt niet mee" kreeg: het geld kwam toch op de rekening, en dit bedrag moet
 * op het uittreksel staan. Per bron, dan in de volgorde van de uitbetalingen.
 */
export function groupPayouts(rows: readonly PayoutRow[]): PayoutGroup[] {
  const payouts = new Map<string, PayoutGroup>();
  for (const row of rows) {
    const key = `${row.source}|${row.reference}`;
    let payout = payouts.get(key);
    if (!payout) {
      payout = {
        source: row.source,
        reference: row.reference,
        firstAt: row.occurredAt,
        lastAt: row.occurredAt,
        count: 0,
        payments: 0,
        refunds: 0,
        fees: 0,
        reserve: 0,
        total: 0,
      };
      payouts.set(key, payout);
    }
    payout.count += 1;
    payout.total += row.amountCents;
    if (row.kind === "PAYMENT") payout.payments += row.amountCents;
    else if (row.kind === "REFUND") payout.refunds += row.amountCents;
    else if (row.kind === "FEE") payout.fees += row.amountCents;
    else payout.reserve += row.amountCents;
    if (row.occurredAt < payout.firstAt) payout.firstAt = row.occurredAt;
    if (row.occurredAt > payout.lastAt) payout.lastAt = row.occurredAt;
  }
  const order = (source: IncomeSourceCode) => INCOME_SOURCES.indexOf(source);
  return [...payouts.values()].sort(
    (a, b) => order(a.source) - order(b.source) || a.lastAt.getTime() - b.lastAt.getTime() || a.reference.localeCompare(b.reference),
  );
}

/**
 * Of een uitbetaling klopt met de bank. Met een vinkje: afgevinkt op het
 * bedrag van nu (`checked`), of op een ander (`changed`: een latere export
 * veranderde de som); een vinkje met de hand gaat altijd voor.
 *
 * Staat ze op een opgeladen bankafschrift, dan zegt dat het: hetzelfde bedrag
 * als de som, of bij Mollie als de overschrijving, is in orde (`bank`); een
 * ander bedrag is een verschil om na te kijken (`bankDiffers`).
 *
 * Zonder afschrift kan het bedrag van de provider zelf het zeggen: de
 * overschrijving in het balansrapport van Mollie is het bedrag op het
 * uittreksel, dus gelijk is klaar (`provider`). Anders (`differs`) hield
 * Mollie iets bij of gaf iets vrij: dat verschil zit in de berekende wijziging
 * van de dynamische reserve, dus ook dat is in orde, als informatie.
 */
export type PayoutState = "checked" | "bank" | "provider" | "changed" | "bankDiffers" | "differs" | "open";

export function payoutState(
  total: number,
  checkedAmount: number | null,
  providerAmount: number | null,
  bankAmount: number | null = null,
): PayoutState {
  if (checkedAmount !== null) return checkedAmount === total ? "checked" : "changed";
  if (bankAmount !== null) return bankAmount === total || bankAmount === providerAmount ? "bank" : "bankDiffers";
  if (providerAmount !== null) return providerAmount === total ? "provider" : "differs";
  return "open";
}

// -----------------------------------------------------------------------------
// Controlelijst
// -----------------------------------------------------------------------------

/** De maanden van een periode: "2026-07" tot "2026-09" geeft drie maanden. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let [year, month] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  while (year < toYear || (year === toYear && month <= toMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/**
 * Bronnen waarvan elke export één kanaal is: een SumUp-account, een
 * Europabank-terminal. Daar zegt een regel van het ene kanaal niets over het
 * andere, dus kijkt de controlelijst per kanaal of er iets ontbreekt. Een
 * export van Payconiq of Mollie heeft alle kanalen samen.
 */
export const EXPORT_PER_CHANNEL: ReadonlySet<IncomeSourceCode> = new Set(["SUMUP", "EUROPABANK"]);

export type IncomeCheck =
  /**
   * Een voorbije maand zonder één regel van een bron die Beheer wel oplaadt,
   * of van een kanaal dat kort ervoor nog regels had: vergeten op te laden?
   */
  | { key: "coverage"; ok: boolean; missing: Array<{ source: IncomeSourceCode; month: string; channel: string | null }> }
  /** Maanden met Mollie-betalingen maar zonder kostenregel. */
  | { key: "mollieFees"; ok: boolean; months: string[] }
  /** Maanden met Mollie-kosten uit twee soorten bestanden: twee keer hetzelfde geld. */
  | { key: "mollieFeesTwice"; ok: boolean; months: string[] }
  | { key: "payouts"; ok: boolean; total: number; checked: number; changed: number; differs: number; bankDiffers: number; bank: number }
  /**
   * Of de site de wijziging van de dynamische reserve van Mollie kent: de
   * betalingenexport en het balansrapport noemen dezelfde betalingen.
   */
  | { key: "mollieReserve"; ok: boolean; transferCount: number; missingInBalance: CountAndCents; missingInExport: CountAndCents }
  | { key: "open"; ok: boolean; count: number; cents: number }
  | { key: "accounts"; ok: boolean; count: number; cents: number }
  /** Er zijn kosten, maar er is geen kostencode gekozen. */
  | { key: "feeCode"; ok: boolean };

export type IncomeCheckInput = {
  months: readonly string[];
  /** De maand van vandaag: een maand die nog loopt, kan nog niet volledig zijn. */
  currentMonth: string;
  /** Bronnen waarvan ooit iets opgeladen werd. */
  sourcesInUse: ReadonlySet<IncomeSourceCode>;
  /** Regels per bron per maand, als `${bron}:${maand}`. */
  rowsPerSourceMonth: ReadonlyMap<string, number>;
  /**
   * De kanalen van een bron uit `EXPORT_PER_CHANNEL` die in de periode of de
   * drie maanden ervoor regels hadden: die verwacht de controlelijst elke maand.
   */
  channelsInUse: ReadonlyArray<{ id: string; source: IncomeSourceCode; name: string }>;
  /** Regels per kanaal per maand, als `${kanaal}:${maand}`. */
  rowsPerChannelMonth: ReadonlyMap<string, number>;
  molliePaymentMonths: ReadonlySet<string>;
  /** Maanden met een kostenregel van Mollie, uit het balansrapport of uit de export per uitbetaling. */
  mollieFeeMonths: ReadonlySet<string>;
  /** Maanden met kosten uit beide soorten bestanden. */
  mollieFeeMonthsTwice: ReadonlySet<string>;
  payouts: ReadonlyArray<{ total: number; checkedAmount: number | null; providerAmount: number | null; bankAmount?: number | null }>;
  open: { count: number; cents: number };
  withoutAccount: { count: number; cents: number };
  hasFees: boolean;
  feeCodeChosen: boolean;
  mollieReserve: MollieReserve;
};

/** Wat Beheer best nakijkt voor een periode afgesloten wordt, in de volgorde van het werk. */
export function computeIncomeChecks(input: IncomeCheckInput): IncomeCheck[] {
  const missing: Array<{ source: IncomeSourceCode; month: string; channel: string | null }> = [];
  const past = input.months.filter((month) => month < input.currentMonth);
  // Enkel de exports: een maand zonder overschrijving is gewoon een maand
  // waarin niemand rechtstreeks stortte, geen vergeten bestand.
  for (const source of EXPORT_SOURCES) {
    if (!input.sourcesInUse.has(source)) continue;
    if (EXPORT_PER_CHANNEL.has(source)) {
      for (const channel of input.channelsInUse) {
        if (channel.source !== source) continue;
        for (const month of past) {
          if (!input.rowsPerChannelMonth.get(`${channel.id}:${month}`)) missing.push({ source, month, channel: channel.name });
        }
      }
      continue;
    }
    for (const month of past) {
      if (!input.rowsPerSourceMonth.get(`${source}:${month}`)) missing.push({ source, month, channel: null });
    }
  }
  const feeMonths = input.months.filter((month) => input.molliePaymentMonths.has(month) && !input.mollieFeeMonths.has(month));
  const twice = input.months.filter((month) => input.mollieFeeMonthsTwice.has(month));
  const states = input.payouts.map((payout) => payoutState(payout.total, payout.checkedAmount, payout.providerAmount, payout.bankAmount ?? null));
  const count = (...wanted: PayoutState[]) => states.filter((state) => wanted.includes(state)).length;
  // Een verschil met de overschrijving van Mollie is in orde: het zit in de reserve.
  // Op het afschrift met hetzelfde bedrag ook.
  const checked = count("checked", "bank", "provider", "differs");
  const reserve = input.mollieReserve;
  const reserveCheck: IncomeCheck[] =
    reserve.status === "none"
      ? []
      : [
          reserve.status === "known"
            ? { key: "mollieReserve", ok: true, transferCount: reserve.transferCount, missingInBalance: { count: 0, cents: 0 }, missingInExport: { count: 0, cents: 0 } }
            : { key: "mollieReserve", ok: false, transferCount: 0, ...reserve.completeness },
        ];
  return [
    { key: "coverage", ok: missing.length === 0, missing },
    { key: "mollieFees", ok: feeMonths.length === 0, months: feeMonths },
    { key: "mollieFeesTwice", ok: twice.length === 0, months: twice },
    ...reserveCheck,
    {
      key: "payouts",
      ok: checked === input.payouts.length,
      total: input.payouts.length,
      checked,
      changed: count("changed"),
      differs: count("differs"),
      bankDiffers: count("bankDiffers"),
      bank: count("bank"),
    },
    { key: "open", ok: input.open.count === 0, ...input.open },
    { key: "accounts", ok: input.withoutAccount.count === 0, ...input.withoutAccount },
    { key: "feeCode", ok: !input.hasFees || input.feeCodeChosen },
  ];
}
