import "server-only";

import { prisma } from "@vtk/db";

import type { AppUsageReport } from "./contract";

/**
 * Hoe de VTK-app gebruikt wordt: het rapport dat de app stuurt
 * (`POST /api/app/v1/gebruik`) en de acties die de site zelf als "uit de app"
 * herkent. Admin › Website › App leest het (`lib/app-usage-stats.ts`); de
 * keuzes erachter staan in docs/app-gebruik.md.
 *
 * Alles hier is statistiek. Een fout mag dus nooit een bestelling of een
 * inschrijving doen mislukken: `recordAppAction` vangt alles op en logt enkel.
 */

/** De koppen die de app sinds november 2026 bij elke aanvraag meestuurt (`src/api/client.ts`). */
export const APP_CLIENT_HEADER = "x-vtk-client";
export const APP_INSTALL_HEADER = "x-vtk-install";

/** Wat de site als een handeling in de app telt. Een ticket staat in `TicketOrder.source`. */
export type AppActionKind =
  | "theokot_order"
  | "cudi_order"
  | "shift_register"
  | "piano_reservation"
  | "push_open"
  | (string & {});

/** Komt deze aanvraag van de app? Enkel de kop telt; een app van voor die kop telt niet mee. */
export function isAppRequest(request: Request): boolean {
  return (request.headers.get(APP_CLIENT_HEADER) ?? "").toLowerCase().startsWith("app");
}

const INSTALL_ID = /^[A-Za-z0-9-]{8,64}$/;

/** De installatie die deze aanvraag stuurde, uit `X-VTK-Install`. */
export function installIdOf(request: Request): string | null {
  const value = request.headers.get(APP_INSTALL_HEADER)?.trim() ?? "";
  return INSTALL_ID.test(value) ? value : null;
}

/**
 * Legt vast dat iets in de app gebeurde. Doet niets voor een aanvraag die niet
 * van de app komt, zodat een route die zowel de site als de app bedient (de
 * shiftinschrijving) dit gewoon altijd kan aanroepen.
 */
export async function recordAppAction(
  request: Request,
  kind: AppActionKind,
  input: { refId?: string | null; userId?: string | null; force?: boolean } = {},
): Promise<void> {
  if (!input.force && !isAppRequest(request)) return;
  try {
    await prisma.appAction.create({
      data: {
        kind,
        refId: input.refId ?? null,
        installId: installIdOf(request),
        userId: input.userId ?? null,
      },
    });
  } catch (error) {
    console.error("[app-gebruik] actie niet bewaard", kind, error);
  }
}

/** Een datum als dag in Brussel, "yyyy-mm-dd". */
function brusselsDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * Een sessie die volgens de app al begon, maar die wij nog niet kenden (het
 * eerste rapport ging verloren), begint hoogstens zo lang geleden. Zo kan een
 * verkeerd klokje op een telefoon geen sessie van een week maken.
 */
const MAX_SESSION_BACKDATE_MS = 12 * 60 * 60 * 1000;

/**
 * Verwerkt één rapport van de app: de installatie bijwerken, de sessie
 * aanmaken of verlengen, de schermen van vandaag optellen en de losse
 * gebeurtenissen bewaren. Alles in één transactie, zodat een rapport dat half
 * mislukt niet half meetelt.
 */
export async function recordUsageReport(report: AppUsageReport, userId: string | null, now = new Date()): Promise<void> {
  const startedAt = new Date(report.sessionStartedAt);
  const sessionStart =
    Number.isNaN(startedAt.getTime()) || startedAt > now || now.getTime() - startedAt.getTime() > MAX_SESSION_BACKDATE_MS
      ? now
      : startedAt;
  const screenViews = report.screens.reduce((sum, screen) => sum + screen.views, 0);
  const day = brusselsDay(now);

  const device = {
    platform: report.platform,
    osVersion: report.osVersion,
    deviceModel: report.deviceModel,
    appVersion: report.appVersion,
    runtimeVersion: report.runtimeVersion,
    updateId: report.updateId,
    channel: report.channel,
    expoGo: report.expoGo,
    locale: report.locale,
    pushEnabled: report.pushEnabled,
  };

  await prisma.$transaction(async (tx) => {
    await tx.appInstall.upsert({
      where: { id: report.installId },
      create: { id: report.installId, ...device, userId, firstSeenAt: now, lastSeenAt: now },
      // Uitgelogd laat de laatste gebruiker staan: zie het model.
      update: { ...device, lastSeenAt: now, ...(userId ? { userId } : {}) },
    });

    const existing = await tx.appSession.findUnique({ where: { id: report.sessionId }, select: { installId: true } });
    if (existing && existing.installId !== report.installId) return; // een id die niet van deze installatie is
    if (existing) {
      await tx.appSession.update({
        where: { id: report.sessionId },
        data: {
          lastSeenAt: now,
          activeSeconds: { increment: report.activeSeconds },
          screenViews: { increment: screenViews },
          appVersion: report.appVersion,
          ...(userId ? { userId } : {}),
        },
      });
    } else {
      await tx.appSession.create({
        data: {
          id: report.sessionId,
          installId: report.installId,
          userId,
          startedAt: sessionStart,
          lastSeenAt: now,
          activeSeconds: report.activeSeconds,
          screenViews,
          appVersion: report.appVersion,
        },
      });
    }

    // Per scherm één rij per dag; een tweede rapport telt erbij op.
    for (const screen of report.screens) {
      await tx.$executeRaw`
        INSERT INTO "AppScreenDay" ("day", "installId", "screen", "tab", "views")
        VALUES (${day}::date, ${report.installId}, ${screen.screen}, ${screen.tab ?? ""}, ${screen.views})
        ON CONFLICT ("day", "installId", "screen", "tab")
        DO UPDATE SET "views" = "AppScreenDay"."views" + EXCLUDED."views"
      `;
    }

    if (report.events.length > 0) {
      await tx.appAction.createMany({
        data: report.events.map((event) => {
          const at = new Date(event.at);
          return {
            kind: event.kind,
            installId: report.installId,
            userId,
            createdAt: Number.isNaN(at.getTime()) || at > now ? now : at,
          };
        }),
      });
    }
  });
}
