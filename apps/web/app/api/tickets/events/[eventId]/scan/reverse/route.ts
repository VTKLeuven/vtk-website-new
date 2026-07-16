import { z } from "zod";
import { readLimitedJson, RequestBodyTooLargeError } from "@/lib/ticketing/http";
import { reverseTicketScan } from "@/lib/ticketing/scanner";

const schema = z.object({ scanId: z.string().min(1), clientScanId: z.string().min(8).max(160) });

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const input = schema.parse(await readLimitedJson(request, 8 * 1024));
    return Response.json(await reverseTicketScan(eventId, input));
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof Error && error.message === "UNSUPPORTED_MEDIA_TYPE") {
      return Response.json({ error: error.message }, { status: 415 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return Response.json({ error: "REVERSAL_FAILED" }, { status: 400 });
  }
}
