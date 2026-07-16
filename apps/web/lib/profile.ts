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

// KU Leuven studentennummer: een `r` gevolgd door exact 7 cijfers. Als string
// gehouden zodat hij zowel als HTML `pattern`-attribuut (client-side hint) als
// in een `RegExp` (server-side validatie) gebruikt kan worden.
export const R_NUMBER_PATTERN = "r[0-9]{7}";
export const R_NUMBER_REGEX = new RegExp(`^${R_NUMBER_PATTERN}$`);

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
