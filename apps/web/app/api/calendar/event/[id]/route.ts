import { buildEventIcs } from "@/lib/calendar/feeds";
import { feedLocale, icsResponse, stripIcsSuffix } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Eén evenement achter de agendaknop op de eventpagina en het agenda-icoon op de
 * homepagekaarten.
 *
 * Bewust `inline` en niet `attachment`. Op een desktopbrowser verandert dat
 * niets: geen van beide kan `text/calendar` tonen, dus het bestand komt gewoon
 * in de downloads terecht en de agenda opent het. Op iOS is het verschil groot:
 * met `attachment` belandt de .ics in de Bestanden-app en moet iemand ze daar
 * gaan zoeken, terwijl Safari een inline `text/calendar` meteen als evenement
 * toont met een knop om het toe te voegen. Dat is wat de knop belooft.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const locale = feedLocale(new URL(request.url));

  const result = await buildEventIcs(stripIcsSuffix(id), locale);
  if (!result) return new Response("Not found", { status: 404 });

  return icsResponse(result.body, `${result.filename}.ics`);
}
