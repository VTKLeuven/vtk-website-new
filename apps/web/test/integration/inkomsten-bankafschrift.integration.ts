import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@vtk/db";
import { importIncomeExport } from "@/lib/inkomsten/server";
import { deleteBankStatement, importBankStatement, loadBankCoverage, loadBankLines } from "@/lib/inkomsten/bankServer";

/**
 * Bankafschriften tegen een echte database: een voorvertoning schrijft niets,
 * enkel de regels van providers worden bewaard, twee afschriften die elkaar
 * overlappen tellen een regel één keer, een export die later komt, koppelt
 * alsnog, en een afschrift verwijderen laat de regels van een ander staan.
 * Alles is verzonnen en ligt in 2033.
 */
describe("bankafschriften", () => {
  const tag = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  const account = `BE99${tag}`;
  const payout = `MDA PID${tag}`;
  const email = `bank-${tag.toLowerCase()}@voorbeeld.invalid`;
  const statementIds: string[] = [];
  const importIds: string[] = [];

  const HEADER =
    "Rekeningnummer;Rubrieknaam;Naam;Munt;Afschriftnummer;Datum;Omschrijving;Valuta;Bedrag;Saldo;Credit;Debet;Rekening tegenpartij;BIC code tegenpartij;Naam tegenpartij;Adres tegenpartij;gestructureerde mededeling;vrije mededeling";
  const line = (date: string, amount: string, name: string, message: string) =>
    [`"${account}"`, '"Zicht"', '"KRING"', '"EUR"', '"2033001"', `"${date}"`, '"OVERSCHRIJVING"', `"${date}"`, `"${amount}"`, '"0"', "", "", '"BE00 9999 9999 9999"', '""', `"${name}"`, '""', '""', `"${message}"`, ""].join(";");
  const march = [HEADER, line("02/03/2033", "99,00", "SumUp Limited", payout), line("05/03/2033", "12,00", "PERSOON A", "lidgeld")].join("\r");
  const overlap = [HEADER, line("02/03/2033", "99,00", "SumUp Limited", payout), line("06/04/2033", "50,00", "SumUp Limited", `MDA PID${tag}X`)].join("\r");

  afterAll(async () => {
    await prisma.incomeBankStatement.deleteMany({ where: { account } });
    await prisma.incomeTransaction.deleteMany({ where: { importId: { in: importIds } } });
    await prisma.incomeImport.deleteMany({ where: { id: { in: importIds } } });
    await prisma.incomeChannel.deleteMany({ where: { source: "SUMUP", identifier: email } });
    await prisma.incomePayout.deleteMany({ where: { source: "SUMUP", reference: payout } });
  });

  it("schrijft niets bij een voorvertoning", async () => {
    const preview = await importBankStatement(march, `${account}_01-03-2033_tot_31-03-2033.csv`, { dryRun: true, userId: null });
    expect(preview).toMatchObject({ ok: true, statementId: null, summary: { providerLines: 1, created: 1, lineCount: 2, newCoverage: true, knownAccount: false } });
    expect(await prisma.incomeBankStatement.count({ where: { account } })).toBe(0);
  });

  it("bewaart enkel de regel van de provider", async () => {
    const outcome = await importBankStatement(march, `${account}_01-03-2033_tot_31-03-2033.csv`, { dryRun: false, userId: null });
    expect(outcome).toMatchObject({ ok: true, summary: { providerLines: 1, created: 1, matched: 0 } });
    if (outcome.ok && outcome.statementId) statementIds.push(outcome.statementId);
    const lines = await prisma.incomeBankLine.findMany({ where: { account } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ provider: "SUMUP", reference: payout, amountCents: 9900 });
    expect(JSON.stringify(lines)).not.toMatch(/PERSOON|lidgeld|9999/);
  });

  it("telt een regel in twee afschriften één keer", async () => {
    const outcome = await importBankStatement(overlap, `${account}_15-03-2033_tot_15-04-2033.csv`, { dryRun: false, userId: null });
    expect(outcome).toMatchObject({ ok: true, summary: { providerLines: 2, created: 1, duplicates: 1 } });
    if (outcome.ok && outcome.statementId) statementIds.push(outcome.statementId);
    const lines = (await loadBankLines("2033-03-01", "2033-04-30")).filter((entry) => entry.account === account);
    expect(lines.map((entry) => [entry.bookedOn, entry.amountCents])).toEqual([
      ["2033-03-02", 9900],
      ["2033-04-06", 5000],
    ]);
    expect(lines[0]).toMatchObject({ payoutKey: null, reason: "NOT_FOUND" });
    // Hetzelfde afschrift nog eens: niets nieuws.
    const again = await importBankStatement(overlap, `${account}_15-03-2033_tot_15-04-2033.csv`, { dryRun: true, userId: null });
    expect(again).toMatchObject({ ok: true, summary: { created: 0, newCoverage: false } });
  });

  it("koppelt alsnog wanneer de export van de provider later komt", async () => {
    const sumup = [
      "email,Datum,Transactie-ID,Transactietype,Status,Kaarttype,Laatste 4 cijfers,Verwerken als,Betaalmethode,Invoerwijze,Autorisatiecode,Beschrijving,Totaal bedrag,Netto verkoop,Belastingbedrag,Bedrag fooi,Transactiekosten,Uitbetaling,Uitbetaling datum,Uitbetalingsnummer,Kenmerk",
      `${email},2033-03-01 12:00:00,T${tag}1,Omzet,Succesvol,VISA,4321,DEBIT,POS,CONTACTLESS,A1,,100.00,100.00,0.0,0.0,1.00,99.00,,,`,
      `${email},2033-03-01 12:00:03,T${tag}1,Uitbetaling,Betaald,VISA,4321,DEBIT,POS,CONTACTLESS,A1,,100.00,100.00,0.0,0.0,1.00,99.00,2033-03-02,${payout},`,
    ].join("\n");
    const outcome = await importIncomeExport(sumup, "sumup.csv", { dryRun: false, userId: null });
    if (!outcome.ok) throw new Error(outcome.error);
    if (outcome.importId) importIds.push(outcome.importId);
    const [matched] = (await loadBankLines("2033-03-01", "2033-03-31")).filter((entry) => entry.account === account);
    expect(matched).toMatchObject({ payoutKey: `SUMUP|${payout}`, reason: null });
  });

  it("laat bij verwijderen de regels van een ander afschrift staan", async () => {
    expect(await deleteBankStatement(statementIds[0])).toMatchObject({ ok: true, lines: 1 });
    const lines = (await loadBankLines("2033-03-01", "2033-04-30")).filter((entry) => entry.account === account);
    expect(lines).toHaveLength(2);
    expect((await loadBankCoverage()).get(account)).toEqual([{ from: "2033-03-15", to: "2033-04-15" }]);
    expect(await deleteBankStatement(statementIds[0])).toEqual({ ok: false });
  });
});
