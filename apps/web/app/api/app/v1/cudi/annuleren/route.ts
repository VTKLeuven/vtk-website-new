import { corsPreflight } from "@/lib/cors";
import { cancelRoute } from "@/lib/cudi/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Eén regel van een lopende bestelling annuleren. */
export function POST(request: Request) {
  return cancelRoute(request);
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
