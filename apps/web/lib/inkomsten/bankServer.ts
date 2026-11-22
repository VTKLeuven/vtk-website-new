import "server-only";

import { prisma } from "@vtk/db";
import { brusselsYMD, parseYMD, shiftYMD, ymdKey } from "@/lib/brussels";
import {
  matchBankLine,
  nextBankingDay,
  normaliseAccount,
  parseBankStatement,
  payoutKey,
  reconcileAccounts,
  type AccountRecon,
  type BankProvider,
  type ReconLine,
  type ReconRow,
  type UnmatchedReason,
} from "./bank";
import { accountOn } from "./overview";
import { displayAccount } from "./labels";
import { MOLLIE_CHANNEL } from "./parse";

/**
 * De bankafschriften van /admin/inkomsten: opladen, de lijst, verwijderen, en
 * wat het overzicht ervan toont (per uitbetaling, en per rekening tegen de
 * bank). Wat bewaard wordt, staat in `bank.ts`: enkel de regels van providers.
 * Zie docs/inkomsten.md, "Bankafschriften".
 */

const CHUNK = 1000;
/** Zoveel dagen voor en na een periode leest de afstemming nog: een verkoop van eind juni staat begin juli op de bank. */
const EDGE_DAYS = 14;

function dateOf(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}
function ymdOf(value: Date): string {
  return value.toISOString().slice(0, 10);
}
function shiftDay(ymd: string, days: number): string {
  return ymdKey(shiftYMD(parseYMD(ymd)!, days));
}


/** De rekeningen van de kanalen in Instellingen, genormaliseerd. */
async function knownAccounts(): Promise<Set<string>> {
  const rows = await prisma.incomeChannelAccount.findMany({ distinct: ["bankAccount"], select: { bankAccount: true } });
  return new Set(rows.map((row) => normaliseAccount(row.bankAccount)));
}

/**
 * De uitbetalingen die de site kent, op `payoutKey`: de referenties op de
 * transacties (SumUp, Payconiq, Europabank, Mollie) en de uitbetalingen uit de
 * exports (`IncomePayout`).
 */
async function knownPayouts(): Promise<{ known: Map<string, string>; payconiqHasPayoutIds: boolean }> {
  const [fromRows, fromPayouts] = await Promise.all([
    prisma.incomeTransaction.findMany({
      where: { payoutReference: { not: null }, source: { not: "TRANSFER" } },
      distinct: ["source", "payoutReference"],
      select: { source: true, payoutReference: true },
    }),
    prisma.incomePayout.findMany({ where: { source: { not: "TRANSFER" } }, select: { source: true, reference: true } }),
  ]);
  const known = new Map<string, string>();
  for (const row of fromRows) known.set(payoutKey(row.source as BankProvider, row.payoutReference!), row.payoutReference!);
  for (const row of fromPayouts) known.set(payoutKey(row.source as BankProvider, row.reference), row.reference);
  return { known, payconiqHasPayoutIds: fromRows.some((row) => row.source === "PAYCONIQ") };
}

// -----------------------------------------------------------------------------
// Opladen
// -----------------------------------------------------------------------------

export type BankImportSummary = {
  fileName: string;
  /** Genormaliseerd. */
  account: string;
  /** Of een kanaal in Instellingen deze rekening heeft. */
  knownAccount: boolean;
  coveredFrom: string;
  coveredTo: string;
  /** Regels in het bestand, ook die van leden (die niet bewaard worden). */
  lineCount: number;
  /** Regels van providers. */
  providerLines: number;
  /** Regels van providers die geen ander afschrift al had. */
  created: number;
  /** Regels van providers die al in een ander afschrift stonden. */
  duplicates: number;
  /** Regels van providers met een uitbetaling op de site. */
  matched: number;
  /** Dagen die nog geen afschrift van deze rekening dekte. */
  newCoverage: boolean;
};

export type BankImportOutcome =
  | { ok: true; summary: BankImportSummary; statementId: string | null }
  | { ok: false; error: "EMPTY" | "BAD_ROW" | "MIXED_ACCOUNTS"; detail?: string };

/**
 * Een afschrift lezen en, zonder `dryRun`, bewaren: het afschrift en zijn
 * regels van providers, in één transactie. `seen` draagt de sleutels van
 * eerdere bestanden uit dezelfde keuze mee, zoals bij de exports.
 */
export async function importBankStatement(
  text: string,
  fileName: string,
  options: { dryRun: boolean; userId: string | null; seen?: Set<string> },
): Promise<BankImportOutcome> {
  const parsed = parseBankStatement(text, fileName);
  if (!parsed.ok) return parsed;
  const { account } = parsed;

  const existing = new Set<string>();
  const keys = parsed.lines.map((line) => line.externalKey);
  for (let i = 0; i < keys.length; i += CHUNK) {
    const found = await prisma.incomeBankLine.findMany({
      where: { account, externalKey: { in: keys.slice(i, i + CHUNK) } },
      distinct: ["externalKey"],
      select: { externalKey: true },
    });
    for (const row of found) existing.add(row.externalKey);
  }
  const isNew = (key: string) => !existing.has(key) && !options.seen?.has(`bank:${account}:${key}`);
  const created = parsed.lines.filter((line) => isNew(line.externalKey)).length;
  const covering = await prisma.incomeBankStatement.findFirst({
    where: { account, coveredFrom: { lte: dateOf(parsed.coveredFrom) }, coveredTo: { gte: dateOf(parsed.coveredTo) } },
    select: { id: true },
  });
  const seenCoverage = options.seen?.has(`bank:${account}:${parsed.coveredFrom}:${parsed.coveredTo}`) ?? false;
  for (const line of parsed.lines) options.seen?.add(`bank:${account}:${line.externalKey}`);
  options.seen?.add(`bank:${account}:${parsed.coveredFrom}:${parsed.coveredTo}`);

  const [accounts, { known, payconiqHasPayoutIds }] = await Promise.all([knownAccounts(), knownPayouts()]);
  const summary: BankImportSummary = {
    fileName,
    account,
    knownAccount: accounts.has(account),
    coveredFrom: parsed.coveredFrom,
    coveredTo: parsed.coveredTo,
    lineCount: parsed.lineCount,
    providerLines: parsed.lines.length,
    created,
    duplicates: parsed.lines.length - created,
    matched: parsed.lines.filter((line) => matchBankLine(line, known, payconiqHasPayoutIds).payoutKey !== null).length,
    newCoverage: !covering && !seenCoverage,
  };
  if (options.dryRun) return { ok: true, summary, statementId: null };

  const statement = await prisma.$transaction(async (tx) => {
    const row = await tx.incomeBankStatement.create({
      data: {
        account,
        fileName: fileName.slice(0, 200),
        coveredFrom: dateOf(parsed.coveredFrom),
        coveredTo: dateOf(parsed.coveredTo),
        lineCount: parsed.lineCount,
        providerCount: parsed.lines.length,
        importedById: options.userId,
      },
      select: { id: true },
    });
    for (let i = 0; i < parsed.lines.length; i += CHUNK) {
      await tx.incomeBankLine.createMany({
        data: parsed.lines.slice(i, i + CHUNK).map((line) => ({
          statementId: row.id,
          account,
          bookedOn: dateOf(line.bookedOn),
          amountCents: line.amountCents,
          provider: line.provider,
          reference: line.reference,
          externalKey: line.externalKey,
        })),
      });
    }
    return row;
  });
  return { ok: true, summary, statementId: statement.id };
}

export type BankStatementItem = {
  id: string;
  account: string;
  fileName: string;
  coveredFrom: string;
  coveredTo: string;
  lineCount: number;
  providerCount: number;
  matched: number;
  knownAccount: boolean;
  createdAt: Date;
  importedBy: string | null;
};

/** De opgeladen afschriften, de laatste eerst, met hoeveel van hun regels een uitbetaling vonden. */
export async function listBankStatements(): Promise<BankStatementItem[]> {
  const statements = await prisma.incomeBankStatement.findMany({
    orderBy: [{ coveredTo: "desc" }, { account: "asc" }],
    take: 100,
    select: {
      id: true,
      account: true,
      fileName: true,
      coveredFrom: true,
      coveredTo: true,
      lineCount: true,
      providerCount: true,
      createdAt: true,
      importedBy: { select: { name: true } },
      lines: { select: { provider: true, reference: true } },
    },
  });
  if (statements.length === 0) return [];
  const [accounts, { known, payconiqHasPayoutIds }] = await Promise.all([knownAccounts(), knownPayouts()]);
  return statements.map((statement) => ({
    id: statement.id,
    account: statement.account,
    fileName: statement.fileName,
    coveredFrom: ymdOf(statement.coveredFrom),
    coveredTo: ymdOf(statement.coveredTo),
    lineCount: statement.lineCount,
    providerCount: statement.providerCount,
    matched: statement.lines.filter(
      (line) => matchBankLine({ provider: line.provider as BankProvider, reference: line.reference }, known, payconiqHasPayoutIds).payoutKey !== null,
    ).length,
    knownAccount: accounts.has(statement.account),
    createdAt: statement.createdAt,
    importedBy: statement.importedBy?.name ?? null,
  }));
}

/**
 * Een afschrift verwijderen, met zijn regels. Mag ook in een afgesloten
 * periode: het verandert geen transactie, geen code en geen maand.
 */
export async function deleteBankStatement(id: string): Promise<{ ok: true; account: string; coveredFrom: string; coveredTo: string; lines: number } | { ok: false }> {
  const statement = await prisma.incomeBankStatement.findUnique({
    where: { id },
    select: { account: true, coveredFrom: true, coveredTo: true, providerCount: true },
  });
  if (!statement) return { ok: false };
  await prisma.incomeBankStatement.delete({ where: { id } });
  return {
    ok: true,
    account: statement.account,
    coveredFrom: ymdOf(statement.coveredFrom),
    coveredTo: ymdOf(statement.coveredTo),
    lines: statement.providerCount,
  };
}

// -----------------------------------------------------------------------------
// Wat het overzicht toont
// -----------------------------------------------------------------------------

/** Een regel van een provider, zonder dubbels, met haar koppeling. */
export type BankLineView = {
  account: string;
  bookedOn: string;
  amountCents: number;
  provider: BankProvider;
  reference: string | null;
  payoutKey: string | null;
  reason: UnmatchedReason | null;
};

/** De regels van providers van `from` tot en met `to` ("2026-07-01"), elke regel één keer. */
export async function loadBankLines(from: string, to: string): Promise<BankLineView[]> {
  const rows = await prisma.incomeBankLine.findMany({
    where: { bookedOn: { gte: dateOf(from), lte: dateOf(to) } },
    orderBy: [{ bookedOn: "asc" }, { createdAt: "asc" }],
    select: { account: true, bookedOn: true, amountCents: true, provider: true, reference: true, externalKey: true },
  });
  const unique = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.account}|${row.externalKey}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  if (unique.size === 0) return [];
  const { known, payconiqHasPayoutIds } = await knownPayouts();
  return [...unique.values()].map((row) => {
    const provider = row.provider as BankProvider;
    const match = matchBankLine({ provider, reference: row.reference }, known, payconiqHasPayoutIds);
    return {
      account: row.account,
      bookedOn: ymdOf(row.bookedOn),
      amountCents: row.amountCents,
      provider,
      reference: row.reference,
      payoutKey: match.payoutKey,
      reason: match.payoutKey === null ? match.reason : null,
    };
  });
}

/** Per rekening de dagen die de afschriften dekken. */
export async function loadBankCoverage(): Promise<Map<string, Array<{ from: string; to: string }>>> {
  const statements = await prisma.incomeBankStatement.findMany({ select: { account: true, coveredFrom: true, coveredTo: true } });
  const coverage = new Map<string, Array<{ from: string; to: string }>>();
  for (const statement of statements) {
    const ranges = coverage.get(statement.account) ?? [];
    ranges.push({ from: ymdOf(statement.coveredFrom), to: ymdOf(statement.coveredTo) });
    coverage.set(statement.account, ranges);
  }
  return coverage;
}

/** Of een dag van een rekening door een afschrift gedekt is. */
export function coveredOn(coverage: ReadonlyMap<string, ReadonlyArray<{ from: string; to: string }>>, account: string | null, day: string): boolean {
  if (!account) return false;
  return (coverage.get(account) ?? []).some((range) => range.from <= day && day <= range.to);
}

export type BankUnmatchedLine = { account: string; bookedOn: string; amountCents: number; provider: BankProvider; reference: string | null; reason: UnmatchedReason };

export type BankOverview = {
  accounts: Array<AccountRecon & { display: string; known: boolean }>;
  /** Regels van providers in de periode zonder uitbetaling op de site. */
  unmatched: BankUnmatchedLine[];
};

/**
 * Per rekening de afstemming met de afschriften (`reconcileAccounts`), en de
 * regels zonder uitbetaling. Null als er nog geen enkel afschrift is. Leest
 * enkel: niets hier verandert wat meetelt.
 */
export async function loadBankOverview(fromMonth: string, toMonth: string): Promise<BankOverview | null> {
  const any = await prisma.incomeBankStatement.findFirst({ select: { id: true } });
  if (!any) return null;
  const from = `${fromMonth}-01`;
  const [toYear, toM] = toMonth.split("-").map(Number);
  const to = ymdKey({ year: toYear, month: toM, day: new Date(Date.UTC(toYear, toM, 0)).getUTCDate() });
  const windowFrom = shiftDay(from, -EDGE_DAYS);
  const windowTo = shiftDay(to, EDGE_DAYS);

  const [lines, coverage, channels, rows, payouts, accounts] = await Promise.all([
    loadBankLines(windowFrom, windowTo),
    loadBankCoverage(),
    prisma.incomeChannel.findMany({ select: { id: true, source: true, identifier: true, accounts: { select: { from: true, bankAccount: true } } } }),
    prisma.incomeTransaction.findMany({
      where: {
        source: { in: ["SUMUP", "PAYCONIQ", "EUROPABANK", "TRANSFER"] },
        occurredAt: { gte: dateOf(windowFrom), lt: dateOf(shiftDay(to, 1)) },
      },
      select: { source: true, occurredAt: true, amountCents: true, channelId: true, payoutReference: true, periodMonth: true },
    }),
    prisma.incomePayout.findMany({
      where: { paidOn: { gte: dateOf(windowFrom), lte: dateOf(windowTo) }, source: { in: ["MOLLIE", "SUMUP", "EUROPABANK"] } },
      select: { source: true, reference: true, paidOn: true, amountCents: true },
    }),
    knownAccounts(),
  ]);
  const accountsOf = new Map(
    channels.map((channel) => [channel.id, channel.accounts.map((entry) => ({ from: ymdOf(entry.from), bankAccount: normaliseAccount(entry.bankAccount) }))]),
  );
  const mollie = channels.find((channel) => channel.source === "MOLLIE" && channel.identifier === MOLLIE_CHANNEL) ?? channels.find((channel) => channel.source === "MOLLIE");
  const mollieAccounts = mollie ? (accountsOf.get(mollie.id) ?? []) : [];

  const reconRows: ReconRow[] = [];
  const byHand = new Map<string, number>();
  for (const row of rows) {
    const saleDay = ymdKey(brusselsYMD(row.occurredAt));
    const account = row.channelId ? accountOn(accountsOf.get(row.channelId) ?? [], saleDay) : null;
    if (row.source === "TRANSFER") {
      if (account && from <= saleDay && saleDay <= to) byHand.set(account, (byHand.get(account) ?? 0) + row.amountCents);
      continue;
    }
    const source = row.source as ReconRow["source"];
    reconRows.push({
      source,
      account,
      saleDay,
      amountCents: row.amountCents,
      payout: row.payoutReference ? payoutKey(source, row.payoutReference) : null,
    });
  }
  const payoutDays = new Map<string, string>();
  const transfers = [];
  for (const payout of payouts) {
    const paidOn = ymdOf(payout.paidOn);
    const key = payoutKey(payout.source as BankProvider, payout.reference);
    if (payout.source === "MOLLIE") {
      if (payout.amountCents !== null) transfers.push({ account: accountOn(mollieAccounts, paidOn), paidOn, amountCents: payout.amountCents, payout: key });
    } else {
      payoutDays.set(key, paidOn);
    }
  }
  const reconLines: ReconLine[] = lines.map((line) => ({ account: line.account, bookedOn: line.bookedOn, amountCents: line.amountCents, payout: line.payoutKey }));
  const recon = reconcileAccounts({ from, to, rows: reconRows, transfers, payoutDays, lines: reconLines, coverage, byHand });
  return {
    accounts: recon.map((entry) => ({ ...entry, display: displayAccount(entry.account), known: accounts.has(entry.account) })),
    unmatched: lines
      .filter((line) => !line.payoutKey && from <= line.bookedOn && line.bookedOn <= to)
      .map((line) => ({ account: line.account, bookedOn: line.bookedOn, amountCents: line.amountCents, provider: line.provider, reference: line.reference, reason: line.reason! })),
  };
}

/**
 * De dag waarop een uitbetaling op de bank verwacht wordt, als ze er nog niet
 * staat: de dag die de provider noemt, of de bankdag na haar laatste verkoop.
 */
export function expectedBankDay(paidOn: Date | null, lastAt: Date): { day: string; estimated: boolean } {
  if (paidOn) return { day: ymdOf(paidOn), estimated: false };
  return { day: nextBankingDay(ymdKey(brusselsYMD(lastAt))), estimated: true };
}
