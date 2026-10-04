/**
 * PAL+, los van React, Next en Prisma.
 *
 * Alles hier is puur: de vakkenlijst en de aanvragen valideren, wat een status
 * toelaat, en de regel voor de bonnetjes van een tutor. Zo is het te testen
 * zonder een render, een request of een databank (test/palPlus.test.ts). De
 * kringkeuzes erachter staan in docs/design-decisions.md ("PAL+").
 *
 * Bevat geen server-only imports: de formulieren gebruiken dezelfde limieten.
 */

import { brusselsMinutesOfDay, brusselsWallClockMinutes, brusselsYMD, ymdKey } from "@/lib/brussels";
import { parseDateTimeFields } from "@/lib/lesbezoeken";

// -----------------------------------------------------------------------------
// Bonnetjes
// -----------------------------------------------------------------------------

/** Wat een tutor verdient per gepland uur, voor elke tutor van de sessie. */
export const PAL_PLUS_VOUCHERS_PER_HOUR = 1;

/**
 * De bonnetjes voor één tutor van een sessie van `startsAt` tot `endsAt`: één
 * per gepland uur, afgerond op het dichtste halve bonnetje (anderhalf uur is
 * anderhalf bonnetje, een uur en drie kwartier zijn er twee).
 *
 * Het geplande moment telt, niet hoe lang het echt duurde: dat weet niemand
 * zeker, en een correctie van Onderwijs blijft altijd mogelijk. Halve
 * bonnetjes bestaan al, want een broodje kan er een half kosten; fijner dan
 * een half gaat het nooit, zodat het saldo exact blijft optellen.
 */
export function palPlusReward(startsAt: Date, endsAt: Date): number {
  const hours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * PAL_PLUS_VOUCHERS_PER_HOUR * 2) / 2;
}

// -----------------------------------------------------------------------------
// Vakkenlijst
// -----------------------------------------------------------------------------

export const PAL_PLUS_LIMITS = {
  courseCode: 12,
  courseName: 120,
  courseOther: 120,
  description: 1000,
  preferredPeriod: 120,
  reviewNote: 500,
  roomText: 120,
  cancelReason: 500,
  maxParticipants: 500,
  tutors: 5,
} as const;

export type PalPlusCourseErrorCode =
  | "COURSE_NAME_REQUIRED"
  | "COURSE_NAME_TOO_LONG"
  | "COURSE_CODE_INVALID"
  | "COURSE_CODE_TAKEN"
  | "COURSE_IN_USE";

/**
 * Maakt van wat iemand intikt of plakt een OPO-code: hoofdletters, zonder
 * spaties en zonder het voorvoegsel `B-KUL-` uit de studiegids. Leeg blijft
 * leeg (`null`): een vak zonder code mag. Geeft `undefined` terug wanneer er
 * iets ingevuld is dat geen code kan zijn.
 */
export function normalizeCourseCode(raw: string): string | null | undefined {
  const compact = raw.replace(/\s+/g, "").toUpperCase().replace(/^B-KUL-/, "");
  if (!compact) return null;
  if (compact.length > PAL_PLUS_LIMITS.courseCode) return undefined;
  return /^[A-Z0-9]+$/.test(compact) ? compact : undefined;
}

export type PalPlusCourseInput = {
  code: string | null;
  nameNl: string;
  nameEn: string | null;
  active: boolean;
};

/** Valideert het formulier van één vak. */
export function parsePalPlusCourse(raw: {
  code: string;
  nameNl: string;
  nameEn: string;
  active: boolean;
}): { ok: true; course: PalPlusCourseInput } | { ok: false; error: PalPlusCourseErrorCode } {
  const nameNl = raw.nameNl.trim();
  const nameEn = raw.nameEn.trim();
  if (!nameNl) return { ok: false, error: "COURSE_NAME_REQUIRED" };
  if (nameNl.length > PAL_PLUS_LIMITS.courseName || nameEn.length > PAL_PLUS_LIMITS.courseName) {
    return { ok: false, error: "COURSE_NAME_TOO_LONG" };
  }

  const code = normalizeCourseCode(raw.code);
  if (code === undefined) return { ok: false, error: "COURSE_CODE_INVALID" };

  return {
    ok: true,
    course: { code, nameNl, nameEn: nameEn || null, active: raw.active },
  };
}

/** De naam van een vak in de taal van de lezer, met de code erachter. */
export function palPlusCourseLabel(
  course: { code: string | null; nameNl: string; nameEn: string | null },
  locale: "nl" | "en",
): string {
  const name = locale === "en" && course.nameEn ? course.nameEn : course.nameNl;
  return course.code ? `${name} (${course.code})` : name;
}

// -----------------------------------------------------------------------------
// Aanvragen: een aanbod om te geven, of een vraag om hulp
// -----------------------------------------------------------------------------

export type PalPlusRequestKindCode = "GIVE" | "FOLLOW";
export type PalPlusRequestStatusCode = "PENDING" | "OPEN" | "PLANNED" | "CLOSED" | "WITHDRAWN";

/** De waarde van "mijn vak staat er niet tussen" in de keuzelijst. */
export const PAL_PLUS_OTHER_COURSE = "__other__";

/**
 * Hoeveel aanvragen één persoon tegelijk mag hebben openstaan. Ruim genoeg voor
 * iemand die bij vijf vakken hulp zoekt en er twee wil geven; genoeg om te
 * voorkomen dat één account de lijst van open vragen vult.
 */
export const PAL_PLUS_MAX_ACTIVE_REQUESTS = 10;

/** Langer dan dit is bijna zeker een tikfout in het uur, geen sessie. */
export const PAL_PLUS_MAX_SESSION_MINUTES = 6 * 60;

/** Zo ver vooruit mag een tutor een moment voorstellen. */
export const PAL_PLUS_MAX_LEAD_DAYS = 365;

export type PalPlusRequestErrorCode =
  | "LOGIN_REQUIRED"
  | "COURSE_REQUIRED"
  | "COURSE_UNKNOWN"
  | "COURSE_OTHER_TOO_LONG"
  | "DESCRIPTION_REQUIRED"
  | "DESCRIPTION_TOO_LONG"
  | "PERIOD_TOO_LONG"
  | "MOMENT_REQUIRED"
  | "MOMENT_INVALID"
  | "MOMENT_ORDER"
  | "MOMENT_TOO_LONG"
  | "MOMENT_PAST"
  | "MOMENT_TOO_FAR"
  | "TOO_MANY_ACTIVE";

export type RawPalPlusRequest = {
  kind: string;
  courseId: string;
  courseOther: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  preferredPeriod: string;
};

type CourseChoice = { courseId: string | null; courseOther: string | null };

export type ParsedPalPlusRequest =
  | (CourseChoice & {
      kind: "GIVE";
      description: string;
      proposedStartsAt: Date;
      proposedEndsAt: Date;
    })
  | (CourseChoice & {
      kind: "FOLLOW";
      description: string;
      preferredPeriod: string | null;
    });

/**
 * Valideert het formulier "ik wil een sessie geven" of "ik zoek hulp". Of het
 * gekozen vak echt bestaat en nog aanstaat, weet enkel de databank; dat
 * controleert de action erna.
 *
 * Het moment van een aanbod is Brusselse wandklok: wie "14:00" intikt, bedoelt
 * 14:00 hier, ook als de server in UTC draait.
 */
export function parsePalPlusRequest(
  raw: RawPalPlusRequest,
  now: Date,
): { ok: true; request: ParsedPalPlusRequest } | { ok: false; error: PalPlusRequestErrorCode } {
  const kind: PalPlusRequestKindCode = raw.kind === "GIVE" ? "GIVE" : "FOLLOW";

  let course: CourseChoice;
  const courseOther = raw.courseOther.trim();
  if (raw.courseId === PAL_PLUS_OTHER_COURSE) {
    if (!courseOther) return { ok: false, error: "COURSE_REQUIRED" };
    if (courseOther.length > PAL_PLUS_LIMITS.courseOther) {
      return { ok: false, error: "COURSE_OTHER_TOO_LONG" };
    }
    course = { courseId: null, courseOther };
  } else if (raw.courseId) {
    course = { courseId: raw.courseId, courseOther: null };
  } else {
    return { ok: false, error: "COURSE_REQUIRED" };
  }

  const description = raw.description.trim();
  if (!description) return { ok: false, error: "DESCRIPTION_REQUIRED" };
  if (description.length > PAL_PLUS_LIMITS.description) {
    return { ok: false, error: "DESCRIPTION_TOO_LONG" };
  }

  if (kind === "FOLLOW") {
    const preferredPeriod = raw.preferredPeriod.trim();
    if (preferredPeriod.length > PAL_PLUS_LIMITS.preferredPeriod) {
      return { ok: false, error: "PERIOD_TOO_LONG" };
    }
    return {
      ok: true,
      request: { kind, ...course, description, preferredPeriod: preferredPeriod || null },
    };
  }

  const moment = parsePalPlusMoment(raw.date, raw.startTime, raw.endTime);
  if (!moment.ok) return moment;
  const { startsAt: proposedStartsAt, endsAt: proposedEndsAt } = moment;
  if (proposedStartsAt.getTime() <= now.getTime()) return { ok: false, error: "MOMENT_PAST" };
  if (proposedStartsAt.getTime() - now.getTime() > PAL_PLUS_MAX_LEAD_DAYS * 86_400_000) {
    return { ok: false, error: "MOMENT_TOO_FAR" };
  }

  return {
    ok: true,
    request: { kind, ...course, description, proposedStartsAt, proposedEndsAt },
  };
}

type MomentErrorCode = "MOMENT_REQUIRED" | "MOMENT_INVALID" | "MOMENT_ORDER" | "MOMENT_TOO_LONG";

/**
 * Een datum met een begin- en einduur, als Brusselse wandklok. Een sessie valt
 * altijd binnen één dag; een einde na middernacht is bijna zeker een tikfout.
 */
export function parsePalPlusMoment(
  date: string,
  startTime: string,
  endTime: string,
): { ok: true; startsAt: Date; endsAt: Date } | { ok: false; error: MomentErrorCode } {
  if (!date || !startTime || !endTime) return { ok: false, error: "MOMENT_REQUIRED" };
  const start = parseDateTimeFields(date, startTime);
  const end = parseDateTimeFields(date, endTime);
  if (!start || !end) return { ok: false, error: "MOMENT_INVALID" };
  if (end.minutes <= start.minutes) return { ok: false, error: "MOMENT_ORDER" };
  if (end.minutes - start.minutes > PAL_PLUS_MAX_SESSION_MINUTES) {
    return { ok: false, error: "MOMENT_TOO_LONG" };
  }
  return {
    ok: true,
    startsAt: brusselsWallClockMinutes(start, start.minutes),
    endsAt: brusselsWallClockMinutes(end, end.minutes),
  };
}

/**
 * Waar een nieuwe aanvraag begint: allebei bij Onderwijs. Een aanbod wacht tot
 * er een sessie van komt; een vraag tot Onderwijs ze nakeek en online zette
 * (`canPublishPalPlusRequest`), want pas dan staat ze op de publieke pagina.
 */
export function initialPalPlusStatus(): PalPlusRequestStatusCode {
  return "PENDING";
}

/** Een vraag die nog nagekeken moet worden, kan Onderwijs online zetten. Een aanbod niet: dat wordt een sessie. */
export function canPublishPalPlusRequest(request: {
  kind: PalPlusRequestKindCode;
  status: PalPlusRequestStatusCode;
}): boolean {
  return request.kind === "FOLLOW" && request.status === "PENDING";
}

/** Nog niet afgehandeld: de indiener kan intrekken, Onderwijs kan sluiten. */
export function isActivePalPlusStatus(status: PalPlusRequestStatusCode): boolean {
  return status === "PENDING" || status === "OPEN";
}

/**
 * Waar een gesloten aanvraag naar terugkeert wanneer Onderwijs ze heropent:
 * terug in het werkbakje, ook een vraag die al eens online stond. Of ze weer op
 * de pagina mag, beslist Onderwijs opnieuw.
 */
export function reopenedPalPlusStatus(): PalPlusRequestStatusCode {
  return initialPalPlusStatus();
}

/**
 * Hoeveel mensen een vraag zoeken: wie ze stelde, plus wie ze steunt. De
 * indiener staat zelf niet in de steunlijst.
 */
export function palPlusAskerCount(backerCount: number): number {
  return backerCount + 1;
}

/** Hoe een status heet, voor de indiener en voor Onderwijs. */
export const PAL_PLUS_STATUS_LABELS: Record<PalPlusRequestStatusCode, { nl: string; en: string }> = {
  PENDING: { nl: "Wacht op Onderwijs", en: "Waiting for Onderwijs" },
  OPEN: { nl: "Zoekt een tutor", en: "Looking for a tutor" },
  PLANNED: { nl: "Sessie gepland", en: "Session planned" },
  CLOSED: { nl: "Gesloten", en: "Closed" },
  WITHDRAWN: { nl: "Ingetrokken", en: "Withdrawn" },
};

/** De naam van het vak van een aanvraag: uit de lijst, of zoals de indiener het intikte. */
export function palPlusRequestCourseLabel(
  request: {
    course: { code: string | null; nameNl: string; nameEn: string | null } | null;
    courseOther: string | null;
  },
  locale: "nl" | "en",
): string {
  if (request.course) return palPlusCourseLabel(request.course, locale);
  return request.courseOther ?? "";
}

// -----------------------------------------------------------------------------
// Sessies
// -----------------------------------------------------------------------------

export type PalPlusSessionErrorCode =
  | "COURSE_REQUIRED"
  | "COURSE_UNKNOWN"
  | "DESCRIPTION_TOO_LONG"
  | MomentErrorCode
  | "MAX_INVALID"
  | "MAX_BELOW_SIGNUPS"
  | "ROOM_TEXT_TOO_LONG"
  | "ROOM_UNKNOWN"
  | "TUTOR_REQUIRED"
  | "TUTORS_TOO_MANY"
  | "TUTOR_UNKNOWN"
  | "SESSION_GONE"
  | "SESSION_CANCELLED";

export type RawPalPlusSession = {
  courseId: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  maxParticipants: string;
  roomId: string;
  roomText: string;
  tutorIds: string[];
};

export type ParsedPalPlusSession = {
  courseId: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  maxParticipants: number | null;
  roomId: string | null;
  roomText: string | null;
  tutorIds: string[];
};

/**
 * Valideert het sessieformulier van Onderwijs. Of het vak, het lokaal en de
 * tutors bestaan, weet enkel de databank; dat controleert de action erna.
 *
 * Een moment in het verleden mag hier wel: Onderwijs kan een sessie die al
 * doorging achteraf invoeren, zodat de tutor ze toch telt.
 */
export function parsePalPlusSession(
  raw: RawPalPlusSession,
): { ok: true; session: ParsedPalPlusSession } | { ok: false; error: PalPlusSessionErrorCode } {
  if (!raw.courseId) return { ok: false, error: "COURSE_REQUIRED" };

  const description = raw.description.trim();
  if (description.length > PAL_PLUS_LIMITS.description) return { ok: false, error: "DESCRIPTION_TOO_LONG" };

  const moment = parsePalPlusMoment(raw.date, raw.startTime, raw.endTime);
  if (!moment.ok) return moment;

  let maxParticipants: number | null = null;
  const rawMax = raw.maxParticipants.trim();
  if (rawMax) {
    const value = Number(rawMax);
    if (!Number.isInteger(value) || value < 1 || value > PAL_PLUS_LIMITS.maxParticipants) {
      return { ok: false, error: "MAX_INVALID" };
    }
    maxParticipants = value;
  }

  // Een lokaal uit de lijst wint van vrije tekst; beide leeg = het lokaal volgt.
  const roomId = raw.roomId.trim() || null;
  const roomText = roomId ? null : raw.roomText.trim() || null;
  if (roomText && roomText.length > PAL_PLUS_LIMITS.roomText) return { ok: false, error: "ROOM_TEXT_TOO_LONG" };

  const tutorIds = [...new Set(raw.tutorIds.map((id) => id.trim()).filter(Boolean))];
  if (tutorIds.length === 0) return { ok: false, error: "TUTOR_REQUIRED" };
  if (tutorIds.length > PAL_PLUS_LIMITS.tutors) return { ok: false, error: "TUTORS_TOO_MANY" };

  return {
    ok: true,
    session: {
      courseId: raw.courseId,
      description,
      startsAt: moment.startsAt,
      endsAt: moment.endsAt,
      maxParticipants,
      roomId,
      roomText,
      tutorIds,
    },
  };
}

export type PalPlusSessionState = "cancelled" | "upcoming" | "running" | "past";

/** Een sessie heeft geen statusveld: ze is geannuleerd, of het uur beslist. */
export function palPlusSessionState(
  session: { startsAt: Date; endsAt: Date; cancelledAt: Date | null },
  now: Date,
): PalPlusSessionState {
  if (session.cancelledAt) return "cancelled";
  if (now.getTime() < session.startsAt.getTime()) return "upcoming";
  if (now.getTime() < session.endsAt.getTime()) return "running";
  return "past";
}

export type PalPlusSignupBlock = "CANCELLED" | "STARTED" | "FULL" | "IS_TUTOR";

/**
 * Waarom iemand zich niet (meer) kan inschrijven, of `null` als het kan.
 * Uitschrijven kan zolang de sessie niet begonnen is; daarvoor geldt enkel
 * `CANCELLED` en `STARTED`.
 */
export function palPlusSignupBlock(
  session: { startsAt: Date; endsAt: Date; cancelledAt: Date | null; maxParticipants: number | null },
  context: { attendeeCount: number; isTutor: boolean; now: Date },
): PalPlusSignupBlock | null {
  const state = palPlusSessionState(session, context.now);
  if (state === "cancelled") return "CANCELLED";
  if (state !== "upcoming") return "STARTED";
  if (context.isTutor) return "IS_TUTOR";
  if (session.maxParticipants !== null && context.attendeeCount >= session.maxParticipants) return "FULL";
  return null;
}

/**
 * Het lokaal van een sessie zoals studenten het in hun uurrooster zien
 * ("200K 00.06"), met de naam erachter; vrije tekst als het niet in de lijst
 * staat; `null` als het nog volgt.
 */
export function palPlusRoomLabel(
  room: { code: string | null; name: string; building: { shortCode: string | null } } | null,
  roomText: string | null,
): string | null {
  if (room) {
    const code = [room.building.shortCode, room.code].filter(Boolean).join(" ");
    return code ? `${code} (${room.name})` : room.name;
  }
  return roomText;
}

/**
 * Een opgeslagen moment terug naar de velden van een formulier: datum en uur in
 * Brusselse wandklok, zoals iemand ze intikte.
 */
export function palPlusWallClockFields(date: Date): { date: string; time: string } {
  const minutes = brusselsMinutesOfDay(date);
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { date: ymdKey(brusselsYMD(date)), time };
}

// -----------------------------------------------------------------------------
// Tutors: de lijst van Onderwijs en de correcties
// -----------------------------------------------------------------------------

/**
 * Vanaf zoveel gegeven sessies in een werkingsjaar is iemand een volwaardig
 * PAL-lid. Voorlopig enkel een markering in de lijst van Onderwijs; het
 * ontgrendelt niets op de site.
 */
export const PAL_PLUS_FULL_MEMBER_SESSIONS = 5;

/** Hoogstens zoveel bonnetjes voor één tutor van één sessie; meer is een tikfout. */
export const PAL_PLUS_MAX_REWARD = 24;

/**
 * Een gecorrigeerde beloning zoals Onderwijs ze intikt: "1,5" of "1.5", een
 * veelvoud van een half, van nul tot `PAL_PLUS_MAX_REWARD`. `null` als het dat
 * niet is.
 */
export function parsePalPlusRewardAmount(raw: string): number | null {
  const value = Number(raw.trim().replace(",", "."));
  if (!raw.trim() || !Number.isFinite(value)) return null;
  if (value < 0 || value > PAL_PLUS_MAX_REWARD) return null;
  return Number.isInteger(value * 2) ? value : null;
}

/** Of een tutor met zoveel gegeven sessies een volwaardig PAL-lid is. */
export function isPalPlusFullMember(sessionsGiven: number): boolean {
  return sessionsGiven >= PAL_PLUS_FULL_MEMBER_SESSIONS;
}
