import "server-only";

import { prisma } from "@vtk/db";
import type { IncomeSource } from "@prisma/client";
import { matchTransaction, reviewDay, type CodeSnapshot, type LendingSpan, type MatchResult } from "./match";
import { checkLendingDays, overlappingLending, type LendingDays } from "./lending";
import { dateToMonth } from "./parse";
import {
  applyMatchUpdates,
  channelLendingContext,
  listClosedPeriods,
  lockedMonthTest,
  matchContextsFor,
  matchUpdateOf,
  rematchOpenTransactions,
  REMATCH_SELECT,
  REMATCHABLE,
  type MatchUpdate,
  type RematchRow,
} from "./server";
import { reviewDaysWhere } from "./transactionFilter";

/**
 * De uitleningen van een toestel (koppelregel 6, `IncomeChannelLending`): de
 * lijst op Na te kijken, bewaren, verwijderen en overnemen wat met de hand
 * gezet werd. Een uitlening is een koppelregel en geen eenmalige wijziging:
 * na elke wijziging koppelt de site opnieuw, en wat later opgeladen wordt,
 * krijgt ze ook. Ze verandert enkel de code, nooit de maand. Zie
 * docs/inkomsten.md, "Uitleningen".
 */

export type LendingError =
  | "BAD_DATE"
  | "LENDING_ORDER"
  | "LENDING_TOO_LONG"
  | "LENDING_OVERLAP"
  | "NOT_FOUND"
  | "CODE_NOT_FOUND"
  | "LOCKED";

/** Een `@db.Date` als "2026-09-16", en terug. */
function ymdOf(value: Date): string {
  return value.toISOString().slice(0, 10);
}
function dateOf(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/** Wat met de hand gezet werd en meetelt, op de dagen van een uitlening (van 9:00 tot 9:00). */
function manualWhere(channelId: string, days: LendingDays) {
  return {
    channelId,
    rule: "MANUAL" as const,
    excluded: false,
    kind: { in: ["PAYMENT" as const, "REFUND" as const] },
    ...reviewDaysWhere(days.from, days.to),
  };
}

/**
 * Of een rij die met de hand gezet werd, in de uitlening kan opgaan zonder dat
 * iets verandert: de koppelregels zouden haar aan deze uitlening geven, met de
 * code die ze al heeft. Een andere code koos iemand bewust; een rij die een
 * exactere regel (de site, een code in de tekst, een kassa) zou krijgen, blijft
 * ook met de hand, anders verandert ze bij het volgende koppelen alsnog.
 */
function canTakeOver(row: RematchRow, match: MatchResult, lendingId: string): boolean {
  return match.rule === "CHANNEL_LENDING" && match.channelLendingId === lendingId && match.code?.code === row.accountingCode;
}

export type ChannelLendingItem = {
  id: string;
  channelId: string;
  channel: string;
  source: IncomeSource;
  days: LendingDays;
  /** Null: de code werd uit het register verwijderd, en dan koppelt de uitlening niets. */
  code: { id: string; code: string; name: string } | null;
  /** De transacties die de uitlening nu koppelt. */
  linkedCount: number;
  linkedCents: number;
  /** Wat op die dagen met de hand een code kreeg (en meetelt), in open maanden. */
  manualCount: number;
  /** Daarvan: wat "Neem over" in de uitlening zet. */
  takeOverCount: number;
  takeOverCents: number;
  createdBy: string | null;
  createdAt: Date;
  updatedBy: string | null;
  updatedAt: Date;
  /** Een gekoppelde transactie valt in een afgesloten periode: aanpassen en verwijderen kan niet. */
  locked: boolean;
};

/** Alle uitleningen, de laatste dagen eerst. */
export async function listChannelLendings(): Promise<ChannelLendingItem[]> {
  const lendings = await prisma.incomeChannelLending.findMany({
    orderBy: [{ fromDay: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      channelId: true,
      fromDay: true,
      toDay: true,
      createdAt: true,
      updatedAt: true,
      channel: { select: { identifier: true, label: true, source: true } },
      accountingCode: { select: { id: true, code: true, name: true } },
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
    },
  });
  if (lendings.length === 0) return [];
  const ids = lendings.map((lending) => lending.id);
  const isLocked = lockedMonthTest(await listClosedPeriods());

  const [linked, linkedMonths, manualRows] = await Promise.all([
    prisma.incomeTransaction.groupBy({
      by: ["channelLendingId"],
      where: { channelLendingId: { in: ids } },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.incomeTransaction.groupBy({ by: ["channelLendingId", "periodMonth"], where: { channelLendingId: { in: ids } } }),
    prisma.incomeTransaction.findMany({
      where: { OR: lendings.map((lending) => manualWhere(lending.channelId, { from: ymdOf(lending.fromDay), to: ymdOf(lending.toDay) })) },
      select: REMATCH_SELECT,
    }),
  ]);
  const linkedOf = new Map(linked.map((row) => [row.channelLendingId, row]));
  const lockedIds = new Set(
    linkedMonths.flatMap((row) => (isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null) ? [row.channelLendingId] : [])),
  );
  const openManual = manualRows.filter((row) => !isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null));
  const contextOf = openManual.length > 0 ? await matchContextsFor(openManual) : null;

  return lendings.map((lending) => {
    const days = { from: ymdOf(lending.fromDay), to: ymdOf(lending.toDay) };
    const manual = openManual.filter((row) => {
      if (row.channelId !== lending.channelId) return false;
      const day = reviewDay(row.occurredAt);
      return days.from <= day && day <= days.to;
    });
    const takeOver = contextOf ? manual.filter((row) => canTakeOver(row, matchTransaction(row, contextOf(row)), lending.id)) : [];
    const own = linkedOf.get(lending.id);
    return {
      id: lending.id,
      channelId: lending.channelId,
      channel: lending.channel.label || lending.channel.identifier,
      source: lending.channel.source,
      days,
      code: lending.accountingCode,
      linkedCount: own?._count._all ?? 0,
      linkedCents: own?._sum.amountCents ?? 0,
      manualCount: manual.length,
      takeOverCount: takeOver.length,
      takeOverCents: takeOver.reduce((sum, row) => sum + row.amountCents, 0),
      createdBy: lending.createdBy?.name ?? null,
      createdAt: lending.createdAt,
      updatedBy: lending.updatedBy?.name ?? null,
      updatedAt: lending.updatedAt,
      locked: lockedIds.has(lending.id),
    };
  });
}

export type LendingInput = {
  /** Null: een nieuwe uitlening. */
  id: string | null;
  channelId: string;
  fromDay: string;
  /** Leeg: dezelfde dag als de eerste. */
  toDay: string;
  accountingCodeId: string;
};

export type LendingSaveOutcome =
  | {
      ok: true;
      id: string;
      created: boolean;
      channel: string;
      days: LendingDays;
      code: CodeSnapshot;
      /** De transacties die de uitlening na het koppelen heeft. */
      count: number;
      /** Wat op die dagen met de hand gezet werd: dat blijft. */
      manualKept: number;
    }
  | { ok: false; error: LendingError };

/**
 * Een uitlening bewaren en opnieuw koppelen. Wat een wijziging zou doen in een
 * afgesloten periode, weigert de site (`LOCKED`): opnieuw koppelen slaat die
 * over, dus anders bleef er een rij achter met een uitlening die er niet meer
 * is, of een uitlening die in die maanden niets doet.
 */
export async function saveChannelLending(input: LendingInput, userId: string | null): Promise<LendingSaveOutcome> {
  const days = checkLendingDays(input.fromDay, input.toDay);
  if (!days.ok) return days;
  const [channel, code, existing] = await Promise.all([
    prisma.incomeChannel.findUnique({ where: { id: input.channelId }, select: { id: true, identifier: true, label: true } }),
    prisma.accountingCode.findUnique({ where: { id: input.accountingCodeId }, select: { id: true, code: true, name: true } }),
    input.id ? prisma.incomeChannelLending.findUnique({ where: { id: input.id }, select: { id: true } }) : null,
  ]);
  if (!channel || (input.id && !existing)) return { ok: false, error: "NOT_FOUND" };
  if (!code) return { ok: false, error: "CODE_NOT_FOUND" };

  const current = await channelLendingContext();
  if (overlappingLending(current.get(channel.id) ?? [], days, input.id)) return { ok: false, error: "LENDING_OVERLAP" };

  // De uitleningen zoals ze na het bewaren zouden zijn.
  const placeholder = input.id ?? "nieuw";
  const next = new Map<string, LendingSpan[]>();
  for (const [channelId, spans] of current) next.set(channelId, spans.filter((span) => span.id !== input.id));
  next.set(channel.id, [
    ...(next.get(channel.id) ?? []),
    { id: placeholder, from: days.from, to: days.to, code: { code: code.code, name: code.name } },
  ]);
  if (await changesClosedMonths(input.id, channel.id, days, current, next)) return { ok: false, error: "LOCKED" };

  const data = {
    channelId: channel.id,
    fromDay: dateOf(days.from),
    toDay: dateOf(days.to),
    accountingCodeId: code.id,
    updatedById: userId,
  };
  const saved = input.id
    ? await prisma.incomeChannelLending.update({ where: { id: input.id }, data, select: { id: true } })
    : await prisma.incomeChannelLending.create({ data: { ...data, createdById: userId }, select: { id: true } });
  await rematchOpenTransactions();

  const [count, manualKept] = await Promise.all([
    prisma.incomeTransaction.count({ where: { channelLendingId: saved.id } }),
    prisma.incomeTransaction.count({ where: manualWhere(channel.id, days) }),
  ]);
  return {
    ok: true,
    id: saved.id,
    created: !input.id,
    channel: channel.label || channel.identifier,
    days: { from: days.from, to: days.to },
    code: { code: code.code, name: code.name },
    count,
    manualKept,
  };
}

/**
 * Of het vervangen van de uitleningen `current` door `next` een transactie in
 * een afgesloten periode een andere koppeling zou geven. Wat het raakt: wat de
 * uitlening nu koppelt, en wat de koppelregels op haar nieuwe dagen mogen
 * herzien. Een rij die er al anders bij stond (een code die sindsdien hernoemd
 * werd), telt niet: enkel wat deze wijziging verandert.
 */
async function changesClosedMonths(
  id: string | null,
  channelId: string,
  days: LendingDays,
  current: Map<string, LendingSpan[]>,
  next: Map<string, LendingSpan[]>,
): Promise<boolean> {
  const periods = await listClosedPeriods();
  if (periods.length === 0) return false;
  const isLocked = lockedMonthTest(periods);
  const rows = await prisma.incomeTransaction.findMany({
    where: {
      AND: [
        REMATCHABLE,
        { OR: [...(id ? [{ channelLendingId: id }] : []), { channelId, ...reviewDaysWhere(days.from, days.to) }] },
      ],
    },
    select: REMATCH_SELECT,
  });
  const closed = rows.filter((row) => isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null));
  if (closed.length === 0) return false;
  const [before, after] = await Promise.all([
    matchContextsFor(closed, { channelLendings: current }),
    matchContextsFor(closed, { channelLendings: next }),
  ]);
  const key = (match: MatchResult) => JSON.stringify([match.rule, match.code?.code ?? null, match.channelLendingId]);
  return closed.some((row) => key(matchTransaction(row, before(row))) !== key(matchTransaction(row, after(row))));
}

export type LendingDeleteOutcome =
  | { ok: true; channel: string; days: LendingDays; count: number }
  | { ok: false; error: "NOT_FOUND" | "LOCKED" };

/**
 * Een uitlening verwijderen. Haar transacties gaan terug naar de koppelregels:
 * meestal de standaardcode van het kanaal, anders Na te kijken.
 */
export async function deleteChannelLending(id: string): Promise<LendingDeleteOutcome> {
  const lending = await prisma.incomeChannelLending.findUnique({
    where: { id },
    select: { fromDay: true, toDay: true, channel: { select: { identifier: true, label: true } } },
  });
  if (!lending) return { ok: false, error: "NOT_FOUND" };
  const linked = await prisma.incomeTransaction.findMany({ where: { channelLendingId: id }, select: { periodMonth: true } });
  const isLocked = lockedMonthTest(await listClosedPeriods());
  if (linked.some((row) => isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null))) return { ok: false, error: "LOCKED" };
  await prisma.incomeChannelLending.delete({ where: { id } });
  await rematchOpenTransactions();
  return {
    ok: true,
    channel: lending.channel.label || lending.channel.identifier,
    days: { from: ymdOf(lending.fromDay), to: ymdOf(lending.toDay) },
    count: linked.length,
  };
}

export type LendingTakeOverOutcome =
  | { ok: true; channel: string; days: LendingDays; count: number; cents: number; kept: number }
  | { ok: false; error: "NOT_FOUND" | "CODE_NOT_FOUND" };

/**
 * Wat op de dagen van een uitlening met de hand dezelfde code kreeg, in de
 * uitlening zetten: de dagen die met het oude formulier "Een hele dag van een
 * kanaal anders toewijzen" gezet werden. De code verandert niet, dus geen
 * enkel totaal; enkel de regel, zodat ze in de lijst bij de uitlening staan en
 * met haar meegaan. Een expliciete actie, nooit bij het bewaren: wat met de
 * hand een code kreeg, blijft anders gewoon staan. Een afgesloten periode
 * blijft zoals ze is.
 */
export async function takeOverChannelLending(id: string): Promise<LendingTakeOverOutcome> {
  const lending = await prisma.incomeChannelLending.findUnique({
    where: { id },
    select: { channelId: true, fromDay: true, toDay: true, accountingCodeId: true, channel: { select: { identifier: true, label: true } } },
  });
  if (!lending) return { ok: false, error: "NOT_FOUND" };
  if (!lending.accountingCodeId) return { ok: false, error: "CODE_NOT_FOUND" };
  const days = { from: ymdOf(lending.fromDay), to: ymdOf(lending.toDay) };
  const rows = await prisma.incomeTransaction.findMany({ where: manualWhere(lending.channelId, days), select: REMATCH_SELECT });
  const isLocked = lockedMonthTest(await listClosedPeriods());
  const open = rows.filter((row) => !isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null));
  if (open.length === 0) return { ok: false, error: "NOT_FOUND" };
  const contextOf = await matchContextsFor(open);

  const updates = new Map<string, { data: MatchUpdate & { assignedById: null; assignedAt: null }; ids: string[] }>();
  let cents = 0;
  for (const row of open) {
    const match = matchTransaction(row, contextOf(row));
    if (!canTakeOver(row, match, id)) continue;
    const update = matchUpdateOf(row, match);
    if (!update) continue;
    cents += row.amountCents;
    // Niet meer met de hand: wie toewees, hoort bij die regel.
    const data = { ...update, assignedById: null, assignedAt: null };
    const key = JSON.stringify(data);
    const group = updates.get(key);
    if (group) group.ids.push(row.id);
    else updates.set(key, { data, ids: [row.id] });
  }
  const count = await applyMatchUpdates(updates.values());
  if (count === 0) return { ok: false, error: "NOT_FOUND" };
  return {
    ok: true,
    channel: lending.channel.label || lending.channel.identifier,
    days,
    count,
    cents,
    kept: open.length - count,
  };
}

/** Wat Transacties boven de lijst zegt bij `?uitlening=`: welk toestel, welke dagen. */
export async function describeChannelLending(
  id: string,
): Promise<{ channel: string; source: IncomeSource; days: LendingDays } | null> {
  const lending = await prisma.incomeChannelLending.findUnique({
    where: { id },
    select: { fromDay: true, toDay: true, channel: { select: { identifier: true, label: true, source: true } } },
  });
  if (!lending) return null;
  return {
    channel: lending.channel.label || lending.channel.identifier,
    source: lending.channel.source,
    days: { from: ymdOf(lending.fromDay), to: ymdOf(lending.toDay) },
  };
}
