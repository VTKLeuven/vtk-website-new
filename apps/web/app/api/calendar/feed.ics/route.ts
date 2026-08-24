import { buildFeed } from "@/lib/calendar/feeds";
import { feedLocale, icsResponse } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `.ics`-alias voor agenda-clients die een herkenbare bestandsextensie eisen. */
export async function GET(request: Request) {
  const locale = feedLocale(new URL(request.url));
  const body = await buildFeed({ kind: "all" }, locale);
  return icsResponse(body, "vtk.ics");
}
