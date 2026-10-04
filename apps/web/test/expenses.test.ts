import { describe, expect, it } from "vitest";
import {
  academicYearTag,
  countWords,
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
  parsePostOptionValue,
  postOptions,
  reimbursementReference,
  reimbursementState,
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
  it("zet jaar, post, activiteit, omschrijving en bedrag achter elkaar met underscores", () => {
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
        activity: "Expo & Kunst/Verf",
        description: "Verf",
        amountCents: 3115,
      }),
    ).toBe("26-27_Cultuur_Expo  KunstVerf_Verf_31.15.pdf");
  });

  it("gebruikt de deelpost van Groep 5 als post", () => {
    expect(
      expenseReportFilename({
        spentOn: new Date(Date.UTC(2026, 9, 3)),
        postLabel: "Beheer",
        activity: "Kantoormateriaal",
        description: "9V batterij",
        amountCents: 329,
      }),
    ).toBe("26-27_Beheer_Kantoormateriaal_9V batterij_3.29.pdf");
  });
});

describe("korte velden", () => {
  it("telt woorden over alle soorten witruimte heen", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("Doopcantus")).toBe(1);
    expect(countWords("  Gender  Switch\tparty ")).toBe(3);
    expect(countWords("Aankoop 9V batterij voor kluis")).toBe(5);
  });
});

describe("terugbetaling voor wie geen Beheer is", () => {
  const at = new Date("2026-09-19T10:00:00Z");

  it("zegt enkel of voorgeschoten geld al terug is", () => {
    expect(reimbursementState({ paymentMethod: "PERSONAL", paidAt: null })).toBe("OPEN");
    expect(reimbursementState({ paymentMethod: "PERSONAL", paidAt: at })).toBe("PAID");
    expect(reimbursementState({ paymentMethod: "VTK_CARD", paidAt: at })).toBe("CARD");
  });

  it("blijft open zolang er niet terugbetaald is, ook als de boekhouder al inboekte", () => {
    // `expenseStatus` zegt dan "Afgehandeld", maar het lid heeft zijn geld nog niet.
    expect(expenseStatus({ paidAt: null, sentAt: null, bookedAt: at })).toBe("DONE");
    expect(reimbursementState({ paymentMethod: "PERSONAL", paidAt: null })).toBe("OPEN");
  });

  it("stelt de mededeling voor de overschrijving op", () => {
    expect(
      reimbursementReference({ payerName: "Tiddo Nees ", activity: " Kantoormateriaal" }),
    ).toBe("Terugbetaling Tiddo Nees - Kantoormateriaal");
  });
});

describe("opgesplitste posten", () => {
  it("vervangt Groep 5 door haar vier deelposten", () => {
    expect(postOptions({ id: "g5", code: "GROEP5" }, "Groep 5").map((option) => option.value)).toEqual([
      "g5:Secretaris",
      "g5:Vice",
      "g5:Praeses",
      "g5:Beheer",
    ]);
  });

  it("zet de volledige post erboven in een filter", () => {
    const options = postOptions({ id: "g5", code: "GROEP5" }, "Groep 5", true);
    expect(options[0]).toEqual({ value: "g5", name: "Groep 5" });
    expect(options[1]).toEqual({ value: "g5:Secretaris", name: "Groep 5 · Secretaris" });
  });

  it("laat een gewone post ongemoeid", () => {
    expect(postOptions({ id: "fak", code: "FAKBAR" }, "Fakbar", true)).toEqual([
      { value: "fak", name: "Fakbar" },
    ]);
  });

  it("leest een keuze terug als post en deelpost", () => {
    expect(parsePostOptionValue("g5:Praeses")).toEqual({ groupId: "g5", sub: "Praeses" });
    expect(parsePostOptionValue("fak")).toEqual({ groupId: "fak", sub: null });
    expect(parsePostOptionValue("g5:")).toEqual({ groupId: "g5", sub: null });
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

describe("filter parsing", () => {
  it("valt netjes terug op het huidige werkingsjaar wanneer ?jaar= ontbreekt of leeg is", async () => {
    const { readFilters } = await import("@/app/[locale]/admin/rekeningen/filters");
    expect(readFilters({}, 2026).year).toBe(2026);
    expect(readFilters({ jaar: "" }, 2026).year).toBe(2026);
    expect(readFilters({ jaar: "   " }, 2026).year).toBe(2026);
    expect(readFilters({ jaar: "alles" }, 2026).year).toBe("all");
    expect(readFilters({ jaar: "2025" }, 2026).year).toBe(2025);
  });

  it("sorteert standaard op indiendatum", async () => {
    const { readFilters } = await import("@/app/[locale]/admin/rekeningen/filters");
    expect(readFilters({}, 2026).sort).toBe("submitted");
    expect(readFilters({ sorteer: "datum" }, 2026).sort).toBe("spent");
    expect(readFilters({ sorteer: "iets" }, 2026).sort).toBe("submitted");
  });

  it("leest ?status= als terugbetaalfilter voor wie geen Beheer is", async () => {
    const { readFilters } = await import("@/app/[locale]/admin/rekeningen/filters");
    expect(readFilters({ status: "doorsturen" }, 2026, true).status).toBe("TO_SEND");
    // Een gedeelde link uit de volledige weergave filtert niet op een stap die
    // een lid niet te zien krijgt.
    const simple = readFilters({ status: "doorsturen" }, 2026, false);
    expect(simple.status).toBe("all");
    expect(simple.reimbursement).toBe("all");
    expect(readFilters({ status: "terugbetaald" }, 2026, false).reimbursement).toBe("PAID");
    expect(readFilters({ status: "terugbetalen" }, 2026, false).reimbursement).toBe("OPEN");
  });
});
