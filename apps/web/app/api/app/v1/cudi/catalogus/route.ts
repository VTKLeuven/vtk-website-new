import { corsPreflight } from "@/lib/cors";
import { catalogRoute } from "@/lib/cudi/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De cursussen voor jouw vakken en het algemene materiaal. */
export function GET(request: Request) {
  return catalogRoute(request);
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
