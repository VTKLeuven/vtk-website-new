import { corsPreflight } from "@/lib/cors";
import { overviewRoute } from "@/lib/cudi/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De bestellingen bij de cursusdienst, de uren van deze week en of er besteld kan worden. */
export function GET(request: Request) {
  return overviewRoute(request);
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
