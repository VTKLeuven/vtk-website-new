import { listScannableTicketEvents } from "@/lib/ticketing/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De evenementen waarvoor deze gebruiker scanrechten heeft.
 *
 * Het webkeuzescherm (`app/(scanner)/scan/page.tsx`) is een server component en
 * roept `listScannableTicketEvents()` rechtstreeks aan. De native scanner-app
 * kan dat niet, en heeft precies dezelfde lijst nodig om te tonen waar het
 * icoon op het beginscherm in moet landen; vandaar dit endpoint.
 */
export async function GET() {
  try {
    return Response.json(
      { events: await listScannableTicketEvents() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    console.error("Scannable ticket events failed", error);
    return Response.json({ error: "SCANNER_EVENTS_FAILED" }, { status: 500 });
  }
}
