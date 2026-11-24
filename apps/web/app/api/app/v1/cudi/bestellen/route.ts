import { corsPreflight } from "@/lib/cors";
import { placeOrderRoute } from "@/lib/cudi/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reserveren bij de cursusdienst. Cudi beslist; een weigering komt terug als `{ ok: false }`. */
export function POST(request: Request) {
  return placeOrderRoute(request);
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
