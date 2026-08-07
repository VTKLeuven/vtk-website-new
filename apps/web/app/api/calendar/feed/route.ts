import { buildFeed } from "@/lib/calendar/feeds";
import { feedLocale, icsResponse } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Alle publieke VTK-evenementen. De feed waar de abonneerknop op /kalender naar wijst. */
export async function GET(request: Request) {
  const locale = feedLocale(new URL(request.url));
  const body = await buildFeed({ kind: "all" }, locale);
  return icsResponse(body, "vtk.ics");
}
