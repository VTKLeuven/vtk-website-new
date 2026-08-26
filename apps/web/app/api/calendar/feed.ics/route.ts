import { buildFeed } from "@/lib/calendar/feeds";
import { feedLocale, feedScopeFromQuery, icsResponse } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `.ics`-alias voor agenda-clients die een herkenbare bestandsextensie eisen. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = feedLocale(url);
  const body = await buildFeed(feedScopeFromQuery(url), locale);
  if (body === null) return new Response("Not found", { status: 404 });
  return icsResponse(body, "vtk.ics");
}
