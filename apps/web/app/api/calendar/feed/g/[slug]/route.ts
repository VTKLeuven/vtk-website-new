import { buildFeed } from "@/lib/calendar/feeds";
import { feedLocale, icsResponse, stripIcsSuffix } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De feed van één post of werkgroep, bv. /api/calendar/feed/g/theokot. */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const clean = stripIcsSuffix(slug);
  const locale = feedLocale(new URL(request.url));

  const body = await buildFeed({ kind: "group", slug: clean }, locale);
  if (body === null) return new Response("Not found", { status: 404 });

  return icsResponse(body, `vtk-${clean}.ics`);
}
