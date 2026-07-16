import { ticketEventStats } from "@/lib/ticketing/scanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    return Response.json(await ticketEventStats(eventId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}
