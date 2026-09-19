import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import {
  presaleCookieExpiry,
  presaleCookieName,
  presaleCookieOptions,
  presaleTokenMatches,
} from "@/lib/ticketing/presaleLink";

export const runtime = "nodejs";

/**
 * De private voorverkooplink. Zet een cookie voor dit ene event en stuurt door
 * naar de gewone ticketpagina.
 *
 * Bewust een eigen pad en geen `?token=` op de shop: zo staat het geheim niet
 * in elke link die iemand daarna deelt of in zijn geschiedenis terugvindt, en
 * kan de bezoeker de pagina herladen en afrekenen zonder de link opnieuw nodig
 * te hebben. De cookie vervalt wanneer de verkoop voor iedereen opengaat.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string; token: string }> },
) {
  const { locale, slug, token } = await params;
  if (!hasLocale(locale)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const base = locale === "en" ? "/en" : "";
  const shopPath = `${base}/tickets/${slug}`;

  const event = await prisma.ticketEvent.findUnique({
    where: { slug },
    select: { id: true, presaleToken: true, salesStartAt: true },
  });
  // Een verkeerde of ingetrokken link leidt gewoon naar de ticketpagina: die
  // zegt zelf wel dat de verkoop nog niet open staat. Een foutmelding zou enkel
  // verklappen dat er een link bestaat.
  //
  // Relatieve Location-header en geen NextResponse.redirect(new URL(..., request.url)):
  // achter een reverse proxy (zoals Caddy voor de Node-container) draagt
  // request.url de interne loopback-origin (localhost:3000), waardoor
  // new URL(..., request.url) bezoekers naar https://localhost:3000/... stuurde.
  if (!event || !presaleTokenMatches(event.presaleToken, token)) {
    return new NextResponse(null, {
      status: 307,
      headers: { Location: shopPath },
    });
  }

  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: shopPath },
  });
  response.cookies.set(
    presaleCookieName(event.id),
    token,
    presaleCookieOptions(presaleCookieExpiry(event.salesStartAt)),
  );
  return response;
}
