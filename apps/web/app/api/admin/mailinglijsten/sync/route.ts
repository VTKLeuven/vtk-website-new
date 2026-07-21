import { reconcileMailingLists } from "@/lib/brevo/sync";

export const runtime = "nodejs";

/**
 * Vangnet-trigger voor de Brevo-sync: herberekent alle mailinglijst-
 * lidmaatschappen en zet ze (upsert + prune) in Brevo recht, zodat het handmatig
 * downloaden/importeren wegvalt en laatkomers, afvinkingen en richtingwissels
 * alsnog doorwerken. Bedoeld voor een dagelijkse cron/uptime-pinger met
 * `Authorization: Bearer $BREVO_SYNC_SECRET`. Geen secret = trigger uit (401).
 */
export async function POST(request: Request) {
  const secret = process.env.BREVO_SYNC_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const result = await reconcileMailingLists();
  const unhealthy = "failed" in result && result.failed > 0;
  return Response.json(result, { status: unhealthy ? 503 : 200 });
}
