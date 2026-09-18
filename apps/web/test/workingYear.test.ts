import { describe, expect, it } from "vitest";
import { needsStudyConfirmation } from "@vtk/auth";
import {
  currentStudyYear,
  currentWorkingYear,
  splitYearBar,
  studyConfirmationStart,
  studyConfirmationYear,
} from "@/lib/workingYear";

describe("currentStudyYear", () => {
  // Drie grenzen: het werkingsjaar op 15 juli, het academiejaar op
  // 14 september (na de herexamens), de bevestigingsronde op 21 september.
  it("kantelt op 14 september, niet op 15 juli", () => {
    expect(currentStudyYear(new Date("2027-07-15T12:00:00Z"))).toBe(2026);
    expect(currentStudyYear(new Date("2027-09-13T12:00:00Z"))).toBe(2026);
    expect(currentStudyYear(new Date("2027-09-14T12:00:00Z"))).toBe(2027);
  });

  it("laat de zomer bij het aflopende academiejaar horen", () => {
    // 15 juli 2027: het werkingsjaar rolt om, het academiejaar niet.
    const midsummer = new Date("2027-07-15T12:00:00Z");
    expect(currentWorkingYear(midsummer)).toBe(2027);
    expect(currentStudyYear(midsummer)).toBe(2026);
  });

  it("telt in Brussel-tijd, niet in UTC", () => {
    // 13 september 23:30 UTC is in Brussel al 14 september (zomertijd, UTC+2).
    expect(currentStudyYear(new Date("2027-09-13T23:30:00Z"))).toBe(2027);
  });

  it("klemt niet op het eerste werkingsjaar", () => {
    // De klem op FIRST_WORKING_YEAR bestaat voor roldata; een lidmaatschap of
    // een bevestiging van een ouder academiejaar bestaat wel degelijk.
    expect(currentStudyYear(new Date("2026-08-27T12:00:00Z"))).toBe(2025);
    expect(currentWorkingYear(new Date("2026-08-27T12:00:00Z"))).toBe(2026);
  });
});

describe("studyConfirmationYear", () => {
  it("loopt een week achter op het academiejaar", () => {
    // Tussen 14 en 21 september heet het jaar al 26-27, maar de bevestiging
    // van vorig jaar telt nog mee.
    const between = new Date("2026-09-18T12:00:00Z");
    expect(currentStudyYear(between)).toBe(2026);
    expect(studyConfirmationYear(between)).toBe(2025);
  });

  it("kantelt op 21 september", () => {
    expect(studyConfirmationYear(new Date("2026-09-20T12:00:00Z"))).toBe(2025);
    expect(studyConfirmationYear(new Date("2026-09-21T12:00:00Z"))).toBe(2026);
  });
});

describe("studyConfirmationStart", () => {
  it("geeft 21 september van dat jaar", () => {
    expect(studyConfirmationStart(2026).toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });
});

describe("needsStudyConfirmation", () => {
  const now = new Date("2027-10-01T12:00:00Z");

  it("vraagt alleen studenten met een verouderde bevestiging", () => {
    expect(needsStudyConfirmation({ isStudent: true, studyConfirmedYear: 2026 }, now)).toBe(true);
    expect(needsStudyConfirmation({ isStudent: true, studyConfirmedYear: 2027 }, now)).toBe(false);
    expect(needsStudyConfirmation({ isStudent: false, studyConfirmedYear: null }, now)).toBe(false);
    expect(needsStudyConfirmation({ isStudent: false, studyConfirmedYear: 2026 }, now)).toBe(false);
  });

  it("wacht op de bevestigingsronde en niet op het academiejaar", () => {
    // 18 september: het jaar heet al 26-27, maar de gate gaat pas op de 21ste
    // open. Wie vorig jaar bevestigde, mag die week ongestoord verder.
    const between = new Date("2026-09-18T12:00:00Z");
    expect(needsStudyConfirmation({ isStudent: true, studyConfirmedYear: 2025 }, between)).toBe(
      false,
    );
    const after = new Date("2026-09-21T12:00:00Z");
    expect(needsStudyConfirmation({ isStudent: true, studyConfirmedYear: 2025 }, after)).toBe(true);
  });

  it("laat wie in die week al bevestigde met rust", () => {
    // Bevestigen op 18 september stempelt 2026 (het lopende academiejaar). Die
    // stempel loopt vóór op de ronde en mag geen gate opleveren.
    const between = new Date("2026-09-18T12:00:00Z");
    expect(needsStudyConfirmation({ isStudent: true, studyConfirmedYear: 2026 }, between)).toBe(
      false,
    );
  });
});

describe("splitYearBar", () => {
  const years = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019];

  it("zet de nieuwste jaren in de balk en de rest in het archief", () => {
    const { bar, archive } = splitYearBar(years, 2026, 5);
    expect(bar).toEqual([2026, 2025, 2024, 2023, 2022]);
    expect(archive).toEqual([2021, 2020, 2019]);
  });

  it("laat het archief leeg wanneer alle jaren in de balk passen", () => {
    const { bar, archive } = splitYearBar([2026, 2025], 2026, 5);
    expect(bar).toEqual([2026, 2025]);
    expect(archive).toEqual([]);
  });

  it("haalt een gekozen archiefjaar naar de balk", () => {
    const { bar, archive } = splitYearBar(years, 2019, 5);
    expect(bar).toEqual([2026, 2025, 2024, 2023, 2022, 2019]);
    expect(archive).toEqual([2021, 2020]);
    expect(archive).not.toContain(2019);
  });

  it("sorteert aflopend, ongeacht de volgorde van de invoer", () => {
    const { bar } = splitYearBar([2022, 2026, 2024], 2026, 5);
    expect(bar).toEqual([2026, 2024, 2022]);
  });

  it("verzint geen jaar dat niet in de data zit", () => {
    const { bar } = splitYearBar([2026, 2025], 1999, 5);
    expect(bar).toEqual([2026, 2025]);
  });

  it("wijzigt de meegegeven lijst niet", () => {
    const input = [2024, 2026, 2025];
    splitYearBar(input, 2026, 2);
    expect(input).toEqual([2024, 2026, 2025]);
  });
});
