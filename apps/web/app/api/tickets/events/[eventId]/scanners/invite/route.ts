import { createScannerInvite } from "@/lib/ticketing/scannerAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Een verse uitnodigings-QR voor dit event.
 *
 * Het paneel roept dit om de twintig seconden opnieuw aan: de code op het scherm
 * is dan altijd vers, en een screenshot van een minuut geleden doet niets meer.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    return Response.json(await createScannerInvite(eventId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHENTICATED";
    const status = code === "TICKET_EVENT_NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : 401;
    return Response.json(
      { error: code === "TICKET_EVENT_NOT_FOUND" ? "NOT_FOUND" : code },
      { status },
    );
  }
}
