/**
 * Het overzicht van /admin/inkomsten als pure som: per boekhoudcode een rij,
 * per bron een kolom, plus de kosten, de reserve en wat nog na te kijken is.
 * Elke transactie van de periode staat in precies één rij, zodat het totaal van
 * een kolom gelijk is aan wat er via die bron binnenkwam (bij Mollie: wat er in
 * die maanden uitbetaald werd).
 */
import { codeKey, REVIEW_DAY_START_HOUR, reviewDay } from "./match";
import type { IncomeKindCode, IncomeSourceCode } from "./parse";

export { REVIEW_DAY_START_HOUR, reviewDay };

export const INCOME_SOURCES: readonly IncomeSourceCode[] = ["PAYCONIQ", "MOLLIE", "SUMUP", "EUROPABANK"];

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
  accounts: Array<{ bankAccount: string | null; total: number }>;
};

function emptyAmounts(): SourceAmounts {
  return { PAYCONIQ: 0, MOLLIE: 0, SUMUP: 0, EUROPABANK: 0 };
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
 */
export function computeIncomeOverview(
  transactions: readonly OverviewTransaction[],
  codeOrder: ReadonlyMap<string, number>,
): IncomeOverview {
  const codes = new Map<string, OverviewCodeRow>();
  const unassigned = emptyLine();
  const fees = emptyLine();
  const reserve = emptyLine();
  const totals = emptyLine();
  const excluded = emptyLine();
  const accounts = new Map<string | null, number>();

  for (const tx of transactions) {
    if (tx.excluded) {
      add(excluded, tx.source, tx.amountCents);
      continue;
    }
    add(totals, tx.source, tx.amountCents);
    accounts.set(tx.bankAccount, (accounts.get(tx.bankAccount) ?? 0) + tx.amountCents);

    if (tx.kind === "FEE") add(fees, tx.source, tx.amountCents);
    else if (tx.kind === "RESERVE") add(reserve, tx.source, tx.amountCents);
    else if (!tx.accountingCode) add(unassigned, tx.source, tx.amountCents);
    else {
      let row = codes.get(tx.accountingCode);
      if (!row) {
        row = { ...emptyLine(), code: tx.accountingCode, name: tx.accountingCodeName ?? "" };
        codes.set(tx.accountingCode, row);
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
 * veranderde de som). Zonder vinkje kan het bedrag van de provider zelf het
 * zeggen: de overschrijving in het balansrapport van Mollie is het bedrag op
 * het uittreksel, dus gelijk is klaar (`provider`) en anders is er een
 * verschil om na te kijken (`differs`).
 */
export type PayoutState = "checked" | "provider" | "changed" | "differs" | "open";

export function payoutState(total: number, checkedAmount: number | null, providerAmount: number | null): PayoutState {
  if (checkedAmount !== null) return checkedAmount === total ? "checked" : "changed";
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
  | { key: "payouts"; ok: boolean; total: number; checked: number; changed: number; differs: number }
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
  payouts: ReadonlyArray<{ total: number; checkedAmount: number | null; providerAmount: number | null }>;
  open: { count: number; cents: number };
  withoutAccount: { count: number; cents: number };
  hasFees: boolean;
  feeCodeChosen: boolean;
};

/** Wat Beheer best nakijkt voor een periode afgesloten wordt, in de volgorde van het werk. */
export function computeIncomeChecks(input: IncomeCheckInput): IncomeCheck[] {
  const missing: Array<{ source: IncomeSourceCode; month: string; channel: string | null }> = [];
  const past = input.months.filter((month) => month < input.currentMonth);
  for (const source of INCOME_SOURCES) {
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
  const states = input.payouts.map((payout) => payoutState(payout.total, payout.checkedAmount, payout.providerAmount));
  const count = (...wanted: PayoutState[]) => states.filter((state) => wanted.includes(state)).length;
  const checked = count("checked", "provider");
  return [
    { key: "coverage", ok: missing.length === 0, missing },
    { key: "mollieFees", ok: feeMonths.length === 0, months: feeMonths },
    { key: "mollieFeesTwice", ok: twice.length === 0, months: twice },
    {
      key: "payouts",
      ok: checked === input.payouts.length,
      total: input.payouts.length,
      checked,
      changed: count("changed"),
      differs: count("differs"),
    },
    { key: "open", ok: input.open.count === 0, ...input.open },
    { key: "accounts", ok: input.withoutAccount.count === 0, ...input.withoutAccount },
    { key: "feeCode", ok: !input.hasFees || input.feeCodeChosen },
  ];
}
