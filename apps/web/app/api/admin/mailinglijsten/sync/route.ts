import { reconcileMailingLists } from "@/lib/brevo/sync";
import { syncAlumniToBrevo } from "@/lib/brevo/alumni";

export const runtime = "nodejs";

/**
 * Vangnet-trigger voor de Brevo-sync: herberekent alle mailinglijst-
 * lidmaatschappen en zet ze (upsert + prune) in Brevo recht, zodat het handmatig
 * downloaden/importeren wegvalt en laatkomers, afvinkingen en richtingwissels
 * alsnog doorwerken. In dezelfde ronde komen de uitschrijvingen uit Brevo terug
 * naar de site (zie `lib/brevo/unsubscribe.ts`). Bedoeld voor een dagelijkse
 * cron/uptime-pinger met `Authorization: Bearer $BREVO_SYNC_SECRET`. Geen secret
 * = trigger uit (401).
 *
 * De alumnilijst draait mee, ook al is het een eigen lijst met een eigen sync:
 * anders zou een alumnus die zich uitschrijft pas uit de lijst vallen wanneer
 * iemand toevallig op de knop in het beheer drukt.
 */
export async function POST(request: Request) {
  const secret = process.env.BREVO_SYNC_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const lists = await reconcileMailingLists();

  // Eén stukke alumnisync mag het resultaat van de studentenlijsten niet
  // verbergen; ze wordt apart gerapporteerd en maakt de ronde wel ongezond.
  let alumni: Awaited<ReturnType<typeof syncAlumniToBrevo>> | { error: string };
  try {
    alumni = await syncAlumniToBrevo();
  } catch (err) {
    alumni = { error: err instanceof Error ? err.message : String(err) };
  }

  const unhealthy = ("failed" in lists && lists.failed > 0) || "error" in alumni;
  return Response.json({ lists, alumni }, { status: unhealthy ? 503 : 200 });
}
