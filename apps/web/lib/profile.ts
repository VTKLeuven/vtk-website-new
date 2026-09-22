// Shared, ordered lists for the onboarding / profile surfaces. Keep the values
// in sync with the `MailCategory` and `EmailPreference` enums in the Prisma
// schema; they are the single source of truth for both the form (which fields
// to render) and the server action (which values to accept).

export const MAIL_CATEGORIES = [
  "FEEST",
  "CAREER",
  "SPORT",
  "EVENEMENTEN",
  "ONDERWIJS",
  "INTERNATIONAAL",
  "EERSTEJAARS",
  "BAKSKE",
] as const;

export type MailCategoryValue = (typeof MAIL_CATEGORIES)[number];

export const EMAIL_PREFERENCES = ["UNIVERSITY", "PERSONAL"] as const;
export type EmailPreferenceValue = (typeof EMAIL_PREFERENCES)[number];

export const ACADEMIC_STAFF_ROLES = [
  "PROFESSOR",
  "ASSISTANT",
  "ADMINISTRATIVE",
  "OTHER",
] as const;
export type AcademicStaffRoleValue = (typeof ACADEMIC_STAFF_ROLES)[number];

// KU Leuven studentennummer: een `r` gevolgd door exact 7 cijfers. Als string
// gehouden zodat hij zowel als HTML `pattern`-attribuut (client-side hint) als
// in een `RegExp` (server-side validatie) gebruikt kan worden.
export const R_NUMBER_PATTERN = "r[0-9]{7}";
export const R_NUMBER_REGEX = new RegExp(`^${R_NUMBER_PATTERN}$`);

// Een afstudeerjaar dat een mens kan hebben. De ondergrens is het stichtingsjaar
// van VTK; de bovengrens loopt mee, want wie in juni afstudeert vult dat in
// september als "vorig jaar" in en wie het laatste examen nog moet doen denkt al
// aan volgend jaar. Nog verder is het jaar waarin iemand verwacht af te studeren,
// en dat vraagt het veld niet.
export const EARLIEST_GRADUATION_YEAR = 1920;

export function latestGraduationYear(now: Date = new Date()): number {
  return now.getFullYear() + 1;
}

/** Leeg mag; anders vier cijfers binnen de grenzen hierboven. */
export function isValidGraduationYear(
  value: string,
  latest: number = latestGraduationYear(),
): boolean {
  const v = value.trim();
  if (v === "") return true;
  if (!/^\d{4}$/.test(v)) return false;
  const year = Number(v);
  return year >= EARLIEST_GRADUATION_YEAR && year <= latest;
}

export const STUDY_YEARS = [
  "BACHELOR_1",
  "BACHELOR_2",
  "BACHELOR_3",
  "MASTER_1",
  "MASTER_2",
] as const;
export type StudyYearValue = (typeof STUDY_YEARS)[number];

// Ordered to match how the richtingen are presented to members.
export const STUDY_PROGRAMMES = [
  "ARCHITECTURE",
  "BIOMEDICAL",
  "COMMON_BACHELOR",
  "CIVIL",
  "CHEMICAL",
  "COMPUTER_SCIENCE",
  "CYBERSECURITY",
  "DIGITAL_HUMANITIES",
  "ELECTRICAL",
  "ENERGY",
  "ARTIFICIAL_INTELLIGENCE",
  "MATERIALS",
  "NANO",
  "URBANISM",
  "MATHEMATICAL",
  "MECHANICAL",
] as const;
export type StudyProgrammeValue = (typeof STUDY_PROGRAMMES)[number];
