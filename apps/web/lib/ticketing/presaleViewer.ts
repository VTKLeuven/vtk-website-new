import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@vtk/db";
import type { SessionPayload } from "@vtk/auth";
import { currentWorkingYear, workingYearStart } from "@/lib/workingYear";
import { hasPresale, type PresaleConfig, type PresaleViewer } from "./presale";
import { presaleCookieName, presaleTokenMatches } from "./presaleLink";

/**
 * De bezoeker zoals de voorverkoopregel hem nodig heeft: zijn posten, plus hoe
 * vaak hij dit werkingsjaar een shift deed.
 *
 * De regel zelf staat in `presale.ts` en blijft puur; dit bestand is enkel het
 * ophalen. Gedeeld door de shop en het slot bij het afrekenen, zodat "vijftien
 * shiften" op beide plaatsen hetzelfde telt.
 */

/**
 * Voltooide shiften van dit werkingsjaar. "Voltooid" is dezelfde definitie als
 * in de ranglijst (`/api/shift/ranking`): de shift is voorbij. Wie voor volgende
 * week ingeschreven staat, heeft ze nog niet gedaan.
 *
 * Request-gedeeld via React `cache`: de ticketlijst roept dit één keer aan voor
 * een pagina vol events.
 */
export const completedShiftsThisWorkingYear = cache(async (userId: string): Promise<number> => {
  return prisma.shiftParticipant.count({
    where: {
      userId,
      shift: {
        endTime: { gte: workingYearStart(currentWorkingYear()), lt: new Date() },
      },
    },
  });
});

type PresaleEvent = PresaleConfig & {
  id: string;
  salesStartAt?: Date | string | null;
  presaleToken?: string | null;
};

/**
 * Bouwt de viewer voor een reeks events.
 *
 * Telt de shiften alleen wanneer er ergens een voorverkoop loopt waar het nog
 * iets kan uitmaken. Zonder die voorwaarde stond er een extra `count` op elke
 * ticketpagina van elke bezoeker, voor een regel die op de meeste events niet
 * eens aan staat.
 */
export async function presaleViewerFor(
  session: SessionPayload | null | undefined,
  events: readonly PresaleEvent[],
): Promise<PresaleViewer> {
  const hasPresaleLink = await followedPresaleLink(events);
  // Zonder sessie is de private link de enige weg naar een voorverkoop; zonder
  // die link valt er voor een uitgelogde bezoeker niets te bepalen.
  if (!session) return hasPresaleLink ? { groups: [], hasPresaleLink } : null;

  const countShifts = events.some(
    (event) => hasPresale(event) && event.presaleHelpers !== false,
  );
  return {
    groups: session.groups,
    completedShifts: countShifts ? await completedShiftsThisWorkingYear(session.user.id) : 0,
    hasPresaleLink,
  };
}

/**
 * Volgde deze bezoeker de private link van een van deze events?
 *
 * Eén event tegelijk is de normale situatie (de ticketpagina); op de lijst kan
 * het er meer zijn, en dan volstaat het dat er één bij zit: de shop toont per
 * event toch zijn eigen venster.
 */
async function followedPresaleLink(events: readonly PresaleEvent[]): Promise<boolean> {
  const withToken = events.filter((event) => event.presaleToken && hasPresale(event));
  if (withToken.length === 0) return false;
  const jar = await cookies();
  return withToken.some((event) =>
    presaleTokenMatches(event.presaleToken ?? null, jar.get(presaleCookieName(event.id))?.value ?? null),
  );
}
