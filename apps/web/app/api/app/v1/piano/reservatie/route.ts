import { z } from "zod";

import { corsPreflight } from "@/lib/cors";
import {
  cancelPianoReservation,
  PianoReservationError,
  reservePianoSlot,
} from "@/lib/piano-reservations";
import { requireSession } from "@/lib/session";
import { appError, appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";

const reserveSchema = z.object({ startsAt: z.string().min(1).max(40) });
const cancelSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * Een pianoslot reserveren of loslaten.
 *
 * Dezelfde functies als de server-actions van de website
 * (`lib/piano-reservations.ts`), dus de weeklimiet, het boekbare venster en de
 * controle dat de starttijd uit een echt slot komt, gelden hier identiek. Die
 * laatste is de belangrijkste: zonder haar zou een zelfgemaakte aanvraag om het
 * even welk uur kunnen boeken.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { startsAt } = reserveSchema.parse(await readAppJson(request));

    const slot = await reservePianoSlot(session.user.id, new Date(startsAt));
    return appJson(
      request,
      { startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() },
      201,
    );
  } catch (error) {
    if (error instanceof PianoReservationError) {
      // 409 voor "iemand was je voor" en "je zit aan je limiet", 404 voor een
      // slot dat niet bestaat: de app kan daar anders op reageren.
      const status = error.code === "NOT_FOUND" ? 404 : 409;
      return appError(request, error.code, status);
    }
    return appErrorResponse(request, error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const { id } = cancelSchema.parse(await readAppJson(request));

    await cancelPianoReservation(session.user.id, id);
    return appJson(request, { ok: true });
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, DELETE, OPTIONS");
}
