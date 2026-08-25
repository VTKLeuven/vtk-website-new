import { z } from "zod";

import { corsPreflight } from "@/lib/cors";
import { requirePermission } from "@/lib/session";
import type { AppVoucherRedeemResult } from "@/lib/app-api/contract";
import { appError, appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { verifyPassToken } from "@/lib/app-api/tokens";
import { redeemVouchers, VoucherError } from "@/lib/app-api/vouchers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bonnetjes afboeken voor een betaling aan een toog.
 *
 * De pas gaat mee en niet het `userId` uit de vorige stap. Dat is het verschil
 * tussen "ik heb net iemands QR gezien" en "ik heb een id ingetikt": zonder de
 * pas zou wie dit recht heeft, bij eender wie kunnen afboeken zonder dat die
 * persoon erbij staat. De pas leeft twee minuten, dus hij dwingt af dat het echt
 * om deze scan gaat.
 *
 * Het saldo en de volgorde (oudste shift eerst) staan in `lib/app-api/vouchers.ts`
 * en worden hier niet overgedaan.
 */

const schema = z.object({
  pass: z.string().min(10).max(512),
  amount: z.number().int().min(1).max(100),
  place: z.string().trim().max(80).optional(),
});

const MESSAGES: Record<string, string> = {
  PASS_INVALID: "Deze code hoort niet bij VTK.",
  PASS_EXPIRED: "Deze code is verlopen. Laat ze opnieuw tonen.",
  NOT_ENOUGH: "Er staan niet genoeg bonnetjes open.",
  CONFLICT: "Het saldo veranderde net. Scan opnieuw.",
  SELF: "Je kan niet bij jezelf afboeken.",
};

export async function POST(request: Request) {
  try {
    const session = await requirePermission("shift.rewardRedeem");
    const input = schema.parse(await readAppJson(request));

    const verified = verifyPassToken(input.pass);
    if (!verified.ok) {
      return appError(request, verified.reason, 400, { message: MESSAGES[verified.reason] });
    }

    const result = await redeemVouchers({
      userId: verified.userId,
      amount: input.amount,
      processedById: session.user.id,
      place: input.place ?? null,
    });

    return appJson(request, result satisfies AppVoucherRedeemResult);
  } catch (error) {
    if (error instanceof VoucherError) {
      // Een saldo dat te laag is, is geen serverfout maar het antwoord op de
      // vraag. 409 en niet 400: er is niets mis met de aanvraag, de toestand is
      // gewoon veranderd of ontoereikend.
      return appError(request, error.code, 409, { message: MESSAGES[error.code] });
    }
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
