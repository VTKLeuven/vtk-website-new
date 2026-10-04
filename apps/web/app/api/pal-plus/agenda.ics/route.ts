import { buildPalPlusFeed } from "@/lib/palPlusIcs";
import { feedLocale, icsResponse } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De publieke PAL+-agenda om op te abonneren. Er staat niets in wat niet ook
 * op /pal-plus staat, dus er hoeft geen geheim in de URL. Los van de gewone
 * kalender, zoals de sessies daar ook niet in staan.
 */
export async function GET(request: Request) {
  const locale = feedLocale(new URL(request.url));
  return icsResponse(await buildPalPlusFeed(locale), "vtk-pal-plus.ics");
}
