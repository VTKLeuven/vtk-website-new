import { describe, expect, it } from "vitest";
import {
  normalizeCourseCode,
  palPlusCourseLabel,
  palPlusReward,
  parsePalPlusCourse,
  PAL_PLUS_LIMITS,
} from "@/lib/palPlus";

const at = (hhmm: string) => new Date(`2026-10-12T${hhmm}:00+02:00`);

describe("palPlusReward", () => {
  it("geeft één bonnetje per gepland uur", () => {
    expect(palPlusReward(at("14:00"), at("15:00"))).toBe(1);
    expect(palPlusReward(at("14:00"), at("16:00"))).toBe(2);
  });

  it("geeft anderhalf bonnetje voor anderhalf uur", () => {
    expect(palPlusReward(at("14:00"), at("15:30"))).toBe(1.5);
  });

  it("rondt af op het dichtste halve bonnetje", () => {
    // 1u10 = 1,17 -> 1
    expect(palPlusReward(at("14:00"), at("15:10"))).toBe(1);
    // 1u20 = 1,33 -> 1,5
    expect(palPlusReward(at("14:00"), at("15:20"))).toBe(1.5);
    // 1u40 = 1,67 -> 1,5
    expect(palPlusReward(at("14:00"), at("15:40"))).toBe(1.5);
    // 1u45 = 1,75 -> 2: precies ertussen rondt naar boven
    expect(palPlusReward(at("14:00"), at("15:45"))).toBe(2);
    // 15 minuten = 0,25 -> 0,5
    expect(palPlusReward(at("14:00"), at("14:15"))).toBe(0.5);
  });

  it("geeft niets voor een sessie zonder duur of met een einde voor het begin", () => {
    expect(palPlusReward(at("14:00"), at("14:00"))).toBe(0);
    expect(palPlusReward(at("15:00"), at("14:00"))).toBe(0);
    expect(palPlusReward(new Date("ongeldig"), at("14:00"))).toBe(0);
  });

  it("geeft altijd een veelvoud van een half", () => {
    for (let minutes = 1; minutes <= 300; minutes += 7) {
      const reward = palPlusReward(at("14:00"), new Date(at("14:00").getTime() + minutes * 60_000));
      expect(Number.isInteger(reward * 2)).toBe(true);
    }
  });
});

describe("normalizeCourseCode", () => {
  it("maakt hoofdletters en haalt spaties weg", () => {
    expect(normalizeCourseCode(" h01a0b ")).toBe("H01A0B");
    expect(normalizeCourseCode("H01 A0B")).toBe("H01A0B");
  });

  it("haalt het voorvoegsel uit de studiegids weg", () => {
    expect(normalizeCourseCode("B-KUL-H01A0B")).toBe("H01A0B");
    expect(normalizeCourseCode("b-kul-h01a0b")).toBe("H01A0B");
  });

  it("laat leeg leeg", () => {
    expect(normalizeCourseCode("")).toBeNull();
    expect(normalizeCourseCode("   ")).toBeNull();
  });

  it("weigert wat geen code kan zijn", () => {
    expect(normalizeCourseCode("H01A0B (6 stp)")).toBeUndefined();
    expect(normalizeCourseCode("H01-A0B")).toBeUndefined();
    expect(normalizeCourseCode("X".repeat(PAL_PLUS_LIMITS.courseCode + 1))).toBeUndefined();
  });
});

describe("parsePalPlusCourse", () => {
  const base = { code: "H01A0B", nameNl: "Analyse I", nameEn: "Analysis I", active: true };

  it("aanvaardt een volledig vak", () => {
    expect(parsePalPlusCourse(base)).toEqual({
      ok: true,
      course: { code: "H01A0B", nameNl: "Analyse I", nameEn: "Analysis I", active: true },
    });
  });

  it("aanvaardt een vak zonder code of Engelse naam", () => {
    expect(parsePalPlusCourse({ ...base, code: "", nameEn: " " })).toEqual({
      ok: true,
      course: { code: null, nameNl: "Analyse I", nameEn: null, active: true },
    });
  });

  it("vraagt een Nederlandse naam", () => {
    expect(parsePalPlusCourse({ ...base, nameNl: "  " })).toEqual({
      ok: false,
      error: "COURSE_NAME_REQUIRED",
    });
  });

  it("weigert een te lange naam", () => {
    const long = "a".repeat(PAL_PLUS_LIMITS.courseName + 1);
    expect(parsePalPlusCourse({ ...base, nameNl: long })).toEqual({
      ok: false,
      error: "COURSE_NAME_TOO_LONG",
    });
    expect(parsePalPlusCourse({ ...base, nameEn: long })).toEqual({
      ok: false,
      error: "COURSE_NAME_TOO_LONG",
    });
  });

  it("weigert een ongeldige code", () => {
    expect(parsePalPlusCourse({ ...base, code: "H01A0B (6 stp)" })).toEqual({
      ok: false,
      error: "COURSE_CODE_INVALID",
    });
  });
});

describe("palPlusCourseLabel", () => {
  const course = { code: "H01A0B", nameNl: "Analyse I", nameEn: "Analysis I" };

  it("toont de naam in de taal van de lezer met de code erachter", () => {
    expect(palPlusCourseLabel(course, "nl")).toBe("Analyse I (H01A0B)");
    expect(palPlusCourseLabel(course, "en")).toBe("Analysis I (H01A0B)");
  });

  it("valt terug op de Nederlandse naam en laat een lege code weg", () => {
    expect(palPlusCourseLabel({ code: null, nameNl: "Matlab", nameEn: null }, "en")).toBe("Matlab");
  });
});
