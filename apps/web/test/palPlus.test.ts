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
  parsePalPlusSession,
  palPlusRoomLabel,
  palPlusSessionState,
  palPlusSignupBlock,
  palPlusWallClockFields,
  parsePalPlusRewardAmount,
  isPalPlusFullMember,
  reopenedPalPlusStatus,
  PAL_PLUS_LIMITS,
  PAL_PLUS_OTHER_COURSE,
  type RawPalPlusRequest,
  type RawPalPlusSession,
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

describe("parsePalPlusSession", () => {
  const raw: RawPalPlusSession = {
    courseId: "course-1",
    description: " Oefeningen hoofdstuk 3 ",
    date: "2026-10-12",
    startTime: "14:00",
    endTime: "16:00",
    maxParticipants: "",
    roomId: "",
    roomText: "",
    tutorIds: ["user-1"],
  };

  it("aanvaardt een sessie zonder lokaal en zonder maximum", () => {
    const result = parsePalPlusSession(raw);
    if (!result.ok) throw new Error(result.error);
    expect(result.session).toMatchObject({
      courseId: "course-1",
      description: "Oefeningen hoofdstuk 3",
      maxParticipants: null,
      roomId: null,
      roomText: null,
      tutorIds: ["user-1"],
    });
    expect(result.session.startsAt.toISOString()).toBe("2026-10-12T12:00:00.000Z");
  });

  it("laat een lokaal uit de lijst winnen van vrije tekst", () => {
    const result = parsePalPlusSession({ ...raw, roomId: "room-1", roomText: "achteraan" });
    if (!result.ok) throw new Error(result.error);
    expect(result.session.roomId).toBe("room-1");
    expect(result.session.roomText).toBeNull();
  });

  it("neemt vrije tekst over wanneer er geen lokaal gekozen is", () => {
    const result = parsePalPlusSession({ ...raw, roomText: " Bib, studiezaal 2 " });
    if (!result.ok) throw new Error(result.error);
    expect(result.session.roomText).toBe("Bib, studiezaal 2");
  });

  it("aanvaardt een moment in het verleden, voor een sessie die al doorging", () => {
    expect(parsePalPlusSession({ ...raw, date: "2025-01-10" }).ok).toBe(true);
  });

  it("dedupliceert tutors en vraagt er minstens een, hoogstens vijf", () => {
    const result = parsePalPlusSession({ ...raw, tutorIds: ["a", "b", "a", " "] });
    if (!result.ok) throw new Error(result.error);
    expect(result.session.tutorIds).toEqual(["a", "b"]);
    expect(parsePalPlusSession({ ...raw, tutorIds: [] })).toEqual({ ok: false, error: "TUTOR_REQUIRED" });
    expect(parsePalPlusSession({ ...raw, tutorIds: ["1", "2", "3", "4", "5", "6"] })).toEqual({
      ok: false,
      error: "TUTORS_TOO_MANY",
    });
  });

  it("vraagt een vak en een geldig moment", () => {
    expect(parsePalPlusSession({ ...raw, courseId: "" })).toEqual({ ok: false, error: "COURSE_REQUIRED" });
    expect(parsePalPlusSession({ ...raw, endTime: "13:00" })).toEqual({ ok: false, error: "MOMENT_ORDER" });
    expect(parsePalPlusSession({ ...raw, date: "" })).toEqual({ ok: false, error: "MOMENT_REQUIRED" });
  });

  it("aanvaardt enkel een positief, geheel maximum", () => {
    expect(parsePalPlusSession({ ...raw, maxParticipants: "20" }).ok).toBe(true);
    for (const value of ["0", "-3", "2.5", "veel", String(PAL_PLUS_LIMITS.maxParticipants + 1)]) {
      expect(parsePalPlusSession({ ...raw, maxParticipants: value })).toEqual({ ok: false, error: "MAX_INVALID" });
    }
  });

  it("weigert een te lange lokaaltekst", () => {
    expect(parsePalPlusSession({ ...raw, roomText: "a".repeat(PAL_PLUS_LIMITS.roomText + 1) })).toEqual({
      ok: false,
      error: "ROOM_TEXT_TOO_LONG",
    });
  });
});

describe("sessies: toestand en inschrijven", () => {
  const session = {
    startsAt: new Date("2026-10-12T12:00:00Z"),
    endsAt: new Date("2026-10-12T14:00:00Z"),
    cancelledAt: null as Date | null,
    maxParticipants: 2 as number | null,
  };
  const before = new Date("2026-10-12T11:00:00Z");
  const during = new Date("2026-10-12T13:00:00Z");
  const after = new Date("2026-10-12T15:00:00Z");

  it("leidt de toestand af uit het uur en de annulering", () => {
    expect(palPlusSessionState(session, before)).toBe("upcoming");
    expect(palPlusSessionState(session, during)).toBe("running");
    expect(palPlusSessionState(session, after)).toBe("past");
    expect(palPlusSessionState({ ...session, cancelledAt: before }, before)).toBe("cancelled");
  });

  it("laat inschrijven zolang de sessie niet begon, niet vol is en je geen tutor bent", () => {
    const ctx = { attendeeCount: 1, isTutor: false, now: before };
    expect(palPlusSignupBlock(session, ctx)).toBeNull();
    expect(palPlusSignupBlock(session, { ...ctx, attendeeCount: 2 })).toBe("FULL");
    expect(palPlusSignupBlock({ ...session, maxParticipants: null }, { ...ctx, attendeeCount: 200 })).toBeNull();
    expect(palPlusSignupBlock(session, { ...ctx, isTutor: true })).toBe("IS_TUTOR");
    expect(palPlusSignupBlock(session, { ...ctx, now: during })).toBe("STARTED");
    expect(palPlusSignupBlock({ ...session, cancelledAt: before }, ctx)).toBe("CANCELLED");
  });
});

describe("palPlusRoomLabel", () => {
  const room = { code: "00.06", name: "Aula Rosalind Franklin", building: { shortCode: "200K" } };

  it("toont het lokaal zoals in het uurrooster, met de naam erachter", () => {
    expect(palPlusRoomLabel(room, null)).toBe("200K 00.06 (Aula Rosalind Franklin)");
  });

  it("valt terug op de naam, de vrije tekst, of niets", () => {
    expect(palPlusRoomLabel({ ...room, code: null, building: { shortCode: null } }, null)).toBe("Aula Rosalind Franklin");
    expect(palPlusRoomLabel(null, "Bib, studiezaal 2")).toBe("Bib, studiezaal 2");
    expect(palPlusRoomLabel(null, null)).toBeNull();
  });
});

describe("palPlusWallClockFields", () => {
  it("geeft datum en uur in Brusselse tijd terug, ook rond de overgang naar wintertijd", () => {
    expect(palPlusWallClockFields(new Date("2026-10-12T12:00:00Z"))).toEqual({ date: "2026-10-12", time: "14:00" });
    expect(palPlusWallClockFields(new Date("2026-11-09T13:30:00Z"))).toEqual({ date: "2026-11-09", time: "14:30" });
    expect(palPlusWallClockFields(new Date("2026-10-12T22:30:00Z"))).toEqual({ date: "2026-10-13", time: "00:30" });
  });
});

describe("tutors: correcties en de markering", () => {
  it("leest een beloning met komma of punt, in halve bonnetjes", () => {
    expect(parsePalPlusRewardAmount("1,5")).toBe(1.5);
    expect(parsePalPlusRewardAmount("2.5")).toBe(2.5);
    expect(parsePalPlusRewardAmount("0")).toBe(0);
    expect(parsePalPlusRewardAmount(" 3 ")).toBe(3);
  });

  it("weigert wat geen halve bonnetjes zijn, negatief is, te groot of leeg", () => {
    for (const raw of ["1,25", "-1", "25", "", "  ", "veel", "1,5,0"]) {
      expect(parsePalPlusRewardAmount(raw)).toBeNull();
    }
  });

  it("noemt vijf gegeven sessies een volwaardig PAL-lid", () => {
    expect(isPalPlusFullMember(4)).toBe(false);
    expect(isPalPlusFullMember(5)).toBe(true);
    expect(isPalPlusFullMember(9)).toBe(true);
  });
});
