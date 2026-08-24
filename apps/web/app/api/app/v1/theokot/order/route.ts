import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { TheokotValidationError } from "@/lib/theokot";
import { cancelOrder, placeOrder, TheokotOrderError } from "@/lib/theokot-orders";
import { appTheokotCancelSchema, appTheokotOrderSchema } from "@/lib/app-api/schemas";
import { appError, appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";

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

function orderErrorResponse(request: Request, error: unknown): Response | null {
  if (error instanceof TheokotOrderError) {
    return appError(request, error.code, error.code === "BANNED" ? 403 : 409, {
      message: error.bannedUntil ? `Geschorst tot ${error.bannedUntil.toISOString()}` : undefined,
    });
  }
  if (error instanceof TheokotValidationError) {
    // De details zijn de zinnen uit `validateOrderLines`. Ze komen mee zodat de
    // app kan zeggen wát er scheelt in plaats van enkel dat er iets scheelt.
    return appError(request, "INVALID_ORDER", 422, { fields: { lines: error.details } });
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const input = appTheokotOrderSchema.parse(await readAppJson(request));

    const order = await placeOrder(session.user.id, input.sessionId, input.lines);
    return appJson(request, order, 201);
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
  return corsPreflight(request, "POST, DELETE, OPTIONS");
}
