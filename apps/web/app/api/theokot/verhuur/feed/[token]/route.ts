import { verifyRentalFeedToken } from "@/lib/theokotVerhuur-server";
import { buildRentalFeed } from "@/lib/theokotVerhuurIcs";
import { feedLocale, icsResponse, stripIcsSuffix } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De iCalendar RFC 5545 feed van de Theokot-verhuurkalender.
 *
 * Beveiligd met een geheim token in het pad, zodat agenda-apps zoals Apple
 * Calendar, Google Calendar en Outlook zich kunnen abonneren en automatische live
 * updates ontvangen wanneer er nieuwe aanvragen bijkomen of goedgekeurd worden.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const rawToken = stripIcsSuffix(token);

  const isValid = await verifyRentalFeedToken(rawToken);
  if (!isValid) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const locale = feedLocale(url);
  const statusParam = url.searchParams.get("status");
  const statusFilter = statusParam === "approved" ? "approved" : "all";
  const includeDeclined = url.searchParams.get("declined") === "1";

  const body = await buildRentalFeed({ statusFilter, includeDeclined }, locale);
  return icsResponse(body, "theokot-verhuur.ics", { private: true });
}
