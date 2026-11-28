import { prisma } from "@vtk/db";

import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appLocaleFrom, type AppShift, type AppShifts } from "@/lib/app-api/contract";
import { localizeShift } from "@/lib/shift/localize";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";
import { earnedShiftReward } from "@/lib/shift/rewards";
import { praesidiumYears } from "@/lib/shift/voucherEligibility";
import { canBeReplaceable, canReplace, visibleParticipants } from "@/lib/shift/replace";
import { ROSTER_PARTICIPANT_SELECT, toRoster } from "@/lib/shift/roster";
import { shiftRides } from "@/lib/shift/driver";

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
    // Zoals de andere routes van de app: `?locale=en` geeft de Engelse naam en
    // uitleg van een shift waar die ingevuld zijn.
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));

    const [shifts, praesidium] = await Promise.all([
      prisma.shift.findMany({
        where: { endTime: { gte: now }, manualGrantId: null },
        orderBy: { startTime: "asc" },
        include: {
          participants: { select: { ...ROSTER_PARTICIPANT_SELECT, replaceable: true } },
        },
      }),
      praesidiumYears([session.user.id]),
    ]);

    // Wie er rijdt op een bijrijdshift, enkel voor de shiften waarop je zelf
    // staat: het nummer is voor wie meerijdt (zie /shift en lib/shift/driver.ts).
    const rides = await shiftRides(
      shifts
        .filter((shift) => shift.participants.some((participant) => participant.userId === session.user.id))
        .map((shift) => shift.transportBookingId),
    );

    const mine: AppShift[] = [];
    const available: AppShift[] = [];

    for (const raw of shifts) {
      const shift = localizeShift(raw, locale);
      const own = shift.participants.find((participant) => participant.userId === session.user.id);
      // Zoals op /shift: wie een vervangbaar praesidiumlid kan vervangen, ziet
      // die plaats als vrij, en de inschrijving neemt ze dan over
      // (`lib/shift/replace.ts`). Wie zelf ingeschreven is, telt altijd mee.
      const visible = own
        ? shift.participants
        : visibleParticipants(shift.participants, canReplace(session.user.id, shift, praesidium));
      const taken = visible.length;

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
        // Wat de shift jou oplevert: nul in een praesidiumjaar.
        reward: earnedShiftReward({ userId: session.user.id, ...shift }, praesidium),
        maxParticipants: shift.maxParticipants,
        takenSpots: taken,
        openToInternationals: shift.openToInternationals,
        registered: Boolean(own),
        canUnregister: Boolean(own) && (!startsWithinLock || withinGrace),
        canRegister: !own && taken < shift.maxParticipants && shift.startTime > now,
        replaceableOption: canBeReplaceable(session.user.id, shift, praesidium),
        replaceable: own?.replaceable ?? false,
        // Dezelfde namen als op /shift: wie meetelt in `takenSpots`, en enkel de naam.
        roster: toRoster(visible, session.user.id),
        ride: own && shift.transportBookingId ? (rides.get(shift.transportBookingId) ?? null) : null,
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
