import { scannerBootstrap } from "@/lib/ticketing/scanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    return Response.json(await scannerBootstrap(eventId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const status = error instanceof Error && error.message === "FORBIDDEN" ? 403 : 404;
    return Response.json({ error: status === 403 ? "FORBIDDEN" : "NOT_FOUND" }, { status });
  }
}
