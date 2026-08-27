import { describe, expect, it } from "vitest";
import { currentStudyYear, currentWorkingYear, splitYearBar, studyYearStart } from "@/lib/workingYear";

describe("currentStudyYear", () => {
  // De studiebevestiging kantelt op 27 september, het werkingsjaar op 15 juli.
  // Precies dat gat is waarom deze functie bestaat: in juli loopt het
  // academiejaar nog, dus vraag je dan niemand naar het nieuwe studiejaar.
  it("kantelt op 27 september, niet op 15 juli", () => {
    expect(currentStudyYear(new Date("2027-09-26T12:00:00Z"))).toBe(2026);
    expect(currentStudyYear(new Date("2027-09-27T12:00:00Z"))).toBe(2027);
  });

  it("laat de zomer bij het aflopende academiejaar horen", () => {
    // 15 juli 2027: het werkingsjaar rolt om, het academiejaar niet.
    const midsummer = new Date("2027-07-15T12:00:00Z");
    expect(currentWorkingYear(midsummer)).toBe(2027);
    expect(currentStudyYear(midsummer)).toBe(2026);
  });

  it("telt in Brussel-tijd, niet in UTC", () => {
    // 26 september 23:30 UTC is in Brussel al 27 september (zomertijd, UTC+2).
    expect(currentStudyYear(new Date("2027-09-26T23:30:00Z"))).toBe(2027);
  });

  it("klemt niet op het eerste werkingsjaar", () => {
    // De klem op FIRST_WORKING_YEAR bestaat voor roldata; hier zou ze de gate
    // net in juli 2026 laten vallen, wat deze cutover moest voorkomen.
    expect(currentStudyYear(new Date("2026-08-27T12:00:00Z"))).toBe(2025);
    expect(currentWorkingYear(new Date("2026-08-27T12:00:00Z"))).toBe(2026);
  });
});

describe("studyYearStart", () => {
  it("geeft 27 september van dat jaar", () => {
    expect(studyYearStart(2026).toISOString()).toBe("2026-09-27T00:00:00.000Z");
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
