/**
 * PAL+, los van React, Next en Prisma.
 *
 * Alles hier is puur: de vakkenlijst valideren en de regel voor de bonnetjes van
 * een tutor. Zo is het te testen zonder een render, een request of een databank
 * (test/palPlus.test.ts). De kringkeuzes erachter staan in
 * docs/design-decisions.md ("PAL+").
 *
 * Bevat geen server-only imports: de formulieren gebruiken dezelfde limieten.
 */

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
