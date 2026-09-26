"use server";

import { prisma } from "@vtk/db";
import { getCurrentSession } from "@/lib/session";

/**
 * Onthoudt "Afstemmen op mijn profiel" van /kalender voor de volgende keer.
 *
 * Het is dezelfde voorkeur als in het profiel (`User.calendarOnlyMyAudiences`),
 * en die bepaalt ook de beginstand van /kalender en de lijst in de app. Eén
 * voorkeur, dus wie het vinkje hier zet, ziet het daar ook aangevinkt staan.
 *
 * Zonder sessie gebeurt er niets: een bezoeker zonder account heeft geen
 * profiel om op af te stemmen, en het vinkje werkt voor hem enkel in deze
 * weergave. Geeft terug of er iets bewaard is.
 */
export async function saveCalendarAudiencePreferenceAction(onlyMine: boolean): Promise<boolean> {
  const session = await getCurrentSession();
  if (!session) return false;
  await prisma.user.update({
    where: { id: session.user.id },
    data: { calendarOnlyMyAudiences: onlyMine === true },
  });
  return true;
}
