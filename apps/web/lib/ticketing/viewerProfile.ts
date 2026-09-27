import "server-only";

import { prisma } from "@vtk/db";
import {
  NO_TICKET_PROFILE,
  ticketAudiencesForProfile,
  type TicketViewerProfile,
} from "./audience";

/**
 * Is de ingelogde bezoeker erelid, en bij welke doelgroepen hoort hij? Een
 * DB-lezing, want `SessionPayload` draagt permissies en rollen, geen
 * ledenstatus of studieprofiel, en dat uitbreiden zou elke sessielezing op de
 * hele site duurder maken voor iets wat enkel de ticketshop nodig heeft.
 */
export async function ticketViewerProfile(userId: string | undefined): Promise<TicketViewerProfile> {
  if (!userId) return NO_TICKET_PROFILE;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      honoraryMember: true,
      studyYears: true,
      internationalStudent: true,
      alumni: true,
      isStudent: true,
      studyConfirmedYear: true,
    },
  });
  if (!user) return NO_TICKET_PROFILE;
  return { honorary: user.honoraryMember, audiences: ticketAudiencesForProfile(user) };
}
