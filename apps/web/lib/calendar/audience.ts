import "server-only";

import { cache } from "react";
import type { CalendarAudience, Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { getCurrentSession } from "@/lib/session";

/**
 * De doelgroepen waar het ingelogde lid bij hoort.
 *
 * Bewust een DB-lezing en geen sessieveld: `SessionPayload` draagt permissies en
 * rollen, geen studieprofiel, en dat uitbreiden zou elke sessielezing op de hele
 * site duurder maken voor iets wat enkel de kalender nodig heeft. De lezing zit
 * in `cache`, dus binnen één render of request gebeurt ze hoogstens één keer.
 *
 * Wie niet ingelogd is, hoort bij geen enkele doelgroep. Dat verbergt niets
 * blijvend: doelgroepevents blijven bereikbaar via "alles tonen" en via hun eigen
 * categoriepagina.
 */
export const viewerAudiences = cache(async (): Promise<CalendarAudience[]> => {
  const session = await getCurrentSession();
  if (!session) return [];
  return audiencesForUser(session.user.id);
});

/**
 * Dezelfde afleiding, maar voor een expliciete gebruiker. De persoonlijke
 * agenda-feed heeft geen sessie: die authenticeert met een token in de URL.
 */
export async function audiencesForUser(userId: string): Promise<CalendarAudience[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { studyYears: true, internationalStudent: true },
  });
  if (!user) return [];

  const audiences: CalendarAudience[] = [];
  if (user.studyYears.includes("BACHELOR_1")) audiences.push("FIRST_YEARS");
  if (user.internationalStudent) audiences.push("INTERNATIONALS");
  return audiences;
}

/**
 * Het where-fragment dat doelgroepevents wegfiltert voor wie er niet bij hoort.
 *
 * Een evenement zonder doelgroepcategorie is voor iedereen. Draagt het er wel
 * een, dan hoort het bij die doelgroep en verschijnt het enkel bij wie erbij
 * hoort. Een evenement met twee doelgroepen (eerstejaars én internationaal)
 * volstaat aan één match.
 */
export function audienceFilter(audiences: CalendarAudience[]): Prisma.CalendarEventWhereInput {
  return {
    OR: [
      { categories: { none: { category: { audience: { not: null } } } } },
      ...(audiences.length > 0
        ? [{ categories: { some: { category: { audience: { in: audiences } } } } }]
        : []),
    ],
  };
}
