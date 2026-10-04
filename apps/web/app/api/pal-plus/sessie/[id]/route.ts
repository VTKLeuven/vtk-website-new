import { buildPalPlusSessionIcs } from "@/lib/palPlusIcs";
import { feedLocale, icsResponse, stripIcsSuffix } from "@/lib/calendar/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Eén sessie achter "Zet in mijn agenda". `inline`, om dezelfde reden als bij
 * een evenement (app/api/calendar/event/[id]/route.ts): Safari op iOS toont dan
 * meteen een knop om het toe te voegen.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await buildPalPlusSessionIcs(stripIcsSuffix(id), feedLocale(new URL(request.url)));
  if (!result) return new Response("Not found", { status: 404 });
  return icsResponse(result.body, `${result.filename}.ics`);
}
