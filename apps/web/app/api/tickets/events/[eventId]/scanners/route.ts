import { ZodError } from "zod";
import { readLimitedJson, RequestBodyTooLargeError } from "@/lib/ticketing/http";
import {
  addEventScanner,
  listEventScanners,
  removeEventScanner,
} from "@/lib/ticketing/scannerAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scanners van dit event beheren, vanuit de scanner zelf.
 *
 * `POST` met `{ userId }` voegt toe, met `{ grantId }` haalt weg. Eén route voor
 * allebei, want het is één paneel dat na elke bewerking dezelfde lijst opnieuw
 * tekent; de antwoorden zijn daarom ook identiek van vorm.
 */
function errorResponse(error: unknown) {
  if (error instanceof RequestBodyTooLargeError) {
    return Response.json({ error: error.message }, { status: 413 });
  }
  if (error instanceof SyntaxError) return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  if (error instanceof ZodError) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  if (error instanceof Error) {
    if (error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error.message === "FORBIDDEN") return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    if (error.message === "TICKET_EVENT_NOT_FOUND") {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    // Verwachte invoerfouten: de scanner maakt er een leesbare melding van.
    if (error.message === "USER_NOT_FOUND" || error.message === "GRANT_NOT_FOUND") {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error.message === "GRANT_ROLE_CONFLICT") {
      return Response.json({ error: error.message }, { status: 409 });
    }
  }
  console.error("Scanner access failed", error);
  return Response.json({ error: "SCANNER_ACCESS_FAILED" }, { status: 500 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    return Response.json(await listEventScanners(eventId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const body = (await readLimitedJson(request, 8 * 1024)) as Record<string, unknown>;
    return Response.json(
      body && "grantId" in body
        ? await removeEventScanner(eventId, body)
        : await addEventScanner(eventId, body)
    );
  } catch (error) {
    return errorResponse(error);
  }
}
