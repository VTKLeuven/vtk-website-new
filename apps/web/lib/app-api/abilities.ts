import "server-only";

import { getCurrentSession } from "@/lib/session";
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
 * bijspringen. Of er echt iets te scannen valt, hangt dus aan de events zelf en
 * niet aan een permissie; `/api/app/v1/scan/events` geeft die lijst.
 */
export async function appAbilities(): Promise<AppAbilities | null> {
  const session = await getCurrentSession();
  if (!session) return null;

  const has = (permission: string) =>
    session.user.isSuperAdmin || session.permissions.includes(permission as never);

  return {
    // Wie in een post zit, kan door de standaardregel sowieso iets scannen; wie
    // dat niet is, kan een uitnodiging krijgen en dan alsnog. De knop mag dus
    // voor elk ingelogd lid bestaan, want een lege lijst legt zichzelf uit.
    scanTickets: true,
    acceptVouchers: has("shift.rewardRedeem"),
    theokotPickup: has("theokot.pickup"),
  };
}
