import { corsPreflight } from "@/lib/cors";
import { documentFileRoute } from "@/lib/burgieclan/courses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Een link naar het bestand van een document, tien minuten geldig, zonder
 * cookie te openen. Burgieclan beslist of je het mag zien (`DocumentFileVoter`).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return documentFileRoute(request, (await params).id);
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
