import { ZodError } from "zod";
import { readLimitedJson, RequestBodyTooLargeError } from "@/lib/ticketing/http";
import { scanTicket } from "@/lib/ticketing/scanner";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    return Response.json(await scanTicket(eventId, await readLimitedJson(request, 16 * 1024)));
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "INVALID_JSON" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "UNSUPPORTED_MEDIA_TYPE") {
      return Response.json({ error: error.message }, { status: 415 });
    }
    if (error instanceof ZodError) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    console.error("Ticket scan failed", error);
    return Response.json({ error: "SCAN_FAILED" }, { status: 500 });
  }
}
