import { reconcileCudiRegistrations } from "@/lib/cudiRegistrationSync";

export const runtime = "nodejs";

/**
 * Vangnet-trigger: duwt de volledige roster-set van alle komende cursusdienst-
 * shiften naar cudi (upsert + prune), zodat een zeldzame gemiste per-actie-push
 * alsnog rechtgezet wordt. Bedoeld voor een cron/uptime-pinger met
 * `Authorization: Bearer $CUDI_SYNC_SECRET`. Geen secret = integratie uit (401).
 */
export async function POST(request: Request) {
  const secret = process.env.CUDI_SYNC_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const result = await reconcileCudiRegistrations();
  const failed = "error" in result;
  return Response.json(result, { status: failed ? 502 : 200 });
}
