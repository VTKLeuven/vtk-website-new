import "server-only";

import { prisma } from "@vtk/db";
import type { IncomeKind, IncomeRule, IncomeSource } from "@prisma/client";
import { brusselsYMD, ymdKey } from "@/lib/brussels";
import { listAccountingCodes } from "@/lib/accounting/server";
import {
  codeKey,
  incomeRuleLabel,
  incomeRuleText,
  matchTransaction,
  nameRuleKey,
  type ChannelCodeEntry,
  type CodeSnapshot,
  type MatchContext,
  type MatchResult,
  type WebsitePayment,
} from "./match";
import {
  INCOME_SOURCES,
  accountOn,
  computeIncomeChecks,
  computeIncomeOverview,
  groupMolliePayouts,
  monthsBetween,
  type IncomeCheck,
  type IncomeOverview,
  type MolliePayout,
} from "./overview";
import { periodLabel } from "./labels";
import { quarterLineKey, type WorkbookGroup, type WorkbookModel, type WorkbookTransaction } from "./workbook";
import {
  dateToMonth,
  monthToDate,
  parseIncomeExport,
  type IncomeFormat,
  type IncomeParseError,
  type IncomeSourceCode,
  type ParsedIncomeRow,
} from "./parse";

/**
 * De databasekant van /admin/inkomsten: opladen, koppelen, groeperen en het
 * overzicht. De regels zelf staan puur in `match.ts`, het lezen van de
 * bestanden in `parse.ts`. Zie docs/inkomsten.md.
 */

const CHUNK = 1000;

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

// -----------------------------------------------------------------------------
// Instellingen (Setting `income.config`)
// -----------------------------------------------------------------------------

export const INCOME_CONFIG_KEY = "income.config";

export type IncomeConfig = {
  /**
   * De code voor de kosten van Mollie, SumUp en Europabank. Geen
   * standaard: Beheer kiest ze, net als elke andere code van de kring.
   */
  feeAccountingCodeId: string | null;
};

export async function getIncomeConfig(): Promise<IncomeConfig> {
  const row = await prisma.setting.findUnique({ where: { key: INCOME_CONFIG_KEY } });
  const value = (row?.value ?? {}) as Record<string, unknown>;
  return { feeAccountingCodeId: typeof value.feeAccountingCodeId === "string" ? value.feeAccountingCodeId : null };
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
  /** De uitbetalingsregels van SumUp: hetzelfde geld als de verkoop ernaast. */
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
};

export type ImportOutcome = { ok: true; summary: ImportSummary; importId: string | null } | { ok: false; error: IncomeParseError; detail?: string };

/**
 * Een export lezen en, zonder `dryRun`, bewaren. Dezelfde berekening voor de
 * voorvertoning en het echte opladen, zodat wat Beheer te zien krijgt ook is
 * wat er gebeurt.
 */
export async function importIncomeExport(
  text: string,
  fileName: string,
  options: { dryRun: boolean; userId: string | null },
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

  const isLocked = lockedMonthTest(await listClosedPeriods());
  const fresh: ParsedIncomeRow[] = [];
  const payoutUpdates: Array<{ id: string; row: ParsedIncomeRow }> = [];
  let locked = 0;
  for (const row of rows) {
    const known = existing.get(row.externalKey);
    if (known) {
      if (!row.derived) duplicates++;
      // Eerst opgeladen voor ze uitbetaald was, nu met de uitbetaling erbij.
      if (!known.payoutReference && row.payoutReference && !isLocked(row.periodMonth)) {
        payoutUpdates.push({ id: known.id, row });
      }
      continue;
    }
    if (isLocked(row.periodMonth)) {
      if (!row.derived) locked++;
      continue;
    }
    fresh.push(row);
  }

  // De kanalen eerst: de standaardcode van een kanaal bepaalt mee de
  // koppeling. Een nieuw kanaal heeft er nog geen.
  const channelNames = [...new Set(fresh.map((row) => row.channel))];
  const knownChannels = await prisma.incomeChannel.findMany({
    where: { source, identifier: { in: channelNames } },
    select: { id: true, identifier: true },
  });
  const channelIds = new Map(knownChannels.map((channel) => [channel.identifier, channel.id]));
  const newChannels = channelNames.filter((name) => !channelIds.has(name));

  const [{ codes }, nameRules, website, channelCodes] = await Promise.all([
    codeContext(),
    nameRuleContext(),
    websitePayments(source, fresh.flatMap((row) => (row.providerId ? [row.providerId] : []))),
    channelCodeContext(),
  ]);
  const context: MatchContext = { codes, nameRules, website, channelCodes };
  const matched = fresh.map((row) => ({
    row,
    match: matchTransaction({ ...row, channelId: channelIds.get(row.channel) ?? null }, context),
  }));

  const rules: ImportRuleCounts = { WEBSITE: 0, CODE_IN_TEXT: 0, NAME_RULE: 0, CHANNEL_DEFAULT: 0, OPEN: 0 };
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
    ignored: parsed.ignored,
    created: fresh.filter((row) => !row.derived).length,
    duplicates,
    updated: payoutUpdates.length,
    locked,
    rules,
    feeRows: fresh.filter((row) => (row.kind === "FEE" || row.kind === "RESERVE") && !row.derived).length,
    firstAt,
    lastAt,
    newChannels,
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

  return { ok: true, summary, importId: created.id };
}

// -----------------------------------------------------------------------------
// Opnieuw koppelen
// -----------------------------------------------------------------------------

/**
 * Alle koppelingen die niet met de hand gezet zijn, opnieuw berekenen: na een
 * onthouden tekst, een nieuwe code in het register, of een verwijderde regel.
 * Een afgesloten periode blijft zoals ze is. Geeft het aantal wijzigingen terug.
 */
export async function rematchOpenTransactions(): Promise<number> {
  const isLocked = lockedMonthTest(await listClosedPeriods());
  const rows = await prisma.incomeTransaction.findMany({
    where: {
      kind: { in: ["PAYMENT", "REFUND"] },
      excluded: false,
      OR: [{ rule: null }, { rule: { not: "MANUAL" } }],
    },
    select: {
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
      accountingCode: true,
      rule: true,
      ticketPaymentId: true,
      membershipPaymentId: true,
      uitleenPaymentId: true,
    },
  });
  const open = rows.filter((row) => !isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null));

  const [{ codes }, nameRules, channelCodes, websites] = await Promise.all([
    codeContext(),
    nameRuleContext(),
    channelCodeContext(),
    Promise.all(
      INCOME_SOURCES.map(async (source) => {
        const ids = open.flatMap((row) => (row.source === source && row.providerId ? [row.providerId] : []));
        return [source, await websitePayments(source, ids)] as const;
      }),
    ),
  ]);
  const websiteBySource = new Map(websites);

  // Eén `updateMany` per wijziging, niet één query per rij: een nieuwe
  // standaardcode raakt zo duizenden betalingen van een SumUp-account.
  const updates = new Map<string, { data: MatchUpdate; ids: string[] }>();
  for (const row of open) {
    const match = matchTransaction(row, {
      codes,
      nameRules,
      channelCodes,
      website: websiteBySource.get(row.source) ?? new Map(),
    });
    const same =
      match.rule === row.rule &&
      (match.code?.code ?? null) === row.accountingCode &&
      match.ticketPaymentId === row.ticketPaymentId &&
      match.membershipPaymentId === row.membershipPaymentId &&
      match.uitleenPaymentId === row.uitleenPaymentId;
    if (same) continue;
    const data: MatchUpdate = {
      rule: match.rule,
      accountingCode: match.code?.code ?? null,
      accountingCodeName: match.code?.name ?? null,
      ticketPaymentId: match.ticketPaymentId,
      membershipPaymentId: match.membershipPaymentId,
      uitleenPaymentId: match.uitleenPaymentId,
    };
    const key = JSON.stringify(data);
    const update = updates.get(key);
    if (update) update.ids.push(row.id);
    else updates.set(key, { data, ids: [row.id] });
  }

  let changed = 0;
  for (const { data, ids } of updates.values()) {
    for (const batch of chunks(ids)) {
      await prisma.incomeTransaction.updateMany({ where: { id: { in: batch } }, data });
    }
    changed += ids.length;
  }
  return changed;
}

type MatchUpdate = {
  rule: MatchResult["rule"];
  accountingCode: string | null;
  accountingCodeName: string | null;
  ticketPaymentId: string | null;
  membershipPaymentId: string | null;
  uitleenPaymentId: string | null;
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
  channel: string;
  /** De tekst om te tonen, met hoofdletters; de groep zelf gaat op kleine letters. */
  label: string | null;
  day: string | null;
  count: number;
  totalCents: number;
  firstAt: Date;
  lastAt: Date;
  samples: string[];
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
  const day = ymdKey(brusselsYMD(row.occurredAt));
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
  const groups = new Map<string, UnassignedGroup>();
  for (const row of await openRows()) {
    const { key, type, day } = groupKeyOf(row);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        type,
        source: row.source,
        channel: row.channelName,
        label: type === "text" ? incomeRuleLabel(row.description) : null,
        day,
        count: 0,
        totalCents: 0,
        firstAt: row.occurredAt,
        lastAt: row.occurredAt,
        samples: [],
      };
      groups.set(key, group);
    }
    group.count++;
    group.totalCents += row.amountCents;
    if (row.occurredAt < group.firstAt) group.firstAt = row.occurredAt;
    if (row.occurredAt > group.lastAt) group.lastAt = row.occurredAt;
    if (row.description && group.samples.length < 3 && !group.samples.includes(row.description)) {
      group.samples.push(row.description);
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

/** Een toewijzing met de hand ongedaan maken: de koppelregels nemen het weer over. */
export async function resetManualAssignment(id: string): Promise<"OK" | "NOT_FOUND" | "LOCKED"> {
  const row = await prisma.incomeTransaction.findUnique({ where: { id }, select: { rule: true, periodMonth: true } });
  if (!row || row.rule !== "MANUAL") return "NOT_FOUND";
  const isLocked = lockedMonthTest(await listClosedPeriods());
  if (isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null)) return "LOCKED";
  await prisma.incomeTransaction.update({
    where: { id },
    data: { rule: null, excluded: false, accountingCode: null, accountingCodeName: null, assignedById: null, assignedAt: null },
  });
  await rematchOpenTransactions();
  return "OK";
}

// -----------------------------------------------------------------------------
// Overzicht
// -----------------------------------------------------------------------------

export type PayoutWithCheck = MolliePayout & {
  check: { amountCents: number; checkedAt: Date; checkedByName: string | null } | null;
};

export type IncomeOverviewData = {
  overview: IncomeOverview;
  /** De bronnen waarvan ooit iets opgeladen werd, in de volgorde van de kolommen. */
  sources: IncomeSourceCode[];
  /** Mollie-betalingen zonder uitbetaling: die tellen pas in de maand van hun uitbetaling. */
  molliePending: { count: number; cents: number };
  /** Of er in de periode Mollie-betalingen staan, maar geen enkele kostenregel. */
  mollieWithoutFees: boolean;
  feeCode: CodeSnapshot | null;
  closed: ClosedPeriod[];
  payouts: PayoutWithCheck[];
  checks: IncomeCheck[];
};

export async function loadIncomeOverview(from: string, to: string): Promise<IncomeOverviewData> {
  const [rows, channels, { order }, pending, feeCode, closedPeriods, sources] = await Promise.all([
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
      },
    }),
    prisma.incomeChannel.findMany({ select: { id: true, accounts: { select: { from: true, bankAccount: true } } } }),
    codeContext(),
    prisma.incomeTransaction.aggregate({
      where: { source: "MOLLIE", kind: "PAYMENT", periodMonth: null },
      _count: true,
      _sum: { amountCents: true },
    }),
    feeAccountingCode(),
    listClosedPeriods(),
    prisma.incomeImport.findMany({ distinct: ["source"], select: { source: true } }),
  ]);

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
  const overview = computeIncomeOverview(withAccount, order);

  const payouts = groupMolliePayouts(
    rows.flatMap((row) =>
      row.source === "MOLLIE" && row.payoutReference
        ? [{ reference: row.payoutReference, kind: row.kind, amountCents: row.amountCents, occurredAt: row.occurredAt }]
        : [],
    ),
  );
  const checkRows = await prisma.incomePayoutCheck.findMany({
    where: { payoutReference: { in: payouts.map((payout) => payout.reference) } },
    select: { payoutReference: true, amountCents: true, checkedAt: true, checkedBy: { select: { name: true } } },
  });
  const checksByReference = new Map(checkRows.map((check) => [check.payoutReference, check]));
  const payoutsWithCheck: PayoutWithCheck[] = payouts.map((payout) => {
    const check = checksByReference.get(payout.reference);
    return {
      ...payout,
      check: check ? { amountCents: check.amountCents, checkedAt: check.checkedAt, checkedByName: check.checkedBy?.name ?? null } : null,
    };
  });

  const rowsPerSourceMonth = new Map<string, number>();
  const molliePaymentMonths = new Set<string>();
  const mollieFeeMonths = new Set<string>();
  for (const row of rows) {
    if (!row.periodMonth) continue;
    const month = dateToMonth(row.periodMonth);
    const key = `${row.source}:${month}`;
    rowsPerSourceMonth.set(key, (rowsPerSourceMonth.get(key) ?? 0) + 1);
    if (row.source === "MOLLIE" && row.kind === "PAYMENT") molliePaymentMonths.add(month);
    if (row.source === "MOLLIE" && row.kind === "FEE") mollieFeeMonths.add(month);
  }
  const counted = withAccount.filter((row) => !row.excluded);
  const inUse = new Set(sources.map((row) => row.source));
  const today = brusselsYMD(new Date());
  const checks = computeIncomeChecks({
    months: monthsBetween(from, to),
    currentMonth: `${today.year}-${String(today.month).padStart(2, "0")}`,
    sourcesInUse: inUse,
    rowsPerSourceMonth,
    molliePaymentMonths,
    mollieFeeMonths,
    payouts: payoutsWithCheck.map((payout) => ({ total: payout.total, checkedAmount: payout.check?.amountCents ?? null })),
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
  });

  return {
    overview,
    sources: INCOME_SOURCES.filter((source) => inUse.has(source)),
    molliePending: { count: pending._count, cents: pending._sum.amountCents ?? 0 },
    mollieWithoutFees: molliePaymentMonths.size > 0 && mollieFeeMonths.size === 0,
    feeCode,
    closed: closedPeriods.filter((period) => period.from <= to && from <= period.to),
    payouts: payoutsWithCheck,
    checks,
  };
}

/**
 * Een Mollie-uitbetaling afvinken: het totaal van de site stond zo op het
 * uittreksel. Het bedrag van nu wordt bewaard, zodat een latere export die de
 * som verandert, opvalt.
 */
export async function setPayoutCheck(
  reference: string,
  checked: boolean,
  userId: string | null,
): Promise<"OK" | "NOT_FOUND" | "LOCKED"> {
  const rows = await prisma.incomeTransaction.findMany({
    where: { source: "MOLLIE", payoutReference: reference },
    select: { amountCents: true, periodMonth: true },
  });
  if (rows.length === 0) return "NOT_FOUND";
  const isLocked = lockedMonthTest(await listClosedPeriods());
  const month = rows[0].periodMonth ? dateToMonth(rows[0].periodMonth) : null;
  if (isLocked(month)) return "LOCKED";
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

/** De transacties achter één cel van het overzicht, voor de lijst. */
export type TransactionFilter = {
  source: IncomeSourceCode | null;
  state: "all" | "open" | "matched" | "excluded";
  from: string | null;
  to: string | null;
  code: string | null;
  query: string | null;
};

export const TRANSACTION_PAGE = 300;

export async function listIncomeTransactions(filter: TransactionFilter) {
  const where = {
    ...(filter.source ? { source: filter.source } : {}),
    ...(filter.state === "open"
      ? { rule: null, excluded: false, kind: { in: ["PAYMENT" as const, "REFUND" as const] } }
      : filter.state === "matched"
        ? { rule: { not: null }, excluded: false }
        : filter.state === "excluded"
          ? { excluded: true }
          : {}),
    ...(filter.from || filter.to
      ? {
          periodMonth: {
            ...(filter.from ? { gte: monthToDate(filter.from) } : {}),
            ...(filter.to ? { lte: monthToDate(filter.to) } : {}),
          },
        }
      : {}),
    ...(filter.code ? { accountingCode: filter.code } : {}),
    ...(filter.query
      ? {
          OR: [
            { description: { contains: filter.query, mode: "insensitive" as const } },
            { providerId: { contains: filter.query } },
            { reference: { contains: filter.query } },
            { payoutReference: { contains: filter.query } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.incomeTransaction.findMany({
      where,
      orderBy: { occurredAt: "desc" },
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
        channel: { select: { identifier: true, label: true } },
        ticketPayment: { select: { order: { select: { eventId: true } } } },
        assignedBy: { select: { name: true } },
      },
    }),
    prisma.incomeTransaction.count({ where }),
  ]);
  return { rows, total };
}

// -----------------------------------------------------------------------------
// Imports, kanalen en onthouden teksten
// -----------------------------------------------------------------------------

export async function listIncomeImports() {
  const imports = await prisma.incomeImport.findMany({
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

export async function listIncomeChannels() {
  return prisma.incomeChannel.findMany({
    orderBy: [{ source: "asc" }, { identifier: "asc" }],
    select: {
      id: true,
      source: true,
      identifier: true,
      label: true,
      accounts: { orderBy: { from: "asc" }, select: { from: true, bankAccount: true } },
      codes: { orderBy: { from: "asc" }, select: { from: true, accountingCode: { select: { code: true, name: true } } } },
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

/** Waarom een transactie haar code kreeg, in woorden: de kolom "Waarom" van het controlebestand. */
function reasonOf(
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
    membershipPaymentId: string | null;
    uitleenPaymentId: string | null;
  },
  nl: boolean,
): string {
  const when = tx.assignedAt ? tx.assignedAt.toLocaleDateString(nl ? "nl-BE" : "en-GB", { timeZone: "Europe/Brussels" }) : null;
  const byWhom = [tx.assignedBy?.name ? `${nl ? "door" : "by"} ${tx.assignedBy.name}` : null, when ? `${nl ? "op" : "on"} ${when}` : null]
    .filter(Boolean)
    .join(" ");
  if (tx.kind === "FEE") {
    if (tx.source === "SUMUP") return nl ? "Transactiekosten van SumUp, op de betaling" : "SumUp transaction fee, on the payment";
    if (tx.source === "EUROPABANK") return nl ? "Commissie van Europabank, op de betaling" : "Europabank commission, on the payment";
    return nl ? "Kosten die Mollie inhield" : "Fees withheld by Mollie";
  }
  if (tx.kind === "RESERVE") return nl ? "Reserve van Mollie" : "Mollie rolling reserve";
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
      },
    }),
    prisma.incomeChannel.findMany({ select: { id: true, accounts: { select: { from: true, bankAccount: true } } } }),
    listAccountingCodes(),
    feeAccountingCode(),
    loadIncomeOverview(from, to),
  ]);

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
    reason: reasonOf(row, nl),
  }));

  // De tussenlaag: dezelfde groepen als Na te kijken, maar voor alles van de periode.
  const groups = new Map<string, WorkbookGroup & { codeSet: Set<string>; reasonSet: Set<string> }>();
  rows.forEach((row, index) => {
    if (row.kind !== "PAYMENT" && row.kind !== "REFUND") return;
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
    const line = quarterLineKey(transactions[index]);
    group.codeSet.add(line ?? (nl ? "telt niet mee" : "does not count"));
    group.reasonSet.add(transactions[index].reason);
  });

  const payoutDate = (date: Date) => date.toLocaleDateString(nl ? "nl-BE" : "en-GB", { timeZone: "Europe/Brussels" });
  const importCounts = new Map<string, number>();
  for (const row of rows) importCounts.set(row.importId, (importCounts.get(row.importId) ?? 0) + 1);
  const imports = await prisma.incomeImport.findMany({
    where: { id: { in: [...importCounts.keys()] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, fileName: true, source: true, createdAt: true, importedBy: { select: { name: true } } },
  });

  return {
    title: `${nl ? "Online inkomsten" : "Online income"} ${periodLabel(from, to, nl)}`,
    nl,
    transactions,
    codeOrder: new Map(codeList.map((code, index) => [codeKey(code.code), index])),
    mainNames: new Map(codeList.filter((code) => code.depth === 0).map((code) => [code.code, code.name])),
    feeCode,
    groups: [...groups.values()].map(({ codeSet, reasonSet, ...group }) => ({
      ...group,
      codes: [...codeSet].join(", "),
      reasons: [...reasonSet].slice(0, 5).join("; "),
    })),
    payouts: overviewData.payouts.map((payout) => ({
      reference: payout.reference,
      firstAt: payout.firstAt,
      lastAt: payout.lastAt,
      payments: payout.payments,
      refunds: payout.refunds,
      fees: payout.fees,
      reserve: payout.reserve,
      total: payout.total,
      checked: payout.check
        ? payout.check.amountCents === payout.total
          ? `${nl ? "ja" : "yes"}, ${payoutDate(payout.check.checkedAt)}${payout.check.checkedByName ? `, ${payout.check.checkedByName}` : ""}`
          : nl
            ? `afgevinkt op ${(payout.check.amountCents / 100).toFixed(2)}, nu anders`
            : `checked at ${(payout.check.amountCents / 100).toFixed(2)}, now different`
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
