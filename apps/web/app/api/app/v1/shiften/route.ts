import { prisma } from "@vtk/db";

import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import type { AppShift, AppShifts } from "@/lib/app-api/contract";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Binnen dit venster voor de start kan je jezelf niet meer uitschrijven, met een
 * bedenktijd na het inschrijven als uitzondering.
 *
 * **Deze twee getallen staan ook in `app/api/shift/register/route.ts`**, en dat
 * is bewust: die route bewaakt ze bindend, deze berekent er enkel `canUnregister`
 * mee zodat de app een knop kan uitzetten. Wijzigt er een, dan moeten ze allebei
 * mee; het ergste dat er anders gebeurt is dat de app een knop toont die de
 * server weigert, en dat is een melding en geen fout in de data.
 */
const UNREGISTER_LOCK_MS = 24 * 60 * 60 * 1000;
const UNREGISTER_GRACE_MS = 10 * 60 * 1000;

/**
 * De shiften: waar je voor ingeschreven staat, en waar je nog op kan.
 *
 * Eén aanvraag voor allebei. De site heeft daar twee endpoints voor (`/api/shift`
 * en `/api/shift/register`), maar dat zijn er twee omdat ze daar door twee
 * schermen gebruikt worden; hier is het één scherm.
 *
 * **In- en uitschrijven loopt niet langs deze boom** maar langs het bestaande
 * `/api/shift/register?id=`. Die route doet meer dan een rij wegschrijven: ze
 * bewaakt overlappende shiften, de 24-uursgrens, en ze duwt een
 * cursusdienst-shift door naar cudi. Dat tweede keer implementeren zou betekenen
 * dat een uitschrijving in de app op cudi kan blijven staan.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const now = new Date();

    const shifts = await prisma.shift.findMany({
      where: { endTime: { gte: now } },
      orderBy: { startTime: "asc" },
      include: {
        participants: { select: { userId: true, registeredAt: true } },
      },
    });

    const mine: AppShift[] = [];
    const available: AppShift[] = [];

    for (const shift of shifts) {
      const own = shift.participants.find((participant) => participant.userId === session.user.id);
      const taken = shift.participants.length;

      const startsWithinLock = shift.startTime.getTime() - now.getTime() < UNREGISTER_LOCK_MS;
      const withinGrace = own
        ? now.getTime() - own.registeredAt.getTime() < UNREGISTER_GRACE_MS
        : false;

      const dto: AppShift = {
        id: shift.id,
        name: shift.name,
        description: shift.description,
        instructions: shift.instructions?.trim() || null,
        location: shift.location,
        start: shift.startTime.toISOString(),
        end: shift.endTime.toISOString(),
        post: shift.post,
        reward: shift.reward,
        maxParticipants: shift.maxParticipants,
        takenSpots: taken,
        openToInternationals: shift.openToInternationals,
        registered: Boolean(own),
        canUnregister: Boolean(own) && (!startsWithinLock || withinGrace),
        canRegister: !own && taken < shift.maxParticipants && shift.startTime > now,
      };

      if (own) mine.push(dto);
      else available.push(dto);
    }

    const payload: AppShifts = { mine, available };
    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
