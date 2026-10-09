import type { CalendarAudience, StudyYear } from "@prisma/client";

/**
 * De doelgroepen met een regel in het profiel. `CUSTOM` hoort er bewust niet bij:
 * die doelgroep maakt een redacteur zelf aan, en het profiel zegt niet wie erbij
 * hoort. Niemand krijgt ze dus uit zijn profiel mee.
 */
export type ProfileAudience = Exclude<CalendarAudience, "CUSTOM">;

/** De profielvelden waaruit de doelgroepen volgen. */
export type StudyProfile = {
  studyYears: readonly StudyYear[];
  internationalStudent: boolean;
  alumni: boolean;
  sideEntrant: boolean;
};

/**
 * De Prisma-select voor {@link StudyProfile}. Elke lezing voor de doelgroepen
 * gebruikt deze, zodat een nieuw profielveld niet in één van de selects
 * vergeten wordt.
 */
export const STUDY_PROFILE_SELECT = {
  studyYears: true,
  internationalStudent: true,
  alumni: true,
  sideEntrant: true,
} as const;

/**
 * Bij welke doelgroepen hoort een studieprofiel? Puur en zonder `server-only`,
 * zodat de kalender (`lib/calendar/audience.ts`) en de ticketshop
 * (`lib/ticketing/audience.ts`) dezelfde regel lezen en die zonder database te
 * testen is. Een nieuwe doelgroep hoort hier, niet in een van beide bellers.
 */
export function audiencesForStudyProfile(profile: StudyProfile): ProfileAudience[] {
  const audiences: ProfileAudience[] = [];
  if (profile.studyYears.includes("BACHELOR_1")) audiences.push("FIRST_YEARS");
  if (profile.internationalStudent) audiences.push("INTERNATIONALS");
  if (profile.studyYears.includes("MASTER_2")) audiences.push("LAST_YEARS");
  if (profile.alumni) audiences.push("ALUMNI");
  if (profile.sideEntrant) audiences.push("SIDE_ENTRANTS");
  return audiences;
}
