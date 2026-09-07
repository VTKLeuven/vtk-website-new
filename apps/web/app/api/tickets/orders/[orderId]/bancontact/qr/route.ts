import { createStyledVtkQrPng } from "@/lib/shortlink-qr";
import { liveBancontactPayment } from "@/lib/ticketing/bancontactPayment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De QR van een lopende Bancontact-betaling.
 *
 * We tekenen ze zelf uit de deeplink in plaats van de afbeelding van de provider
 * door te geven: dan staat de QR er in dezelfde stijl als die op een ticket, en
 * hangt de betaalpagina niet aan een externe host die traag of weg kan zijn.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const payment = await liveBancontactPayment(orderId);
  if (!payment?.providerDeeplink) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const png = await createStyledVtkQrPng(payment.providerDeeplink);
  return new Response(Buffer.from(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
