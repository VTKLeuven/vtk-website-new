import { corsPreflight } from "@/lib/cors";
import { readAppJson } from "@/lib/app-api/respond";
import { appPlanningSubscriptionSchema } from "@/lib/app-api/schemas";
import { planningRoute } from "@/lib/burgieclan/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Een lessenrooster koppelen, of de link vervangen (`{ icsUrl }`, de
 * abonnementslink van het KU Leuven-lessenrooster). Een andere link begint een
 * nieuw rooster; de wekelijkse regels en de deadlines blijven.
 */
export async function POST(request: Request) {
  return planningRoute(request, async () => {
    const { icsUrl } = appPlanningSubscriptionSchema.parse(await readAppJson(request));
    return { kind: "subscribe", icsUrl };
  });
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
