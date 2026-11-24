import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { cancelOrder, placeOrder, updateOrder } from "@/lib/theokot-orders";
import {
  appTheokotCancelSchema,
  appTheokotOrderSchema,
  appTheokotUpdateSchema,
} from "@/lib/app-api/schemas";
import { appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { orderErrorResponse } from "@/lib/app-api/theokotErrors";
import { recordAppAction } from "@/lib/app-api/usage";

export const runtime = "nodejs";

/**
 * Bestellen en annuleren vanuit de app.
 *
 * Beide roepen dezelfde functies aan als de server-actions van de website
 * (`lib/theokot-orders.ts`), dus de ban, het bestelvenster, de X/Y-limieten en de
 * voorraadcheck-in-transactie gelden hier identiek. Wat deze route toevoegt is de
 * vertaling van een `TheokotOrderError` naar een code die de app kent; de
 * Nederlandse zin maakt de app zelf, want die kent de taal van de gebruiker.
 */


export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const input = appTheokotOrderSchema.parse(await readAppJson(request));

    const order = await placeOrder(session.user.id, input.sessionId, input.lines);
    // Deze route is enkel voor de app; ook een app zonder de kop telt dus mee.
    await recordAppAction(request, "theokot_order", { refId: order.orderId, userId: session.user.id, force: true });
    return appJson(request, order, 201);
  } catch (error) {
    return orderErrorResponse(request, error) ?? appErrorResponse(request, error);
  }
}

/**
 * Een reservatie aanpassen zolang het bestelvenster open is: dezelfde
 * `updateOrder` als op /theokot, met de eigen reservatie als vrije voorraad.
 */
export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const { orderId, lines } = appTheokotUpdateSchema.parse(await readAppJson(request));

    const order = await updateOrder(session.user.id, orderId, lines);
    return appJson(request, order);
  } catch (error) {
    return orderErrorResponse(request, error) ?? appErrorResponse(request, error);
  }
}

/**
 * Annuleren.
 *
 * `DELETE` op hetzelfde pad, met het order-id in de body en niet in het pad. Een
 * id in een URL komt in serverlogs en in proxylogs terecht; hier hoeft dat niet,
 * want er is toch al een body-parser. `cancelOrder` geeft trouwens hetzelfde
 * antwoord voor "bestaat niet" als voor "niet van jou", zodat deze route geen
 * manier is om te achterhalen welke order-id's bestaan.
 */
export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const { orderId } = appTheokotCancelSchema.parse(await readAppJson(request));

    await cancelOrder(session.user.id, orderId);
    return appJson(request, { ok: true });
  } catch (error) {
    return orderErrorResponse(request, error) ?? appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, PATCH, DELETE, OPTIONS");
}
