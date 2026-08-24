import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { listTicketsForCurrentUser } from "@/lib/ticketing/queries";
import type { AppMyOrder } from "@/lib/app-api/contract";
import { absoluteUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mijn tickets.
 *
 * Staat onder `/mijn/` en niet onder `/tickets/mijn`, zodat het nooit kan botsen
 * met een event met de slug "mijn". Next zou dat vandaag goed oplossen (een vast
 * segment wint van een dynamisch), maar dat is een regel waar je niet op wil
 * moeten vertrouwen wanneer een redacteur een slug kiest.
 *
 * Het `credential`-veld is de inhoud van de QR-code. De app tekent die zelf met
 * `react-native-qrcode-svg`; er komt geen afbeelding over de lijn, want dat is
 * een rondje meer voor iets dat het toestel in een oogwenk zelf tekent. Bovendien
 * werkt een getekende QR ook wanneer het net op dat moment geen netwerk heeft, en
 * dat is precies de situatie aan een ingang.
 */
export async function GET(request: Request) {
  try {
    await requireSession();
    const orders = await listTicketsForCurrentUser();

    const payload: AppMyOrder[] = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalCents: order.totalCents,
      event: {
        slug: order.event.slug,
        title: order.event.title,
        startsAt: order.event.startsAt.toISOString(),
        location: order.event.location,
      },
      tickets: order.tickets.map((ticket) => ({
        id: ticket.id,
        publicId: ticket.publicId,
        status: ticket.status,
        attendeeName: ticket.attendeeName,
        typeName: ticket.typeName,
        credential: ticket.credential,
        checkedInAt: ticket.checkedInAt ? ticket.checkedInAt.toISOString() : null,
        // De PDF- en walletroutes geven paden terug; een telefoon heeft er een
        // volledige URL voor nodig.
        pdfUrl: absoluteUrl(request, ticket.pdfUrl) as string,
        walletAppleUrl: absoluteUrl(request, ticket.walletAppleUrl),
        walletGoogleUrl: absoluteUrl(request, ticket.walletGoogleUrl),
      })),
    }));

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
