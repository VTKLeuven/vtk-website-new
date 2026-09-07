import { z } from "zod";
import { startOrderPayment } from "@/lib/ticketing/orders";
import { getOrderForViewer } from "@/lib/ticketing/queries";
import { readLimitedJson, RequestBodyTooLargeError } from "@/lib/ticketing/http";

export const runtime = "nodejs";

const paySchema = z.object({
  provider: z.enum(["mollie", "bancontact", "mock"]),
  locale: z.enum(["nl", "en"]).default("nl"),
});

/**
 * Start de betaling van een bestaande bestelling met de gekozen betaalwijze.
 *
 * De toegangscontrole is die van de bestelpagina zelf: `getOrderForViewer` geeft
 * enkel iets terug aan wie de bestelling mag zien (toegangscookie, de ingelogde
 * koper, of een superadmin). Een tweede, eigen check zou daarvan afdrijven.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  try {
    const viewable = await getOrderForViewer(orderId);
    if (!viewable) return Response.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

    const body = paySchema.parse(await readLimitedJson(request, 4 * 1024));
    const result = await startOrderPayment({ orderId, provider: body.provider, locale: body.locale });

    if (!result.ok) {
      // Al betaald is geen fout voor de koper: de bestelpagina toont dan gewoon
      // de tickets. De andere codes zijn dat wel.
      const status = result.code === "ORDER_NOT_FOUND" ? 404 : result.code === "ALREADY_PAID" ? 409 : 400;
      return Response.json({ error: result.code }, { status });
    }
    return Response.json({ provider: result.provider, checkoutUrl: result.checkoutUrl });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "INVALID_JSON" }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    console.error("Starting a ticket payment failed", { orderId, error });
    return Response.json({ error: "PAYMENT_UNAVAILABLE" }, { status: 500 });
  }
}
