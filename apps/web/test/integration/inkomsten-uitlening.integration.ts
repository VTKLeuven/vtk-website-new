import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@vtk/db";
import { importIncomeExport, rematchOpenTransactions } from "@/lib/inkomsten/server";
import {
  deleteChannelLending,
  listChannelLendings,
  saveChannelLending,
  takeOverChannelLending,
} from "@/lib/inkomsten/lendingServer";

/**
 * Een uitlening van een toestel tegen een echte database: bewaren, wat later
 * opgeladen wordt, aanpassen, overlappen, een afgesloten periode, overnemen
 * wat met de hand gezet werd, en verwijderen. De SumUp van een post (met een
 * standaardcode) wordt van dinsdag 2 tot woensdag 3 maart 2032 uitgeleend.
 * Alles is verzonnen en ligt in 2032, zodat het niets van de echte site raakt.
 */
describe("uitlening van een toestel", () => {
  const tag = randomUUID().slice(0, 8);
  const email = `uitlening-${tag}@voorbeeld.invalid`;
  // Zes cijfers die uniek zijn per run: een code in het register is uniek.
  const digits = String(100000 + (parseInt(tag.slice(0, 5), 16) % 800000)).slice(0, 5);
  const codes = { post: `9${digits}`, lent: `8${digits}`, other: `7${digits}` };
  const codeIds: Record<keyof typeof codes, string> = { post: "", lent: "", other: "" };
  const importIds: string[] = [];
  let channelId = "";
  let lendingId = "";
  let periodId = "";

  const header =
    "email,Datum,Transactie-ID,Transactietype,Status,Kaarttype,Laatste 4 cijfers,Verwerken als,Betaalmethode,Invoerwijze,Autorisatiecode,Beschrijving,Totaal bedrag,Netto verkoop,Belastingbedrag,Bedrag fooi,Transactiekosten,Uitbetaling,Uitbetaling datum,Uitbetalingsnummer,Kenmerk";
  const sale = (id: string, at: string, amount: string) =>
    `${email},${at},T${tag}${id},Omzet,Succesvol,VISA,4321,DEBIT,POS,CONTACTLESS,AUTH${id},,${amount},${amount},0.0,0.0,0.00,${amount},,,`;

  async function upload(lines: string[]) {
    const outcome = await importIncomeExport([header, ...lines].join("\n"), "sumup.csv", { dryRun: false, userId: null });
    if (!outcome.ok) throw new Error(`import mislukt: ${outcome.error}`);
    if (outcome.importId) importIds.push(outcome.importId);
    return outcome.summary;
  }
  const row = (id: string) =>
    prisma.incomeTransaction.findFirstOrThrow({
      where: { providerId: `T${tag}${id}` },
      select: { id: true, rule: true, accountingCode: true, channelLendingId: true, amountCents: true },
    });
  const totalsByCode = async () => {
    const groups = await prisma.incomeTransaction.groupBy({
      by: ["accountingCode"],
      where: { channelId, kind: "PAYMENT" },
      _sum: { amountCents: true },
    });
    return Object.fromEntries(groups.map((group) => [group.accountingCode ?? "-", group._sum.amountCents]));
  };

  beforeAll(async () => {
    for (const key of Object.keys(codes) as Array<keyof typeof codes>) {
      const created = await prisma.accountingCode.create({ data: { code: codes[key], name: `Uitlening test ${key}` } });
      codeIds[key] = created.id;
    }
    // Ma 1 tot do 4 maart 2032, Brusselse tijd (wintertijd).
    const summary = await upload([
      sale("01", "2032-03-01 12:00:00", "10.00"),
      sale("02", "2032-03-02 12:00:00", "20.00"),
      sale("03", "2032-03-02 14:00:00", "21.00"),
      sale("04", "2032-03-03 12:00:00", "30.00"),
      // 2:00 in de nacht na woensdag hoort nog bij woensdag (een dag loopt tot 9:00).
      sale("05", "2032-03-04 02:00:00", "31.00"),
      sale("06", "2032-03-04 12:00:00", "40.00"),
    ]);
    expect(summary.created).toBe(6);
    const channel = await prisma.incomeChannel.findUniqueOrThrow({
      where: { source_identifier: { source: "SUMUP", identifier: email } },
      select: { id: true },
    });
    channelId = channel.id;
    await prisma.incomeChannelCode.create({
      data: { channelId, from: new Date("2032-01-01T00:00:00Z"), accountingCodeId: codeIds.post },
    });
    await rematchOpenTransactions();
    // Twee rijen kregen al met de hand een code, zoals met het oude dagformulier.
    await prisma.incomeTransaction.update({
      where: { id: (await row("03")).id },
      data: { rule: "MANUAL", accountingCode: codes.lent, accountingCodeName: "Uitlening test lent" },
    });
    await prisma.incomeTransaction.update({
      where: { id: (await row("04")).id },
      data: { rule: "MANUAL", accountingCode: codes.other, accountingCodeName: "Uitlening test other" },
    });
  });

  afterAll(async () => {
    if (periodId) await prisma.incomePeriod.deleteMany({ where: { id: periodId } });
    await prisma.incomeTransaction.deleteMany({ where: { importId: { in: importIds } } });
    await prisma.incomeImport.deleteMany({ where: { id: { in: importIds } } });
    if (channelId) await prisma.incomeChannel.deleteMany({ where: { id: channelId } });
    await prisma.accountingCode.deleteMany({ where: { id: { in: Object.values(codeIds).filter(Boolean) } } });
  });

  it("geeft de dagen de code, behalve wat met de hand gezet werd", async () => {
    expect((await row("02")).rule).toBe("CHANNEL_DEFAULT");
    const outcome = await saveChannelLending(
      { id: null, channelId, fromDay: "2032-03-02", toDay: "2032-03-03", accountingCodeId: codeIds.lent },
      null,
    );
    expect(outcome).toMatchObject({ ok: true, created: true, count: 2, manualKept: 2 });
    if (!outcome.ok) return;
    lendingId = outcome.id;
    expect(await row("02")).toMatchObject({ rule: "CHANNEL_LENDING", accountingCode: codes.lent, channelLendingId: lendingId });
    expect(await row("05")).toMatchObject({ rule: "CHANNEL_LENDING", channelLendingId: lendingId });
    // Wat met de hand gezet werd, blijft; de dagen ervoor en erna ook.
    expect(await row("03")).toMatchObject({ rule: "MANUAL", channelLendingId: null });
    expect(await row("04")).toMatchObject({ rule: "MANUAL", accountingCode: codes.other });
    expect(await row("01")).toMatchObject({ rule: "CHANNEL_DEFAULT", accountingCode: codes.post });
    expect(await row("06")).toMatchObject({ rule: "CHANNEL_DEFAULT", accountingCode: codes.post });
  });

  it("geeft een betaling die later opgeladen wordt, de uitlening meteen", async () => {
    const summary = await upload([sale("07", "2032-03-03 15:00:00", "5.00")]);
    expect(summary.rules.CHANNEL_LENDING).toBe(1);
    expect(await row("07")).toMatchObject({ rule: "CHANNEL_LENDING", channelLendingId: lendingId });
  });

  it("weigert een uitlening die een dag deelt met een andere", async () => {
    const outcome = await saveChannelLending(
      { id: null, channelId, fromDay: "2032-03-03", toDay: "2032-03-05", accountingCodeId: codeIds.other },
      null,
    );
    expect(outcome).toEqual({ ok: false, error: "LENDING_OVERLAP" });
  });

  it("toont de uitlening met wat ze overneemt: enkel wat met de hand dezelfde code kreeg", async () => {
    const item = (await listChannelLendings()).find((lending) => lending.id === lendingId);
    expect(item).toMatchObject({ linkedCount: 3, linkedCents: 20_00 + 31_00 + 5_00, manualCount: 2, takeOverCount: 1, takeOverCents: 21_00 });
  });

  it("neemt over wat met de hand dezelfde code kreeg, zonder een totaal te verplaatsen", async () => {
    const before = await totalsByCode();
    const outcome = await takeOverChannelLending(lendingId);
    expect(outcome).toMatchObject({ ok: true, count: 1, cents: 21_00, kept: 1 });
    expect(await row("03")).toMatchObject({ rule: "CHANNEL_LENDING", accountingCode: codes.lent, channelLendingId: lendingId });
    // Een andere code koos iemand bewust: die blijft met de hand.
    expect(await row("04")).toMatchObject({ rule: "MANUAL", accountingCode: codes.other });
    expect(await totalsByCode()).toEqual(before);
  });

  it("past de code aan van alles wat de uitlening koppelt", async () => {
    const outcome = await saveChannelLending(
      { id: lendingId, channelId, fromDay: "2032-03-02", toDay: "2032-03-03", accountingCodeId: codeIds.other },
      null,
    );
    expect(outcome).toMatchObject({ ok: true, created: false, count: 4, manualKept: 1 });
    for (const id of ["02", "03", "05", "07"]) {
      expect(await row(id)).toMatchObject({ rule: "CHANNEL_LENDING", accountingCode: codes.other, channelLendingId: lendingId });
    }
  });

  it("weigert aanpassen en verwijderen in een afgesloten periode", async () => {
    const period = await prisma.incomePeriod.create({
      data: { fromMonth: new Date("2032-03-01T00:00:00Z"), toMonth: new Date("2032-03-01T00:00:00Z") },
    });
    periodId = period.id;
    expect(await deleteChannelLending(lendingId)).toEqual({ ok: false, error: "LOCKED" });
    expect(
      await saveChannelLending({ id: lendingId, channelId, fromDay: "2032-03-02", toDay: "2032-03-02", accountingCodeId: codeIds.other }, null),
    ).toEqual({ ok: false, error: "LOCKED" });
    // Een uitlening in een andere maand raakt de afgesloten maand niet.
    const elsewhere = await saveChannelLending(
      { id: null, channelId, fromDay: "2032-04-05", toDay: "2032-04-06", accountingCodeId: codeIds.lent },
      null,
    );
    expect(elsewhere).toMatchObject({ ok: true, count: 0 });
    if (elsewhere.ok) expect(await deleteChannelLending(elsewhere.id)).toMatchObject({ ok: true, count: 0 });
    await prisma.incomePeriod.delete({ where: { id: period.id } });
    periodId = "";
  });

  it("geeft na verwijderen alles terug aan de koppelregels", async () => {
    const outcome = await deleteChannelLending(lendingId);
    expect(outcome).toMatchObject({ ok: true, count: 4 });
    for (const id of ["02", "03", "05", "07"]) {
      expect(await row(id)).toMatchObject({ rule: "CHANNEL_DEFAULT", accountingCode: codes.post, channelLendingId: null });
    }
    expect(await row("04")).toMatchObject({ rule: "MANUAL", accountingCode: codes.other });
  });
});
