import "server-only";

import { prisma } from "@vtk/db";
import type { IncomeKind, IncomeRule, IncomeSource, Prisma } from "@prisma/client";
import { brusselsWallClockMinutes, brusselsYMD, ymdKey } from "@/lib/brussels";
import { listAccountingCodes } from "@/lib/accounting/server";
import {
  codeKey,
  deviceAt,
  incomeRuleLabel,
  incomeRuleText,
  matchTransaction,
  nameRuleKey,
  type ChannelCodeEntry,
  type CodeSnapshot,
  type KassaSpan,
  type LendingSpan,
  type MatchContext,
  type MatchResult,
  type WebsitePayment,
} from "./match";
import { registerInterval, type PaymentMethod } from "@/lib/kassas/kassa";
import {
  INCOME_SOURCES,
  accountOn,
  EXPORT_PER_CHANNEL,
  computeIncomeChecks,
  computeIncomeOverview,
  groupPayouts,
  monthsBetween,
  payoutState,
  reviewDay,
  type IncomeCheck,
  type IncomeOverview,
  type OverviewTransaction,
  type PayoutGroup,
  type PayoutState,
} from "./overview";
import { periodLabel, postName } from "./labels";
import {
  deviceKey,
  deviceWindow,
  importAmountOf,
  kassaControlState,
  type ControlRegister,
  type DeviceUse,
  type KassaControlState,
  type KassaImportAmount,
} from "./kassa";
import { INCOME_CONFIG_KEY, lineRulesOf, parseIncomeConfig, type IncomeConfig } from "./config";
import { isSeparateFee, quarterLineKey, type LineRules } from "./lines";
import { computeMollieReserve, type MollieCompleteness, type MollieReserve } from "./reserve";
import { MANUAL_FORMAT } from "./transfer";
import { normaliseAccount, payoutKey, type BankProvider } from "./bank";
import { coveredOn, expectedBankDay, loadBankCoverage, loadBankLines, loadBankOverview, type BankOverview } from "./bankServer";
import type { WorkbookGroup, WorkbookModel, WorkbookTransaction } from "./workbook";
import { ASSIGNABLE_KINDS, transactionWhere, type TransactionFilter } from "./transactionFilter";
import {
  BALANCE_KEY,
  MOLLIE_CHANNEL,
  nextMonth,
  dateToMonth,
  monthToDate,
  parseIncomeExport,
  type IncomeFormat,
  type IncomeParseFailure,
  type IncomeSourceCode,
  type ParsedIncomeRow,
} from "./parse";

/**
 * De databasekant van /admin/inkomsten: opladen, koppelen, groeperen en het
 * overzicht. De regels zelf staan puur in `match.ts`, het lezen van de
 * bestanden in `parse.ts`. Zie docs/inkomsten.md.
 */

const CHUNK = 1000;

export function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

// -----------------------------------------------------------------------------
// Instellingen (Setting `income.config`)
// -----------------------------------------------------------------------------

export { INCOME_CONFIG_KEY, type IncomeConfig };

export async function getIncomeConfig(): Promise<IncomeConfig> {
  const row = await prisma.setting.findUnique({ where: { key: INCOME_CONFIG_KEY } });
  return parseIncomeConfig(row?.value);
}

export async function saveIncomeConfig(config: IncomeConfig): Promise<void> {
  await prisma.setting.upsert({
    where: { key: INCOME_CONFIG_KEY },
    create: { key: INCOME_CONFIG_KEY, value: config },
    update: { value: config },
  });
}

export async function feeAccountingCode(): Promise<CodeSnapshot | null> {
  const { feeAccountingCodeId } = await getIncomeConfig();
  if (!feeAccountingCodeId) return null;
  return prisma.accountingCode.findUnique({ where: { id: feeAccountingCodeId }, select: { code: true, name: true } });
}

// -----------------------------------------------------------------------------
// Afgesloten periodes
// -----------------------------------------------------------------------------

export type ClosedPeriod = { id: string; from: string; to: string; closedAt: Date; closedByName: string | null };

export async function listClosedPeriods(): Promise<ClosedPeriod[]> {
  const rows = await prisma.incomePeriod.findMany({
    orderBy: { fromMonth: "desc" },
    select: { id: true, fromMonth: true, toMonth: true, closedAt: true, closedBy: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    from: dateToMonth(row.fromMonth),
    to: dateToMonth(row.toMonth),
    closedAt: row.closedAt,
    closedByName: row.closedBy?.name ?? null,
  }));
}

/** Of een maand ("2026-10") in een afgesloten periode valt. */
export function lockedMonthTest(periods: readonly Pick<ClosedPeriod, "from" | "to">[]): (month: string | null) => boolean {
  return (month) => month !== null && periods.some((period) => period.from <= month && month <= period.to);
}

// -----------------------------------------------------------------------------
// Wat de koppelregels nodig hebben
// -----------------------------------------------------------------------------

/** Welke provider op de site bij welke export hoort. SumUp en Europabank gebruikt de site niet. */
const WEBSITE_PROVIDER: Partial<Record<IncomeSourceCode, string>> = { PAYCONIQ: "bancontact", MOLLIE: "mollie" };

async function websitePayments(source: IncomeSourceCode, providerIds: readonly string[]): Promise<Map<string, WebsitePayment>> {
  const provider = WEBSITE_PROVIDER[source];
  const result = new Map<string, WebsitePayment>();
  if (!provider) return result;
  for (const ids of chunks([...new Set(providerIds)])) {
    const where = { provider, providerPaymentId: { in: ids } };
    const [tickets, memberships, uitleen] = await Promise.all([
      prisma.ticketPayment.findMany({
        where,
        select: { id: true, providerPaymentId: true, order: { select: { accountingCode: true, accountingCodeName: true } } },
      }),
      prisma.membershipPayment.findMany({
        where,
        select: { id: true, providerPaymentId: true, accountingCode: true, accountingCodeName: true },
      }),
      prisma.uitleenPayment.findMany({ where, select: { id: true, providerPaymentId: true } }),
    ]);
    for (const row of tickets) {
      if (!row.providerPaymentId) continue;
      result.set(row.providerPaymentId, {
        code: row.order.accountingCode,
        name: row.order.accountingCodeName,
        ticketPaymentId: row.id,
      });
    }
    for (const row of memberships) {
      if (!row.providerPaymentId) continue;
      result.set(row.providerPaymentId, { code: row.accountingCode, name: row.accountingCodeName, membershipPaymentId: row.id });
    }
    for (const row of uitleen) {
      if (!row.providerPaymentId) continue;
      result.set(row.providerPaymentId, { code: null, name: null, uitleenPaymentId: row.id });
    }
    // Een terugbetaling heeft haar eigen ID (`re_...`); via de terugbetaling op
    // de site vinden we de bestelling, en dus de code.
    const refunds = await prisma.ticketRefund.findMany({
      where: { provider, providerRefundId: { in: ids } },
      select: { providerRefundId: true, paymentId: true, order: { select: { accountingCode: true, accountingCodeName: true } } },
    });
    for (const row of refunds) {
      if (!row.providerRefundId) continue;
      result.set(row.providerRefundId, {
        code: row.order.accountingCode,
        name: row.order.accountingCodeName,
        ticketPaymentId: row.paymentId,
      });
    }
  }
  return result;
}

async function codeContext(): Promise<{ codes: Map<string, CodeSnapshot>; order: Map<string, number> }> {
  const list = await listAccountingCodes();
  return {
    codes: new Map(list.map((code) => [codeKey(code.code), { code: code.code, name: code.name }])),
    order: new Map(list.map((code, index) => [codeKey(code.code), index])),
  };
}

/** De standaardcodes per kanaal, met hun vanaf-dag. */
async function channelCodeContext(): Promise<Map<string, ChannelCodeEntry[]>> {
  const rows = await prisma.incomeChannelCode.findMany({
    select: { channelId: true, from: true, accountingCode: { select: { code: true, name: true } } },
  });
  const result = new Map<string, ChannelCodeEntry[]>();
  for (const row of rows) {
    const entries = result.get(row.channelId) ?? [];
    entries.push({ from: row.from.toISOString().slice(0, 10), code: row.accountingCode });
    result.set(row.channelId, entries);
  }
  return result;
}

/**
 * Per kanaal met een toestel: de aanvaarde kassa's met dat toestel, op begin
 * gesorteerd, met hun code (regel 4). Ook een kassa zonder code staat erin: op
 * een gedeeld toestel eindigt ze de kassa ervoor.
 */
async function cashRegisterContext(): Promise<Map<string, KassaSpan[]>> {
  const channels = await prisma.incomeChannel.findMany({
    where: { cashMethod: { not: null }, cashTerminal: { not: null } },
    select: { id: true, cashMethod: true, cashTerminal: true },
  });
  if (channels.length === 0) return new Map();
  const payments = await prisma.cashRegisterPayment.findMany({
    where: { register: { status: { not: "REQUESTED" } } },
    select: {
      method: true,
      terminal: true,
      register: {
        select: { id: true, date: true, startsAt: true, endsAt: true, accountingCode: { select: { code: true, name: true } } },
      },
    },
  });
  const byDevice = new Map<string, KassaSpan[]>();
  for (const payment of payments) {
    const key = `${payment.method}|${payment.terminal}`;
    const spans = byDevice.get(key) ?? [];
    if (!spans.some((span) => span.id === payment.register.id)) {
      const interval = registerInterval(payment.register);
      spans.push({
        id: payment.register.id,
        start: interval.start,
        end: interval.end,
        code: payment.register.accountingCode,
        wholeDay: !(payment.register.startsAt && payment.register.endsAt),
      });
    }
    byDevice.set(key, spans);
  }
  for (const spans of byDevice.values()) spans.sort((a, b) => a.start.getTime() - b.start.getTime());
  const result = new Map<string, KassaSpan[]>();
  for (const channel of channels) {
    const spans = byDevice.get(`${channel.cashMethod}|${channel.cashTerminal}`);
    if (spans) result.set(channel.id, spans);
  }
  return result;
}

/**
 * De uitleningen per kanaal (regel 6), met hun code. Een uitlening waarvan de
 * code uit het register verdween, staat erin zonder code: ze koppelt dan niets.
 */
export async function channelLendingContext(): Promise<Map<string, LendingSpan[]>> {
  const rows = await prisma.incomeChannelLending.findMany({
    select: { id: true, channelId: true, fromDay: true, toDay: true, accountingCode: { select: { code: true, name: true } } },
  });
  const result = new Map<string, LendingSpan[]>();
  for (const row of rows) {
    const spans = result.get(row.channelId) ?? [];
    spans.push({ id: row.id, from: ymdOf(row.fromDay), to: ymdOf(row.toDay), code: row.accountingCode });
    result.set(row.channelId, spans);
  }
  return result;
}

/** Een `@db.Date` als "2026-09-16". */
function ymdOf(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function nameRuleContext(): Promise<Map<string, CodeSnapshot>> {
  const rules = await prisma.incomeNameRule.findMany({
    select: { source: true, text: true, accountingCode: { select: { code: true, name: true } } },
  });
  return new Map(rules.map((rule) => [nameRuleKey(rule.source, rule.text), rule.accountingCode]));
}

// -----------------------------------------------------------------------------
// Opladen
// -----------------------------------------------------------------------------

export type ImportRuleCounts = Record<Exclude<IncomeRule, "MANUAL"> | "OPEN", number>;

export type ImportSummary = {
  format: IncomeFormat;
  source: IncomeSourceCode;
  fileName: string;
  /** Regels in het bestand. */
  total: number;
  /** Mislukt, vervallen of geannuleerd: telt nergens mee. */
  skipped: number;
  /**
   * Hetzelfde geld als een andere regel: de uitbetalingsregels van SumUp, de
   * betalingen in het balansrapport van Mollie (die komen uit de
   * betalingenexport), en de maandfactuur van Mollie voor een maand waarvan
   * de kosten al uit de export per uitbetaling komen.
   */
  ignored: number;
  created: number;
  /** Al eerder opgeladen. */
  duplicates: number;
  /** Al eerder opgeladen, maar nu met een uitbetaling erbij. */
  updated: number;
  /** In een afgesloten periode: niet bewaard. */
  locked: number;
  rules: ImportRuleCounts;
  /**
   * Kosten- en reserveregels die als eigen regel in het bestand stonden
   * (Mollie). De kosten op een betaling van SumUp of Europabank tellen niet mee.
   */
  feeRows: number;
  firstAt: Date | null;
  lastAt: Date | null;
  /** Stickers of profielen die de site nog niet kende. */
  newChannels: string[];
  /**
   * Uitbetalingen in het bestand die de site nog niet kende, of nu met een
   * ander bedrag of een andere dag: de overschrijvingen van Mollie, de
   * uitbetalingsnummers van SumUp.
   */
  payouts: number;
  /**
   * Betalingen uit het balansrapport van Mollie die de site nog niet kende om
   * de betalingenexport na te kijken. Ze tellen nergens; ze maken een balans-
   * rapport dat al geüpload was, het opnieuw uploaden waard.
   */
  balancePayments: number;
};

/**
 * De maanden waarvan de Mollie-kosten uit de export per uitbetaling komen
 * ("Withheld fees"), en dus niet uit het balansrapport.
 */
async function mollieFeeMonthsOutsideBalance(months: readonly string[]): Promise<Set<string>> {
  if (months.length === 0) return new Set();
  const rows = await prisma.incomeTransaction.findMany({
    where: {
      source: "MOLLIE",
      kind: "FEE",
      periodMonth: { in: months.map(monthToDate) },
      NOT: { externalKey: { startsWith: `FEE:${BALANCE_KEY}:` } },
    },
    distinct: ["periodMonth"],
    select: { periodMonth: true },
  });
  return new Set(rows.flatMap((row) => (row.periodMonth ? [dateToMonth(row.periodMonth)] : [])));
}

export type ImportOutcome = { ok: true; summary: ImportSummary; importId: string | null } | IncomeParseFailure;

/**
 * Een export lezen en, zonder `dryRun`, bewaren. Dezelfde berekening voor de
 * voorvertoning en het echte opladen, zodat wat Beheer te zien krijgt ook is
 * wat er gebeurt.
 *
 * `seen` draagt de sleutels van eerdere bestanden uit dezelfde keuze mee: in de
 * voorvertoning staat nog niets in de database, en zonder dit zou een dag die in
 * twee gekozen bestanden zit, twee keer als nieuw tellen.
 */
export async function importIncomeExport(
  text: string,
  fileName: string,
  options: { dryRun: boolean; userId: string | null; seen?: Set<string> },
): Promise<ImportOutcome> {
  const parsed = parseIncomeExport(text);
  if (!parsed.ok) return parsed;
  const { source } = parsed;

  // Dubbel in hetzelfde bestand: de eerste telt. De tellingen gaan over regels
  // in het bestand, dus zonder de kostenregels die de parser erbij maakte.
  const unique = new Map<string, ParsedIncomeRow>();
  let duplicates = 0;
  for (const row of parsed.rows) {
    if (!unique.has(row.externalKey)) unique.set(row.externalKey, row);
    else if (!row.derived) duplicates++;
  }
  const rows = [...unique.values()];

  const existing = new Map<string, { id: string; payoutReference: string | null }>();
  for (const keys of chunks(rows.map((row) => row.externalKey))) {
    const found = await prisma.incomeTransaction.findMany({
      where: { source, externalKey: { in: keys } },
      select: { id: true, externalKey: true, payoutReference: true },
    });
    for (const row of found) existing.set(row.externalKey, row);
  }

  // De kosten van Mollie komen per maand uit één soort bestand: de maandfactuur
  // in het balansrapport, of "Withheld fees" per uitbetaling. Beide samen is
  // twee keer hetzelfde geld; wat er al is, blijft.
  let ignored = parsed.ignored;
  const feesElsewhere =
    parsed.format === "mollie-balance"
      ? await mollieFeeMonthsOutsideBalance([...new Set(rows.flatMap((row) => (row.kind === "FEE" && row.periodMonth ? [row.periodMonth] : [])))])
      : new Set<string>();

  const isLocked = lockedMonthTest(await listClosedPeriods());
  const fresh: ParsedIncomeRow[] = [];
  const payoutUpdates: Array<{ id: string; row: ParsedIncomeRow }> = [];
  let locked = 0;
  for (const row of rows) {
    if (row.kind === "FEE" && row.periodMonth && feesElsewhere.has(row.periodMonth)) {
      ignored++;
      continue;
    }
    const known = existing.get(row.externalKey);
    if (known) {
      if (!row.derived) duplicates++;
      // Eerst opgeladen voor ze uitbetaald was, nu met de uitbetaling erbij.
      if (!known.payoutReference && row.payoutReference && !isLocked(row.periodMonth)) {
        payoutUpdates.push({ id: known.id, row });
      }
      continue;
    }
    if (options.seen?.has(`${source}:${row.externalKey}`)) {
      if (!row.derived) duplicates++;
      continue;
    }
    if (isLocked(row.periodMonth)) {
      if (!row.derived) locked++;
      continue;
    }
    fresh.push(row);
  }
  for (const row of fresh) options.seen?.add(`${source}:${row.externalKey}`);

  // Een uitbetaling die er al is met dezelfde dag en hetzelfde bedrag, is
  // niets nieuws. SumUp zegt geen bedrag: dan blijft wat er stond.
  const knownPayouts = parsed.payouts.length
    ? await prisma.incomePayout.findMany({
        where: { source, reference: { in: parsed.payouts.map((payout) => payout.reference) } },
        select: { reference: true, paidOn: true, amountCents: true },
      })
    : [];
  const payoutsByReference = new Map(knownPayouts.map((payout) => [payout.reference, payout]));
  const payouts = parsed.payouts.filter((payout) => {
    if (options.seen?.has(`payout:${source}:${payout.reference}`)) return false;
    const known = payoutsByReference.get(payout.reference);
    const changed =
      !known ||
      known.paidOn.toISOString().slice(0, 10) !== payout.paidOn ||
      (payout.amountCents !== null && known.amountCents !== payout.amountCents);
    if (!changed) return false;
    // Een overschrijving van Mollie bepaalt mee de reserve van haar maand: in
    // een afgesloten maand komt er geen bij en verandert er geen.
    if (isLocked(payout.paidOn.slice(0, 7)) || (known && isLocked(known.paidOn.toISOString().slice(0, 7)))) {
      locked++;
      return false;
    }
    return true;
  });
  for (const payout of payouts) options.seen?.add(`payout:${source}:${payout.reference}`);

  // Betalingen volgens het balansrapport die de site nog niet heeft.
  const balancePayments = (parsed.balancePayments ?? []).filter((payment) => !options.seen?.has(`balance:${payment.paymentId}`));
  const knownBalancePayments = new Set<string>();
  for (const ids of chunks(balancePayments.map((payment) => payment.paymentId))) {
    const found = await prisma.incomeMollieBalancePayment.findMany({ where: { paymentId: { in: ids } }, select: { paymentId: true } });
    for (const row of found) knownBalancePayments.add(row.paymentId);
  }
  const newBalancePayments = balancePayments.filter((payment) => !knownBalancePayments.has(payment.paymentId)).length;
  for (const payment of balancePayments) options.seen?.add(`balance:${payment.paymentId}`);

  // De kanalen eerst: de standaardcode van een kanaal bepaalt mee de
  // koppeling. Een nieuw kanaal heeft er nog geen.
  const channelNames = [...new Set(fresh.map((row) => row.channel))];
  const knownChannels = await prisma.incomeChannel.findMany({
    where: { source, identifier: { in: channelNames } },
    select: { id: true, identifier: true },
  });
  const channelIds = new Map(knownChannels.map((channel) => [channel.identifier, channel.id]));
  const newChannels = channelNames.filter((name) => !channelIds.has(name));

  const [{ codes }, nameRules, website, channelCodes, cashRegisters, channelLendings] = await Promise.all([
    codeContext(),
    nameRuleContext(),
    websitePayments(source, fresh.flatMap((row) => (row.providerId ? [row.providerId] : []))),
    channelCodeContext(),
    cashRegisterContext(),
    channelLendingContext(),
  ]);
  const context: MatchContext = { codes, nameRules, website, channelCodes, cashRegisters, channelLendings };
  const matched = fresh.map((row) => ({
    row,
    match: matchTransaction({ ...row, channelId: channelIds.get(row.channel) ?? null }, context),
  }));

  const rules: ImportRuleCounts = {
    WEBSITE: 0,
    CODE_IN_TEXT: 0,
    CASH_REGISTER: 0,
    NAME_RULE: 0,
    CHANNEL_LENDING: 0,
    CHANNEL_DEFAULT: 0,
    OPEN: 0,
  };
  for (const { row, match } of matched) {
    if (row.kind !== "PAYMENT" && row.kind !== "REFUND") continue;
    rules[match.rule ?? "OPEN"]++;
  }

  // Een lus en geen `Math.min(...)`: een jaar Europabank is tienduizenden regels.
  let firstAt: Date | null = null;
  let lastAt: Date | null = null;
  for (const row of fresh) {
    if (!firstAt || row.occurredAt < firstAt) firstAt = row.occurredAt;
    if (!lastAt || row.occurredAt > lastAt) lastAt = row.occurredAt;
  }
  const summary: ImportSummary = {
    format: parsed.format,
    source,
    fileName,
    total: parsed.total,
    skipped: parsed.skipped,
    ignored,
    created: fresh.filter((row) => !row.derived).length,
    duplicates,
    updated: payoutUpdates.filter((update) => !update.row.derived).length,
    locked,
    rules,
    feeRows: fresh.filter((row) => (row.kind === "FEE" || row.kind === "RESERVE") && !row.derived).length,
    firstAt,
    lastAt,
    newChannels,
    payouts: payouts.length,
    balancePayments: newBalancePayments,
  };
  if (options.dryRun) return { ok: true, summary, importId: null };

  for (const name of newChannels) {
    const channel = await prisma.incomeChannel.upsert({
      where: { source_identifier: { source, identifier: name } },
      create: { source, identifier: name },
      update: {},
      select: { id: true },
    });
    channelIds.set(name, channel.id);
  }

  const created = await prisma.incomeImport.create({
    data: {
      source,
      fileName: fileName.slice(0, 200),
      format: parsed.format,
      rowCount: parsed.total,
      createdCount: summary.created,
      duplicateCount: duplicates,
      skippedCount: parsed.skipped,
      lockedCount: locked,
      firstAt: summary.firstAt,
      lastAt: summary.lastAt,
      importedById: options.userId,
    },
    select: { id: true },
  });

  for (const batch of chunks(matched)) {
    await prisma.incomeTransaction.createMany({
      data: batch.map(({ row, match }) => ({
        source,
        kind: row.kind,
        externalKey: row.externalKey,
        providerId: row.providerId,
        occurredAt: row.occurredAt,
        periodMonth: row.periodMonth ? monthToDate(row.periodMonth) : null,
        amountCents: row.amountCents,
        refundedCents: row.refundedCents,
        description: row.description,
        reference: row.reference,
        bulkId: row.bulkId,
        payoutReference: row.payoutReference,
        channelId: channelIds.get(row.channel) ?? null,
        importId: created.id,
        accountingCode: match.code?.code ?? null,
        accountingCodeName: match.code?.name ?? null,
        rule: match.rule,
        ticketPaymentId: match.ticketPaymentId,
        membershipPaymentId: match.membershipPaymentId,
        uitleenPaymentId: match.uitleenPaymentId,
        cashRegisterId: match.cashRegisterId,
        channelLendingId: match.channelLendingId,
      })),
      skipDuplicates: true,
    });
  }

  for (const { id, row } of payoutUpdates) {
    await prisma.incomeTransaction.update({
      where: { id },
      data: {
        payoutReference: row.payoutReference,
        periodMonth: row.periodMonth ? monthToDate(row.periodMonth) : null,
        amountCents: row.amountCents,
        refundedCents: row.refundedCents,
      },
    });
  }

  for (const payout of payouts) {
    const paidOn = new Date(`${payout.paidOn}T00:00:00Z`);
    await prisma.incomePayout.upsert({
      where: { source_reference: { source, reference: payout.reference } },
      create: { source, reference: payout.reference, paidOn, amountCents: payout.amountCents, importId: created.id },
      update: { paidOn, ...(payout.amountCents !== null ? { amountCents: payout.amountCents } : {}), importId: created.id },
    });
  }

  // De betalingen volgens het balansrapport: ook wanneer het bestand al eens
  // geüpload werd, want voor november 2026 las de site ze niet. De nieuwste
  // import zet ze; ze tellen nergens, ze dienen enkel om na te kijken.
  for (const batch of chunks(balancePayments)) {
    await prisma.$transaction([
      prisma.incomeMollieBalancePayment.deleteMany({ where: { paymentId: { in: batch.map((payment) => payment.paymentId) } } }),
      prisma.incomeMollieBalancePayment.createMany({
        data: batch.map((payment) => ({
          paymentId: payment.paymentId,
          month: monthToDate(payment.month),
          amountCents: payment.amountCents,
          importId: created.id,
        })),
        skipDuplicates: true,
      }),
    ]);
  }

  return { ok: true, summary, importId: created.id };
}

// -----------------------------------------------------------------------------
// Opnieuw koppelen
// -----------------------------------------------------------------------------

/** Wat opnieuw koppelen van een transactie leest. */
export const REMATCH_SELECT = {
  id: true,
  source: true,
  kind: true,
  providerId: true,
  description: true,
  reference: true,
  bulkId: true,
  channelId: true,
  occurredAt: true,
  periodMonth: true,
  amountCents: true,
  excluded: true,
  accountingCode: true,
  accountingCodeName: true,
  rule: true,
  ticketPaymentId: true,
  membershipPaymentId: true,
  uitleenPaymentId: true,
  cashRegisterId: true,
  channelLendingId: true,
} satisfies Prisma.IncomeTransactionSelect;

export type RematchRow = Prisma.IncomeTransactionGetPayload<{ select: typeof REMATCH_SELECT }>;

/**
 * De koppelregels voor een reeks transacties: per rij de context van haar bron.
 * Met `channelLendings` rekent het met andere uitleningen dan die in de
 * database, om te zien wat een gewijzigde uitlening zou doen voor ze bewaard
 * is.
 */
export async function matchContextsFor(
  rows: readonly RematchRow[],
  options: { channelLendings?: Map<string, LendingSpan[]> } = {},
): Promise<(row: RematchRow) => MatchContext> {
  const [{ codes }, nameRules, channelCodes, cashRegisters, channelLendings, websites] = await Promise.all([
    codeContext(),
    nameRuleContext(),
    channelCodeContext(),
    cashRegisterContext(),
    options.channelLendings ?? channelLendingContext(),
    Promise.all(
      INCOME_SOURCES.map(async (source) => {
        const ids = rows.flatMap((row) => (row.source === source && row.providerId ? [row.providerId] : []));
        return [source, await websitePayments(source, ids)] as const;
      }),
    ),
  ]);
  const contexts = new Map(
    websites.map(([source, website]) => [source, { codes, nameRules, channelCodes, cashRegisters, channelLendings, website }]),
  );
  return (row) => contexts.get(row.source)!;
}

/** Wat koppelen aan een rij verandert, of null als alles al zo stond. */
export function matchUpdateOf(row: RematchRow, match: MatchResult): MatchUpdate | null {
  const same =
    match.rule === row.rule &&
    (match.code?.code ?? null) === row.accountingCode &&
    // Ook de naam: een hernoemde code in het register geeft haar nieuwe naam door.
    (match.code?.name ?? null) === row.accountingCodeName &&
    match.ticketPaymentId === row.ticketPaymentId &&
    match.membershipPaymentId === row.membershipPaymentId &&
    match.uitleenPaymentId === row.uitleenPaymentId &&
    match.cashRegisterId === row.cashRegisterId &&
    match.channelLendingId === row.channelLendingId;
  if (same) return null;
  return {
    rule: match.rule,
    accountingCode: match.code?.code ?? null,
    accountingCodeName: match.code?.name ?? null,
    ticketPaymentId: match.ticketPaymentId,
    membershipPaymentId: match.membershipPaymentId,
    uitleenPaymentId: match.uitleenPaymentId,
    cashRegisterId: match.cashRegisterId,
    channelLendingId: match.channelLendingId,
  };
}

/** Wat opnieuw koppelen raakt: een betaling of terugbetaling die meetelt en niet met de hand gezet is. */
export const REMATCHABLE: Prisma.IncomeTransactionWhereInput = {
  kind: { in: ["PAYMENT", "REFUND"] },
  excluded: false,
  OR: [{ rule: null }, { rule: { not: "MANUAL" } }],
};

/**
 * Alle koppelingen die niet met de hand gezet zijn, opnieuw berekenen: na een
 * onthouden tekst, een nieuwe of gewijzigde code in het register, een
 * verwijderde regel, een uitlening, of een kassa die aanvaard, gewijzigd of
 * verwijderd werd. Een afgesloten periode blijft zoals ze is. Geeft het aantal
 * wijzigingen terug.
 */
export async function rematchOpenTransactions(): Promise<number> {
  const isLocked = lockedMonthTest(await listClosedPeriods());
  const rows = await prisma.incomeTransaction.findMany({ where: REMATCHABLE, select: REMATCH_SELECT });
  const open = rows.filter((row) => !isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null));
  const contextOf = await matchContextsFor(open);

  // Eén `updateMany` per wijziging, niet één query per rij: een nieuwe
  // standaardcode raakt zo duizenden betalingen van een SumUp-account.
  const updates = new Map<string, { data: MatchUpdate; ids: string[] }>();
  for (const row of open) {
    const data = matchUpdateOf(row, matchTransaction(row, contextOf(row)));
    if (!data) continue;
    const key = JSON.stringify(data);
    const update = updates.get(key);
    if (update) update.ids.push(row.id);
    else updates.set(key, { data, ids: [row.id] });
  }
  return applyMatchUpdates(updates.values());
}

/** Groepen rijen die dezelfde wijziging krijgen, wegschrijven. Geeft het aantal rijen terug. */
export async function applyMatchUpdates(updates: Iterable<{ data: MatchUpdate; ids: string[] }>): Promise<number> {
  let changed = 0;
  for (const { data, ids } of updates) {
    for (const batch of chunks(ids)) {
      await prisma.incomeTransaction.updateMany({ where: { id: { in: batch } }, data });
    }
    changed += ids.length;
  }
  return changed;
}

export type MatchUpdate = {
  rule: MatchResult["rule"];
  accountingCode: string | null;
  accountingCodeName: string | null;
  ticketPaymentId: string | null;
  membershipPaymentId: string | null;
  uitleenPaymentId: string | null;
  cashRegisterId: string | null;
  channelLendingId: string | null;
};

// -----------------------------------------------------------------------------
// Na te kijken
// -----------------------------------------------------------------------------

/**
 * Een groep transacties die met één keuze een code krijgt. Een Payconiq-betaling
 * met een referentie of een Mollie-betaling komt van een systeem (de site, Cudi,
 * Uniflow) en draagt een vaste tekst: die groeperen we op tekst, en die tekst
 * kan Beheer onthouden. Een betaling op een sticker zonder referentie typt
 * iemand zelf ("drinken"), en een kaartbetaling bij SumUp of Europabank heeft
 * geen tekst: die groeperen we per toestel per dag.
 */
export type UnassignedGroup = {
  key: string;
  type: "text" | "day";
  source: IncomeSourceCode;
  channelId: string | null;
  channel: string;
  /** De tekst om te tonen, met hoofdletters; de groep zelf gaat op kleine letters. */
  label: string | null;
  day: string | null;
  count: number;
  totalCents: number;
  firstAt: Date;
  lastAt: Date;
  samples: string[];
  /**
   * Aanvaarde kassa's zonder code die het toestel hadden toen deze betalingen
   * binnenkwamen: met een code had regel 4 ze gekoppeld.
   */
  kassas: Array<{ id: string; activity: string; postLabel: string }>;
};

type GroupRow = {
  id: string;
  source: IncomeSource;
  channelId: string | null;
  occurredAt: Date;
  amountCents: number;
  description: string | null;
  reference: string | null;
};

function groupKeyOf(
  row: Pick<GroupRow, "source" | "channelId" | "occurredAt" | "description" | "reference">,
): { key: string; type: "text" | "day"; text: string | null; day: string | null } {
  const enc = encodeURIComponent;
  if (row.source === "MOLLIE" || (row.source === "PAYCONIQ" && row.reference)) {
    const text = incomeRuleText(row.description);
    return { key: ["text", row.source, row.channelId ?? "", enc(text ?? "")].join("|"), type: "text", text, day: null };
  }
  const day = reviewDay(row.occurredAt);
  return { key: ["day", row.source, row.channelId ?? "", day].join("|"), type: "day", text: null, day };
}

async function openRows(): Promise<Array<GroupRow & { channelName: string }>> {
  const isLocked = lockedMonthTest(await listClosedPeriods());
  const rows = await prisma.incomeTransaction.findMany({
    where: { rule: null, excluded: false, kind: { in: ["PAYMENT", "REFUND"] } },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      source: true,
      channelId: true,
      occurredAt: true,
      amountCents: true,
      description: true,
      reference: true,
      periodMonth: true,
      channel: { select: { identifier: true, label: true } },
    },
  });
  return rows
    .filter((row) => !isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null))
    .map((row) => ({ ...row, channelName: row.channel?.label || row.channel?.identifier || "" }));
}

export async function listUnassignedGroups(): Promise<UnassignedGroup[]> {
  const [rows, channelCodes, cashRegisters, channelLendings] = await Promise.all([
    openRows(),
    channelCodeContext(),
    cashRegisterContext(),
    channelLendingContext(),
  ]);
  const groups = new Map<string, UnassignedGroup>();
  const kassaIds = new Map<string, Set<string>>();
  for (const row of rows) {
    const { key, type, day } = groupKeyOf(row);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        type,
        source: row.source,
        channelId: row.channelId,
        channel: row.channelName,
        label: type === "text" ? incomeRuleLabel(row.description) : null,
        day,
        count: 0,
        totalCents: 0,
        firstAt: row.occurredAt,
        lastAt: row.occurredAt,
        samples: [],
        kassas: [],
      };
      groups.set(key, group);
      kassaIds.set(key, new Set());
    }
    // Een kassa had het toestel, maar nog geen code: dan valt de betaling door.
    const { kassa } = deviceAt(row, { channelCodes, cashRegisters, channelLendings });
    if (kassa && !kassa.code) kassaIds.get(key)!.add(kassa.id);
    group.count++;
    group.totalCents += row.amountCents;
    if (row.occurredAt < group.firstAt) group.firstAt = row.occurredAt;
    if (row.occurredAt > group.lastAt) group.lastAt = row.occurredAt;
    if (row.description && group.samples.length < 3 && !group.samples.includes(row.description)) {
      group.samples.push(row.description);
    }
  }
  const ids = [...new Set([...kassaIds.values()].flatMap((set) => [...set]))];
  if (ids.length > 0) {
    const registers = await prisma.cashRegister.findMany({
      where: { id: { in: ids } },
      orderBy: [{ date: "asc" }, { startsAt: "asc" }],
      select: { id: true, activity: true, postLabel: true },
    });
    for (const group of groups.values()) {
      const own = kassaIds.get(group.key)!;
      group.kassas = registers.filter((register) => own.has(register.id));
    }
  }
  // De grootste bedragen eerst: daar zit het meeste werk van de boekhouder.
  return [...groups.values()].sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents));
}

export type AssignOutcome = { ok: true; count: number } | { ok: false; error: "NOT_FOUND" | "CODE_NOT_FOUND" | "CANNOT_REMEMBER" };

/** Eén groep een code geven, of laten wegvallen ("telt niet mee"). */
export async function assignUnassignedGroup(
  key: string,
  choice: { accountingCodeId: string; remember: boolean } | { exclude: true },
  userId: string | null,
): Promise<AssignOutcome> {
  const members = (await openRows()).filter((row) => groupKeyOf(row).key === key);
  if (members.length === 0) return { ok: false, error: "NOT_FOUND" };
  const ids = members.map((row) => row.id);
  const now = new Date();

  if ("exclude" in choice) {
    await prisma.incomeTransaction.updateMany({
      where: { id: { in: ids }, rule: null },
      data: { excluded: true, rule: "MANUAL", accountingCode: null, accountingCodeName: null, assignedById: userId, assignedAt: now },
    });
    return { ok: true, count: ids.length };
  }

  const code = await prisma.accountingCode.findUnique({
    where: { id: choice.accountingCodeId },
    select: { id: true, code: true, name: true },
  });
  if (!code) return { ok: false, error: "CODE_NOT_FOUND" };

  const { type, text } = groupKeyOf(members[0]);
  if (choice.remember) {
    // Onthouden kan enkel voor een vaste tekst: "drinken" op een sticker zegt
    // volgende week niets meer.
    if (type !== "text" || !text) return { ok: false, error: "CANNOT_REMEMBER" };
    const source = members[0].source;
    await prisma.incomeNameRule.upsert({
      where: { source_text: { source, text } },
      create: { source, text, accountingCodeId: code.id, createdById: userId },
      update: { accountingCodeId: code.id, createdById: userId },
    });
    // De regel doet het werk, ook voor andere kanalen met dezelfde tekst.
    await rematchOpenTransactions();
    return { ok: true, count: ids.length };
  }

  await prisma.incomeTransaction.updateMany({
    where: { id: { in: ids }, rule: null },
    data: { rule: "MANUAL", accountingCode: code.code, accountingCodeName: code.name, assignedById: userId, assignedAt: now },
  });
  return { ok: true, count: ids.length };
}

// -----------------------------------------------------------------------------
// Overzicht
// -----------------------------------------------------------------------------

export type PayoutWithCheck = PayoutGroup & {
  check: { amountCents: number; checkedAt: Date; checkedByName: string | null } | null;
  /** De dag van de overschrijving, als de export ze noemde. */
  paidOn: Date | null;
  /** Wat de provider zegt dat hij overschreef (de overschrijving van Mollie). */
  providerAmount: number | null;
  /** De regel(s) op een opgeladen bankafschrift: de eerste dag, en het bedrag samen. */
  bank: { bookedOn: string; amountCents: number; account: string } | null;
  /** De rekening waarop de uitbetaling verwacht wordt (van het kanaal), genormaliseerd. */
  account: string | null;
  /** Of een afschrift van die rekening de dag dekt waarop ze verwacht wordt, zonder dat ze erop staat. */
  missingOnStatement: boolean;
  state: PayoutState;
};

/** "2026-07" min drie maanden: "2026-04". */
function monthsBefore(month: string, count: number): string {
  const [year, m] = month.split("-").map(Number);
  const index = year * 12 + (m - 1) - count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** De laatste dag van een maand: "2026-09" -> "2026-09-30". */
function lastDayOf(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}

/**
 * Of de betalingenexport en het balansrapport van Mollie dezelfde betalingen
 * noemen, voor de betalingen van de periode. Een ID telt als gevonden wanneer
 * hij aan de andere kant staat, in welke maand ook: de twee bestanden zetten een
 * betaling soms een seconde anders, en rond middernacht is dat een andere maand.
 */
async function mollieCompleteness(
  from: string,
  to: string,
  exportPayments: ReadonlyArray<{ id: string; amountCents: number }>,
): Promise<MollieCompleteness> {
  const balance = await prisma.incomeMollieBalancePayment.findMany({
    where: { month: { gte: monthToDate(from), lte: monthToDate(to) } },
    select: { paymentId: true, amountCents: true },
  });
  const inBalance = new Set<string>();
  for (const ids of chunks(exportPayments.map((payment) => payment.id))) {
    const found = await prisma.incomeMollieBalancePayment.findMany({ where: { paymentId: { in: ids } }, select: { paymentId: true } });
    for (const row of found) inBalance.add(row.paymentId);
  }
  const inExport = new Set<string>();
  for (const ids of chunks(balance.map((payment) => payment.paymentId))) {
    const found = await prisma.incomeTransaction.findMany({
      where: { source: "MOLLIE", kind: "PAYMENT", providerId: { in: ids } },
      select: { providerId: true },
    });
    for (const row of found) if (row.providerId) inExport.add(row.providerId);
  }
  const sum = (items: ReadonlyArray<{ amountCents: number }>) => ({
    count: items.length,
    cents: items.reduce((total, item) => total + item.amountCents, 0),
  });
  return {
    missingInBalance: sum(exportPayments.filter((payment) => !inBalance.has(payment.id))),
    missingInExport: sum(balance.filter((payment) => !inExport.has(payment.paymentId))),
  };
}

/**
 * De berekende reserve als regels voor het overzicht: één per rekening van
 * Mollie. Ze bestaan enkel in het geheugen en worden nooit bewaard.
 */
function reserveOverviewRows(reserve: MollieReserve): OverviewTransaction[] {
  if (reserve.status !== "known") return [];
  return reserve.accounts
    .filter((account) => account.cents !== 0)
    .map((account) => ({
      source: "MOLLIE",
      kind: "RESERVE",
      accountingCode: null,
      accountingCodeName: null,
      excluded: false,
      amountCents: account.cents,
      bankAccount: account.bankAccount,
    }));
}

export type IncomeOverviewData = {
  overview: IncomeOverview;
  /** De bronnen waarvan ooit iets opgeladen werd, in de volgorde van de kolommen. */
  sources: IncomeSourceCode[];
  /** De berekende wijziging van de dynamische reserve van Mollie (`reserve.ts`). */
  mollieReserve: MollieReserve;
  /** Wat meetelt (Instellingen), voor de schermen en de Excel-bestanden. */
  lineRules: LineRules;
  /** Of er in de periode Mollie-betalingen staan, maar geen enkele kostenregel. */
  mollieWithoutFees: boolean;
  feeCode: CodeSnapshot | null;
  closed: ClosedPeriod[];
  payouts: PayoutWithCheck[];
  checks: IncomeCheck[];
  /** Per rekening tegen de bankafschriften; null zonder enig afschrift. */
  bank: BankOverview | null;
};

export async function loadIncomeOverview(from: string, to: string): Promise<IncomeOverviewData> {
  const [rows, channels, { codes, order }, config, feeCode, closedPeriods, sources, transfers] = await Promise.all([
    prisma.incomeTransaction.findMany({
      where: { periodMonth: { gte: monthToDate(from), lte: monthToDate(to) } },
      select: {
        source: true,
        kind: true,
        accountingCode: true,
        accountingCodeName: true,
        excluded: true,
        amountCents: true,
        occurredAt: true,
        channelId: true,
        periodMonth: true,
        payoutReference: true,
        externalKey: true,
        providerId: true,
      },
    }),
    prisma.incomeChannel.findMany({
      select: { id: true, source: true, identifier: true, accounts: { select: { from: true, bankAccount: true } } },
    }),
    codeContext(),
    getIncomeConfig(),
    feeAccountingCode(),
    listClosedPeriods(),
    prisma.incomeImport.findMany({ distinct: ["source"], select: { source: true } }),
    // De overschrijvingen van Mollie naar de bank in de periode, op hun eigen dag.
    prisma.incomePayout.findMany({
      where: {
        source: "MOLLIE",
        amountCents: { not: null },
        paidOn: { gte: monthToDate(from), lte: new Date(`${lastDayOf(to)}T00:00:00Z`) },
      },
      select: { reference: true, paidOn: true, amountCents: true },
    }),
  ]);
  const rules = lineRulesOf(config);
  const activeChannels = await prisma.incomeTransaction.findMany({
    where: {
      source: { in: [...EXPORT_PER_CHANNEL] },
      channelId: { not: null },
      periodMonth: { gte: monthToDate(monthsBefore(from, 3)), lte: monthToDate(to) },
    },
    distinct: ["channelId"],
    select: { channel: { select: { id: true, source: true, identifier: true, label: true } } },
  });

  const accountsByChannel = new Map(
    channels.map((channel) => [
      channel.id,
      channel.accounts.map((account) => ({ from: account.from.toISOString().slice(0, 10), bankAccount: account.bankAccount })),
    ]),
  );
  const withAccount = rows.map((row) => ({
    ...row,
    bankAccount: row.channelId
      ? accountOn(accountsByChannel.get(row.channelId) ?? [], ymdKey(brusselsYMD(row.occurredAt)))
      : null,
  }));

  // De wijziging van de dynamische reserve, per rekening van Mollie; zie reserve.ts.
  const mollieAccounts = accountsByChannel.get(
    (channels.find((channel) => channel.source === "MOLLIE" && channel.identifier === MOLLIE_CHANNEL) ??
      channels.find((channel) => channel.source === "MOLLIE"))?.id ?? "",
  ) ?? [];
  const mollieRows = withAccount.filter((row) => row.source === "MOLLIE");
  const mollieReserve = computeMollieReserve({
    rows: mollieRows.map((row) => ({
      kind: row.kind,
      amountCents: row.amountCents,
      bankAccount: row.bankAccount,
      notCounted: quarterLineKey(row, rules) === null,
    })),
    transfers: transfers.map((transfer) => {
      const paidOn = transfer.paidOn.toISOString().slice(0, 10);
      return { reference: transfer.reference, paidOn, amountCents: transfer.amountCents ?? 0, bankAccount: accountOn(mollieAccounts, paidOn) };
    }),
    completeness: await mollieCompleteness(
      from,
      to,
      mollieRows.flatMap((row) => (row.kind === "PAYMENT" && row.providerId ? [{ id: row.providerId, amountCents: row.amountCents }] : [])),
    ),
  });

  const computed = computeIncomeOverview([...withAccount, ...reserveOverviewRows(mollieReserve)], order, rules);
  // De kolom Post: de naam van de hoofdrekening, zoals in het kwartaalblad.
  const overview: IncomeOverview = {
    ...computed,
    codes: computed.codes.map((row) => ({
      ...row,
      name: postName(row.code, row.name, (main) => codes.get(codeKey(main))?.name),
    })),
  };

  // Elke uitbetaling met een regel in de periode, met al haar regels: een
  // SumUp-verkoop telt in haar eigen maand, dus een uitbetaling kan over de
  // rand van een periode lopen, terwijl ze op het uittreksel één bedrag is.
  //
  // Ook Payconiq (de export met `payoutId`) en Europabank (de OV-ref): hun
  // uitbetaling noemt geen bedrag, maar een bankafschrift bevestigt ze.
  const references = [...new Set(rows.flatMap((row) => (row.payoutReference && row.source !== "TRANSFER" ? [row.payoutReference] : [])))];
  const [payoutRows, checkRows, providerRows] = references.length
    ? await Promise.all([
        prisma.incomeTransaction.findMany({
          where: { payoutReference: { in: references } },
          select: { source: true, payoutReference: true, kind: true, amountCents: true, occurredAt: true, channelId: true },
        }),
        prisma.incomePayoutCheck.findMany({
          where: { payoutReference: { in: references } },
          select: { payoutReference: true, amountCents: true, checkedAt: true, checkedBy: { select: { name: true } } },
        }),
        prisma.incomePayout.findMany({
          where: { reference: { in: references } },
          select: { source: true, reference: true, paidOn: true, amountCents: true },
        }),
      ])
    : [[], [], []];
  const payouts = groupPayouts(
    payoutRows.flatMap((row) =>
      row.payoutReference
        ? [{ source: row.source, reference: row.payoutReference, kind: row.kind, amountCents: row.amountCents, occurredAt: row.occurredAt }]
        : [],
    ),
  );
  const checksByReference = new Map(checkRows.map((check) => [check.payoutReference, check]));
  const providerByKey = new Map(providerRows.map((payout) => [`${payout.source}|${payout.reference}`, payout]));

  // De bankafschriften: de regels die bij een uitbetaling van de periode horen
  // (die kan tot een paar weken na de periode op de bank komen), en wat
  // afschriften dekken. Enkel lezen: niets hiervan verandert wat meetelt.
  const [bankLines, coverage, bank] = await Promise.all([
    loadBankLines(`${monthsBefore(from, 1)}-01`, `${lastDayOf(nextMonth(to))}`),
    loadBankCoverage(),
    loadBankOverview(from, to),
  ]);
  const bankByPayout = new Map<string, { bookedOn: string; amountCents: number; account: string }>();
  for (const line of bankLines) {
    if (!line.payoutKey) continue;
    const known = bankByPayout.get(line.payoutKey);
    if (known) {
      known.amountCents += line.amountCents;
      if (line.bookedOn < known.bookedOn) known.bookedOn = line.bookedOn;
    } else {
      bankByPayout.set(line.payoutKey, { bookedOn: line.bookedOn, amountCents: line.amountCents, account: line.account });
    }
  }
  const normalisedAccounts = new Map(
    [...accountsByChannel].map(([id, entries]) => [id, entries.map((entry) => ({ from: entry.from, bankAccount: normaliseAccount(entry.bankAccount) }))]),
  );
  const firstChannel = new Map<string, { channelId: string | null; occurredAt: Date }>();
  for (const row of payoutRows) {
    const key = `${row.source}|${row.payoutReference}`;
    if (!firstChannel.has(key)) firstChannel.set(key, { channelId: row.channelId, occurredAt: row.occurredAt });
  }
  const payoutsWithCheck: PayoutWithCheck[] = payouts.map((payout) => {
    const check = checksByReference.get(payout.reference);
    const provider = providerByKey.get(`${payout.source}|${payout.reference}`);
    const providerAmount = provider?.amountCents ?? null;
    const onBank = bankByPayout.get(payoutKey(payout.source as BankProvider, payout.reference)) ?? null;
    const expected = expectedBankDay(provider?.paidOn ?? null, payout.lastAt);
    const first = firstChannel.get(`${payout.source}|${payout.reference}`);
    const account =
      payout.source === "MOLLIE"
        ? accountOn(mollieAccounts.map((entry) => ({ from: entry.from, bankAccount: normaliseAccount(entry.bankAccount) })), expected.day)
        : first?.channelId
          ? accountOn(normalisedAccounts.get(first.channelId) ?? [], ymdKey(brusselsYMD(first.occurredAt)))
          : null;
    return {
      ...payout,
      check: check ? { amountCents: check.amountCents, checkedAt: check.checkedAt, checkedByName: check.checkedBy?.name ?? null } : null,
      paidOn: provider?.paidOn ?? null,
      providerAmount,
      bank: onBank,
      account,
      missingOnStatement: !onBank && coveredOn(coverage, account, expected.day),
      state: payoutState(payout.total, check?.amountCents ?? null, providerAmount, onBank?.amountCents ?? null),
    };
  });
  // In de volgorde van het uittreksel: per bron op de dag van de overschrijving.
  const sourceOrder = (source: IncomeSourceCode) => INCOME_SOURCES.indexOf(source);
  const when = (payout: PayoutWithCheck) => (payout.paidOn ?? payout.lastAt).getTime();
  payoutsWithCheck.sort(
    (a, b) => sourceOrder(a.source) - sourceOrder(b.source) || when(a) - when(b) || a.reference.localeCompare(b.reference),
  );

  const rowsPerSourceMonth = new Map<string, number>();
  const rowsPerChannelMonth = new Map<string, number>();
  const molliePaymentMonths = new Set<string>();
  const mollieFeeMonths = new Set<string>();
  const mollieBalanceFeeMonths = new Set<string>();
  const mollieOtherFeeMonths = new Set<string>();
  for (const row of rows) {
    if (!row.periodMonth) continue;
    const month = dateToMonth(row.periodMonth);
    const key = `${row.source}:${month}`;
    rowsPerSourceMonth.set(key, (rowsPerSourceMonth.get(key) ?? 0) + 1);
    if (row.channelId) rowsPerChannelMonth.set(`${row.channelId}:${month}`, (rowsPerChannelMonth.get(`${row.channelId}:${month}`) ?? 0) + 1);
    if (row.source === "MOLLIE" && row.kind === "PAYMENT") molliePaymentMonths.add(month);
    if (row.source === "MOLLIE" && row.kind === "FEE") {
      mollieFeeMonths.add(month);
      (row.externalKey.startsWith(`FEE:${BALANCE_KEY}:`) ? mollieBalanceFeeMonths : mollieOtherFeeMonths).add(month);
    }
  }
  const counted = withAccount.filter((row) => quarterLineKey(row, rules) !== null);
  const inUse = new Set(sources.map((row) => row.source));
  const today = brusselsYMD(new Date());
  const checks = computeIncomeChecks({
    months: monthsBetween(from, to),
    currentMonth: `${today.year}-${String(today.month).padStart(2, "0")}`,
    sourcesInUse: inUse,
    rowsPerSourceMonth,
    channelsInUse: activeChannels.flatMap(({ channel }) =>
      channel ? [{ id: channel.id, source: channel.source, name: channel.label || channel.identifier }] : [],
    ),
    rowsPerChannelMonth,
    molliePaymentMonths,
    mollieFeeMonths,
    mollieFeeMonthsTwice: new Set([...mollieBalanceFeeMonths].filter((month) => mollieOtherFeeMonths.has(month))),
    payouts: payoutsWithCheck.map((payout) => ({
      total: payout.total,
      checkedAmount: payout.check?.amountCents ?? null,
      providerAmount: payout.providerAmount,
      bankAmount: payout.bank?.amountCents ?? null,
    })),
    open: {
      count: overview.unassigned.count,
      cents: overview.unassigned.total,
    },
    withoutAccount: {
      count: counted.filter((row) => row.bankAccount === null).length,
      cents: counted.filter((row) => row.bankAccount === null).reduce((sum, row) => sum + row.amountCents, 0),
    },
    hasFees: overview.fees.count > 0,
    feeCodeChosen: feeCode !== null,
    mollieReserve,
  });

  return {
    overview,
    sources: INCOME_SOURCES.filter((source) => inUse.has(source)),
    mollieReserve,
    lineRules: rules,
    mollieWithoutFees: molliePaymentMonths.size > 0 && mollieFeeMonths.size === 0,
    feeCode,
    closed: closedPeriods.filter((period) => period.from <= to && from <= period.to),
    payouts: payoutsWithCheck,
    checks,
    bank,
  };
}

/**
 * Een uitbetaling van Mollie of SumUp afvinken: het totaal van de site stond
 * zo op het uittreksel. Het bedrag van nu wordt bewaard, zodat een latere
 * export die de som verandert, opvalt.
 */
export async function setPayoutCheck(
  reference: string,
  checked: boolean,
  userId: string | null,
): Promise<"OK" | "NOT_FOUND" | "LOCKED"> {
  const rows = await prisma.incomeTransaction.findMany({
    where: { payoutReference: reference },
    select: { amountCents: true, periodMonth: true },
  });
  if (rows.length === 0) return "NOT_FOUND";
  const isLocked = lockedMonthTest(await listClosedPeriods());
  if (rows.some((row) => isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null))) return "LOCKED";
  if (!checked) {
    await prisma.incomePayoutCheck.deleteMany({ where: { payoutReference: reference } });
    return "OK";
  }
  const amountCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
  await prisma.incomePayoutCheck.upsert({
    where: { payoutReference: reference },
    create: { payoutReference: reference, amountCents, checkedById: userId },
    update: { amountCents, checkedById: userId, checkedAt: new Date() },
  });
  return "OK";
}

export const TRANSACTION_PAGE = 100;

/**
 * De transacties achter één cel van het overzicht, per pagina, met hoeveel en
 * hoeveel geld er in totaal aan de filter voldoet. `assignable` telt enkel wat
 * met de hand een code kan krijgen, want enkel dat raakt "alles selecteren".
 */
export async function listIncomeTransactions(filter: TransactionFilter, page: number) {
  const where = transactionWhere(filter);
  const [rows, byKind, closed] = await Promise.all([
    prisma.incomeTransaction.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * TRANSACTION_PAGE,
      take: TRANSACTION_PAGE,
      select: {
        id: true,
        source: true,
        kind: true,
        occurredAt: true,
        periodMonth: true,
        amountCents: true,
        refundedCents: true,
        description: true,
        reference: true,
        providerId: true,
        payoutReference: true,
        accountingCode: true,
        accountingCodeName: true,
        rule: true,
        excluded: true,
        assignedAt: true,
        membershipPaymentId: true,
        uitleenPaymentId: true,
        channel: { select: { identifier: true, label: true } },
        ticketPayment: { select: { order: { select: { eventId: true } } } },
        cashRegister: { select: { id: true, activity: true, postLabel: true } },
        assignedBy: { select: { name: true } },
      },
    }),
    prisma.incomeTransaction.groupBy({ by: ["kind"], where, _count: { _all: true }, _sum: { amountCents: true } }),
    listClosedPeriods(),
  ]);
  const isLocked = lockedMonthTest(closed);
  let total = 0;
  let totalCents = 0;
  let assignable = 0;
  for (const group of byKind) {
    total += group._count._all;
    totalCents += group._sum.amountCents ?? 0;
    if (ASSIGNABLE_KINDS.includes(group.kind)) assignable += group._count._all;
  }
  return {
    rows: rows.map((row) => ({ ...row, locked: isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null) })),
    total,
    totalCents,
    assignable,
  };
}

/** Welke transacties een keuze raakt: aangevinkt, of alles wat aan een filter voldoet. */
export type TransactionSelection = { ids: string[] } | { filter: TransactionFilter; expected: number };

export type TransactionChoice = { accountingCodeId: string } | { exclude: true } | { reset: true };

export type ChangeOutcome =
  | {
      ok: true;
      /** Hoeveel er veranderden. */
      count: number;
      /** Bleef zoals het was: een afgesloten maand. */
      locked: number;
      /** Hing aan een kassa, een ticketverkoop, lidgeld of de uitleendienst, en nu niet meer. */
      unlinked: number;
      /** Bij `reset`: stond niet met de hand en volgde de regels dus al. */
      notManual: number;
      code: { code: string; name: string } | null;
    }
  | { ok: false; error: "NOT_FOUND" | "CODE_NOT_FOUND" | "LOCKED" | "FILTER_CHANGED" | "NOTHING_SELECTED" };

/**
 * Transacties met de hand een code geven, laten wegvallen ("telt niet mee"), of
 * teruggeven aan de koppelregels: één rij uit de lijst, de aangevinkte rijen, of
 * alles wat aan de filter voldoet.
 *
 * Met de hand wint van elke regel, ook van een kassa of een betaling van de
 * site: wie de code met de hand zet, weet dat die koppeling fout was. Daarom
 * gaat die koppeling mee weg, net als bij een hele dag; "terug naar de regels"
 * legt ze opnieuw. Kosten en reserve krijgen hier nooit een code: die hebben
 * hun eigen regel in het overzicht. Een afgesloten maand blijft zoals ze is.
 */
export async function changeTransactions(
  selection: TransactionSelection,
  choice: TransactionChoice,
  userId: string | null,
): Promise<ChangeOutcome> {
  if ("ids" in selection && selection.ids.length === 0) return { ok: false, error: "NOTHING_SELECTED" };
  const where =
    "ids" in selection
      ? { id: { in: selection.ids }, kind: { in: [...ASSIGNABLE_KINDS] } }
      : { AND: [transactionWhere(selection.filter), { kind: { in: [...ASSIGNABLE_KINDS] } }] };
  const rows = await prisma.incomeTransaction.findMany({
    where,
    select: {
      id: true,
      source: true,
      rule: true,
      periodMonth: true,
      ticketPaymentId: true,
      membershipPaymentId: true,
      uitleenPaymentId: true,
      cashRegisterId: true,
    },
  });
  // Tussen het tonen en het klikken kwam er iets bij of ging er iets weg (een
  // import, iemand anders die toewees): dan raakt "alles" iets anders dan wat
  // de bevestiging noemde.
  if ("filter" in selection && rows.length !== selection.expected) return { ok: false, error: "FILTER_CHANGED" };
  if (rows.length === 0) return { ok: false, error: "NOT_FOUND" };

  const isLocked = lockedMonthTest(await listClosedPeriods());
  const open = rows.filter((row) => !isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null));
  const locked = rows.length - open.length;
  if (open.length === 0) return { ok: false, error: "LOCKED" };

  if ("reset" in choice) {
    // Een overschrijving heeft geen koppelregel: zonder de hand stond ze bij Na
    // te kijken. Ze blijft zoals ze is; aanpassen gaat bij Overschrijvingen.
    const manual = open.filter((row) => row.rule === "MANUAL" && row.source !== "TRANSFER");
    for (const batch of chunks(manual.map((row) => row.id))) {
      await prisma.incomeTransaction.updateMany({
        where: { id: { in: batch } },
        data: { rule: null, excluded: false, accountingCode: null, accountingCodeName: null, assignedById: null, assignedAt: null },
      });
    }
    if (manual.length > 0) await rematchOpenTransactions();
    return { ok: true, count: manual.length, locked, unlinked: 0, notManual: open.length - manual.length, code: null };
  }

  let code: { code: string; name: string } | null = null;
  if ("accountingCodeId" in choice) {
    code = await prisma.accountingCode.findUnique({ where: { id: choice.accountingCodeId }, select: { code: true, name: true } });
    if (!code) return { ok: false, error: "CODE_NOT_FOUND" };
  }
  const unlinked = open.filter(
    (row) => row.ticketPaymentId || row.membershipPaymentId || row.uitleenPaymentId || row.cashRegisterId,
  ).length;
  const now = new Date();
  for (const batch of chunks(open.map((row) => row.id))) {
    await prisma.incomeTransaction.updateMany({
      where: { id: { in: batch } },
      data: {
        rule: "MANUAL",
        excluded: !code,
        accountingCode: code?.code ?? null,
        accountingCodeName: code?.name ?? null,
        ticketPaymentId: null,
        membershipPaymentId: null,
        uitleenPaymentId: null,
        cashRegisterId: null,
        channelLendingId: null,
        assignedById: userId,
        assignedAt: now,
      },
    });
  }
  return { ok: true, count: open.length, locked, unlinked, notManual: 0, code };
}

// -----------------------------------------------------------------------------
// Imports, kanalen en onthouden teksten
// -----------------------------------------------------------------------------

export async function listIncomeImports() {
  const imports = await prisma.incomeImport.findMany({
    // Een overschrijving met de hand is geen bestand: die staat bij Overschrijvingen.
    where: { format: { not: MANUAL_FORMAT } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      source: true,
      fileName: true,
      rowCount: true,
      createdCount: true,
      duplicateCount: true,
      skippedCount: true,
      lockedCount: true,
      firstAt: true,
      lastAt: true,
      createdAt: true,
      importedBy: { select: { name: true } },
    },
  });
  const manual = await prisma.incomeTransaction.groupBy({
    by: ["importId"],
    where: { importId: { in: imports.map((row) => row.id) }, rule: "MANUAL" },
    _count: true,
  });
  const manualById = new Map(manual.map((row) => [row.importId, row._count]));
  return imports.map((row) => ({ ...row, manualCount: manualById.get(row.id) ?? 0 }));
}

/** Per toestel van de kassa's de kanalen die het zijn: "BANCONTACT|Evenementen" naar kanaal-ID's. */
async function deviceChannels(): Promise<Map<string, { method: PaymentMethod; terminal: string; channelIds: string[] }>> {
  const channels = await prisma.incomeChannel.findMany({
    where: { cashMethod: { not: null }, cashTerminal: { not: null } },
    select: { id: true, cashMethod: true, cashTerminal: true },
  });
  const devices = new Map<string, { method: PaymentMethod; terminal: string; channelIds: string[] }>();
  for (const channel of channels) {
    if (!channel.cashMethod || !channel.cashTerminal) continue;
    const key = deviceKey(channel.cashMethod, channel.cashTerminal);
    const device = devices.get(key) ?? { method: channel.cashMethod, terminal: channel.cashTerminal, channelIds: [] };
    device.channelIds.push(channel.id);
    devices.set(key, device);
  }
  return devices;
}

/**
 * De kassacontrole voor veel toestellen op veel kassa's tegelijk, in twee
 * queries: wie welk toestel die dagen had, en de transacties in de vensters.
 * Per gevraagd toestel het bedrag, of `null` wanneer geen kanaal dat toestel
 * is. Het rekenen zelf staat puur in `kassa.ts`.
 */
async function controlAmounts(
  wanted: readonly { register: ControlRegister; method: PaymentMethod; terminal: string }[],
  devices: ReadonlyMap<string, { channelIds: string[] }>,
): Promise<(KassaImportAmount | null)[]> {
  const linked = wanted.filter((item) => devices.has(deviceKey(item.method, item.terminal)));
  if (linked.length === 0) return wanted.map(() => null);

  const dayMs = 86_400_000;
  const days = [
    ...new Map(
      linked.flatMap((item) => {
        const ms = item.register.date.getTime();
        return [ms - dayMs, ms, ms + dayMs].map((t) => [t, new Date(t)] as const);
      }),
    ).values(),
  ];
  const uses: DeviceUse[] = (
    await prisma.cashRegisterPayment.findMany({
      where: { register: { status: { not: "REQUESTED" }, date: { in: days } } },
      select: {
        registerId: true,
        method: true,
        terminal: true,
        register: { select: { date: true, startsAt: true, endsAt: true } },
      },
    })
  ).map((use) => ({
    registerId: use.registerId,
    date: use.register.date,
    startsAt: use.register.startsAt,
    endsAt: use.register.endsAt,
    method: use.method,
    terminal: use.terminal,
  }));

  const placed = wanted.map((item) =>
    devices.has(deviceKey(item.method, item.terminal)) ? deviceWindow(item.register, item.method, item.terminal, uses) : null,
  );
  const windows = wanted.flatMap((item, index) => {
    const device = devices.get(deviceKey(item.method, item.terminal));
    const place = placed[index];
    return device && place
      ? [{ channelId: { in: device.channelIds }, occurredAt: { gte: place.window.start, lt: place.window.end } }]
      : [];
  });
  const transactions = await prisma.incomeTransaction.findMany({
    where: { kind: { in: ["PAYMENT", "REFUND"] }, OR: windows },
    select: { channelId: true, occurredAt: true, amountCents: true },
  });
  const onDevices = transactions.flatMap((tx) => (tx.channelId ? [{ ...tx, channelId: tx.channelId }] : []));

  return wanted.map((item, index) => {
    const device = devices.get(deviceKey(item.method, item.terminal));
    const place = placed[index];
    return device && place ? importAmountOf(item.method, item.terminal, place, device.channelIds, onDevices) : null;
  });
}

/**
 * Wat de import per toestel zag tijdens een kassa, voor het telformulier: voor
 * elk toestel waaraan Beheer een kanaal koppelde, ook een dat (nog) niet op de
 * kassa staat, want bij het tellen kan er een bijkomen. Schrijft niets in de
 * kassa.
 */
export async function kassaImportAmounts(register: ControlRegister): Promise<KassaImportAmount[]> {
  const devices = await deviceChannels();
  const amounts = await controlAmounts(
    [...devices.values()].map((device) => ({ register, method: device.method, terminal: device.terminal })),
    devices,
  );
  return amounts.flatMap((amount) => (amount ? [amount] : []));
}

/** Eén toestel op één kassa in de lijst met afwijkingen. */
export type KassaControlRow = {
  registerId: string;
  date: Date;
  startsAt: Date | null;
  endsAt: Date | null;
  activity: string;
  postLabel: string;
  method: PaymentMethod;
  terminal: string;
  /** Wat Beheer bij het tellen intikte; `null` = nog niet afgelezen. */
  typedCents: number | null;
  /** `null` = geen kanaal van de online inkomsten aan dit toestel gekoppeld. */
  amount: KassaImportAmount | null;
  state: KassaControlState;
};

/**
 * De lijst met afwijkingen: elk toestel op elke aanvaarde kassa van een
 * werkingsjaar, met wat er ingetikt is naast wat de import zag. Dezelfde
 * rekening als het telformulier (`controlAmounts`), dus de lijst en de kassa
 * zeggen hetzelfde.
 */
export async function kassaControlList(year: number | "all"): Promise<KassaControlRow[]> {
  const [registers, devices] = await Promise.all([
    prisma.cashRegister.findMany({
      where: {
        status: { not: "REQUESTED" },
        payments: { some: {} },
        ...(year === "all" ? {} : { workingYear: year }),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        date: true,
        startsAt: true,
        endsAt: true,
        activity: true,
        postLabel: true,
        payments: { orderBy: { sortOrder: "asc" }, select: { method: true, terminal: true, amountCents: true } },
      },
    }),
    deviceChannels(),
  ]);
  const lines = registers.flatMap((register) => register.payments.map((payment) => ({ register, payment })));
  const amounts = await controlAmounts(
    lines.map(({ register, payment }) => ({ register, method: payment.method, terminal: payment.terminal })),
    devices,
  );
  return lines.map(({ register, payment }, index) => ({
    registerId: register.id,
    date: register.date,
    startsAt: register.startsAt,
    endsAt: register.endsAt,
    activity: register.activity,
    postLabel: register.postLabel,
    method: payment.method,
    terminal: payment.terminal,
    typedCents: payment.amountCents,
    amount: amounts[index],
    state: kassaControlState(payment.amountCents, amounts[index]),
  }));
}

/**
 * De kanalen van de exports. Met `transfers` ook de rekeningen van de
 * overschrijvingen: Instellingen en de uitleningen hebben daar niets aan (hun
 * rekening ligt vast), de filter van Transacties wel.
 */
export async function listIncomeChannels(options: { transfers?: boolean } = {}) {
  return prisma.incomeChannel.findMany({
    where: options.transfers ? {} : { source: { not: "TRANSFER" } },
    orderBy: [{ source: "asc" }, { identifier: "asc" }],
    select: {
      id: true,
      source: true,
      identifier: true,
      label: true,
      cashMethod: true,
      cashTerminal: true,
      accounts: { orderBy: { from: "asc" }, select: { from: true, bankAccount: true } },
      codes: { orderBy: { from: "asc" }, select: { from: true, accountingCode: { select: { id: true, code: true, name: true } } } },
      _count: { select: { transactions: true } },
    },
  });
}

export async function listIncomeNameRules() {
  return prisma.incomeNameRule.findMany({
    orderBy: [{ source: "asc" }, { text: "asc" }],
    select: {
      id: true,
      source: true,
      text: true,
      accountingCode: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
}

/** Hoeveel transacties er nog na te kijken zijn, voor het tabblad. */
export async function countUnassigned(): Promise<number> {
  return (await openRows()).length;
}

// -----------------------------------------------------------------------------
// De Excel-bestanden
// -----------------------------------------------------------------------------

const SOURCE_NAME: Record<IncomeSourceCode, string> = {
  PAYCONIQ: "Payconiq",
  MOLLIE: "Mollie",
  SUMUP: "SumUp",
  EUROPABANK: "Europabank",
  TRANSFER: "Overschrijvingen",
};

/** Waarom een transactie haar code kreeg, in woorden: de kolom "Waarom" van het controlebestand. */
function reasonOf(
  rules: LineRules,
  tx: {
    source: IncomeSource;
    kind: IncomeKind;
    rule: IncomeRule | null;
    excluded: boolean;
    description: string | null;
    assignedAt: Date | null;
    assignedBy: { name: string } | null;
    channel: { identifier: string; label: string | null } | null;
    ticketPayment: { order: { event: { titleNl: string } } } | null;
    cashRegister: { activity: string; postLabel: string; date: Date } | null;
    channelLending: { fromDay: Date; toDay: Date } | null;
    membershipPaymentId: string | null;
    uitleenPaymentId: string | null;
  },
  nl: boolean,
): string {
  const when = tx.assignedAt ? tx.assignedAt.toLocaleDateString(nl ? "nl-BE" : "en-GB", { timeZone: "Europe/Brussels" }) : null;
  const byWhom = [tx.assignedBy?.name ? `${nl ? "door" : "by"} ${tx.assignedBy.name}` : null, when ? `${nl ? "op" : "on"} ${when}` : null]
    .filter(Boolean)
    .join(" ");
  if (tx.kind === "FEE" && isSeparateFee(tx, rules)) {
    return nl
      ? `Kosten van ${SOURCE_NAME[tx.source]}, aparte factuur (Instellingen): telt niet mee`
      : `${SOURCE_NAME[tx.source]} fees, separate invoice (Settings): does not count`;
  }
  if (tx.kind === "FEE") {
    if (tx.source === "SUMUP") return nl ? "Transactiekosten van SumUp, op de betaling" : "SumUp transaction fee, on the payment";
    if (tx.source === "EUROPABANK") return nl ? "Commissie van Europabank, op de betaling" : "Europabank commission, on the payment";
    return nl ? "Kosten die Mollie inhield" : "Fees withheld by Mollie";
  }
  if (tx.kind === "RESERVE") return nl ? "Reserve van Mollie" : "Mollie rolling reserve";
  if (tx.source === "TRANSFER" && !tx.excluded) {
    return `${nl ? "Overschrijving, met de hand ingevoerd" : "Transfer, entered by hand"}${byWhom ? ` ${byWhom}` : ""}`;
  }
  if (tx.excluded) return `${nl ? "Telt niet mee, met de hand" : "Does not count, by hand"}${byWhom ? ` ${byWhom}` : ""}`;
  switch (tx.rule) {
    case "MANUAL":
      return `${nl ? "Met de hand" : "By hand"}${byWhom ? ` ${byWhom}` : ""}`;
    case "WEBSITE":
      if (tx.ticketPayment) return `${nl ? "Betaling van de site, ticketverkoop" : "Site payment, ticket sale"} ${tx.ticketPayment.order.event.titleNl}`;
      if (tx.membershipPaymentId) return nl ? "Betaling van de site, lidgeld" : "Site payment, membership";
      return nl ? "Betaling van de site" : "Site payment";
    case "CODE_IN_TEXT":
      return nl ? "Code in de omschrijving of de referentie" : "Code in the description or reference";
    case "NAME_RULE":
      return `${nl ? "Onthouden tekst" : "Remembered text"} "${incomeRuleText(tx.description) ?? ""}"`;
    case "CHANNEL_DEFAULT":
      return `${nl ? "Standaardcode van" : "Default code of"} ${tx.channel?.label || tx.channel?.identifier || "?"}`;
    case "CHANNEL_LENDING": {
      const channel = tx.channel?.label || tx.channel?.identifier || "?";
      if (!tx.channelLending) return `${nl ? "Uitlening van" : "Lending of"} ${channel}`;
      const day = (value: Date) => value.toLocaleDateString(nl ? "nl-BE" : "en-GB", { timeZone: "UTC" });
      return nl
        ? `Uitlening van ${channel}, ${day(tx.channelLending.fromDay)} tot en met ${day(tx.channelLending.toDay)}`
        : `Lending of ${channel}, ${day(tx.channelLending.fromDay)} to ${day(tx.channelLending.toDay)}`;
    }
    case "CASH_REGISTER":
      return tx.cashRegister
        ? `${nl ? "Kassa" : "Cash register"} ${tx.cashRegister.activity} (${tx.cashRegister.postLabel}), ${tx.cashRegister.date.toLocaleDateString(nl ? "nl-BE" : "en-GB", { timeZone: "UTC" })}`
        : nl
          ? "Kassa"
          : "Cash register";
    default:
      return tx.uitleenPaymentId
        ? nl
          ? "Betaling van de uitleendienst, nog na te kijken"
          : "Equipment rental payment, still to review"
        : nl
          ? "Na te kijken"
          : "To review";
  }
}

/** Alles wat de Excel-bestanden van een periode nodig hebben. */
export async function loadIncomeWorkbookModel(from: string, to: string, nl: boolean): Promise<WorkbookModel> {
  const [rows, channels, codeList, feeCode, overviewData] = await Promise.all([
    prisma.incomeTransaction.findMany({
      where: { periodMonth: { gte: monthToDate(from), lte: monthToDate(to) } },
      orderBy: { occurredAt: "asc" },
      select: {
        source: true,
        kind: true,
        occurredAt: true,
        amountCents: true,
        periodMonth: true,
        payoutReference: true,
        description: true,
        reference: true,
        accountingCode: true,
        accountingCodeName: true,
        excluded: true,
        rule: true,
        channelId: true,
        importId: true,
        assignedAt: true,
        membershipPaymentId: true,
        uitleenPaymentId: true,
        assignedBy: { select: { name: true } },
        channel: { select: { identifier: true, label: true } },
        ticketPayment: { select: { order: { select: { event: { select: { titleNl: true } } } } } },
        cashRegister: { select: { activity: true, postLabel: true, date: true } },
        channelLending: { select: { fromDay: true, toDay: true } },
      },
    }),
    prisma.incomeChannel.findMany({ select: { id: true, accounts: { select: { from: true, bankAccount: true } } } }),
    listAccountingCodes(),
    feeAccountingCode(),
    loadIncomeOverview(from, to),
  ]);

  const rules = overviewData.lineRules;
  const accountsByChannel = new Map(
    channels.map((channel) => [
      channel.id,
      channel.accounts.map((account) => ({ from: account.from.toISOString().slice(0, 10), bankAccount: account.bankAccount })),
    ]),
  );
  const transactions: WorkbookTransaction[] = rows.map((row) => ({
    occurredAt: row.occurredAt,
    source: row.source,
    kind: row.kind,
    channel: row.channel?.label || row.channel?.identifier || "",
    description: row.description,
    amountCents: row.amountCents,
    periodMonth: row.periodMonth ? dateToMonth(row.periodMonth) : null,
    payoutReference: row.payoutReference,
    bankAccount: row.channelId ? accountOn(accountsByChannel.get(row.channelId) ?? [], ymdKey(brusselsYMD(row.occurredAt))) : null,
    accountingCode: row.accountingCode,
    accountingCodeName: row.accountingCodeName,
    excluded: row.excluded,
    reason: reasonOf(rules, row, nl),
  }));

  // De tussenlaag: dezelfde groepen als Na te kijken, maar voor alles van de periode.
  const groups = new Map<string, WorkbookGroup & { codeSet: Set<string>; reasonSet: Set<string> }>();
  rows.forEach((row, index) => {
    // Een overschrijving staat er per stuk al: Na te kijken groepeert ze nooit.
    if ((row.kind !== "PAYMENT" && row.kind !== "REFUND") || row.source === "TRANSFER") return;
    const { key, type, day } = groupKeyOf(row);
    let group = groups.get(key);
    if (!group) {
      group = {
        source: row.source,
        channel: transactions[index].channel,
        label: type === "day" ? (day ?? "") : (incomeRuleLabel(row.description) ?? (nl ? "(zonder omschrijving)" : "(no description)")),
        firstAt: row.occurredAt,
        lastAt: row.occurredAt,
        count: 0,
        cents: 0,
        codes: "",
        reasons: "",
        codeSet: new Set(),
        reasonSet: new Set(),
      };
      groups.set(key, group);
    }
    group.count += 1;
    group.cents += row.amountCents;
    if (row.occurredAt > group.lastAt) group.lastAt = row.occurredAt;
    const line = quarterLineKey(transactions[index], rules);
    group.codeSet.add(line ?? (nl ? "telt niet mee" : "does not count"));
    group.reasonSet.add(transactions[index].reason);
  });

  // De berekende reserve, dezelfde als op het overzicht: als regel in Transacties,
  // zodat de formules van het kwartaalblad en het controleblok van Mollie sluiten.
  const reserve = overviewData.mollieReserve;
  if (reserve.status === "known") {
    const [toYear, toMonth] = to.split("-").map(Number);
    const lastDay = Number(lastDayOf(to).slice(8));
    const endOfPeriod = new Date(brusselsWallClockMinutes({ year: toYear, month: toMonth, day: lastDay }, 23 * 60 + 59).getTime() + 59_000);
    const euro = (cents: number) => (cents / 100).toLocaleString(nl ? "nl-BE" : "en-GB", { style: "currency", currency: "EUR" });
    for (const account of reserve.accounts) {
      if (account.cents === 0) continue;
      transactions.push({
        occurredAt: endOfPeriod,
        source: "MOLLIE",
        kind: "RESERVE",
        channel: MOLLIE_CHANNEL,
        description: nl ? "Wijziging dynamische reserve (berekend)" : "Change in rolling reserve (computed)",
        amountCents: account.cents,
        periodMonth: to,
        payoutReference: null,
        bankAccount: account.bankAccount,
        accountingCode: null,
        accountingCodeName: null,
        excluded: false,
        reason: nl
          ? `Berekend: overgeschreven ${euro(account.transfersCents)} in ${account.transferCount} overschrijvingen, min alles van Mollie in de periode (${euro(account.transfersCents - account.cents)})`
          : `Computed: transferred ${euro(account.transfersCents)} in ${account.transferCount} transfers, minus everything from Mollie in the period (${euro(account.transfersCents - account.cents)})`,
      });
    }
  }

  const payoutDate = (date: Date) => date.toLocaleDateString(nl ? "nl-BE" : "en-GB", { timeZone: "Europe/Brussels" });
  const importCounts = new Map<string, number>();
  for (const row of rows) importCounts.set(row.importId, (importCounts.get(row.importId) ?? 0) + 1);
  const imports = await prisma.incomeImport.findMany({
    // Een overschrijving is geen bestand.
    where: { id: { in: [...importCounts.keys()] }, format: { not: MANUAL_FORMAT } },
    orderBy: { createdAt: "asc" },
    select: { id: true, fileName: true, source: true, createdAt: true, importedBy: { select: { name: true } } },
  });

  return {
    title: `${nl ? "Online inkomsten" : "Online income"} ${periodLabel(from, to, nl)}`,
    nl,
    transactions,
    codeOrder: new Map(codeList.map((code, index) => [codeKey(code.code), index])),
    mainNames: new Map(codeList.filter((code) => code.depth === 0).map((code) => [code.code, code.name])),
    lineRules: rules,
    mollieTransfers: reserve.status === "known" ? { cents: reserve.transfersCents, count: reserve.transferCount } : null,
    feeCode,
    groups: [...groups.values()].map(({ codeSet, reasonSet, ...group }) => ({
      ...group,
      codes: [...codeSet].join(", "),
      reasons: [...reasonSet].slice(0, 5).join("; "),
    })),
    payouts: overviewData.payouts.map((payout) => ({
      source: payout.source,
      reference: payout.reference,
      paidOn: payout.paidOn,
      firstAt: payout.firstAt,
      lastAt: payout.lastAt,
      payments: payout.payments,
      refunds: payout.refunds,
      fees: payout.fees,
      reserve: payout.reserve,
      total: payout.total,
      providerAmount: payout.providerAmount,
      bankOn: payout.bank ? new Date(`${payout.bank.bookedOn}T00:00:00Z`) : null,
      bankAmount: payout.bank?.amountCents ?? null,
      checked:
        payout.state === "bank"
          ? nl
            ? "ja, op het uittreksel"
            : "yes, on the statement"
          : payout.state === "bankDiffers"
            ? nl
              ? "nee, ander bedrag op de bank"
              : "no, another amount on the bank"
            : payout.state === "checked" && payout.check
          ? `${nl ? "ja" : "yes"}, ${payoutDate(payout.check.checkedAt)}${payout.check.checkedByName ? `, ${payout.check.checkedByName}` : ""}`
          : payout.state === "changed" && payout.check
            ? nl
              ? `afgevinkt op ${(payout.check.amountCents / 100).toFixed(2)}, nu anders`
              : `checked at ${(payout.check.amountCents / 100).toFixed(2)}, now different`
            : payout.state === "provider"
              ? nl
                ? "ja, gelijk aan de overschrijving"
                : "yes, equal to the transfer"
              : payout.state === "differs"
                ? nl
                  ? "nee, anders dan de overschrijving"
                  : "no, differs from the transfer"
                : nl
                  ? "nee"
                  : "no",
    })),
    imports: imports.map((file) => ({
      fileName: file.fileName,
      source: file.source,
      createdAt: file.createdAt,
      importedBy: file.importedBy?.name ?? "",
      rowsInPeriod: importCounts.get(file.id) ?? 0,
    })),
  };
}
