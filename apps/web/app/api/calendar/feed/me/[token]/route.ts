import { prisma } from "@vtk/db";
import { buildFeed } from "@/lib/calendar/feeds";
import { feedLocale, icsResponse, stripIcsSuffix } from "@/lib/calendar/http";
import {
  hashCalendarFeedToken,
  isCalendarFeedToken,
  shouldTouchLastUsed,
} from "@/lib/calendar/feedToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De persoonlijke feed van één lid: ledenexclusieve evenementen en zijn shiften.
 * Authenticatie gebeurt met het token in het pad, want een agenda-client stuurt
 * geen cookies en kan niet inloggen.
 *
 * Elk mislukt geval geeft dezelfde 404 als een onbestaand pad: een ingetrokken
 * token mag niet te onderscheiden zijn van een verzonnen token.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const raw = stripIcsSuffix(token);
  if (!isCalendarFeedToken(raw)) return new Response("Not found", { status: 404 });

  const record = await prisma.calendarFeedToken.findUnique({
    where: { tokenHash: hashCalendarFeedToken(raw) },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { active: true, deletedAt: true } },
    },
  });

  // Een gedeactiveerd of gewist account houdt geen werkende feed over.
  if (!record || record.revokedAt || !record.user.active || record.user.deletedAt) {
    return new Response("Not found", { status: 404 });
  }

  if (shouldTouchLastUsed(record.lastUsedAt)) {
    await prisma.calendarFeedToken
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      // Een mislukte statistiek mag de feed nooit tegenhouden.
      .catch(() => {});
  }

  const locale = feedLocale(new URL(request.url));
  const body = await buildFeed({ kind: "personal", userId: record.userId }, locale);
  return icsResponse(body, "mijn-vtk.ics", { private: true });
}
