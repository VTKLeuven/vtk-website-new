import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@vtk/db";
import { changeTransactions, listIncomeImports, loadIncomeOverview } from "@/lib/inkomsten/server";
import { deleteTransfer, knownBankAccounts, listTransfers, saveTransfer } from "@/lib/inkomsten/transferServer";

/**
 * Overschrijvingen met de hand tegen een echte database: toevoegen, aanpassen
 * (ook naar een andere rekening), meetellen in het overzicht, niet in de lijst
 * van Uploaden, niet terug naar de regels, een afgesloten maand, en
 * verwijderen. Alles is verzonnen en ligt in 2032.
 */
describe("overschrijvingen met de hand", () => {
  const tag = randomUUID().slice(0, 8);
  const accounts = { a: `BE00 TEST ${tag} 0001`, b: `BE00 TEST ${tag} 0002` };
  const digits = String(100000 + (parseInt(tag.slice(0, 5), 16) % 800000)).slice(0, 5);
  const codeNumber = `6${digits}`;
  let codeId = "";
  let transferId = "";
  let periodId = "";

  beforeAll(async () => {
    const code = await prisma.accountingCode.create({ data: { code: codeNumber, name: "Overschrijving test" } });
    codeId = code.id;
  });

  afterAll(async () => {
    if (periodId) await prisma.incomePeriod.deleteMany({ where: { id: periodId } });
    const channels = await prisma.incomeChannel.findMany({
      where: { source: "TRANSFER", identifier: { in: Object.values(accounts) } },
      select: { id: true },
    });
    const imports = await prisma.incomeTransaction.findMany({
      where: { channelId: { in: channels.map((channel) => channel.id) } },
      select: { importId: true },
    });
    await prisma.incomeImport.deleteMany({ where: { id: { in: imports.map((row) => row.importId) } } });
    await prisma.incomeChannel.deleteMany({ where: { id: { in: channels.map((channel) => channel.id) } } });
    if (codeId) await prisma.accountingCode.deleteMany({ where: { id: codeId } });
  });

  it("voegt een overschrijving toe met haar rekening, code en maand", async () => {
    const outcome = await saveTransfer(
      { id: null, day: "2032-03-31", amount: "68,75", bankAccount: accounts.a, description: "inschrijving", accountingCodeId: codeId },
      null,
    );
    expect(outcome).toMatchObject({ ok: true, created: true, amountCents: 6875 });
    if (!outcome.ok) return;
    transferId = outcome.id;
    const row = await prisma.incomeTransaction.findUniqueOrThrow({
      where: { id: transferId },
      select: { source: true, kind: true, rule: true, accountingCode: true, periodMonth: true, occurredAt: true, import: { select: { format: true } } },
    });
    expect(row).toMatchObject({ source: "TRANSFER", kind: "PAYMENT", rule: "MANUAL", accountingCode: codeNumber, import: { format: "manual" } });
    // 31 maart om 12:00 in Brussel, zomertijd: de maand blijft maart.
    expect(row.periodMonth?.toISOString().slice(0, 10)).toBe("2032-03-01");
    expect(row.occurredAt.toISOString()).toBe("2032-03-31T10:00:00.000Z");
    expect(await knownBankAccounts()).toContain(accounts.a);
    expect(await listTransfers("2032-01", "2032-03")).toEqual([
      expect.objectContaining({ id: transferId, day: "2032-03-31", amountCents: 6875, bankAccount: accounts.a, accountingCodeId: codeId }),
    ]);
  });

  it("telt mee in het overzicht op haar rekening, maar staat niet bij Uploaden", async () => {
    const data = await loadIncomeOverview("2032-03", "2032-03");
    expect(data.sources).toContain("TRANSFER");
    expect(data.overview.codes.find((row) => row.code === codeNumber)?.bySource.TRANSFER).toBe(6875);
    expect(data.overview.accounts.find((row) => row.bankAccount === accounts.a)?.total).toBe(6875);
    expect(data.checks.find((check) => check.key === "coverage")).toMatchObject({ ok: true });
    const imports = await listIncomeImports();
    expect(imports.some((row) => row.source === "TRANSFER")).toBe(false);
  });

  it("gaat niet terug naar de regels: een overschrijving heeft er geen", async () => {
    const outcome = await changeTransactions({ ids: [transferId] }, { reset: true }, null);
    expect(outcome).toMatchObject({ ok: true, count: 0 });
    expect(await prisma.incomeTransaction.findUniqueOrThrow({ where: { id: transferId }, select: { rule: true } })).toEqual({
      rule: "MANUAL",
    });
  });

  it("past dag, bedrag en rekening aan; een terugbetaling is negatief", async () => {
    const outcome = await saveTransfer(
      { id: transferId, day: "2032-04-01", amount: "-12,50", bankAccount: accounts.b, description: "terug", accountingCodeId: codeId },
      null,
    );
    expect(outcome).toMatchObject({ ok: true, created: false, amountCents: -1250, bankAccount: accounts.b });
    const row = await prisma.incomeTransaction.findUniqueOrThrow({
      where: { id: transferId },
      select: { kind: true, periodMonth: true, channel: { select: { identifier: true, accounts: { select: { bankAccount: true } } } } },
    });
    expect(row.kind).toBe("REFUND");
    expect(row.periodMonth?.toISOString().slice(0, 10)).toBe("2032-04-01");
    expect(row.channel).toEqual({ identifier: accounts.b, accounts: [{ bankAccount: accounts.b }] });
    expect(await listTransfers("2032-03", "2032-03")).toEqual([]);
  });

  it("weigert wat een afgesloten maand raakt, ook bij aanpassen van de oude dag", async () => {
    const period = await prisma.incomePeriod.create({
      data: { fromMonth: new Date("2032-04-01T00:00:00Z"), toMonth: new Date("2032-04-01T00:00:00Z") },
    });
    periodId = period.id;
    expect(
      await saveTransfer({ id: null, day: "2032-04-15", amount: "5", bankAccount: accounts.a, description: "", accountingCodeId: codeId }, null),
    ).toEqual({ ok: false, error: "LOCKED" });
    // Van april (afgesloten) naar mei: de oude maand verandert ook.
    expect(
      await saveTransfer({ id: transferId, day: "2032-05-02", amount: "5", bankAccount: accounts.a, description: "", accountingCodeId: codeId }, null),
    ).toEqual({ ok: false, error: "LOCKED" });
    expect(await deleteTransfer(transferId)).toEqual({ ok: false, error: "LOCKED" });
    expect((await listTransfers("2032-04", "2032-04"))[0]).toMatchObject({ locked: true });
    await prisma.incomePeriod.delete({ where: { id: period.id } });
    periodId = "";
  });

  it("verwijdert de overschrijving met haar import", async () => {
    const before = await prisma.incomeTransaction.findUniqueOrThrow({ where: { id: transferId }, select: { importId: true } });
    expect(await deleteTransfer(transferId)).toMatchObject({ ok: true, amountCents: -1250, bankAccount: accounts.b });
    expect(await prisma.incomeTransaction.findUnique({ where: { id: transferId } })).toBeNull();
    expect(await prisma.incomeImport.findUnique({ where: { id: before.importId } })).toBeNull();
    expect(await deleteTransfer(transferId)).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
