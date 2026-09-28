import { NextResponse } from "next/server";
import { loadCalendarEvents } from "@/lib/calendar/publicEvents";

// Leest de sessie om de doelgroepen van de kijker te bepalen, dus per definitie
// niet statisch te renderen.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  const payload = await loadCalendarEvents({
    ...(start && end ? { start: new Date(start), end: new Date(end) } : {}),
    groups: url.searchParams.getAll("group").filter(Boolean),
    categories: url.searchParams.getAll("category").filter(Boolean),
    // Standaard toont de publieke kalender alles. Personalisatie is opt-in: met
    // `audience=mine` blijven algemene events en doelgroepevents voor dit profiel.
    onlyMyAudiences: url.searchParams.get("audience") === "mine",
  });

  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
