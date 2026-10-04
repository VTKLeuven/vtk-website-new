import { describe, expect, it } from "vitest";
import {
  initialPalPlusStatus,
  isActivePalPlusStatus,
  normalizeCourseCode,
  palPlusAskerCount,
  palPlusCourseLabel,
  palPlusRequestCourseLabel,
  palPlusReward,
  parsePalPlusCourse,
  parsePalPlusRequest,
  reopenedPalPlusStatus,
  PAL_PLUS_LIMITS,
  PAL_PLUS_OTHER_COURSE,
  type RawPalPlusRequest,
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

describe("parsePalPlusRequest", () => {
  // Maandag 5 oktober 2026, 10:00 in Brussel (zomertijd, UTC+2).
  const now = new Date("2026-10-05T10:00:00+02:00");
  const give: RawPalPlusRequest = {
    kind: "GIVE",
    courseId: "course-1",
    courseOther: "",
    description: "Oefeningen hoofdstuk 3",
    date: "2026-10-12",
    startTime: "14:00",
    endTime: "15:30",
    preferredPeriod: "",
  };
  const follow: RawPalPlusRequest = {
    ...give,
    kind: "FOLLOW",
    date: "",
    startTime: "",
    endTime: "",
    preferredPeriod: "voor het examen in januari",
  };

  it("aanvaardt een aanbod en rekent het moment in Brusselse tijd", () => {
    const result = parsePalPlusRequest(give, now);
    expect(result.ok).toBe(true);
    if (!result.ok || result.request.kind !== "GIVE") throw new Error("verwacht een aanbod");
    expect(result.request.courseId).toBe("course-1");
    expect(result.request.courseOther).toBeNull();
    expect(result.request.proposedStartsAt.toISOString()).toBe("2026-10-12T12:00:00.000Z");
    expect(result.request.proposedEndsAt.toISOString()).toBe("2026-10-12T13:30:00.000Z");
  });

  it("rekent een moment na de overgang naar wintertijd met UTC+1", () => {
    const result = parsePalPlusRequest({ ...give, date: "2026-11-09" }, now);
    if (!result.ok || result.request.kind !== "GIVE") throw new Error("verwacht een aanbod");
    expect(result.request.proposedStartsAt.toISOString()).toBe("2026-11-09T13:00:00.000Z");
  });

  it("aanvaardt een vraag zonder moment, met een periode in eigen woorden", () => {
    expect(parsePalPlusRequest(follow, now)).toEqual({
      ok: true,
      request: {
        kind: "FOLLOW",
        courseId: "course-1",
        courseOther: null,
        description: "Oefeningen hoofdstuk 3",
        preferredPeriod: "voor het examen in januari",
      },
    });
  });

  it("maakt van een lege periode null", () => {
    const result = parsePalPlusRequest({ ...follow, preferredPeriod: "  " }, now);
    if (!result.ok || result.request.kind !== "FOLLOW") throw new Error("verwacht een vraag");
    expect(result.request.preferredPeriod).toBeNull();
  });

  it("neemt een zelf ingetikt vak over wanneer het niet in de lijst staat", () => {
    const result = parsePalPlusRequest(
      { ...follow, courseId: PAL_PLUS_OTHER_COURSE, courseOther: " Thermodynamica " },
      now,
    );
    if (!result.ok) throw new Error("verwacht ok");
    expect(result.request.courseId).toBeNull();
    expect(result.request.courseOther).toBe("Thermodynamica");
  });

  it("vraagt een vak", () => {
    expect(parsePalPlusRequest({ ...follow, courseId: "" }, now)).toEqual({ ok: false, error: "COURSE_REQUIRED" });
    expect(parsePalPlusRequest({ ...follow, courseId: PAL_PLUS_OTHER_COURSE }, now)).toEqual({
      ok: false,
      error: "COURSE_REQUIRED",
    });
    expect(
      parsePalPlusRequest(
        { ...follow, courseId: PAL_PLUS_OTHER_COURSE, courseOther: "a".repeat(PAL_PLUS_LIMITS.courseOther + 1) },
        now,
      ),
    ).toEqual({ ok: false, error: "COURSE_OTHER_TOO_LONG" });
  });

  it("vraagt een omschrijving van de sessie", () => {
    expect(parsePalPlusRequest({ ...follow, description: " " }, now)).toEqual({
      ok: false,
      error: "DESCRIPTION_REQUIRED",
    });
    expect(
      parsePalPlusRequest({ ...follow, description: "a".repeat(PAL_PLUS_LIMITS.description + 1) }, now),
    ).toEqual({ ok: false, error: "DESCRIPTION_TOO_LONG" });
  });

  it("weigert een te lange periode", () => {
    expect(
      parsePalPlusRequest({ ...follow, preferredPeriod: "a".repeat(PAL_PLUS_LIMITS.preferredPeriod + 1) }, now),
    ).toEqual({ ok: false, error: "PERIOD_TOO_LONG" });
  });

  it("vraagt bij een aanbod een volledig en geldig moment", () => {
    expect(parsePalPlusRequest({ ...give, date: "" }, now)).toEqual({ ok: false, error: "MOMENT_REQUIRED" });
    expect(parsePalPlusRequest({ ...give, endTime: "" }, now)).toEqual({ ok: false, error: "MOMENT_REQUIRED" });
    expect(parsePalPlusRequest({ ...give, date: "2026-02-31" }, now)).toEqual({ ok: false, error: "MOMENT_INVALID" });
    expect(parsePalPlusRequest({ ...give, startTime: "25:00" }, now)).toEqual({ ok: false, error: "MOMENT_INVALID" });
  });

  it("weigert een einde voor het begin of een sessie van meer dan zes uur", () => {
    expect(parsePalPlusRequest({ ...give, endTime: "13:00" }, now)).toEqual({ ok: false, error: "MOMENT_ORDER" });
    expect(parsePalPlusRequest({ ...give, endTime: "14:00" }, now)).toEqual({ ok: false, error: "MOMENT_ORDER" });
    expect(parsePalPlusRequest({ ...give, startTime: "09:00", endTime: "15:01" }, now)).toEqual({
      ok: false,
      error: "MOMENT_TOO_LONG",
    });
    expect(parsePalPlusRequest({ ...give, startTime: "09:00", endTime: "15:00" }, now).ok).toBe(true);
  });

  it("weigert een moment dat voorbij is of meer dan een jaar vooruit ligt", () => {
    expect(parsePalPlusRequest({ ...give, date: "2026-10-05", startTime: "09:00", endTime: "10:00" }, now)).toEqual({
      ok: false,
      error: "MOMENT_PAST",
    });
    expect(parsePalPlusRequest({ ...give, date: "2027-10-12" }, now)).toEqual({ ok: false, error: "MOMENT_TOO_FAR" });
  });

  it("negeert de momentvelden bij een vraag", () => {
    expect(parsePalPlusRequest({ ...follow, date: "2026-02-31", startTime: "x" }, now).ok).toBe(true);
  });
});

describe("statussen", () => {
  it("laat een aanbod wachten en een vraag meteen openstaan", () => {
    expect(initialPalPlusStatus("GIVE")).toBe("PENDING");
    expect(initialPalPlusStatus("FOLLOW")).toBe("OPEN");
    expect(reopenedPalPlusStatus("GIVE")).toBe("PENDING");
    expect(reopenedPalPlusStatus("FOLLOW")).toBe("OPEN");
  });

  it("noemt enkel wachtend en open nog actief", () => {
    expect(isActivePalPlusStatus("PENDING")).toBe(true);
    expect(isActivePalPlusStatus("OPEN")).toBe(true);
    expect(isActivePalPlusStatus("PLANNED")).toBe(false);
    expect(isActivePalPlusStatus("CLOSED")).toBe(false);
    expect(isActivePalPlusStatus("WITHDRAWN")).toBe(false);
  });

  it("telt de indiener mee bij wie een vraag zoekt", () => {
    expect(palPlusAskerCount(0)).toBe(1);
    expect(palPlusAskerCount(4)).toBe(5);
  });

  it("toont het vak uit de lijst, of wat de indiener intikte", () => {
    const course = { code: "H01A0B", nameNl: "Analyse I", nameEn: null };
    expect(palPlusRequestCourseLabel({ course, courseOther: "analyse" }, "nl")).toBe("Analyse I (H01A0B)");
    expect(palPlusRequestCourseLabel({ course: null, courseOther: "Thermo" }, "nl")).toBe("Thermo");
  });
});
