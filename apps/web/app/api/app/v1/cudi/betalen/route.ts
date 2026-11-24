import { corsPreflight } from "@/lib/cors";
import { checkoutRoute } from "@/lib/cudi/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De betaallink van een bestelling die nog online betaald moet worden. */
export function POST(request: Request) {
  return checkoutRoute(request);
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
