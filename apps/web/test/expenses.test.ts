import { describe, expect, it } from "vitest";
import {
  academicYearTag,
  expenseReportFilename,
  expenseStatus,
  formatBytes,
  formatEuro,
  formatIban,
  isAllowedReceiptName,
  isValidIban,
  normaliseIban,
  parseAmountToCents,
  parseDateInput,
  workingYearOf,
} from "@/lib/rekeningen/expenses";

describe("bedrag inlezen", () => {
  it("aanvaardt zowel de punt als de komma als decimaalteken", () => {
    expect(parseAmountToCents("10.23")).toBe(1023);
    expect(parseAmountToCents("10,23")).toBe(1023);
    expect(parseAmountToCents("10")).toBe(1000);
    expect(parseAmountToCents(" € 10,20 ")).toBe(1020);
  });

  it("leest een duizendtalpunt als scheidingsteken, niet als komma", () => {
    expect(parseAmountToCents("1.234,56")).toBe(123456);
  });

  it("weigert wat geen bedrag is, in plaats van er nul van te maken", () => {
    // `Number("")` is 0: precies de val waardoor een leeg veld anders stil als
    // een rekening van € 0 opgeslagen zou worden.
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("-5")).toBeNull();
    expect(parseAmountToCents("0")).toBeNull();
    expect(parseAmountToCents("10,234")).toBeNull();
  });
});

describe("IBAN", () => {
  it("aanvaardt een geldig nummer, met of zonder spaties", () => {
    expect(isValidIban("BE68 5390 0754 7034")).toBe(true);
    expect(isValidIban("be68539007547034")).toBe(true);
    expect(isValidIban("NL91ABNA0417164300")).toBe(true);
  });

  it("verwerpt een tikfout in een cijfer", () => {
    expect(isValidIban("BE68 5390 0754 7035")).toBe(false);
    expect(isValidIban("BE00 5390 0754 7034")).toBe(false);
    expect(isValidIban("12345")).toBe(false);
    expect(isValidIban("")).toBe(false);
  });

  it("normaliseert en formatteert heen en weer", () => {
    expect(normaliseIban("be68 5390-0754 7034")).toBe("BE68539007547034");
    expect(formatIban("BE68539007547034")).toBe("BE68 5390 0754 7034");
    expect(formatIban(null)).toBe("");
  });
});

describe("werkingsjaar van een uitgave", () => {
  it("legt de grens op 15 juli, zoals de rest van de site", () => {
    expect(workingYearOf(new Date(Date.UTC(2026, 6, 14)))).toBe(2025);
    expect(workingYearOf(new Date(Date.UTC(2026, 6, 15)))).toBe(2026);
    expect(workingYearOf(new Date(Date.UTC(2026, 11, 31)))).toBe(2026);
    expect(workingYearOf(new Date(Date.UTC(2027, 0, 2)))).toBe(2026);
  });

  it("schrijft de tag zoals hij op het blad van de boekhouder staat", () => {
    expect(academicYearTag(new Date(Date.UTC(2026, 8, 18)))).toBe("26-27");
    expect(academicYearTag(new Date(Date.UTC(2026, 8, 18)), "long")).toBe("2026-2027");
    expect(academicYearTag(new Date(Date.UTC(2026, 5, 30)))).toBe("25-26");
  });
});

describe("status uit de drie datums", () => {
  const at = new Date("2026-09-19T10:00:00Z");

  it("volgt de workflow van terugbetalen tot ingeboekt", () => {
    expect(expenseStatus({ paidAt: null, sentAt: null, bookedAt: null })).toBe("TO_REIMBURSE");
    expect(expenseStatus({ paidAt: at, sentAt: null, bookedAt: null })).toBe("TO_SEND");
    expect(expenseStatus({ paidAt: at, sentAt: at, bookedAt: null })).toBe("TO_BOOK");
    expect(expenseStatus({ paidAt: at, sentAt: at, bookedAt: at })).toBe("DONE");
  });

  it("laat ingeboekt voorgaan, ook wanneer de andere datums ontbreken", () => {
    // Kan gebeuren wanneer een beheerder een vinkje terugdraait; de rekening is
    // dan nog steeds ingeboekt en hoort niet terug in de werklijst.
    expect(expenseStatus({ paidAt: null, sentAt: null, bookedAt: at })).toBe("DONE");
  });
});

describe("datum uit een date-input", () => {
  it("leest een geldige datum als UTC-middernacht", () => {
    expect(parseDateInput("2026-09-18")?.toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });

  it("verwerpt een onbestaande of onvolledige datum", () => {
    expect(parseDateInput("2026-02-30")).toBeNull();
    expect(parseDateInput("2026-13-01")).toBeNull();
    expect(parseDateInput("18/09/2026")).toBeNull();
    expect(parseDateInput("")).toBeNull();
  });
});

describe("bestandsnaam van het blad", () => {
  it("houdt het formaat van billsheet aan, zodat de map bij de boekhouder doorloopt", () => {
    expect(
      expenseReportFilename({
        spentOn: new Date(Date.UTC(2026, 8, 18)),
        postLabel: "Fakbar",
        activity: "Doopcantus",
        description: "Bierbestelling",
        amountCents: 24890,
      }),
    ).toBe("26-27_Fakbar_Doopcantus_Bierbestelling_248.9.pdf");
  });

  it("gooit tekens weg die niet in een bestandsnaam horen", () => {
    expect(
      expenseReportFilename({
        spentOn: new Date(Date.UTC(2026, 8, 18)),
        postLabel: "Cultuur",
        activity: "Expo/Kunst",
        description: "Verf & penselen",
        amountCents: 3115,
      }),
    ).toBe("26-27_Cultuur_ExpoKunst_Verf  penselen_31.15.pdf");
  });
});

describe("bonnetjes", () => {
  it("aanvaardt enkel de formaten die het blad kan verwerken", () => {
    expect(isAllowedReceiptName("bon.jpg")).toBe(true);
    expect(isAllowedReceiptName("BON.JPEG")).toBe(true);
    expect(isAllowedReceiptName("scan.png")).toBe(true);
    expect(isAllowedReceiptName("bestelling.pdf")).toBe(true);
    expect(isAllowedReceiptName("bon.heic")).toBe(false);
    expect(isAllowedReceiptName("bon")).toBe(false);
  });
});

describe("weergave", () => {
  it("toont bedragen in euro met twee cijfers", () => {
    expect(formatEuro(24890)).toBe("€ 248,90");
    expect(formatEuro(0)).toBe("€ 0,00");
    expect(formatEuro(24890, "en")).toBe("€ 248.90");
  });

  it("toont bestandsgroottes leesbaar", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024 * 1024 * 2)).toBe("2,0 MB");
    expect(formatBytes(1024 * 1024 * 312)).toBe("312 MB");
  });
});
