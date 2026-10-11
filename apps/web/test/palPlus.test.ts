import { describe, expect, it } from "vitest";
import {
  canAcceptPalPlusRequest,
  canAnswerPalPlusCoTutor,
  canonicalPalPlusTags,
  canPublishPalPlusRequest,
  palPlusGridDays,
  palPlusGridSlots,
  palPlusMomentLabel,
  palPlusProposedMomentsJson,
  palPlusSlotIsPast,
  palPlusSlotsToMoments,
  parsePalPlusProposedMoments,
  parsePalPlusTags,
  readPalPlusProposedMoments,
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

/** Een zondagavond voor de momenten in de tests. */
const NOW = new Date("2026-10-11T20:00:00+02:00");

describe("parsePalPlusRequest", () => {
  const parseRequest = (raw: RawPalPlusRequest) => parsePalPlusRequest(raw, NOW);
  const give: RawPalPlusRequest = {
    kind: "GIVE",
    courseId: "course-1",
    courseOther: "",
    description: "Oefeningen hoofdstuk 3",
    tags: ["Oefeningen", " Hoofdstuk  3 "],
    moments: [
      { date: "2026-10-15", startTime: "19:00", endTime: "21:00" },
      { date: "2026-10-13", startTime: "14:00", endTime: "16:00" },
    ],
    availabilityNote: "",
    coTutor: "",
    preferredPeriod: "",
  };
  const follow: RawPalPlusRequest = {
    ...give,
    kind: "FOLLOW",
    moments: [],
    preferredPeriod: "voor het examen in januari",
  };

  it("aanvaardt een aanbod met tags en momenten, de vroegste eerst", () => {
    const result = parseRequest(give);
    if (!result.ok || result.request.kind !== "GIVE") throw new Error("verwacht een aanbod");
    expect(result.request.courseId).toBe("course-1");
    expect(result.request.courseOther).toBeNull();
    expect(result.request.tags).toEqual(["Oefeningen", "Hoofdstuk 3"]);
    expect(result.request.moments).toEqual([
      { startsAt: new Date("2026-10-13T14:00:00+02:00"), endsAt: new Date("2026-10-13T16:00:00+02:00") },
      { startsAt: new Date("2026-10-15T19:00:00+02:00"), endsAt: new Date("2026-10-15T21:00:00+02:00") },
    ]);
    expect(result.request.availabilityNote).toBeNull();
    expect(result.request.coTutorRNumber).toBeNull();
  });

  it("aanvaardt een vraag met een periode in eigen woorden, zonder momenten", () => {
    expect(parseRequest(follow)).toEqual({
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
    const result = parseRequest({ ...follow, preferredPeriod: "  " });
    if (!result.ok || result.request.kind !== "FOLLOW") throw new Error("verwacht een vraag");
    expect(result.request.preferredPeriod).toBeNull();
  });

  it("neemt een zelf ingetikt vak over wanneer het niet in de lijst staat", () => {
    const result = parseRequest({ ...follow, courseId: PAL_PLUS_OTHER_COURSE, courseOther: " Thermodynamica " });
    if (!result.ok) throw new Error("verwacht ok");
    expect(result.request.courseId).toBeNull();
    expect(result.request.courseOther).toBe("Thermodynamica");
  });

  it("vraagt een vak", () => {
    expect(parseRequest({ ...follow, courseId: "" })).toEqual({ ok: false, error: "COURSE_REQUIRED" });
    expect(parseRequest({ ...follow, courseId: PAL_PLUS_OTHER_COURSE })).toEqual({
      ok: false,
      error: "COURSE_REQUIRED",
    });
    expect(
      parseRequest({
        ...follow,
        courseId: PAL_PLUS_OTHER_COURSE,
        courseOther: "a".repeat(PAL_PLUS_LIMITS.courseOther + 1),
      }),
    ).toEqual({ ok: false, error: "COURSE_OTHER_TOO_LONG" });
  });

  it("vraagt een omschrijving van de sessie", () => {
    expect(parseRequest({ ...follow, description: " " })).toEqual({ ok: false, error: "DESCRIPTION_REQUIRED" });
    expect(parseRequest({ ...follow, description: "a".repeat(PAL_PLUS_LIMITS.description + 1) })).toEqual({
      ok: false,
      error: "DESCRIPTION_TOO_LONG",
    });
  });

  it("weigert een te lange periode", () => {
    expect(parseRequest({ ...follow, preferredPeriod: "a".repeat(PAL_PLUS_LIMITS.preferredPeriod + 1) })).toEqual({
      ok: false,
      error: "PERIOD_TOO_LONG",
    });
  });

  it("vraagt bij een aanbod minstens één moment; een opmerking alleen volstaat niet", () => {
    expect(parseRequest({ ...give, moments: [] })).toEqual({ ok: false, error: "MOMENTS_REQUIRED" });
    expect(
      parseRequest({ ...give, moments: [{ date: "", startTime: "", endTime: "" }], availabilityNote: "dinsdagavond" }),
    ).toEqual({ ok: false, error: "MOMENTS_REQUIRED" });
  });

  it("bewaart de opmerking bij de momenten, en weigert een te lange", () => {
    const withNote = parseRequest({ ...give, availabilityNote: " liefst voor de tussentoets " });
    if (!withNote.ok || withNote.request.kind !== "GIVE") throw new Error("verwacht een aanbod");
    expect(withNote.request.availabilityNote).toBe("liefst voor de tussentoets");
    expect(
      parseRequest({ ...give, availabilityNote: "a".repeat(PAL_PLUS_LIMITS.availabilityNote + 1) }),
    ).toEqual({ ok: false, error: "AVAILABILITY_NOTE_TOO_LONG" });
  });

  it("leest het r-nummer van de medetutor zoals iemand het intikt", () => {
    for (const typed of ["r0123456", "R0123456", "0123456", " r 0123456 "]) {
      const result = parseRequest({ ...give, coTutor: typed });
      if (!result.ok || result.request.kind !== "GIVE") throw new Error("verwacht een aanbod");
      expect(result.request.coTutorRNumber).toBe("r0123456");
    }
    expect(parseRequest({ ...give, coTutor: "r12" })).toEqual({ ok: false, error: "COTUTOR_INVALID" });
  });

  it("negeert de momenten en de medetutor bij een vraag", () => {
    expect(parseRequest({ ...follow, moments: [{ date: "gisteren", startTime: "", endTime: "" }], coTutor: "nee" }).ok).toBe(
      true,
    );
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

describe("voorgestelde momenten", () => {
  const row = (date: string, startTime: string, endTime: string) => ({ date, startTime, endTime });

  it("laat lege rijen vallen, haalt dubbels weg en zet de vroegste eerst", () => {
    expect(
      parsePalPlusProposedMoments(
        [
          row("2026-10-15", "19:00", "21:00"),
          row("", "", ""),
          row("2026-10-13", "14:00", "16:00"),
          row("2026-10-15", "19:00", "21:00"),
        ],
        NOW,
      ),
    ).toEqual({
      ok: true,
      moments: [
        { startsAt: new Date("2026-10-13T14:00:00+02:00"), endsAt: new Date("2026-10-13T16:00:00+02:00") },
        { startsAt: new Date("2026-10-15T19:00:00+02:00"), endsAt: new Date("2026-10-15T21:00:00+02:00") },
      ],
    });
  });

  it("leest de uren als Brusselse wandklok, ook na de overgang naar wintertijd", () => {
    const result = parsePalPlusProposedMoments([row("2026-11-03", "19:00", "21:00")], NOW);
    if (!result.ok) throw new Error("verwacht ok");
    expect(result.moments[0]!.startsAt.toISOString()).toBe("2026-11-03T18:00:00.000Z");
  });

  it("weigert een half ingevulde rij in plaats van ze stil te laten vallen", () => {
    expect(parsePalPlusProposedMoments([row("2026-10-15", "19:00", "")], NOW)).toEqual({
      ok: false,
      error: "MOMENT_REQUIRED",
    });
  });

  it("aanvaardt een venster langer dan een sessie, maar geen einde voor het begin of een onbestaande datum", () => {
    expect(parsePalPlusProposedMoments([row("2026-10-15", "08:00", "20:00")], NOW).ok).toBe(true);
    expect(parsePalPlusProposedMoments([row("2026-10-15", "21:00", "19:00")], NOW)).toEqual({
      ok: false,
      error: "MOMENT_ORDER",
    });
    expect(parsePalPlusProposedMoments([row("2026-02-30", "19:00", "21:00")], NOW)).toEqual({
      ok: false,
      error: "MOMENT_INVALID",
    });
  });

  it("weigert een moment dat al voorbij is of nu begint", () => {
    expect(parsePalPlusProposedMoments([row("2026-10-11", "14:00", "16:00")], NOW)).toEqual({
      ok: false,
      error: "MOMENT_PAST",
    });
    expect(parsePalPlusProposedMoments([row("2026-10-11", "20:00", "21:00")], NOW)).toEqual({
      ok: false,
      error: "MOMENT_PAST",
    });
  });

  it("weigert meer momenten dan het maximum", () => {
    const many = Array.from({ length: PAL_PLUS_LIMITS.moments + 1 }, (_, index) => {
      const hour = String(8 + (index % 7) * 2).padStart(2, "0");
      return row(`2026-10-${13 + Math.floor(index / 7)}`, `${hour}:00`, `${hour}:30`);
    });
    expect(parsePalPlusProposedMoments(many, NOW)).toEqual({ ok: false, error: "TOO_MANY_MOMENTS" });
  });

  it("bewaart als ISO en leest terug, rommel en een oud weekrooster vallen weg", () => {
    const moments = [
      { startsAt: new Date("2026-10-15T19:00:00+02:00"), endsAt: new Date("2026-10-15T21:00:00+02:00") },
      { startsAt: new Date("2026-10-13T14:00:00+02:00"), endsAt: new Date("2026-10-13T16:00:00+02:00") },
    ];
    const json = palPlusProposedMomentsJson(moments);
    expect(json[0]).toEqual({ startsAt: "2026-10-15T17:00:00.000Z", endsAt: "2026-10-15T19:00:00.000Z" });
    expect(readPalPlusProposedMoments([...json, { day: 2, start: 480, end: 720, label: "Voormiddag" }, "x", null])).toEqual([
      moments[1],
      moments[0],
    ]);
    expect(readPalPlusProposedMoments(null)).toEqual([]);
  });

  it("schrijft een moment als dag, datum en uren in Brusselse tijd", () => {
    const moment = { startsAt: new Date("2026-10-13T19:00:00+02:00"), endsAt: new Date("2026-10-13T21:30:00+02:00") };
    expect(palPlusMomentLabel(moment, "nl")).toBe("Dinsdag 13 oktober, 19:00-21:30");
    expect(palPlusMomentLabel(moment, "en")).toBe("Tuesday 13 October, 19:00-21:30");
  });
});

describe("het rooster", () => {
  it("toont de komende zeven werkdagen, vandaag inbegrepen als het een werkdag is", () => {
    // Zondag: het rooster begint maandag en springt over het weekend.
    expect(palPlusGridDays(NOW)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-19",
      "2026-10-20",
    ]);
    // Woensdagavond 23:30 in Brussel is in UTC al donderdag; het rooster telt in Brussel.
    expect(palPlusGridDays(new Date("2026-10-14T23:30:00+02:00"))[0]).toBe("2026-10-14");
  });

  it("deelt de dag op in halve uren van 8 tot 22 uur", () => {
    const slots = palPlusGridSlots();
    expect(slots[0]).toBe(8 * 60);
    expect(slots.at(-1)).toBe(21 * 60 + 30);
    expect(slots).toHaveLength(28);
  });

  it("zet een halfuur dat al begon uit, en alles van gisteren", () => {
    expect(palPlusSlotIsPast("2026-10-12", 600, "2026-10-12", 610)).toBe(true);
    expect(palPlusSlotIsPast("2026-10-12", 630, "2026-10-12", 610)).toBe(false);
    expect(palPlusSlotIsPast("2026-10-11", 1200, "2026-10-12", 0)).toBe(true);
  });

  it("voegt aaneensluitende halve uren samen tot een blok per stuk, de vroegste eerst", () => {
    expect(
      palPlusSlotsToMoments([
        "2026-10-15|1140",
        "2026-10-13|840",
        "2026-10-15|1170",
        "2026-10-13|870",
        "2026-10-13|960",
        "rommel",
      ]),
    ).toEqual([
      { date: "2026-10-13", startTime: "14:00", endTime: "15:00" },
      { date: "2026-10-13", startTime: "16:00", endTime: "16:30" },
      { date: "2026-10-15", startTime: "19:00", endTime: "20:00" },
    ]);
  });
});

describe("tweede tutor", () => {
  it("kan antwoorden zolang er geen sessie van het aanbod kwam", () => {
    expect(canAnswerPalPlusCoTutor({ kind: "GIVE", status: "PENDING", coTutorStatus: "PENDING" })).toBe(true);
    expect(canAnswerPalPlusCoTutor({ kind: "GIVE", status: "ACCEPTED", coTutorStatus: "PENDING" })).toBe(true);
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

  it("aanvaardt enkel een wachtend aanbod zonder moment", () => {
    expect(canAcceptPalPlusRequest({ kind: "GIVE", status: "PENDING" })).toBe(true);
    expect(canAcceptPalPlusRequest({ kind: "GIVE", status: "ACCEPTED" })).toBe(false);
    expect(canAcceptPalPlusRequest({ kind: "GIVE", status: "PLANNED" })).toBe(false);
    expect(canAcceptPalPlusRequest({ kind: "FOLLOW", status: "PENDING" })).toBe(false);
  });

  it("noemt wachtend, open en aanvaard nog actief: er hangt nog geen sessie aan", () => {
    expect(isActivePalPlusStatus("PENDING")).toBe(true);
    expect(isActivePalPlusStatus("OPEN")).toBe(true);
    expect(isActivePalPlusStatus("ACCEPTED")).toBe(true);
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
