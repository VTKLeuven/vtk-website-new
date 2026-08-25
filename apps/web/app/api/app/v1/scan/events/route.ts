import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";

import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { listScannableTicketEvents } from "@/lib/ticketing/authorization";
import { appLocaleFrom, type AppScanEvent } from "@/lib/app-api/contract";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De evenementen waarvoor jij nu tickets mag scannen.
 *
 * Dezelfde lijst als het keuzescherm van de webscanner (`/scan`), en dus
 * dezelfde regels: van twaalf uur na afloop tot een maand vooruit, en de
 * standaardregel plus je grants bepalen wat je ziet. Dat staat in
 * `listScannableTicketEvents` en wordt hier niet overgedaan; de app zou anders
 * soepeler of strenger kunnen worden dan de site.
 *
 * Een lege lijst is een geldig antwoord en geen fout: wie geen rechten heeft,
 * ziet een scherm dat uitlegt dat een organisator hem een uitnodigings-QR kan
 * tonen.
 */
export async function GET(request: Request) {
  try {
    await requireSession();
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));
    const events = await listScannableTicketEvents();
    if (events.length === 0) return appJson(request, [] satisfies AppScanEvent[]);

    // De stand per event in twee queries in plaats van twee per event: aan een
    // deur met vier scanners is dit scherm het eerste wat iedereen opent.
    const ids = events.map((event) => event.id);
    const [totals, checkedIn] = await Promise.all([
      prisma.ticket.groupBy({
        by: ["eventId"],
        where: { eventId: { in: ids }, status: "VALID" },
        _count: { _all: true },
      }),
      prisma.ticket.groupBy({
        by: ["eventId"],
        where: { eventId: { in: ids }, status: "VALID", checkedInAt: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const totalBy = new Map(totals.map((row) => [row.eventId, row._count._all]));
    const scannedBy = new Map(checkedIn.map((row) => [row.eventId, row._count._all]));

    const payload: AppScanEvent[] = events.map((event) => ({
      id: event.id,
      title: pick(event.titleNl, event.titleEn ?? event.titleNl, locale),
      startsAt: event.startsAt.toISOString(),
      location: event.location,
      total: totalBy.get(event.id) ?? 0,
      checkedIn: scannedBy.get(event.id) ?? 0,
    }));

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
