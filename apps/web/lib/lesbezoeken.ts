/**
 * Lesbezoeken, los van React, Next en Prisma.
 *
 * Alles hier is puur: de validatie van het publieke formulier, het afleiden van
 * de professornaam uit zijn adres, het invullen van de mailsjablonen en het
 * opzoeken van de bijzonderheden bij een aanvraag. Zo is de logica te testen
 * zonder een render, een request of een mailserver (test/lesbezoeken.test.ts);
 * `lib/lesbezoeken-server.ts` doet het I/O-werk.
 *
 * Bevat geen server-only imports: het publieke formulier is een client component
 * en gebruikt dezelfde limieten en keuzelijsten.
 */

import { toSingleLine, toMessageText, isValidEmail } from "@/lib/contactForm";
import {
  brusselsWallClock,
  brusselsYMD,
  isoWeekday,
  shiftYMD,
  ymdKey,
} from "@/lib/brussels";

// -----------------------------------------------------------------------------
// Duur en doelgroepen
// -----------------------------------------------------------------------------

/**
 * Een gewoon lesbezoek is een aankondiging van een paar minuten bij het begin
 * van de les. Het formulier vroeg enkel of het lánger dan vijf minuten duurt,
 * dus meer granulariteit dan deze twee bestaat er in de aanvraag niet; een
 * beheerder kan het einduur achteraf wel bijstellen.
 */
export const SHORT_VISIT_MINUTES = 5;
export const LONG_VISIT_MINUTES = 15;

function visitMinutes(longVisit: boolean): number {
  return longVisit ? LONG_VISIT_MINUTES : SHORT_VISIT_MINUTES;
}

/** Het einde van een bezoek dat op `start` begint. */
export function visitEnd(start: Date, longVisit: boolean): Date {
  return new Date(start.getTime() + visitMinutes(longVisit) * 60_000);
}

/**
 * De doelgroepen uit het formulier dat dit vervangt, in dezelfde volgorde.
 *
 * Bewust een lijst in code en geen tabel: dit is het programma van de faculteit,
 * niet iets wat VTK beheert, en het verandert hoogstens één keer per jaar. De
 * masters en al de rest gaan via het vrije veld, precies zoals de "Anders"-optie
 * in het formulier.
 */
export const LESBEZOEK_BACHELORS = [
  "1e Bach, Algemene richting, Groep A",
  "1e Bach, Algemene richting, Groep B",
  "1e Bach, Architectuur",
  "2e Bach, Algemene richting, Groep A",
  "2e Bach, Algemene richting, Groep B",
  "2e Bach, Algemene richting (A en B samen)",
  "2e Bach, Architectuur",
  "3e Bach, Algemene richting",
  "3e Bach, Architectuur",
  "3e Bach, Bouwkunde",
  "3e Bach, Biomedische technologie",
  "3e Bach, Chemische Technologie",
  "3e Bach, Computerwetenschappen",
  "3e Bach, Elektrotechniek",
  "3e Bach, Materiaalkunde",
  "3e Bach, Werktuigkunde",
  "3e Bach, nevenrichting Architectuur & Omgeving",
  "3e Bach, nevenrichting Bedrijfsbeheer",
] as const;

export const LESBEZOEK_MASTERS = [
  "Master Architectural Engineering",
  "Master Artificial Intelligence",
  "Master Biomedical Engineering",
  "Master Chemical Engineering",
  "Master Civil Engineering",
  "Master Computer Science",
  "Master Electrical Engineering",
  "Master Energy Engineering",
  "Master Materials Engineering",
  "Master Mathematical Engineering",
  "Master Mechanical Engineering",
  "Master Mobility & Supply Chain Engineering",
  "Master Nanoscience, Nanotechnology and Nanoengineering",
] as const;

export const LESBEZOEK_AUDIENCES = [
  ...LESBEZOEK_BACHELORS,
  ...LESBEZOEK_MASTERS,
] as const;

/**
 * Parseert een doelgroepinvoer (enkele string, komma-gescheiden reeks of array)
 * naar een nette lijst van afzonderlijke doelgroepnamen.
 */
export function parseAudienceList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((item) => toSingleLine(item)).filter(Boolean)));
  }
  if (typeof raw !== "string") return [];
  const text = toSingleLine(raw);
  if (!text) return [];

  const found: string[] = [];
  let remaining = text;

  // Sorteer bekende doelgroepen op lengte van lang naar kort om deelmatches te voorkomen
  const sortedKnown = [...LESBEZOEK_BACHELORS, ...LESBEZOEK_MASTERS].sort(
    (a, b) => b.length - a.length,
  );

  for (const known of sortedKnown) {
    if (remaining.includes(known)) {
      found.push(known);
      remaining = remaining.replace(known, "").trim();
    }
  }

  // Voeg eventuele overgebleven delen toe (opgesplitst op komma's)
  if (remaining) {
    const extra = remaining
      .split(/,\s*/)
      .map((s) => s.replace(/^,\s*|,\s*$/g, "").trim())
      .filter((s) => s.length > 0 && !found.includes(s));
    found.push(...extra);
  }

  return found.length > 0 ? found : [text];
}

/**
 * De taal waarin de professor standaard aangeschreven wordt.
 *
 * De vuistregel uit de handleiding: masters zijn Engelstalig, bachelors niet.
 * Het is een gok en geen feit, dus het scherm laat ze altijd overschrijven.
 */
export function defaultTeacherLocale(audience: string): "nl" | "en" {
  return /(^|[^a-z])(ma|master)([^a-z]|$)/i.test(audience) ? "en" : "nl";
}

// -----------------------------------------------------------------------------
// Statussen
// -----------------------------------------------------------------------------

export const LESBEZOEK_STATUSES = [
  "PENDING",
  "ASKED",
  "APPROVED",
  "DECLINED",
  "REJECTED",
  "CANCELLED",
] as const;

export type LesbezoekStatusCode = (typeof LESBEZOEK_STATUSES)[number];

export function isLesbezoekStatus(value: unknown): value is LesbezoekStatusCode {
  return typeof value === "string" && (LESBEZOEK_STATUSES as readonly string[]).includes(value);
}

/**
 * Label en toon per status. `tone` stuurt de kleur in de kalender en de badge;
 * de kleur van de organisatie blijft de kleur van het blokje zelf, dus de status
 * moet met iets anders dan kleur alleen te lezen zijn (rand, doorhaling).
 */
export const LESBEZOEK_STATUS_META: Record<
  LesbezoekStatusCode,
  { nl: string; en: string; tone: "waiting" | "sent" | "ok" | "no" }
> = {
  PENDING: { nl: "Nieuw", en: "New", tone: "waiting" },
  ASKED: { nl: "Bij de prof", en: "With the professor", tone: "sent" },
  APPROVED: { nl: "Goedgekeurd", en: "Approved", tone: "ok" },
  DECLINED: { nl: "Afgewezen door de prof", en: "Declined by the professor", tone: "no" },
  REJECTED: { nl: "Afgewezen door ons", en: "Declined by us", tone: "no" },
  CANCELLED: { nl: "Ingetrokken", en: "Withdrawn", tone: "no" },
};

/** Statussen die als "hier moet nog iets mee gebeuren" tellen (actie vereist). */
export const OPEN_STATUSES: readonly LesbezoekStatusCode[] = ["PENDING", "ASKED"] as const;

/** Statussen die als "afgehandeld / verwerkt" tellen. */
export const PROCESSED_STATUSES: readonly LesbezoekStatusCode[] = [
  "APPROVED",
  "DECLINED",
  "REJECTED",
  "CANCELLED",
] as const;

/** Welke statussen tellen als openstaand (Nieuw & Bij de prof). */
export function isOpenStatus(status: LesbezoekStatusCode): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

/** Welke statussen tellen als verwerkt / afgehandeld. */
export function isProcessedStatus(status: LesbezoekStatusCode): boolean {
  return (PROCESSED_STATUSES as readonly string[]).includes(status);
}

// -----------------------------------------------------------------------------
// De professor
// -----------------------------------------------------------------------------

/**
 * De naam van de professor uit zijn KU Leuven-adres, met een hoofdletter:
 * `pieter.vansteenwegen@kuleuven.be` -> "Vansteenwegen".
 *
 * Dit is een gok, geen waarheid. Samengestelde namen ("van den Berghe") en
 * omgekeerde volgordes lopen hier mis, en de handleiding zei niet voor niets "bij
 * twijfel, KU Leuven wie is wie". Daarom is het veld achteraf te verbeteren en
 * wordt dit enkel gebruikt om het formulier voor te invullen.
 */
export function teacherNameFromEmail(email: string): string | null {
  const local = toSingleLine(email).split("@")[0];
  if (!local) return null;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1]!;
  // Adressen als `r0123456@kuleuven.be` of `secretariaat@...` leveren geen naam
  // op; dan liever niets tonen dan iets fouts.
  if (/\d/.test(last) || last.length < 2) return null;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

// -----------------------------------------------------------------------------
// Bijzonderheden ("Peculiarities")
// -----------------------------------------------------------------------------

export type Peculiarity = { id: string; subject: string; note: string };

/** Waar een bijzonderheid tegen gematcht wordt. */
export type PeculiarityTarget = {
  teacherEmail: string;
  teacherName?: string | null;
  course: string;
  audience: string;
};

/**
 * Vanaf deze lengte behandelen we een sleutel als "specifiek genoeg" voor een
 * gewone substring-test. Vijf is de kortste lengte waarop de Nederlandse
 * voorzetsels en lidwoorden die in vaknamen rondzwerven ("aan", "van", "over")
 * er allemaal onder vallen.
 */
const SHORT_KEY_LENGTH = 5;

/** Tekens die een woordgrens vormen; alles wat geen letter of cijfer is. */
const NON_WORD = "[^\\p{L}\\p{N}]";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Komt `needle` als heel woord voor in `hay`?
 *
 * Nodig voor korte sleutels. "aan" zit letterlijk in "Aanvullingen wiskunde",
 * dus een gewone substring-test hangt die bijzonderheid aan elk vak waarvan de
 * naam toevallig zo begint.
 */
function containsWord(hay: string, needle: string): boolean {
  return new RegExp(`(^|${NON_WORD})${escapeRegex(needle)}($|${NON_WORD})`, "u").test(hay);
}

/**
 * De bijzonderheden die bij deze aanvraag horen.
 *
 * Een bijzonderheid staat op een naam, een adres, een vak of een faculteit, en
 * de Sheet mengde die vier in één kolom. We vergelijken dus hoofdletterongevoelig
 * in beide richtingen: "Vandewalle" moet matchen op "stefan.vandewalle@kuleuven.be",
 * en "Faculteit Bio-Ingenieurswetenschappen" op een vak dat die naam draagt.
 *
 * Bewust ruim, maar niet grenzeloos: een bijzonderheid te veel tonen kost een
 * blik, een bijzonderheid te weinig kost een mail naar een professor die er geen
 * wil. Korte sleutels ("BME", "IT") moeten wel als heel woord voorkomen, anders
 * plakken ze aan elk vak waar die letters middenin staan.
 */
export function matchPeculiarities(
  peculiarities: readonly Peculiarity[],
  target: PeculiarityTarget,
): Peculiarity[] {
  const haystacks = [target.teacherEmail, target.teacherName ?? "", target.course, target.audience]
    .map((value) => toSingleLine(value).toLowerCase())
    .filter(Boolean);

  return peculiarities.filter((peculiarity) => {
    const needle = toSingleLine(peculiarity.subject).toLowerCase();
    if (needle === "") return false;

    return haystacks.some((hay) => {
      const matches =
        needle.length < SHORT_KEY_LENGTH ? containsWord(hay, needle) : hay.includes(needle);
      if (matches) return true;
      // Andersom: een lange sleutel ("Faculteit Bio-Ingenieurswetenschappen") mag
      // een korter veld bevatten. Enkel voor velden die zelf iets voorstellen;
      // een naam van drie letters zou anders aan elke lange sleutel blijven kleven.
      return hay.length >= SHORT_KEY_LENGTH && needle.includes(hay);
    });
  });
}

// -----------------------------------------------------------------------------
// Het publieke aanvraagformulier
// -----------------------------------------------------------------------------

/** Bovengrenzen per veld. Ruim genoeg voor een echte aanvraag, krap voor een bot. */
export const LESBEZOEK_LIMITS = {
  name: 120,
  /** De maximale lengte van een e-mailadres volgens RFC 5321. */
  email: 254,
  phone: 40,
  subject: 150,
  course: 150,
  audience: 500,
  organisation: 120,
  /**
   * De toelichting gaat letterlijk naar de professor. Twee duizend tekens is
   * ruim een halve A4; wie meer nodig heeft om een lesbezoek van vijf minuten
   * uit te leggen, overtuigt daar niemand meer mee.
   */
  teacherNote: 2000,
} as const;

/**
 * Hoeveel aanvragen één afzender per venster mag indienen.
 *
 * Ruimer dan het contactformulier (drie): een organisatie dient vaak meerdere
 * lesbezoeken na elkaar in, één per doelgroep, en die mag het formulier niet na
 * de derde dichtgooien.
 */
export const LESBEZOEK_RATE_LIMIT = { max: 8, windowMs: 15 * 60 * 1000 } as const;

/**
 * Hoe ver op voorhand een aanvraag binnen moet zijn. De afspraak met de faculteit
 * is twee weken; korter dan dat haalt de professor het antwoord niet meer.
 *
 * Dit is een grens en geen suggestie: een aanvraag voor overmorgen kost VTK een
 * mail die toch te laat komt.
 */
export const LESBEZOEK_MIN_LEAD_DAYS = 14;

/**
 * Hoe ver vooruit je mag aanvragen. Zonder bovengrens landt er ooit een aanvraag
 * voor een academiejaar dat nog niet bestaat.
 */
export const LESBEZOEK_MAX_LEAD_DAYS = 365;

export type LesbezoekErrorCode =
  | "ORGANISATION_REQUIRED"
  | "ORGANISATION_TOO_LONG"
  | "EMAIL_REQUIRED"
  | "EMAIL_INVALID"
  | "EMAIL_TOO_LONG"
  | "NAME_TOO_LONG"
  | "PHONE_REQUIRED"
  | "PHONE_TOO_LONG"
  | "SUBJECT_REQUIRED"
  | "SUBJECT_TOO_LONG"
  | "TEACHER_NOTE_REQUIRED"
  | "TEACHER_NOTE_TOO_LONG"
  | "AUDIENCE_REQUIRED"
  | "AUDIENCE_TOO_LONG"
  | "COURSE_REQUIRED"
  | "COURSE_TOO_LONG"
  | "TEACHER_EMAIL_REQUIRED"
  | "TEACHER_EMAIL_INVALID"
  | "DATE_REQUIRED"
  | "DATE_INVALID"
  | "TOO_SOON"
  | "TOO_FAR"
  | "RATE_LIMITED";

/** Een gecontroleerde aanvraag, klaar om weg te schrijven. */
export type LesbezoekRequest = {
  /** Id van een bestaande organisatie, of null wanneer de naam nieuw is. */
  organisationId: string | null;
  /** De naam zoals ingetikt; enkel gevuld wanneer `organisationId` null is. */
  organisationName: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  subject: string;
  teacherNote: string;
  audience: string;
  course: string;
  teacherEmail: string;
  /** Wandklok, zoals `<input type="date">` en `type="time"` ze teruggeven. */
  date: string;
  time: string;
  longVisit: boolean;
};

export type RawLesbezoekInput = {
  organisationId?: unknown;
  organisationName?: unknown;
  requesterName?: unknown;
  requesterEmail?: unknown;
  requesterPhone?: unknown;
  subject?: unknown;
  teacherNote?: unknown;
  audience?: unknown;
  audiences?: unknown;
  audienceOther?: unknown;
  course?: unknown;
  teacherEmail?: unknown;
  date?: unknown;
  time?: unknown;
  longVisit?: unknown;
  /** Honeypot: staat verborgen in het formulier, dus een mens laat het leeg. */
  honeypot?: unknown;
};

export type LesbezoekParseResult =
  | { status: "ok"; request: LesbezoekRequest }
  /** Honeypot ingevuld: de aanroeper doet niets en meldt tóch succes. */
  | { status: "honeypot" }
  | { status: "error"; code: LesbezoekErrorCode };

/** "yyyy-mm-dd" + "hh:mm" -> de losse getallen, of null als het niet klopt. */
export function parseDateTimeFields(
  date: string,
  time: string,
): { year: number; month: number; day: number; minutes: number } | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;
  // 31 februari bestaat niet; laat de kalender zelf oordelen.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;

  return { year, month, day, minutes: hour * 60 + minute };
}

/**
 * Controleert een aanvraag uit het publieke formulier.
 *
 * Geeft fouten terug in plaats van ze te gooien: een leeg veld of een datum van
 * volgende week is verwachte invoer en hoort een rode toast te geven, geen error
 * boundary (zie CLAUDE.md).
 *
 * `now` en `startsAt` komen als instants binnen zodat de tijdzone-omzetting bij
 * de aanroeper blijft; deze functie vergelijkt enkel.
 */
export function parseLesbezoekRequest(
  raw: RawLesbezoekInput,
  options: { startsAt: Date | null; now?: Date },
): LesbezoekParseResult {
  // Eerst de honeypot: een bot die enkel dat veld invult, mag geen enkele
  // foutmelding krijgen waaruit hij kan leren.
  if (toSingleLine(raw.honeypot) !== "") return { status: "honeypot" };

  const organisationId = toSingleLine(raw.organisationId);
  const organisationName = toSingleLine(raw.organisationName);
  if (!organisationId && organisationName === "") {
    return { status: "error", code: "ORGANISATION_REQUIRED" };
  }
  if (organisationName.length > LESBEZOEK_LIMITS.organisation) {
    return { status: "error", code: "ORGANISATION_TOO_LONG" };
  }

  const requesterName = toSingleLine(raw.requesterName);
  if (requesterName.length > LESBEZOEK_LIMITS.name) {
    return { status: "error", code: "NAME_TOO_LONG" };
  }

  const requesterEmail = toSingleLine(raw.requesterEmail);
  if (requesterEmail === "") return { status: "error", code: "EMAIL_REQUIRED" };
  if (requesterEmail.length > LESBEZOEK_LIMITS.email) {
    return { status: "error", code: "EMAIL_TOO_LONG" };
  }
  if (!isValidEmail(requesterEmail)) return { status: "error", code: "EMAIL_INVALID" };

  const requesterPhone = toSingleLine(raw.requesterPhone);
  if (requesterPhone === "") return { status: "error", code: "PHONE_REQUIRED" };
  if (requesterPhone.length > LESBEZOEK_LIMITS.phone) {
    return { status: "error", code: "PHONE_TOO_LONG" };
  }

  const subject = toSingleLine(raw.subject);
  if (subject === "") return { status: "error", code: "SUBJECT_REQUIRED" };
  if (subject.length > LESBEZOEK_LIMITS.subject) {
    return { status: "error", code: "SUBJECT_TOO_LONG" };
  }

  const teacherNote = toMessageText(raw.teacherNote);
  if (teacherNote === "") return { status: "error", code: "TEACHER_NOTE_REQUIRED" };
  if (teacherNote.length > LESBEZOEK_LIMITS.teacherNote) {
    return { status: "error", code: "TEACHER_NOTE_TOO_LONG" };
  }

  // Doelgroepen: ondersteunt zowel een enkele doelgroep, meerdere doelgroepen
  // (als array of komma-gescheiden reeks), als een optioneel vrij veld.
  const rawAudienceItems: string[] = [];
  if (Array.isArray(raw.audience)) {
    rawAudienceItems.push(...raw.audience.map((i: unknown) => toSingleLine(i)).filter(Boolean));
  } else if (typeof raw.audience === "string") {
    rawAudienceItems.push(...parseAudienceList(raw.audience));
  }

  if (Array.isArray(raw.audiences)) {
    rawAudienceItems.push(...raw.audiences.map((i: unknown) => toSingleLine(i)).filter(Boolean));
  } else if (typeof raw.audiences === "string") {
    rawAudienceItems.push(...parseAudienceList(raw.audiences));
  }

  if (raw.audienceOther) {
    const otherText = toSingleLine(raw.audienceOther);
    if (otherText && otherText !== "__other__") {
      rawAudienceItems.push(otherText);
    }
  }

  const uniqueAudiences = Array.from(
    new Set(rawAudienceItems.filter((item) => item && item !== "__other__")),
  );
  const audience = uniqueAudiences.join(", ");

  if (audience === "") return { status: "error", code: "AUDIENCE_REQUIRED" };
  if (audience.length > LESBEZOEK_LIMITS.audience) {
    return { status: "error", code: "AUDIENCE_TOO_LONG" };
  }

  const course = toSingleLine(raw.course);
  if (course === "") return { status: "error", code: "COURSE_REQUIRED" };
  if (course.length > LESBEZOEK_LIMITS.course) {
    return { status: "error", code: "COURSE_TOO_LONG" };
  }

  const teacherEmail = toSingleLine(raw.teacherEmail);
  if (teacherEmail === "") return { status: "error", code: "TEACHER_EMAIL_REQUIRED" };
  if (teacherEmail.length > LESBEZOEK_LIMITS.email || !isValidEmail(teacherEmail)) {
    return { status: "error", code: "TEACHER_EMAIL_INVALID" };
  }

  const date = toSingleLine(raw.date);
  const time = toSingleLine(raw.time);
  if (date === "" || time === "") return { status: "error", code: "DATE_REQUIRED" };
  if (!parseDateTimeFields(date, time) || !options.startsAt) {
    return { status: "error", code: "DATE_INVALID" };
  }

  const now = options.now ?? new Date();
  const leadMs = options.startsAt.getTime() - now.getTime();
  if (leadMs < LESBEZOEK_MIN_LEAD_DAYS * 86_400_000) return { status: "error", code: "TOO_SOON" };
  if (leadMs > LESBEZOEK_MAX_LEAD_DAYS * 86_400_000) return { status: "error", code: "TOO_FAR" };

  return {
    status: "ok",
    request: {
      organisationId: organisationId || null,
      organisationName,
      requesterName,
      requesterEmail,
      requesterPhone,
      subject,
      teacherNote,
      audience,
      course,
      teacherEmail,
      date,
      time,
      longVisit: raw.longVisit === "on" || raw.longVisit === true || raw.longVisit === "true",
    },
  };
}

// -----------------------------------------------------------------------------
// Kleuren van de organisaties
// -----------------------------------------------------------------------------

/**
 * Het palet waaruit een nieuwe organisatie haar kleur krijgt.
 *
 * De oude app deelde kleuren uit in de volgorde waarin de rijen binnenkwamen, uit
 * een lijst van vijf; organisatie zes en verder werden allemaal hetzelfde rood, en
 * na een reload kon dezelfde organisatie een andere kleur hebben. Hier hangt de
 * kleur aan de rij in de database, dus ze verandert alleen als iemand ze verandert.
 *
 * Tinten die donker genoeg zijn voor witte tekst; de kalender zet ze als
 * achtergrond van een blokje met witte letters.
 */
export const LESBEZOEK_COLOURS = [
  "#3B82F6",
  "#0E9F6E",
  "#7C3AED",
  "#EA580C",
  "#DB2777",
  "#0891B2",
  "#65A30D",
  "#B45309",
  "#4F46E5",
  "#BE123C",
] as const;

/** De eerstvolgende kleur die nog niet in gebruik is, anders roterend verder. */
export function nextOrganisationColour(used: readonly string[]): string {
  const taken = new Set(used.map((colour) => colour.toUpperCase()));
  const free = LESBEZOEK_COLOURS.find((colour) => !taken.has(colour.toUpperCase()));
  return free ?? LESBEZOEK_COLOURS[used.length % LESBEZOEK_COLOURS.length]!;
}

/**
 * Namen die op hetzelfde neerkomen, tot één sleutel: "VTK - Onderwijs",
 * "VTK Onderwijs" en "vtk onderwijs" zijn dezelfde organisatie. Gebruikt om te
 * beslissen of een naam uit het publieke formulier een nieuwe rij verdient.
 */
export function organisationKey(name: string): string {
  return toSingleLine(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// -----------------------------------------------------------------------------
// Planning en uitgesteld verzenden van mails
// -----------------------------------------------------------------------------

export type SchedulePreset = {
  id: "tomorrow_0800" | "tomorrow_0900" | "next_workday_0800";
  labelNl: string;
  labelEn: string;
  dateStr: string;
  timeStr: string;
  instant: Date;
};

/**
 * Berekent logische presets voor het inplannen van mails (bv. morgen 08:00, morgen 09:00,
 * volgende werkdag 08:00). Handig om professoren niet 's avonds laat of in het weekend
 * te mailen.
 */
export function getSchedulePresets(now: Date = new Date()): SchedulePreset[] {
  const currentYmd = brusselsYMD(now);
  const tomorrowYmd = shiftYMD(currentYmd, 1);
  const weekday = isoWeekday(currentYmd);

  // Volgende werkdag:
  // Vrijdag (5) -> Maandag (+3)
  // Zaterdag (6) -> Maandag (+2)
  // Zondag (7) -> Maandag (+1)
  // Maandag t.e.m. Donderdag -> Morgen (+1)
  const workdayDelta = weekday === 5 ? 3 : weekday === 6 ? 2 : weekday === 7 ? 1 : 1;
  const nextWorkdayYmd = shiftYMD(currentYmd, workdayDelta);

  const tomorrow8 = brusselsWallClock(tomorrowYmd.year, tomorrowYmd.month, tomorrowYmd.day, "08:00");
  const tomorrow9 = brusselsWallClock(tomorrowYmd.year, tomorrowYmd.month, tomorrowYmd.day, "09:00");
  const nextWorkday8 = brusselsWallClock(nextWorkdayYmd.year, nextWorkdayYmd.month, nextWorkdayYmd.day, "08:00");

  const fmtDateNl = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const fmtDateEn = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const tomorrowNl = fmtDateNl.format(tomorrow8);
  const tomorrowEn = fmtDateEn.format(tomorrow8);
  const workdayNl = fmtDateNl.format(nextWorkday8);
  const workdayEn = fmtDateEn.format(nextWorkday8);

  const presets: SchedulePreset[] = [
    {
      id: "tomorrow_0800",
      labelNl: `Morgen om 08:00 (${tomorrowNl})`,
      labelEn: `Tomorrow at 08:00 (${tomorrowEn})`,
      dateStr: ymdKey(tomorrowYmd),
      timeStr: "08:00",
      instant: tomorrow8,
    },
    {
      id: "tomorrow_0900",
      labelNl: `Morgen om 09:00 (${tomorrowNl})`,
      labelEn: `Tomorrow at 09:00 (${tomorrowEn})`,
      dateStr: ymdKey(tomorrowYmd),
      timeStr: "09:00",
      instant: tomorrow9,
    },
  ];

  if (workdayDelta > 1) {
    presets.push({
      id: "next_workday_0800",
      labelNl: `Volgende werkdag om 08:00 (${workdayNl})`,
      labelEn: `Next workday at 08:00 (${workdayEn})`,
      dateStr: ymdKey(nextWorkdayYmd),
      timeStr: "08:00",
      instant: nextWorkday8,
    });
  }

  return presets;
}

/** Formatteert een gepland moment in Brussel-tijd (bv. "donderdag 27 augustus om 08:00"). */
export function formatScheduleMoment(
  instant: Date,
  locale: "nl" | "en",
): string {
  const dateFmt = new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeFmt = new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = dateFmt.format(instant);
  const time = timeFmt.format(instant);
  return locale === "nl" ? `${date} om ${time}` : `${date} at ${time}`;
}

/** Korte weergave van een gepland moment voor overzichten en badges (bv. "do 27 aug · 08:00"). */
export function formatScheduleShort(
  instant: Date,
  locale: "nl" | "en",
): string {
  const dateFmt = new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeFmt = new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateFmt.format(instant)} · ${timeFmt.format(instant)}`;
}
