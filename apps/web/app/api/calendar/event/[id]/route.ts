import { buildEventIcs } from "@/lib/calendar/feeds";
import { feedLocale, icsResponse, stripIcsSuffix } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Eén evenement als download, voor de "Zet in mijn agenda"-knop op de eventpagina. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const locale = feedLocale(new URL(request.url));

  const result = await buildEventIcs(stripIcsSuffix(id), locale);
  if (!result) return new Response("Not found", { status: 404 });

  return icsResponse(result.body, `${result.filename}.ics`, { download: true });
}
