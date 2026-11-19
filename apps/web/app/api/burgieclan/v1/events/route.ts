import { NextResponse } from "next/server";
import { burgieclanEventsById, burgieclanUpcomingEvents, MAX_IDS } from "@/lib/burgieclan/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * De VTK-evenementen voor de planning van Burgieclan (`lib/burgieclan/events.ts`).
 *
 * - `?ids=a,b,c`: deze evenementen, voor zover gepubliceerd (hoogstens 100).
 * - zonder `ids`: wat er de komende `?days=` dagen (standaard 120, hoogstens 366)
 *   aan komt, voor de keuzelijst.
 *
 * Publiek en zonder login, want het zijn dezelfde gegevens als de publieke
 * ICS-feed. Bewust een eigen pad en geen `/api/calendar/events`: dat is de
 * kalender van de site, die de doelgroep van de kijker leest en verandert
 * wanneer de site dat nodig heeft. Dit is een contract met een andere applicatie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");

  if (idsParam !== null) {
    const ids = idsParam.split(",");
    if (ids.length > MAX_IDS) {
      return NextResponse.json({ error: "TOO_MANY_IDS", max: MAX_IDS }, { status: 400 });
    }
    const events = await burgieclanEventsById(ids);
    return NextResponse.json({ events }, { headers: { "cache-control": "no-store" } });
  }

  const daysParam = Number(url.searchParams.get("days") ?? 120);
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.round(daysParam), 1), 366) : 120;
  const now = new Date();
  const events = await burgieclanUpcomingEvents(now, new Date(now.getTime() + days * DAY_MS));
  return NextResponse.json(
    { events },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
