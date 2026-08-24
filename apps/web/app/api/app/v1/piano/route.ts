import { pick } from "@vtk/i18n";
import { prisma } from "@vtk/db";

import { corsPreflight } from "@/lib/cors";
import { isPianoSlotBookable, pianoHorizonEnd, pianoWeekRange } from "@/lib/piano";
import { getPianoConfig, getPianoInfo, loadPianoAgenda } from "@/lib/piano-server";
import { requireSession } from "@/lib/session";
import { appLocaleFrom, type AppPiano } from "@/lib/app-api/contract";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De pianoagenda: welke slots er zijn, welke vrij zijn, en hoeveel je er deze
 * week al hebt.
 *
 * Vraagt een login. De namen van wie een slot heeft, staan in het antwoord, net
 * als op de site: dat is er met opzet, zodat je weet met wie je kan ruilen. Een
 * anonieme agenda zou dat onmogelijk maken, en daarom is de pagina ook op de site
 * niet publiek.
 *
 * `bookable` is het oordeel van de server over of dit slot nu geboekt kan worden;
 * de app schakelt daar een knop mee uit en beslist niets zelf.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));
    const now = new Date();

    const [config, info] = await Promise.all([getPianoConfig(), getPianoInfo()]);

    // Tot waar er geboekt kan worden; verder tonen heeft geen zin, want dan staat
    // er een agenda vol slots waarvan er geen enkele op groen kan.
    const horizon = pianoHorizonEnd(now, config);
    const { days, takenBy } = await loadPianoAgenda({
      from: now,
      to: new Date(
        Date.UTC(horizon.year, horizon.month - 1, horizon.day, 23, 59, 59),
      ),
      slotMinutes: config.slotMinutes,
    });

    const week = pianoWeekRange(now);

    // De eigen reservaties apart opvragen om hun **id** te kennen.
    // `loadPianoAgenda` geeft per slot enkel wie het heeft, want dat is alles wat
    // de website nodig heeft; de app moet een slot ook weer kunnen loslaten, en
    // daar hoort een id bij.
    const [usedThisWeek, own] = await Promise.all([
      prisma.pianoReservation.count({
        where: {
          userId: session.user.id,
          startsAt: { gte: week.from, lt: week.to },
          endsAt: { gt: now },
        },
      }),
      prisma.pianoReservation.findMany({
        where: { userId: session.user.id, startsAt: { gt: now } },
        select: { id: true, startsAt: true },
      }),
    ]);

    const ownById = new Map(own.map((row) => [row.startsAt.getTime(), row.id]));

    const payload: AppPiano = {
      info: pick(info.bodyNl, info.bodyEn, locale),
      maxPerWeek: config.maxPerWeek,
      usedThisWeek,
      slotMinutes: config.slotMinutes,
      days: days.map((day) => ({
        date: day.date,
        slots: day.slots.map((slot) => {
          const taken = takenBy.get(slot.startsAt.getTime());
          const mine = taken?.userId === session.user.id;
          return {
            startsAt: slot.startsAt.toISOString(),
            endsAt: slot.endsAt.toISOString(),
            state: mine ? ("MINE" as const) : taken ? ("TAKEN" as const) : ("FREE" as const),
            takenByName: taken?.name ?? null,
            reservationId: mine ? (ownById.get(slot.startsAt.getTime()) ?? null) : null,
            bookable:
              !taken &&
              slot.startsAt > now &&
              isPianoSlotBookable(slot.startsAt, now, config),
          };
        }),
      })),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
