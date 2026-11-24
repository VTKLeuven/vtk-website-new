import { corsPreflight } from "@/lib/cors";
import { getCurrentSession } from "@/lib/session";
import type { AppUsageResult } from "@/lib/app-api/contract";
import { appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { appUsageReportSchema } from "@/lib/app-api/schemas";
import { recordUsageReport } from "@/lib/app-api/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Een gebruiksrapport van de app (`AppUsageReport`): welke installatie, hoe lang
 * op de voorgrond, welke schermen. Ook zonder login; dan telt het rapport voor
 * de installatie en niet voor een lid. Zie `lib/app-api/usage.ts`.
 */
export async function POST(request: Request) {
  try {
    const [session, body] = await Promise.all([getCurrentSession(), readAppJson(request)]);
    const report = appUsageReportSchema.parse(body);
    await recordUsageReport(report, session?.user.id ?? null);
    return appJson<AppUsageResult>(request, { ok: true });
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
