import { corsPreflight } from "@/lib/cors";
import { listPublishedTicketEvents } from "@/lib/ticketing/queries";
import { appLocaleFrom, type AppTicketEvent } from "@/lib/app-api/contract";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De events waarvoor er nu tickets te koop zijn.
 *
 * `listPublishedTicketEvents` doet al het werk en houdt daarbij twee dingen in de
 * gaten die de app niet zou mogen overdoen: welke tickettypes op dit moment in
 * hun verkoopvenster zitten, en welke een login vragen (ledentickets en gratis
 * tickets). Wie niet ingelogd is en enkel ledentickets zou zien, krijgt
 * `requiresLogin` in plaats van een leeg event.
 *
 * De lijst zelf draagt geen tickettypes: die zijn pas nodig op het detailscherm,
 * en een lijst van tien events met al hun types en vragen is een payload die
 * niemand leest.
 */
export async function GET(request: Request) {
  try {
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));
    const events = await listPublishedTicketEvents(locale);

    const payload: AppTicketEvent[] = events.map((event) => ({
      id: event.id,
      slug: event.slug,
      title: event.title,
      location: event.location,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      ownerGroupName: event.ownerGroupName,
      ticketTypeCount: event.ticketTypes.length,
      fromPriceCents:
        event.ticketTypes.length > 0
          ? Math.min(...event.ticketTypes.map((type) => type.priceCents))
          : null,
      requiresLogin: event.requiresLogin,
    }));

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
