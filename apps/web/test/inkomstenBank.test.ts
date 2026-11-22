import { describe, expect, it } from "vitest";
import { decodeUpload, detectDelimiter } from "@/lib/csv";
import {
  bankProviderOf,
  coveredFromFileName,
  isBankingDay,
  isCovered,
  matchBankLine,
  nextBankingDay,
  normaliseAccount,
  parseBankStatement,
  payoutKey,
  reconcileAccounts,
  recognisesBankStatement,
  type ReconRow,
} from "@/lib/inkomsten/bank";
import { parseIncomeExport } from "@/lib/inkomsten/parse";

// Verzonnen gegevens in de vorm van een CSV-afschrift van KBC: geen echte
// namen, rekeningnummers of referenties.

const HEADER =
  "Rekeningnummer;Rubrieknaam;Naam;Munt;Afschriftnummer;Datum;Omschrijving;Valuta;Bedrag;Saldo;Credit;Debet;Rekening tegenpartij;BIC code tegenpartij;Naam tegenpartij;Adres tegenpartij;gestructureerde mededeling;vrije mededeling";
const line = (fields: { date: string; amount: string; name: string; bic?: string; message: string; counter?: string; nr?: string }) =>
  [
    '"BE00 0000 0000 0001"',
    '"Zichtrekening"',
    '"KRING VZW"',
    '"EUR"',
    `"${fields.nr ?? "2026089"}"`,
    `"${fields.date}"`,
    '"OVERSCHRIJVING"',
    `"${fields.date}"`,
    `"${fields.amount}"`,
    '"1000,00"',
    "",
    "",
    `"${fields.counter ?? "BE00 9999 9999 9999"}"`,
    `"${fields.bic ?? ""}"`,
    `"${fields.name}"`,
    '"STRAAT 1 3000 LEUVEN"',
    '""',
    `"${fields.message}"`,
    "",
  ].join(";");

// Losse CR als regeleinde en een puntkomma achteraan op elke regel, zoals KBC.
const STATEMENT = [
  HEADER,
  line({ date: "03/08/2026", amount: "198,96", name: "SumUp Limited", bic: "SXPYDKKKXXX", message: "MDA PID1234567" }),
  line({ date: "04/08/2026", amount: "1.234,56", name: "STICHTING MOLLIE PAYMENTS", bic: "CITINL2X", message: "REF T12345678.2608.01 MOLLIE" }),
  line({
    date: "17/09/2026",
    amount: "768,70",
    name: "BANCONTACT COMPANY NV",
    bic: "BBRUBEBB",
    message: "20260916-PAabcdef1234567890ABCDEFGH-NONE-PQ-BULKRECON-1a234b567",
  }),
  line({
    date: "14/09/2026",
    amount: "183,23",
    name: "EUROPABANK N.V.",
    bic: "EURBBE99",
    message: "MC-UID: 123456 01 DD. 2026-SEP-13                    BRUTO: 185,20 - COMM 1,97 OV.REF.038248",
  }),
  line({ date: "20/08/2026", amount: "68,75", name: "PERSOON A", bic: "KREDBEBB", message: "inschrijving galabal PERSOON A" }),
  line({ date: "21/08/2026", amount: "-19,00", name: "LEVERANCIER B", message: "factuur 123" }),
].join("\r");

const FILE_NAME = "BE00000000000001_01-08-2026_tot_30-09-2026.csv";

describe("een bankafschrift lezen", () => {
  it("herkent een afschrift van KBC, en geen export als afschrift", () => {
    expect(recognisesBankStatement(STATEMENT)).toBe(true);
    expect(parseIncomeExport(STATEMENT)).toMatchObject({ ok: false, error: "UNKNOWN_FORMAT" });
    const sumup =
      "email,Datum,Transactie-ID,Transactietype,Status,Totaal bedrag\nkassa@voorbeeld.be,2026-10-01 00:20:00,T1,Omzet,Succesvol,3.40";
    expect(recognisesBankStatement(sumup)).toBe(false);
  });

  it("vindt de puntkomma ook met een losse CR als regeleinde", () => {
    expect(detectDelimiter("a;b;c\rd,e;f,g,h,i,j,k\r")).toBe(";");
  });

  it("houdt enkel de regels van providers over, zonder naam of rekening van een lid", () => {
    const parsed = parseBankStatement(STATEMENT, FILE_NAME);
    expect(parsed).toMatchObject({ ok: true, account: "BE00000000000001", coveredFrom: "2026-08-01", coveredTo: "2026-09-30", lineCount: 6 });
    if (!parsed.ok) return;
    expect(parsed.lines.map((entry) => [entry.provider, entry.bookedOn, entry.amountCents, entry.reference])).toEqual([
      ["SUMUP", "2026-08-03", 19896, "MDA PID1234567"],
      ["MOLLIE", "2026-08-04", 123456, "12345678.2608.01"],
      ["PAYCONIQ", "2026-09-17", 76870, "PAABCDEF1234567890ABCDEFGH"],
      ["EUROPABANK", "2026-09-14", 18323, "38248"],
    ]);
    const text = JSON.stringify(parsed);
    expect(text).not.toMatch(/PERSOON|LEVERANCIER|galabal|BE00 9999|9999|STRAAT|KRING/);
  });

  it("neemt zonder datums in de naam de dagen van de regels", () => {
    const parsed = parseBankStatement(STATEMENT, "afschrift.csv");
    expect(parsed).toMatchObject({ ok: true, coveredFrom: "2026-08-03", coveredTo: "2026-09-17" });
    expect(coveredFromFileName("x_31-09-2026_tot_30-09-2026.csv")).toBeNull();
  });

  it("weigert een bestand met twee rekeningen en een onleesbare regel", () => {
    const mixed = `${STATEMENT}\r${line({ date: "05/08/2026", amount: "1,00", name: "X", message: "y" }).replace("BE00 0000 0000 0001", "BE00 0000 0000 0002")}`;
    expect(parseBankStatement(mixed)).toEqual({ ok: false, error: "MIXED_ACCOUNTS" });
    const bad = `${STATEMENT}\r${line({ date: "32/08/2026", amount: "1,00", name: "X", message: "y" })}`;
    expect(parseBankStatement(bad)).toMatchObject({ ok: false, error: "BAD_ROW" });
  });

  it("geeft dezelfde regel in twee afschriften dezelfde sleutel, en twee gelijke regels elk een eigen", () => {
    const one = parseBankStatement(STATEMENT, FILE_NAME);
    const twice = parseBankStatement(`${STATEMENT}\r${STATEMENT.split("\r")[1]}`, FILE_NAME);
    if (!one.ok || !twice.ok) throw new Error("niet gelezen");
    expect(twice.lines[0].externalKey).toBe(one.lines[0].externalKey);
    expect(twice.lines.at(-1)!.externalKey).not.toBe(one.lines[0].externalKey);
  });

  it("herkent een provider aan de naam, niet aan de mededeling", () => {
    expect(bankProviderOf("SumUp Limited")).toBe("SUMUP");
    expect(bankProviderOf("BANCONTACT COMPANY NV")).toBe("PAYCONIQ");
    expect(bankProviderOf("EUROPABANK N.V.")).toBe("EUROPABANK");
    expect(bankProviderOf("PERSOON A")).toBeNull();
    // Een lid dat "Mollie" in de mededeling zet, blijft een lid: de mededeling telt niet.
    const member = parseBankStatement(
      [HEADER, line({ date: "05/08/2026", amount: "5,00", name: "PERSOON C", message: "REF T12345678.2608.01 MOLLIE" })].join("\r"),
    );
    expect(member.ok && member.lines).toEqual([]);
  });

  it("leest Windows-1252 als UTF-8 niet lukt", () => {
    const bytes = new Uint8Array([0x52, 0xe9, 0x66]).buffer; // "Réf" in Windows-1252
    expect(decodeUpload(bytes)).toBe("Réf");
    expect(decodeUpload(new TextEncoder().encode("Réf").buffer as ArrayBuffer)).toBe("Réf");
  });

  it("normaliseert een rekening", () => {
    expect(normaliseAccount(" be00 0000.0000 0001 ")).toBe("BE00000000000001");
  });
});

describe("een bankregel koppelen", () => {
  const known = new Map([
    [payoutKey("SUMUP", "MDA PID1234567"), "MDA PID1234567"],
    [payoutKey("PAYCONIQ", "paabcdef1234567890abcdefgh"), "paabcdef1234567890abcdefgh"],
    [payoutKey("EUROPABANK", "38248"), "38248"],
  ]);

  it("koppelt op de referentie, ook met andere hoofdletters of voorloopnullen", () => {
    expect(matchBankLine({ provider: "SUMUP", reference: "MDA  PID1234567" }, known, true)).toEqual({
      payoutKey: "SUMUP|MDA PID1234567",
      reference: "MDA PID1234567",
    });
    expect(matchBankLine({ provider: "PAYCONIQ", reference: "PAABCDEF1234567890ABCDEFGH" }, known, true)).toMatchObject({
      reference: "paabcdef1234567890abcdefgh",
    });
    expect(matchBankLine({ provider: "EUROPABANK", reference: "038248" }, known, true)).toMatchObject({ reference: "38248" });
  });

  it("zegt waarom een regel niets vond", () => {
    expect(matchBankLine({ provider: "MOLLIE", reference: null }, known, true)).toEqual({ payoutKey: null, reason: "NO_REFERENCE" });
    expect(matchBankLine({ provider: "PAYCONIQ", reference: "PAZZZ" }, known, false)).toEqual({
      payoutKey: null,
      reason: "PAYCONIQ_WITHOUT_PAYOUT_ID",
    });
    expect(matchBankLine({ provider: "SUMUP", reference: "MDA PID7654321" }, known, true)).toEqual({ payoutKey: null, reason: "NOT_FOUND" });
  });
});

describe("de volgende bankdag", () => {
  it("slaat het weekend en de sluitingsdagen van TARGET2 over", () => {
    expect(nextBankingDay("2026-09-17")).toBe("2026-09-18");
    // Vrijdag, zaterdag (15 augustus) en zondag komen maandag.
    expect(nextBankingDay("2026-08-14")).toBe("2026-08-17");
    expect(nextBankingDay("2026-08-15")).toBe("2026-08-17");
    // Kerstmis op vrijdag en tweede kerstdag op zaterdag.
    expect(nextBankingDay("2026-12-24")).toBe("2026-12-28");
    // Goede Vrijdag (3 april 2026) en Paasmaandag (6 april).
    expect(nextBankingDay("2026-04-02")).toBe("2026-04-07");
    expect(isBankingDay("2026-05-01")).toBe(false);
    expect(isBankingDay("2026-07-21")).toBe(true);
  });

  it("weet wanneer afschriften een periode dekken", () => {
    const ranges = [
      { from: "2026-07-01", to: "2026-07-31" },
      { from: "2026-08-01", to: "2026-09-30" },
    ];
    expect(isCovered(ranges, "2026-07-01", "2026-09-30")).toBe(true);
    expect(isCovered([ranges[1]], "2026-07-01", "2026-09-30")).toBe(false);
    expect(isCovered([{ from: "2026-07-01", to: "2026-09-29" }], "2026-07-01", "2026-09-30")).toBe(false);
  });
});

describe("per rekening afstemmen", () => {
  const A = "BE00000000000001";
  const row = (partial: Partial<ReconRow>): ReconRow => ({ source: "PAYCONIQ", account: A, saleDay: "2026-08-10", amountCents: 0, payout: null, ...partial });

  it("schuift de laatste en de eerste dagen naar de periode waarin hun geld op de bank kwam", () => {
    const recon = reconcileAccounts({
      from: "2026-07-01",
      to: "2026-09-30",
      rows: [
        row({ amountCents: 10000 }),
        // Verkocht op de laatste dag, geschat de volgende bankdag (1 oktober).
        row({ saleDay: "2026-09-30", amountCents: 2500 }),
        // Verkocht op 30 juni, op de bank op 1 juli.
        row({ saleDay: "2026-06-30", amountCents: 700 }),
        // Een SumUp-uitbetaling die over de rand loopt: de dag komt uit de bankregel.
        row({ source: "SUMUP", saleDay: "2026-09-29", amountCents: 4000, payout: "SUMUP|MDA PID1" }),
        row({ source: "SUMUP", saleDay: "2026-09-29", amountCents: -40, payout: "SUMUP|MDA PID1" }),
        // Een rij die niet meetelt, telt hier wel: het geld kwam toch op de bank.
        row({ saleDay: "2026-08-11", amountCents: 300 }),
        // Ver buiten de periode: telt nergens.
        row({ saleDay: "2026-05-01", amountCents: 999 }),
      ],
      transfers: [
        { account: A, paidOn: "2026-08-03", amountCents: 50000, payout: "MOLLIE|1.2608.01" },
        { account: A, paidOn: "2026-10-05", amountCents: 9999, payout: "MOLLIE|1.2610.01" },
      ],
      payoutDays: new Map([["SUMUP|MDA PID1", "2026-09-30"]]),
      lines: [
        { account: A, bookedOn: "2026-09-30", amountCents: 3960, payout: "SUMUP|MDA PID1" },
        { account: A, bookedOn: "2026-08-03", amountCents: 50000, payout: "MOLLIE|1.2608.01" },
        { account: A, bookedOn: "2026-08-11", amountCents: 11000, payout: null },
      ],
      coverage: new Map([[A, [{ from: "2026-07-01", to: "2026-09-30" }]]]),
      byHand: new Map([[A, 6875]]),
    });
    expect(recon).toHaveLength(1);
    const [account] = recon;
    expect(account.covered).toBe(true);
    expect(account.sold).toMatchObject({ cents: 10000 + 2500 + 4000 - 40 + 300, count: 5 });
    expect(account.laterOut).toEqual({ cents: 2500, count: 1, estimated: 1 });
    expect(account.earlierIn).toEqual({ cents: 700, count: 1, estimated: 1 });
    expect(account.mollie).toMatchObject({ cents: 50000, count: 1 });
    expect(account.expected).toBe(16760 - 2500 + 700 + 50000);
    expect(account.bank).toBe(3960 + 50000 + 11000);
    expect(account.difference).toBe(account.bank - account.expected);
    expect(account.byHand).toBe(6875);
  });

  it("geeft geen oordeel zonder afschrift voor de hele periode", () => {
    const [account] = reconcileAccounts({
      from: "2026-07-01",
      to: "2026-09-30",
      rows: [row({ amountCents: 100 })],
      transfers: [],
      payoutDays: new Map(),
      lines: [],
      coverage: new Map([[A, [{ from: "2026-08-01", to: "2026-09-30" }]]]),
      byHand: new Map(),
    });
    expect(account.covered).toBe(false);
  });
});

describe("een uitbetaling op het afschrift", () => {
  it("is in orde met hetzelfde bedrag, of bij Mollie met de overschrijving; een vinkje gaat voor", async () => {
    const { payoutState } = await import("@/lib/inkomsten/overview");
    expect(payoutState(1000, null, null, 1000)).toBe("bank");
    expect(payoutState(1000, null, null, 990)).toBe("bankDiffers");
    // Mollie: de som van de betalingen verschilt (reserve), de bank toont de overschrijving.
    expect(payoutState(1000, null, 950, 950)).toBe("bank");
    expect(payoutState(1000, null, 950, 940)).toBe("bankDiffers");
    // Een vinkje met de hand gaat voor op de bank.
    expect(payoutState(1000, 1000, null, 990)).toBe("checked");
    // Zonder afschrift zoals vroeger.
    expect(payoutState(1000, null, 1000)).toBe("provider");
    expect(payoutState(1000, null, null)).toBe("open");
  });

  it("telt in de controlelijst als in orde, een ander bedrag niet", async () => {
    const { computeIncomeChecks } = await import("@/lib/inkomsten/overview");
    const checks = computeIncomeChecks({
      months: ["2026-09"],
      currentMonth: "2026-10",
      sourcesInUse: new Set(),
      rowsPerSourceMonth: new Map(),
      channelsInUse: [],
      rowsPerChannelMonth: new Map(),
      molliePaymentMonths: new Set(),
      mollieFeeMonths: new Set(),
      mollieFeeMonthsTwice: new Set(),
      payouts: [
        { total: 1000, checkedAmount: null, providerAmount: null, bankAmount: 1000 },
        { total: 2000, checkedAmount: null, providerAmount: null, bankAmount: 1990 },
      ],
      open: { count: 0, cents: 0 },
      withoutAccount: { count: 0, cents: 0 },
      hasFees: false,
      feeCodeChosen: false,
      mollieReserve: { status: "none" },
    });
    expect(checks.find((check) => check.key === "payouts")).toMatchObject({ ok: false, total: 2, checked: 1, bank: 1, bankDiffers: 1 });
  });

  it("zet de dag en het bedrag op de bank in het controlebestand, en laat het kwartaalblad zoals het was", async () => {
    const { payoutsSheet, quarterSheet } = await import("@/lib/inkomsten/workbook");
    const { NO_SEPARATE_FEES } = await import("@/lib/inkomsten/lines");
    const model = {
      title: "t",
      nl: true,
      transactions: [],
      codeOrder: new Map(),
      mainNames: new Map(),
      lineRules: NO_SEPARATE_FEES,
      mollieTransfers: null,
      feeCode: null,
      groups: [],
      payouts: [
        {
          source: "SUMUP" as const,
          reference: "MDA PID1234567",
          paidOn: new Date("2026-08-03T00:00:00Z"),
          firstAt: new Date("2026-08-01T10:00:00Z"),
          lastAt: new Date("2026-08-02T10:00:00Z"),
          payments: 20000,
          refunds: 0,
          fees: -104,
          reserve: 0,
          total: 19896,
          providerAmount: null,
          bankOn: new Date("2026-08-03T00:00:00Z"),
          bankAmount: 19896,
          checked: "ja, op het uittreksel",
        },
      ],
      imports: [],
    };
    const sheet = payoutsSheet(model);
    const text = (cell: unknown) => (cell && typeof cell === "object" ? (cell as { value: unknown }).value : cell);
    expect(sheet.data[0].slice(11).map(text)).toEqual(["Op de bank op", "Bedrag op de bank", "Afgevinkt"]);
    expect(sheet.data[1].slice(12).map(text)).toEqual([198.96, "ja, op het uittreksel"]);
    // Het kwartaalblad kent de afschriften niet.
    expect(JSON.stringify(quarterSheet(model, { formulas: false }).data)).not.toMatch(/bank op|uittreksel/);
  });
});
