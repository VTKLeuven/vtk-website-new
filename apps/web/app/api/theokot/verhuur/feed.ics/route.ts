import { verifyRentalFeedToken } from "@/lib/theokotVerhuur-server";
import { buildRentalFeed } from "@/lib/theokotVerhuurIcs";
import { feedLocale, icsResponse } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `.ics`-endpoint voor Theokot-verhuur via querystring (`?token=...`).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";

  const isValid = await verifyRentalFeedToken(token);
  if (!isValid) return new Response("Not found", { status: 404 });

  const locale = feedLocale(url);
  const statusParam = url.searchParams.get("status");
  const statusFilter = statusParam === "approved" ? "approved" : "all";
  const includeDeclined = url.searchParams.get("declined") === "1";

  const body = await buildRentalFeed({ statusFilter, includeDeclined }, locale);
  return icsResponse(body, "theokot-verhuur.ics", { private: true });
}
