import { pick } from "@vtk/i18n";

import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { canCancel, canOrderNow } from "@/lib/theokot";
import { loadOrderableSessions, remainingFor } from "@/lib/theokot-orders";
import { appLocaleFrom, type AppTheokot, type AppTheokotWindow } from "@/lib/app-api/contract";
import { absoluteMediaUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Het bestelscherm van het Theokot: de open verkoopdagen, hun aanbod en jouw
 * bestelling per dag.
 *
 * Leest via dezelfde `loadOrderableSessions` als `/theokot` op de website, zodat
 * de voorraad, het bestelvenster en een eventuele ban niet op twee plaatsen
 * berekend worden.
 *
 * Vraagt een login, en dat is geen keuze van de app: een bestelling hangt aan een
 * persoon, en de pagina op de site doet hetzelfde.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));
    const now = new Date();

    const { config, ban, sessions, used, message } = await loadOrderableSessions(
      session.user.id,
      now,
    );

    const payload: AppTheokot = {
      maxItemsPerOrder: config.maxItemsPerOrder,
      maxWeeklySpecialPerOrder: config.maxWeeklySpecialPerOrder,
      message: (pick(message?.bodyNl ?? "", message?.bodyEn ?? "", locale) ?? "").trim(),
      ban: ban ? { until: ban.endsAt.toISOString() } : null,
      sessions: sessions.map((sess) => {
        const existing = sess.orders[0];
        // "Broodje van de week" is het aanbod-item dat zo gemarkeerd staat; de
        // naam ervan is wat het die week concreet is.
        const special = sess.items.find((item) => item.isWeeklySpecial);
        const window: AppTheokotWindow =
          now < sess.orderOpenAt ? "UPCOMING" : now >= sess.orderCloseAt ? "CLOSED" : "OPEN";

        return {
          id: sess.id,
          date: sess.date.toISOString(),
          pickupStart: sess.pickupStart.toISOString(),
          pickupEnd: sess.pickupEnd.toISOString(),
          orderOpenAt: sess.orderOpenAt.toISOString(),
          orderCloseAt: sess.orderCloseAt.toISOString(),
          window,
          canOrder: canOrderNow(sess, now),
          weeklySpecialName: special
            ? (pick(special.nameNl, special.nameEn, locale) ?? special.nameNl)
            : null,
          items: sess.items.map((item) => ({
            id: item.id,
            name: pick(item.nameNl, item.nameEn, locale) ?? item.nameNl,
            priceCents: item.priceCents,
            remaining: remainingFor(item, used),
            isWeeklySpecial: item.isWeeklySpecial,
            imageUrl: absoluteMediaUrl(request, item.imageKey),
            // Beide talen leeg = geen ingrediënten, en dan toont de app er ook
            // geen regel voor.
            ingredients: pick(item.ingredientsNl, item.ingredientsEn, locale)?.trim() || null,
          })),
          order: existing
            ? {
                orderId: existing.id,
                status: existing.status,
                totalCents: existing.totalCents,
                canCancel: existing.status === "RESERVED" && canCancel(sess, now),
                lines: existing.lines.map((line) => ({
                  name:
                    pick(line.sessionItem.nameNl, line.sessionItem.nameEn, locale) ??
                    line.sessionItem.nameNl,
                  quantity: line.quantity,
                  unitPriceCents: line.unitPriceCents,
                })),
              }
            : null,
        };
      }),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
