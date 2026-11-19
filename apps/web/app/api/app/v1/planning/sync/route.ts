import { corsPreflight } from "@/lib/cors";
import { planningRoute } from "@/lib/burgieclan/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nu synchroniseren met het lessenrooster van KU Leuven. Burgieclan begrenst hoe vaak. */
export async function POST(request: Request) {
  return planningRoute(request, () => ({ kind: "sync" }));
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
