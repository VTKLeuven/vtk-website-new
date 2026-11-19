import "server-only";

import { burgieclanConfig } from "@/lib/burgieclan/client";
import { getCurrentSession } from "@/lib/session";
import { hasScannableTicketEvent } from "@/lib/ticketing/authorization";
import type { AppAbilities } from "./contract";

/**
 * Welke knoppen deze gebruiker mag zien.
 *
 * Dit is netheid en geen beveiliging: elke route controleert het daarna nog eens
 * zelf. Zonder dit zou de app een scanknop tonen aan iedereen, en die zou dan bij
 * de helft "geen toegang" antwoorden; een knop die je nooit mag gebruiken, is
 * erger dan een knop die er niet is.
 *
 * Scannen staat er bewust **niet** in als "heeft de permissie `tickets.manageAll`":
 * de standaardregel (`TicketEvent.openScanning`) geeft elk praesidiumlid
 * scanrechten, en een losse `SCANNER`-grant doet hetzelfde voor wie komt
 * bijspringen. Of er echt iets te scannen valt, hangt dus aan de events zelf, en
 * `scanTickets` volgt precies de lijst van `/api/app/v1/scan/events`: is die
 * leeg, dan is er geen knop. Een gewone student ziet de scanner aan de deur dus
 * niet. Wie komt shiften, scant onder Meer de uitnodigings-QR; de app haalt dit
 * daarna opnieuw op en dan staat de knop er wel.
 */
export async function appAbilities(): Promise<AppAbilities | null> {
  const session = await getCurrentSession();
  if (!session) return null;

  const has = (permission: string) =>
    session.user.isSuperAdmin || session.permissions.includes(permission as never);

  return {
    scanTickets: await hasScannableTicketEvent(session),
    acceptVouchers: has("shift.rewardRedeem"),
    theokotPickup: has("theokot.pickup"),
    planning: burgieclanConfig() !== null,
  };
}
