import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { withSource } from "@/lib/ticketing/source";
import {
  presaleCookieExpiry,
  presaleCookieName,
  presaleCookieOptions,
  presaleTokenMatches,
} from "@/lib/ticketing/presaleLink";
import {
  privateCookieExpiry,
  privateCookieName,
  privateCookieOptions,
} from "@/lib/ticketing/privateLink";

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
    select: {
      id: true,
      presaleToken: true,
      salesStartAt: true,
      salesEndAt: true,
      endsAt: true,
      isPrivate: true,
      privateToken: true,
    },
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

  // Met `via`, zodat wie via de voorverkooplink koopt in de statistieken als
  // zodanig telt. Enkel bij een geldige link: een foute laat niets na.
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: withSource(shopPath, "voorverkoop") },
  });
  response.cookies.set(
    presaleCookieName(event.id),
    token,
    presaleCookieOptions(presaleCookieExpiry(event.salesStartAt)),
  );
  // Op een privéverkoop opent de voorverkooplink ook de pagina zelf: wie vroeger
  // mag kopen, hoort het event te kunnen zien. Anders stuurde deze link naar
  // een 404, en moest het beheer twee links naar dezelfde mensen sturen.
  if (event.isPrivate && event.privateToken) {
    response.cookies.set(
      privateCookieName(event.id),
      event.privateToken,
      privateCookieOptions(privateCookieExpiry(event)),
    );
  }
  return response;
}
