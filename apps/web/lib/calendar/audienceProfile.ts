import type { CalendarAudience, StudyYear } from "@prisma/client";

/**
 * Bij welke doelgroepen hoort een studieprofiel? Puur en zonder `server-only`,
 * zodat de kalender (`lib/calendar/audience.ts`) en de ticketshop
 * (`lib/ticketing/audience.ts`) dezelfde regel lezen en die zonder database te
 * testen is. Een nieuwe doelgroep hoort hier, niet in een van beide bellers.
 */
export function audiencesForStudyProfile(
  studyYears: readonly StudyYear[],
  internationalStudent: boolean,
  alumni: boolean,
): CalendarAudience[] {
  const audiences: CalendarAudience[] = [];
  if (studyYears.includes("BACHELOR_1")) audiences.push("FIRST_YEARS");
  if (internationalStudent) audiences.push("INTERNATIONALS");
  if (studyYears.includes("MASTER_2")) audiences.push("LAST_YEARS");
  if (alumni) audiences.push("ALUMNI");
  return audiences;
}
