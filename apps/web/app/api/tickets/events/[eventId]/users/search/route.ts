import { searchScannerCandidates } from "@/lib/ticketing/scannerAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Iemand zoeken om als scanner toe te voegen: op naam, e-mail of r-nummer. */
export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json(await searchScannerCandidates(eventId, query), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHENTICATED";
    const status =
      code === "TICKET_EVENT_NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : 401;
    return Response.json({ error: code === "TICKET_EVENT_NOT_FOUND" ? "NOT_FOUND" : code }, { status });
  }
}
