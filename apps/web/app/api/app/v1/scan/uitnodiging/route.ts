import { prisma } from "@vtk/db";
import { z } from "zod";

import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { verifyScannerInviteToken } from "@/lib/ticketing/crypto";
import { grantScannerRole } from "@/lib/ticketing/scannerAccess";
import type { AppScannerInviteResult } from "@/lib/app-api/contract";
import { appError, appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Een uitnodigings-QR inwisselen voor scanrechten op één evenement.
 *
 * Dit is de app-kant van `/scan/uitnodiging`, de pagina waar diezelfde code op
 * uitkomt wanneer je hem met de gewone camera scant. Bewust hetzelfde token en
 * dezelfde schrijfweg (`grantScannerRole`): één soort code die overal werkt is
 * makkelijker uit te leggen aan wie hem aan de deur moet tonen, en er is maar één
 * plek waar een grant ontstaat.
 *
 * De code komt uit een QR die om de twintig seconden ververst; de app mag dus
 * ook de volledige URL doorsturen in plaats van enkel de parameter, want dat is
 * wat een camera leest.
 *
 * Wat je krijgt is de rol `SCANNER` op dit ene evenement en niets anders. Geen
 * bestellingen, geen deelnemerslijst, geen Tickets-tab.
 */

const schema = z.object({ code: z.string().min(10).max(2000) });

/** De code uit een volledige uitnodigings-URL, of de string zelf. */
function extractCode(raw: string): string {
  const value = raw.trim();
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    return new URL(value).searchParams.get("code")?.trim() || "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { code } = schema.parse(await readAppJson(request));

    const eventId = verifyScannerInviteToken(extractCode(code));
    if (!eventId) {
      return appError(request, "INVITE_EXPIRED", 400, {
        message: "Deze code is verlopen. Vraag ze opnieuw te tonen.",
      });
    }

    const event = await prisma.ticketEvent.findUnique({
      where: { id: eventId },
      select: { id: true, titleNl: true },
    });
    if (!event) {
      return appError(request, "NOT_FOUND", 404, { message: "Dit evenement bestaat niet meer." });
    }

    let alreadyHadAccess = false;
    try {
      await grantScannerRole(event.id, session.user.id, session.user.id, "INVITE");
    } catch (error) {
      // Wie al een zwaardere rol op dit event heeft, kon sowieso al scannen. Dat
      // is geen fout om een foutscherm voor te tonen; het antwoord is gewoon "je
      // kan verder".
      if (error instanceof Error && error.message === "GRANT_ROLE_CONFLICT") {
        alreadyHadAccess = true;
      } else {
        throw error;
      }
    }

    const payload: AppScannerInviteResult = {
      eventId: event.id,
      title: event.titleNl,
      alreadyHadAccess,
    };
    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
