import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import type { AppVouchers } from "@/lib/app-api/contract";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";
import { createPassToken, PASS_TTL_SECONDS } from "@/lib/app-api/tokens";
import { voucherOverview } from "@/lib/app-api/vouchers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Jouw bonnetjes, en de pas waarmee je ze uitgeeft.
 *
 * De pas zit in dezelfde aanvraag als het saldo omdat ze samen op één scherm
 * staan: je haalt je telefoon boven aan de toog en er moet meteen een code op
 * staan. Twee rondjes voor één scherm voel je daar wel degelijk.
 *
 * Hij leeft twee minuten. De app haalt hem opnieuw op zodra hij verlopen is; dat
 * is met opzet kort, want een QR die uren geldig blijft, staat na één keer tonen
 * in de groepschat. Wat je verliest is de mogelijkheid om je pas offline te
 * tonen, en dat is aanvaardbaar: aan de toog staat altijd iemand met netwerk.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const now = new Date();

    const overview = await voucherOverview(session.user.id, now);
    const expiresAt = new Date(now.getTime() + PASS_TTL_SECONDS * 1000);

    const payload: AppVouchers = {
      balance: overview.balance,
      earnedThisYear: overview.earnedThisYear,
      history: overview.history,
      pass: createPassToken(session.user.id, expiresAt),
      passExpiresAt: expiresAt.toISOString(),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
