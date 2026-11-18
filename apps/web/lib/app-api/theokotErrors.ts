import "server-only";

import { TheokotValidationError } from "@/lib/theokot";
import { TheokotOrderError } from "@/lib/theokot-orders";
import { appError } from "./respond";

/**
 * Een weigering van het Theokot als code die de app kent
 * (`AppTheokotErrorCode`), of `null` wanneer het geen verwachte weigering is.
 * Gedeeld door bestellen, aanpassen, annuleren, vrijgeven en overnemen.
 */
export function orderErrorResponse(request: Request, error: unknown): Response | null {
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
