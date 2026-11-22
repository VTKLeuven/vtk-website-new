import "server-only";

import { prisma } from "@vtk/db";
import type { CodeSnapshot } from "./match";
import { CHANNEL_FROM_START } from "./overview";
import { dateToMonth, monthToDate } from "./parse";
import { listClosedPeriods, lockedMonthTest } from "./server";
import { checkTransfer, MANUAL_FORMAT, transferMoment } from "./transfer";

/**
 * De overschrijvingen met de hand (`IncomeSource` `TRANSFER`): geld dat iemand
 * rechtstreeks op een rekening van de kring stortte. Er is geen export, en een
 * lijn van een lid op een bankafschrift bewaart de site bewust niet, dus voert
 * Beheer ze per stuk in.
 *
 * Elke overschrijving is een gewone `IncomeTransaction` (regel MANUAL, met haar
 * code), zodat het overzicht, het kwartaalblad en het controlebestand ze zonder
 * eigen code meetellen: een kolom per rekening onder "Overschrijvingen". Ze
 * hangt aan een eigen `IncomeImport` (formaat "manual"), zodat verwijderen en
 * elke bestaande query werken zoals bij een export, en aan een kanaal per
 * rekening, dat die rekening vanaf het begin heeft. Zie docs/inkomsten.md,
 * "Overschrijvingen".
 */

export type TransferError = "BAD_DATE" | "BAD_AMOUNT" | "ACCOUNT_REQUIRED" | "CODE_NOT_FOUND" | "NOT_FOUND" | "LOCKED";

/**
 * De rekeningen die de site kent: die van de kanalen in Instellingen, en die
 * van eerdere overschrijvingen. Zo staat er geen rekeningnummer in de code.
 */
export async function knownBankAccounts(): Promise<string[]> {
  const rows = await prisma.incomeChannelAccount.findMany({ distinct: ["bankAccount"], select: { bankAccount: true } });
  return rows.map((row) => row.bankAccount).sort((a, b) => a.localeCompare(b));
}

export type TransferItem = {
  id: string;
  /** "2026-09-16" */
  day: string;
  amountCents: number;
  bankAccount: string;
  code: CodeSnapshot | null;
  /** De code in het register, om ze aan te passen; null als ze er niet meer staat. */
  accountingCodeId: string | null;
  description: string | null;
  /** Met de hand uitgesloten in Transacties: telt niet mee. */
  excluded: boolean;
  enteredBy: string | null;
  enteredAt: Date;
  /** In een afgesloten periode: aanpassen en verwijderen kan niet. */
  locked: boolean;
};

/** De overschrijvingen die in een periode tellen ("2026-07" tot "2026-09"), op dag. */
export async function listTransfers(from: string, to: string): Promise<TransferItem[]> {
  const [rows, isLocked] = await Promise.all([
    prisma.incomeTransaction.findMany({
      where: { source: "TRANSFER", periodMonth: { gte: monthToDate(from), lte: monthToDate(to) } },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        occurredAt: true,
        periodMonth: true,
        amountCents: true,
        accountingCode: true,
        accountingCodeName: true,
        description: true,
        excluded: true,
        createdAt: true,
        channel: { select: { identifier: true } },
        import: { select: { createdAt: true, importedBy: { select: { name: true } } } },
      },
    }),
    listClosedPeriods().then(lockedMonthTest),
  ]);
  const codes = [...new Set(rows.flatMap((row) => (row.accountingCode ? [row.accountingCode] : [])))];
  const codeIds = codes.length
    ? new Map(
        (await prisma.accountingCode.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } })).map((code) => [
          code.code,
          code.id,
        ]),
      )
    : new Map<string, string>();
  return rows.map((row) => {
    const month = row.periodMonth ? dateToMonth(row.periodMonth) : null;
    return {
      id: row.id,
      day: dayOf(row.occurredAt),
      amountCents: row.amountCents,
      bankAccount: row.channel?.identifier ?? "",
      code: row.accountingCode ? { code: row.accountingCode, name: row.accountingCodeName ?? "" } : null,
      accountingCodeId: row.accountingCode ? (codeIds.get(row.accountingCode) ?? null) : null,
      description: row.description,
      excluded: row.excluded,
      enteredBy: row.import.importedBy?.name ?? null,
      enteredAt: row.import.createdAt,
      locked: isLocked(month),
    };
  });
}

/** De Brusselse dag van een moment, als "2026-09-16". */
function dayOf(at: Date): string {
  return at.toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
}

export type TransferInput = {
  /** Null: een nieuwe overschrijving. */
  id: string | null;
  day: string;
  amount: string;
  bankAccount: string;
  description: string;
  accountingCodeId: string;
};

export type TransferSaveOutcome =
  | { ok: true; id: string; created: boolean; day: string; amountCents: number; bankAccount: string; code: CodeSnapshot }
  | { ok: false; error: TransferError };

/**
 * Een overschrijving bewaren. Een afgesloten maand weigert ze (`LOCKED`), voor
 * de nieuwe dag en, bij aanpassen, voor de oude: wat bij de boekhouder ligt,
 * verandert niet meer.
 */
export async function saveTransfer(input: TransferInput, userId: string | null): Promise<TransferSaveOutcome> {
  const fields = checkTransfer(input);
  if (!fields.ok) return fields;
  const [code, existing, isLocked] = await Promise.all([
    prisma.accountingCode.findUnique({ where: { id: input.accountingCodeId }, select: { code: true, name: true } }),
    input.id
      ? prisma.incomeTransaction.findFirst({ where: { id: input.id, source: "TRANSFER" }, select: { importId: true, periodMonth: true } })
      : null,
    listClosedPeriods().then(lockedMonthTest),
  ]);
  if (input.id && !existing) return { ok: false, error: "NOT_FOUND" };
  if (!code) return { ok: false, error: "CODE_NOT_FOUND" };
  const month = fields.day.slice(0, 7);
  if (isLocked(month) || (existing && isLocked(existing.periodMonth ? dateToMonth(existing.periodMonth) : null))) {
    return { ok: false, error: "LOCKED" };
  }

  // Eén kanaal per rekening, met die rekening vanaf het begin: zo telt de
  // overschrijving op haar rekening in het overzicht en het kwartaalblad.
  const channel = await prisma.incomeChannel.upsert({
    where: { source_identifier: { source: "TRANSFER", identifier: fields.bankAccount } },
    create: { source: "TRANSFER", identifier: fields.bankAccount },
    update: {},
    select: { id: true },
  });
  const from = new Date(`${CHANNEL_FROM_START}T00:00:00Z`);
  await prisma.incomeChannelAccount.upsert({
    where: { channelId_from: { channelId: channel.id, from } },
    create: { channelId: channel.id, from, bankAccount: fields.bankAccount },
    update: {},
  });

  const occurredAt = transferMoment(fields.day);
  const data = {
    occurredAt,
    periodMonth: monthToDate(month),
    // Een terugbetaling per overschrijving vult Beheer negatief in.
    kind: fields.amountCents < 0 ? ("REFUND" as const) : ("PAYMENT" as const),
    amountCents: fields.amountCents,
    description: fields.description,
    channelId: channel.id,
    accountingCode: code.code,
    accountingCodeName: code.name,
    rule: "MANUAL" as const,
    assignedById: userId,
    assignedAt: new Date(),
  };

  if (existing && input.id) {
    await prisma.$transaction([
      prisma.incomeTransaction.update({ where: { id: input.id }, data }),
      prisma.incomeImport.update({ where: { id: existing.importId }, data: { firstAt: occurredAt, lastAt: occurredAt } }),
    ]);
    return { ok: true, id: input.id, created: false, day: fields.day, amountCents: fields.amountCents, bankAccount: fields.bankAccount, code };
  }

  const created = await prisma.$transaction(async (tx) => {
    const entry = await tx.incomeImport.create({
      data: {
        source: "TRANSFER",
        fileName: "Overschrijving",
        format: MANUAL_FORMAT,
        rowCount: 1,
        createdCount: 1,
        duplicateCount: 0,
        skippedCount: 0,
        firstAt: occurredAt,
        lastAt: occurredAt,
        importedById: userId,
      },
      select: { id: true },
    });
    return tx.incomeTransaction.create({
      data: { ...data, source: "TRANSFER", externalKey: `TRANSFER:${entry.id}`, importId: entry.id },
      select: { id: true },
    });
  });
  return { ok: true, id: created.id, created: true, day: fields.day, amountCents: fields.amountCents, bankAccount: fields.bankAccount, code };
}

export type TransferDeleteOutcome =
  | { ok: true; day: string; amountCents: number; bankAccount: string }
  | { ok: false; error: "NOT_FOUND" | "LOCKED" };

/** Een overschrijving verwijderen: ze verdwijnt uit het overzicht van haar maand. */
export async function deleteTransfer(id: string): Promise<TransferDeleteOutcome> {
  const row = await prisma.incomeTransaction.findFirst({
    where: { id, source: "TRANSFER" },
    select: { importId: true, occurredAt: true, periodMonth: true, amountCents: true, channel: { select: { identifier: true } } },
  });
  if (!row) return { ok: false, error: "NOT_FOUND" };
  const isLocked = lockedMonthTest(await listClosedPeriods());
  if (isLocked(row.periodMonth ? dateToMonth(row.periodMonth) : null)) return { ok: false, error: "LOCKED" };
  // De import gaat mee, en met haar de transactie (onDelete Cascade).
  await prisma.incomeImport.delete({ where: { id: row.importId } });
  return { ok: true, day: dayOf(row.occurredAt), amountCents: row.amountCents, bankAccount: row.channel?.identifier ?? "" };
}
