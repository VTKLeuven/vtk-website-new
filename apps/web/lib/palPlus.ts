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

import { brusselsMinutesOfDay, brusselsWallClockMinutes, brusselsYMD, isoWeekday, shiftYMD, ymdKey } from "@/lib/brussels";
import { parseDateTimeFields } from "@/lib/lesbezoeken";
import { normalizeRNumber } from "@/lib/theokotPickupQuery";

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
  /** Een sessie heeft hoogstens twee tutors; een aanbod dus hoogstens één tweede. */
  tutors: 2,
  tags: 5,
  tag: 30,
  availabilityNote: 300,
  /**
   * Zoveel losse blokken mag het rooster hoogstens opleveren. Aaneensluitende
   * vakjes worden één blok, dus dit raakt enkel wie een dambord aanduidt.
   */
  moments: 20,
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
export type PalPlusRequestStatusCode = "PENDING" | "OPEN" | "ACCEPTED" | "PLANNED" | "CLOSED" | "WITHDRAWN";

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

export type PalPlusRequestErrorCode =
  | "LOGIN_REQUIRED"
  | "COURSE_REQUIRED"
  | "COURSE_UNKNOWN"
  | "COURSE_OTHER_TOO_LONG"
  | "DESCRIPTION_REQUIRED"
  | "DESCRIPTION_TOO_LONG"
  | "PERIOD_TOO_LONG"
  | "TAG_TOO_LONG"
  | "TOO_MANY_TAGS"
  | PalPlusProposedMomentsErrorCode
  | "AVAILABILITY_NOTE_TOO_LONG"
  | "COTUTOR_INVALID"
  | "COTUTOR_UNKNOWN"
  | "COTUTOR_SELF"
  | "TOO_MANY_ACTIVE";

export type RawPalPlusRequest = {
  kind: string;
  courseId: string;
  courseOther: string;
  description: string;
  tags: string[];
  /** De voorgestelde momenten van een aanbod, zoals ingetikt; lege rijen vallen weg. */
  moments: RawPalPlusMoment[];
  availabilityNote: string;
  /** Het r-nummer van wie mee geeft, zoals ingetikt. */
  coTutor: string;
  preferredPeriod: string;
};

type CourseChoice = { courseId: string | null; courseOther: string | null };

export type ParsedPalPlusRequest =
  | (CourseChoice & {
      kind: "GIVE";
      description: string;
      tags: string[];
      moments: PalPlusProposedMoment[];
      availabilityNote: string | null;
      coTutorRNumber: string | null;
    })
  | (CourseChoice & {
      kind: "FOLLOW";
      description: string;
      tags: string[];
      preferredPeriod: string | null;
    });

/**
 * Valideert het formulier "ik wil een sessie geven" of "ik zoek hulp". Of het
 * gekozen vak en de tweede tutor echt bestaan, weet enkel de databank; dat
 * controleert de action erna.
 *
 * Een aanbod zegt op welke concrete momenten die ene sessie kan doorgaan:
 * minstens één, allemaal na `now` (zie `parsePalPlusProposedMoments`).
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

  const tags = parsePalPlusTags(raw.tags);
  if (!tags.ok) return tags;

  if (kind === "FOLLOW") {
    const preferredPeriod = raw.preferredPeriod.trim();
    if (preferredPeriod.length > PAL_PLUS_LIMITS.preferredPeriod) {
      return { ok: false, error: "PERIOD_TOO_LONG" };
    }
    return {
      ok: true,
      request: { kind, ...course, description, tags: tags.tags, preferredPeriod: preferredPeriod || null },
    };
  }

  const moments = parsePalPlusProposedMoments(raw.moments, now);
  if (!moments.ok) return moments;
  const availabilityNote = raw.availabilityNote.trim();
  if (availabilityNote.length > PAL_PLUS_LIMITS.availabilityNote) {
    return { ok: false, error: "AVAILABILITY_NOTE_TOO_LONG" };
  }

  let coTutorRNumber: string | null = null;
  if (raw.coTutor.trim()) {
    coTutorRNumber = normalizeRNumber(raw.coTutor);
    if (!coTutorRNumber) return { ok: false, error: "COTUTOR_INVALID" };
  }

  return {
    ok: true,
    request: {
      kind,
      ...course,
      description,
      tags: tags.tags,
      moments: moments.moments,
      availabilityNote: availabilityNote || null,
      coTutorRNumber,
    },
  };
}

// -----------------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------------

/**
 * Tags zoals iemand ze intikte: spaties opgeruimd, dubbels eruit (hoofdletters
 * tellen niet, de eerste schrijfwijze wint), hoogstens vijf van elk dertig
 * tekens. Te veel of te lang is een fout en geen stille inkorting: dan ziet de
 * indiener wat er niet meekwam.
 */
export function parsePalPlusTags(
  raw: string[],
): { ok: true; tags: string[] } | { ok: false; error: "TAG_TOO_LONG" | "TOO_MANY_TAGS" } {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const tag = value.replace(/\s+/g, " ").trim();
    if (!tag) continue;
    if (tag.length > PAL_PLUS_LIMITS.tag) return { ok: false, error: "TAG_TOO_LONG" };
    const key = tag.toLocaleLowerCase("nl-BE");
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  if (tags.length > PAL_PLUS_LIMITS.tags) return { ok: false, error: "TOO_MANY_TAGS" };
  return { ok: true, tags };
}

/**
 * Zet een ingetikte tag op de schrijfwijze van een tag die al bestaat ("oefeningen"
 * wordt "Oefeningen"), zodat dezelfde tag niet in twee vormen rondgaat.
 */
export function canonicalPalPlusTags(tags: string[], known: string[]): string[] {
  const byKey = new Map(known.map((tag) => [tag.toLocaleLowerCase("nl-BE"), tag]));
  return tags.map((tag) => byKey.get(tag.toLocaleLowerCase("nl-BE")) ?? tag);
}

/** De naam van een snelle tag in het beheer. */
export function parsePalPlusTagLabel(
  raw: string,
): { ok: true; label: string } | { ok: false; error: "TAG_REQUIRED" | "TAG_TOO_LONG" } {
  const label = raw.replace(/\s+/g, " ").trim();
  if (!label) return { ok: false, error: "TAG_REQUIRED" };
  if (label.length > PAL_PLUS_LIMITS.tag) return { ok: false, error: "TAG_TOO_LONG" };
  return { ok: true, label };
}

// -----------------------------------------------------------------------------
// Wanneer de sessie kan doorgaan: de voorgestelde momenten van een aanbod
// -----------------------------------------------------------------------------

/** Eén blok: een datum met een begin- en einduur, zoals het formulier het meestuurt. */
export type RawPalPlusMoment = { date: string; startTime: string; endTime: string };

/**
 * Een venster waarin de tutor de sessie kan geven: "dinsdag 13 oktober, 13:00
 * tot 18:00". Langer dan de sessie zelf mag; Onderwijs kiest er het uur in.
 */
export type PalPlusProposedMoment = { startsAt: Date; endsAt: Date };

/**
 * Het rooster waarin een tutor aanduidt wanneer de sessie kan: de komende
 * werkdagen als kolommen, de halve uren als rijen. Een vakje is een halfuur
 * op een echte datum, dus wat aangeduid is, is meteen een concreet moment.
 */
export const PAL_PLUS_GRID = {
  /** Zoveel werkdagen vanaf vandaag; zaterdag en zondag vallen weg. */
  days: 7,
  startMinutes: 8 * 60,
  endMinutes: 22 * 60,
  slotMinutes: 30,
} as const;

/**
 * De datums van het rooster (`YYYY-MM-DD`, Brusselse kalender): de komende
 * `PAL_PLUS_GRID.days` werkdagen, vandaag inbegrepen als het een werkdag is.
 * Wat vandaag al voorbij is, zet het rooster zelf uit (`palPlusSlotIsPast`).
 */
export function palPlusGridDays(now: Date): string[] {
  const days: string[] = [];
  let day = brusselsYMD(now);
  while (days.length < PAL_PLUS_GRID.days) {
    if (isoWeekday(day) <= 5) days.push(ymdKey(day));
    day = shiftYMD(day, 1);
  }
  return days;
}

/** Het begin van elk halfuur van het rooster, in minuten sinds middernacht. */
export function palPlusGridSlots(): number[] {
  const slots: number[] = [];
  for (let minutes = PAL_PLUS_GRID.startMinutes; minutes < PAL_PLUS_GRID.endMinutes; minutes += PAL_PLUS_GRID.slotMinutes) {
    slots.push(minutes);
  }
  return slots;
}

/** Een halfuur dat al begonnen is, kan niet meer: dat vakje staat uit. */
export function palPlusSlotIsPast(date: string, minutes: number, today: string, nowMinutes: number): boolean {
  return date < today || (date === today && minutes < nowMinutes);
}

/** De sleutel van een vakje in het rooster: `"2026-10-13|1140"`. */
export function palPlusSlotKey(date: string, minutes: number): string {
  return `${date}|${minutes}`;
}

/**
 * Maakt van aangeduide vakjes de blokken die meegaan: aaneensluitende halve
 * uren op dezelfde dag worden één blok, de vroegste eerst. Wat er niet als een
 * vakje uitziet, valt weg.
 */
export function palPlusSlotsToMoments(keys: Iterable<string>): RawPalPlusMoment[] {
  const byDay = new Map<string, number[]>();
  for (const key of keys) {
    const match = /^(\d{4}-\d{2}-\d{2})\|(\d{1,4})$/.exec(key);
    if (!match) continue;
    const list = byDay.get(match[1]!) ?? [];
    list.push(Number(match[2]));
    byDay.set(match[1]!, list);
  }
  const moments: RawPalPlusMoment[] = [];
  for (const date of [...byDay.keys()].sort()) {
    const starts = [...new Set(byDay.get(date))].sort((a, b) => a - b);
    let blockStart = starts[0]!;
    let blockEnd = blockStart + PAL_PLUS_GRID.slotMinutes;
    for (const start of starts.slice(1)) {
      if (start === blockEnd) {
        blockEnd += PAL_PLUS_GRID.slotMinutes;
        continue;
      }
      moments.push({ date, startTime: palPlusClock(blockStart), endTime: palPlusClock(blockEnd) });
      blockStart = start;
      blockEnd = start + PAL_PLUS_GRID.slotMinutes;
    }
    moments.push({ date, startTime: palPlusClock(blockStart), endTime: palPlusClock(blockEnd) });
  }
  return moments;
}

/** 1140 wordt "19:00". */
export function palPlusClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export type PalPlusProposedMomentsErrorCode =
  | "MOMENTS_REQUIRED"
  | "TOO_MANY_MOMENTS"
  | "MOMENT_PAST"
  | MomentErrorCode;

/**
 * De vensters die een tutor aanduidde voor die ene sessie. Een blok dat
 * helemaal leeg is, valt weg; een half ingevuld blok is een fout. Minstens één
 * en hoogstens `PAL_PLUS_LIMITS.moments`, allemaal na `now`: een moment dat al
 * voorbij is, kan Onderwijs niet meer plannen. Een venster mag langer zijn dan
 * een sessie ("de hele namiddag"), maar valt binnen één dag. Dubbels vallen
 * weg, de vroegste eerst.
 */
export function parsePalPlusProposedMoments(
  raw: RawPalPlusMoment[],
  now: Date,
): { ok: true; moments: PalPlusProposedMoment[] } | { ok: false; error: PalPlusProposedMomentsErrorCode } {
  const filled = raw.filter((row) => row.date.trim() || row.startTime.trim() || row.endTime.trim());
  if (filled.length === 0) return { ok: false, error: "MOMENTS_REQUIRED" };
  if (filled.length > PAL_PLUS_LIMITS.moments) return { ok: false, error: "TOO_MANY_MOMENTS" };

  const moments: PalPlusProposedMoment[] = [];
  const seen = new Set<string>();
  for (const row of filled) {
    const moment = parsePalPlusMoment(row.date.trim(), row.startTime.trim(), row.endTime.trim(), 24 * 60);
    if (!moment.ok) return moment;
    if (moment.startsAt.getTime() <= now.getTime()) return { ok: false, error: "MOMENT_PAST" };
    const key = `${moment.startsAt.getTime()}-${moment.endsAt.getTime()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    moments.push({ startsAt: moment.startsAt, endsAt: moment.endsAt });
  }
  return { ok: true, moments: sortMoments(moments) };
}

function sortMoments(moments: PalPlusProposedMoment[]): PalPlusProposedMoment[] {
  return [...moments].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Zoals de momenten in `PalPlusRequest.proposedMoments` staan. */
export function palPlusProposedMomentsJson(moments: PalPlusProposedMoment[]): { startsAt: string; endsAt: string }[] {
  return moments.map((moment) => ({ startsAt: moment.startsAt.toISOString(), endsAt: moment.endsAt.toISOString() }));
}

/**
 * Leest de bewaarde momenten terug, de vroegste eerst. Wat er niet uitziet als
 * een moment, valt weg; een aanbod van voor de momenten (`null`) geeft niets.
 */
export function readPalPlusProposedMoments(json: unknown): PalPlusProposedMoment[] {
  if (!Array.isArray(json)) return [];
  const moments: PalPlusProposedMoment[] = [];
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const { startsAt, endsAt } = item as Record<string, unknown>;
    if (typeof startsAt !== "string" || typeof endsAt !== "string") continue;
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
    moments.push({ startsAt: start, endsAt: end });
  }
  return sortMoments(moments);
}

/** "Dinsdag 14 oktober, 19:00-21:00", in Brusselse tijd. */
export function palPlusMomentLabel(moment: PalPlusProposedMoment, locale: "nl" | "en"): string {
  const day = new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(moment.startsAt);
  const start = palPlusWallClockFields(moment.startsAt).time;
  const end = palPlusWallClockFields(moment.endsAt).time;
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${start}-${end}`;
}

/** De momenten als tekst, een regel per moment. Voor de mails en de pagina. */
export function palPlusMomentLines(moments: PalPlusProposedMoment[], locale: "nl" | "en"): string[] {
  return moments.map((moment) => palPlusMomentLabel(moment, locale));
}

// -----------------------------------------------------------------------------
// De tweede tutor
// -----------------------------------------------------------------------------

export type PalPlusCoTutorStatusCode = "PENDING" | "ACCEPTED" | "DECLINED";

/**
 * Of de uitgenodigde tweede tutor nog kan antwoorden: zolang er geen sessie
 * van het aanbod kwam, ook als Onderwijs het al aanvaardde. Is er al een
 * sessie (of is het gesloten), dan vervalt de uitnodiging; wie toch mee wil,
 * regelt dat met Onderwijs.
 */
export function canAnswerPalPlusCoTutor(request: {
  kind: PalPlusRequestKindCode;
  status: PalPlusRequestStatusCode;
  coTutorStatus: PalPlusCoTutorStatusCode | null;
}): boolean {
  return (
    request.kind === "GIVE" &&
    (request.status === "PENDING" || request.status === "ACCEPTED") &&
    request.coTutorStatus === "PENDING"
  );
}

export type MomentErrorCode = "MOMENT_REQUIRED" | "MOMENT_INVALID" | "MOMENT_ORDER" | "MOMENT_TOO_LONG";

/**
 * Een datum met een begin- en einduur, als Brusselse wandklok. Een sessie valt
 * altijd binnen één dag; een einde na middernacht is bijna zeker een tikfout.
 */
export function parsePalPlusMoment(
  date: string,
  startTime: string,
  endTime: string,
  /** Langer is een tikfout. Een sessie: zes uur; een venster van een tutor: de hele dag. */
  maxMinutes: number = PAL_PLUS_MAX_SESSION_MINUTES,
): { ok: true; startsAt: Date; endsAt: Date } | { ok: false; error: MomentErrorCode } {
  if (!date || !startTime || !endTime) return { ok: false, error: "MOMENT_REQUIRED" };
  const start = parseDateTimeFields(date, startTime);
  const end = parseDateTimeFields(date, endTime);
  if (!start || !end) return { ok: false, error: "MOMENT_INVALID" };
  if (end.minutes <= start.minutes) return { ok: false, error: "MOMENT_ORDER" };
  if (end.minutes - start.minutes > maxMinutes) {
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

/**
 * Een aanbod dat nog wacht, kan Onderwijs aanvaarden zonder al een moment te
 * kiezen: de tutor weet dan dat het doorgaat, het moment en het lokaal volgen.
 * Een vraag niet: die gaat online, of krijgt meteen een sessie.
 */
export function canAcceptPalPlusRequest(request: {
  kind: PalPlusRequestKindCode;
  status: PalPlusRequestStatusCode;
}): boolean {
  return request.kind === "GIVE" && request.status === "PENDING";
}

/**
 * De statussen waarin een aanvraag nog niet afgehandeld is: er hangt nog geen
 * sessie aan en niemand sloot ze. Een aanvaard aanbod hoort daarbij, want het
 * moment ligt nog niet vast.
 */
export const PAL_PLUS_ACTIVE_STATUSES = ["PENDING", "OPEN", "ACCEPTED"] as const satisfies readonly PalPlusRequestStatusCode[];

/** Nog niet afgehandeld: de indiener kan intrekken, Onderwijs kan sluiten of plannen. */
export function isActivePalPlusStatus(status: PalPlusRequestStatusCode): boolean {
  return (PAL_PLUS_ACTIVE_STATUSES as readonly PalPlusRequestStatusCode[]).includes(status);
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
  ACCEPTED: { nl: "Aanvaard, moment volgt", en: "Accepted, time to follow" },
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
  | "TAG_TOO_LONG"
  | "TOO_MANY_TAGS"
  | "SESSION_GONE"
  | "SESSION_CANCELLED";

export type RawPalPlusSession = {
  courseId: string;
  description: string;
  tags: string[];
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
  tags: string[];
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
  const tags = parsePalPlusTags(raw.tags);
  if (!tags.ok) return tags;

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
      tags: tags.tags,
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

// -----------------------------------------------------------------------------
// Herinnering
// -----------------------------------------------------------------------------

/** De herinnering vertrekt een dag voor de start. */
export const PAL_PLUS_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Wat `reminderSentAt` wordt voor wie er nu bij komt (inschrijven, als tutor
 * toegevoegd) of wanneer het moment verschuift: `now` als de sessie al binnen
 * het venster begint, anders leeg.
 *
 * Wie zich drie uur voor de start inschrijft, hoort geen mail te krijgen die
 * met "morgen" begint, en wie net "je geeft een sessie" kreeg, geen tweede mail
 * vijf minuten later. Ligt het (nieuwe) moment verder dan een dag weg, dan komt
 * de herinnering gewoon op tijd.
 */
export function palPlusReminderHandledAt(startsAt: Date, now: Date): Date | null {
  return startsAt.getTime() - now.getTime() <= PAL_PLUS_REMINDER_LEAD_MS ? now : null;
}
