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
    // `expiresAt` is hier de vervaldatum van de checkout bij de provider, niet
    // die van de reservatie: zie `createAndPersistCheckout`. De pagina heeft ze
    // nodig om geen dode QR te blijven tonen.
    select: { id: true, providerDeeplink: true, expiresAt: true },
  });
}

/**
 * Of de bestelpagina terug moet wijzen naar een lopende Bancontact-QR, en hoe
 * lang die nog geldt. Dat "hoe lang" meten we op de klok van de server: met
 * een absoluut tijdstip zou een telefoon waarvan de klok voorloopt, het blok
 * meteen verbergen.
 */
export async function openBancontactForOrderPage(
  orderId: string
): Promise<{ paymentId: string; expiresInMs: number | null } | null> {
  const payment = await liveBancontactPayment(orderId);
  if (!payment?.providerDeeplink) return null;
  const expiresInMs = payment.expiresAt ? payment.expiresAt.getTime() - Date.now() : null;
  return expiresInMs == null || expiresInMs > 0 ? { paymentId: payment.id, expiresInMs } : null;
}
