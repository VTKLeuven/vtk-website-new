import { corsPreflight } from "@/lib/cors";
import { planningRoute } from "@/lib/burgieclan/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Een nieuwe link voor de geëxporteerde agenda. De oude link werkt meteen niet
 * meer, ook niet in een agenda-app die erop geabonneerd was.
 */
export async function POST(request: Request) {
  return planningRoute(request, () => ({ kind: "rotateFeed" }));
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
