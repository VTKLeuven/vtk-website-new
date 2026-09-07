import "server-only";

import { prisma } from "@vtk/db";
import { getOrderForViewer } from "./queries";

/**
 * De nog lopende Bancontact-betaling van een bestelling, of null.
 *
 * De toegangscontrole is die van de bestelpagina: `getOrderForViewer` geeft
 * enkel iets terug aan wie de bestelling mag zien. Pas daarna halen we de
 * betaling op; een eigen tweede check zou daar na verloop van tijd van afdrijven.
 */
export async function liveBancontactPayment(orderId: string) {
  const viewable = await getOrderForViewer(orderId);
  if (!viewable) return null;

  return prisma.ticketPayment.findFirst({
    where: {
      orderId,
      provider: "bancontact",
      status: { in: ["CREATED", "PENDING"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, providerDeeplink: true, expiresAt: true },
  });
}
