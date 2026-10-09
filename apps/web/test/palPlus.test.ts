import { describe, expect, it } from "vitest";
import {
  canAnswerPalPlusCoTutor,
  canonicalPalPlusTags,
  canPublishPalPlusRequest,
  palPlusAvailabilityGrid,
  palPlusAvailabilityLines,
  palPlusAvailabilitySnapshot,
  parsePalPlusDaypart,
  parsePalPlusTags,
  readPalPlusAvailability,
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
  const give: RawPalPlusRequest = {
    kind: "GIVE",
    courseId: "course-1",
    courseOther: "",
    description: "Oefeningen hoofdstuk 3",
    tags: ["Oefeningen", " Hoofdstuk  3 "],
    availability: ["1:avond", "3:namiddag"],
    availabilityNote: "",
    coTutor: "",
    preferredPeriod: "",
  };
  const follow: RawPalPlusRequest = {
    ...give,
    kind: "FOLLOW",
    availability: [],
    preferredPeriod: "voor het examen in januari",
  };

  it("aanvaardt een aanbod met tags en aangevinkte vakjes", () => {
    const result = parsePalPlusRequest(give);
    if (!result.ok || result.request.kind !== "GIVE") throw new Error("verwacht een aanbod");
    expect(result.request.courseId).toBe("course-1");
    expect(result.request.courseOther).toBeNull();
    expect(result.request.tags).toEqual(["Oefeningen", "Hoofdstuk 3"]);
    expect(result.request.availability).toEqual([
      { day: 1, daypartId: "avond" },
      { day: 3, daypartId: "namiddag" },
    ]);
    expect(result.request.availabilityNote).toBeNull();
    expect(result.request.coTutorRNumber).toBeNull();
  });

  it("aanvaardt een vraag met een periode in eigen woorden, zonder rooster", () => {
    expect(parsePalPlusRequest(follow)).toEqual({
      ok: true,
      request: {
        kind: "FOLLOW",
        courseId: "course-1",
        courseOther: null,
        description: "Oefeningen hoofdstuk 3",
        tags: ["Oefeningen", "Hoofdstuk 3"],
        preferredPeriod: "voor het examen in januari",
      },
    });
  });

  it("maakt van een lege periode null", () => {
    const result = parsePalPlusRequest({ ...follow, preferredPeriod: "  " });
    if (!result.ok || result.request.kind !== "FOLLOW") throw new Error("verwacht een vraag");
    expect(result.request.preferredPeriod).toBeNull();
  });

  it("neemt een zelf ingetikt vak over wanneer het niet in de lijst staat", () => {
    const result = parsePalPlusRequest({ ...follow, courseId: PAL_PLUS_OTHER_COURSE, courseOther: " Thermodynamica " });
    if (!result.ok) throw new Error("verwacht ok");
    expect(result.request.courseId).toBeNull();
    expect(result.request.courseOther).toBe("Thermodynamica");
  });

  it("vraagt een vak", () => {
    expect(parsePalPlusRequest({ ...follow, courseId: "" })).toEqual({ ok: false, error: "COURSE_REQUIRED" });
    expect(parsePalPlusRequest({ ...follow, courseId: PAL_PLUS_OTHER_COURSE })).toEqual({
      ok: false,
      error: "COURSE_REQUIRED",
    });
    expect(
      parsePalPlusRequest({
        ...follow,
        courseId: PAL_PLUS_OTHER_COURSE,
        courseOther: "a".repeat(PAL_PLUS_LIMITS.courseOther + 1),
      }),
    ).toEqual({ ok: false, error: "COURSE_OTHER_TOO_LONG" });
  });

  it("vraagt een omschrijving van de sessie", () => {
    expect(parsePalPlusRequest({ ...follow, description: " " })).toEqual({ ok: false, error: "DESCRIPTION_REQUIRED" });
    expect(parsePalPlusRequest({ ...follow, description: "a".repeat(PAL_PLUS_LIMITS.description + 1) })).toEqual({
      ok: false,
      error: "DESCRIPTION_TOO_LONG",
    });
  });

  it("weigert een te lange periode", () => {
    expect(parsePalPlusRequest({ ...follow, preferredPeriod: "a".repeat(PAL_PLUS_LIMITS.preferredPeriod + 1) })).toEqual({
      ok: false,
      error: "PERIOD_TOO_LONG",
    });
  });

  it("vraagt bij een aanbod minstens een vakje of een opmerking", () => {
    expect(parsePalPlusRequest({ ...give, availability: [] })).toEqual({ ok: false, error: "AVAILABILITY_REQUIRED" });
    const noteOnly = parsePalPlusRequest({ ...give, availability: [], availabilityNote: " enkel op 14 oktober " });
    if (!noteOnly.ok || noteOnly.request.kind !== "GIVE") throw new Error("verwacht een aanbod");
    expect(noteOnly.request.availabilityNote).toBe("enkel op 14 oktober");
  });

  it("weigert een vakje dat er niet als een vakje uitziet, en een te lange opmerking", () => {
    expect(parsePalPlusRequest({ ...give, availability: ["8:avond"] })).toEqual({ ok: false, error: "AVAILABILITY_INVALID" });
    expect(parsePalPlusRequest({ ...give, availability: ["maandag"] })).toEqual({ ok: false, error: "AVAILABILITY_INVALID" });
    expect(
      parsePalPlusRequest({ ...give, availabilityNote: "a".repeat(PAL_PLUS_LIMITS.availabilityNote + 1) }),
    ).toEqual({ ok: false, error: "AVAILABILITY_NOTE_TOO_LONG" });
  });

  it("leest het r-nummer van de medetutor zoals iemand het intikt", () => {
    for (const typed of ["r0123456", "R0123456", "0123456", " r 0123456 "]) {
      const result = parsePalPlusRequest({ ...give, coTutor: typed });
      if (!result.ok || result.request.kind !== "GIVE") throw new Error("verwacht een aanbod");
      expect(result.request.coTutorRNumber).toBe("r0123456");
    }
    expect(parsePalPlusRequest({ ...give, coTutor: "r12" })).toEqual({ ok: false, error: "COTUTOR_INVALID" });
  });

  it("negeert het rooster en de medetutor bij een vraag", () => {
    expect(parsePalPlusRequest({ ...follow, availability: ["x"], coTutor: "nee" }).ok).toBe(true);
  });
});

describe("tags", () => {
  it("ruimt op, haalt dubbels weg ongeacht hoofdletters en houdt de eerste schrijfwijze", () => {
    expect(parsePalPlusTags(["  Theorie ", "theorie", "", "Hoofdstuk   3"])).toEqual({
      ok: true,
      tags: ["Theorie", "Hoofdstuk 3"],
    });
  });

  it("weigert een te lange tag of te veel tags in plaats van stil in te korten", () => {
    expect(parsePalPlusTags(["a".repeat(PAL_PLUS_LIMITS.tag + 1)])).toEqual({ ok: false, error: "TAG_TOO_LONG" });
    expect(parsePalPlusTags(["a", "b", "c", "d", "e", "f"])).toEqual({ ok: false, error: "TOO_MANY_TAGS" });
  });

  it("zet een tag op de schrijfwijze van een snelle tag", () => {
    expect(canonicalPalPlusTags(["oefeningen", "Hoofdstuk 3"], ["Oefeningen", "Theorie"])).toEqual([
      "Oefeningen",
      "Hoofdstuk 3",
    ]);
  });
});

describe("beschikbaarheid", () => {
  const dayparts = [
    { id: "avond", labelNl: "Avond", labelEn: "Evening", startMinutes: 1080, endMinutes: 1320 },
    { id: "namiddag", labelNl: "Namiddag", labelEn: "Afternoon", startMinutes: 780, endMinutes: 1080 },
  ];

  it("bewaart de aangevinkte vakjes met de naam en de uren van nu, gesorteerd", () => {
    expect(
      palPlusAvailabilitySnapshot(
        [
          { day: 3, daypartId: "avond" },
          { day: 1, daypartId: "avond" },
          { day: 3, daypartId: "namiddag" },
        ],
        dayparts,
      ),
    ).toEqual([
      { day: 1, start: 1080, end: 1320, label: "Avond" },
      { day: 3, start: 780, end: 1080, label: "Namiddag" },
      { day: 3, start: 1080, end: 1320, label: "Avond" },
    ]);
  });

  it("weigert een vakje met een dagdeel dat er niet (meer) is", () => {
    expect(palPlusAvailabilitySnapshot([{ day: 1, daypartId: "nacht" }], dayparts)).toBeNull();
  });

  it("leest een bewaarde momentopname terug en laat rommel vallen", () => {
    expect(
      readPalPlusAvailability([{ day: 2, start: 480, end: 720, label: "Voormiddag" }, { day: 9 }, "x", null]),
    ).toEqual([{ day: 2, start: 480, end: 720, label: "Voormiddag" }]);
    expect(readPalPlusAvailability(null)).toEqual([]);
  });

  it("toont het rooster met enkel de dagen en dagdelen die erin voorkomen", () => {
    const grid = palPlusAvailabilityGrid([
      { day: 3, start: 1080, end: 1320, label: "Avond" },
      { day: 1, start: 1080, end: 1320, label: "Avond" },
      { day: 1, start: 780, end: 1080, label: "Namiddag" },
    ]);
    expect(grid.columns.map((column) => `${column.label} ${column.hours}`)).toEqual([
      "Namiddag 13:00-18:00",
      "Avond 18:00-22:00",
    ]);
    expect(grid.rows.map((row) => [row.day, row.keys.length])).toEqual([
      [1, 2],
      [3, 1],
    ]);
  });

  it("schrijft het rooster als tekst, een regel per dag", () => {
    expect(
      palPlusAvailabilityLines(
        [
          { day: 1, start: 1080, end: 1320, label: "Avond" },
          { day: 1, start: 780, end: 1080, label: "Namiddag" },
        ],
        "nl",
      ),
    ).toEqual(["Maandag: Namiddag (13:00-18:00), Avond (18:00-22:00)"]);
  });

  it("leest een dagdeel uit het beheer", () => {
    expect(parsePalPlusDaypart({ labelNl: " Avond ", labelEn: "", start: "18:00", end: "22:00" })).toEqual({
      ok: true,
      daypart: { labelNl: "Avond", labelEn: null, startMinutes: 1080, endMinutes: 1320 },
    });
    expect(parsePalPlusDaypart({ labelNl: "", labelEn: "", start: "18:00", end: "22:00" })).toEqual({
      ok: false,
      error: "DAYPART_LABEL_REQUIRED",
    });
    expect(parsePalPlusDaypart({ labelNl: "Avond", labelEn: "", start: "18", end: "22:00" })).toEqual({
      ok: false,
      error: "DAYPART_TIME_INVALID",
    });
    expect(parsePalPlusDaypart({ labelNl: "Avond", labelEn: "", start: "22:00", end: "18:00" })).toEqual({
      ok: false,
      error: "DAYPART_TIME_ORDER",
    });
  });
});

describe("tweede tutor", () => {
  it("kan antwoorden zolang het aanbod bij Onderwijs wacht", () => {
    expect(canAnswerPalPlusCoTutor({ kind: "GIVE", status: "PENDING", coTutorStatus: "PENDING" })).toBe(true);
    expect(canAnswerPalPlusCoTutor({ kind: "GIVE", status: "PLANNED", coTutorStatus: "PENDING" })).toBe(false);
    expect(canAnswerPalPlusCoTutor({ kind: "GIVE", status: "PENDING", coTutorStatus: "ACCEPTED" })).toBe(false);
    expect(canAnswerPalPlusCoTutor({ kind: "FOLLOW", status: "PENDING", coTutorStatus: "PENDING" })).toBe(false);
  });
});

describe("statussen", () => {
  it("laat een aanbod en een vraag allebei eerst wachten op Onderwijs", () => {
    expect(initialPalPlusStatus()).toBe("PENDING");
    expect(reopenedPalPlusStatus()).toBe("PENDING");
  });

  it("zet enkel een wachtende vraag online", () => {
    expect(canPublishPalPlusRequest({ kind: "FOLLOW", status: "PENDING" })).toBe(true);
    expect(canPublishPalPlusRequest({ kind: "FOLLOW", status: "OPEN" })).toBe(false);
    expect(canPublishPalPlusRequest({ kind: "FOLLOW", status: "CLOSED" })).toBe(false);
    expect(canPublishPalPlusRequest({ kind: "GIVE", status: "PENDING" })).toBe(false);
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
    tags: [],
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
