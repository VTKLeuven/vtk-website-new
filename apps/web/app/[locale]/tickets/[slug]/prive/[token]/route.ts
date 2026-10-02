import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { SOURCE_URL_PARAMS } from "@/lib/ticketing/source";
import {
  privateCookieExpiry,
  privateCookieName,
  privateCookieOptions,
  privateTokenMatches,
} from "@/lib/ticketing/privateLink";

export const runtime = "nodejs";

/**
 * De privélink van een privéverkoop. Zet een cookie voor dit ene event en
 * stuurt door naar de gewone ticketpagina, die zonder die cookie een 404 geeft.
 *
 * Zelfde opzet als de voorverkooplink: een eigen pad en geen `?token=` op de
 * shop, zodat het geheim niet meereist in elke link die iemand daarna deelt,
 * en de bezoeker de pagina kan herladen, eerst inloggen en later terugkomen
 * zonder de link opnieuw nodig te hebben.
 *
 * De herkomst uit de deelbare links van het beheer (`?via=whatsapp&c=...`) gaat
 * mee naar de shop; zonder die parameters telt het bezoek zoals elk ander.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; slug: string; token: string }> },
) {
  const { locale, slug, token } = await params;
  if (!hasLocale(locale)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const base = locale === "en" ? "/en" : "";
  const shopPath = `${base}/tickets/${slug}`;

  const event = await prisma.ticketEvent.findUnique({
    where: { slug },
    select: { id: true, privateToken: true, salesEndAt: true, endsAt: true },
  });
  // Een verkeerde of vernieuwde link leidt naar de ticketpagina, die voor een
  // privé-event een 404 geeft: net wat een onbestaand event ook geeft, dus
  // niets hier verraadt dat er een link bestaat.
  //
  // Relatieve Location-header: achter de reverse proxy draagt request.url de
  // interne origin (zie de voorverkooplink).
  if (!event || !privateTokenMatches(event.privateToken, token)) {
    return new NextResponse(null, { status: 307, headers: { Location: shopPath } });
  }

  const incoming = new URL(request.url).searchParams;
  const forwarded = new URLSearchParams();
  for (const key of SOURCE_URL_PARAMS) {
    const value = incoming.get(key);
    if (value) forwarded.set(key, value);
  }
  const query = forwarded.toString();

  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: query ? `${shopPath}?${query}` : shopPath },
  });
  response.cookies.set(
    privateCookieName(event.id),
    token,
    privateCookieOptions(privateCookieExpiry(event)),
  );
  return response;
}
