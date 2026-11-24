import "server-only";

import { prisma } from "@vtk/db";
import { hasPermission, type SessionPayload } from "@vtk/auth";
import { pick } from "@vtk/i18n";
import { brusselsWallClockMinutes, brusselsYMD, isoWeekday, parseYMD, shiftYMD, ymdKey, type YMD } from "@/lib/brussels";
import type { AppLocale, AppTransportTrip, AppTransportWeek } from "./contract";
import { driverColors, driverInitials, vehiclePattern, type DriverChoice } from "./transportColors";

/**
 * De transportplanning van Logistiek in de app.
 *
 * **Wie ze ziet** is dezelfde regel als `canSeeTripDetails` in
 * apps/logistiek/lib/session.ts: het team (`logistiek.manage`), wie de
 * bijrijders regelt (`logistiek.helpers`), en wie in een praesidiumpost, een
 * werkgroep of een jaarwerking zit. Een student zonder groep ziet op
 * logistiek.vtk.be enkel wanneer een voertuig bezet is, en in de app niets: dat
 * was de vraag.
 *
 * **Wat ze toont** is de projectie van `transportWeekForPraesidium` daar: welke
 * post de rit aanvroeg, waarvoor, wat er mee moet, waarheen, wie rijdt en wie
 * meerijdt. Telefoonnummers, het ophaaladres en de nota's blijven weg, ook voor
 * het team: wie die nodig heeft, opent logistiek.vtk.be. Een eigen `select` en
 * geen filter achteraf, om dezelfde reden als daar: een projectie achteraf laat
 * vroeg of laat een veld door.
 *
 * apps/web kan de code van apps/logistiek niet importeren (twee Next-apps met
 * elk hun `@/`), dus de query staat hier opnieuw. Houd de twee gelijk.
 */
export function canSeeTransport(session: SessionPayload): boolean {
  return (
    hasPermission(session, "logistiek.manage") ||
    hasPermission(session, "logistiek.helpers") ||
    session.groups.some(
      (group) => group.type === "PRAESIDIUM" || group.type === "WERKGROEP" || group.type === "JAARWERKING",
    )
  );
}

/** Zoals `PLANNING_STATUSES` in logistiek: een afgewezen of geannuleerde rit gaat niet door. */
const PLANNING_STATUSES = ["REQUESTED", "APPROVED", "COMPLETED"] as const;

export function logistiekUrl(): string {
  const configured = process.env.LOGISTIEK_PUBLIC_URL?.trim();
  return (configured || "https://logistiek.vtk.be").replace(/\/+$/, "");
}

/** Maandag van de week waarin `week` (YYYY-MM-DD) valt, of van deze week. */
export function weekStartFor(week: string | null, now = new Date()): string {
  const day = (week && parseYMD(week)) || brusselsYMD(now);
  return ymdKey(shiftYMD(day, 1 - isoWeekday(day)));
}

export async function transportWeek(
  session: SessionPayload,
  weekStart: string,
  locale: AppLocale,
): Promise<AppTransportWeek> {
  const monday = parseYMD(weekStart);
  if (!monday) throw new Error("INVALID_WEEK");
  const from = brusselsWallClockMinutes(monday, 0);
  const to = brusselsWallClockMinutes(shiftYMD(monday, 7), 0);

  const [vehicles, bookings, choices] = await Promise.all([
    prisma.uitleenVehicle.findMany({
      where: { active: true },
      orderBy: { sortIndex: "asc" },
      select: { id: true, nameNl: true, nameEn: true, needsDriver: true, pattern: true },
    }),
    prisma.uitleenTransportBooking.findMany({
      where: { status: { in: [...PLANNING_STATUSES] }, startAt: { lt: to }, endAt: { gt: from } },
      select: {
        id: true,
        vehicleId: true,
        tripLeg: true,
        startAt: true,
        endAt: true,
        status: true,
        purpose: true,
        cargoNote: true,
        eventName: true,
        destination: true,
        requesterType: true,
        requesterName: true,
        userId: true,
        groupId: true,
        assignedGroupId: true,
        driverId: true,
        driver: { select: { name: true } },
        user: { select: { name: true } },
        group: { select: { nameNl: true, nameEn: true } },
        helpers: { orderBy: { createdAt: "asc" }, select: { name: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    // De kleur die het team voor een chauffeur koos (`driverColorOverrides` in logistiek).
    prisma.uitleenDriver.findMany({
      where: { OR: [{ colorIndex: { not: null } }, { customColor: { not: null } }] },
      select: { userId: true, colorIndex: true, customColor: true },
    }),
  ]);
  const choiceOf = new Map<string, DriverChoice>(
    choices.map((row) => [row.userId, { colorIndex: row.colorIndex, customColor: row.customColor }]),
  );

  const ownGroups = new Set(session.groups.map((group) => group.id));
  const trips: AppTransportTrip[] = bookings.map((booking) => {
    const event = booking.eventName?.trim() || null;
    const purpose = booking.purpose?.trim() || null;
    const post = booking.group ? pick(booking.group.nameNl, booking.group.nameEn, locale) : null;
    return {
      id: booking.id,
      vehicleId: booking.vehicleId,
      start: booking.startAt.toISOString(),
      end: booking.endAt.toISOString(),
      status: booking.status as AppTransportTrip["status"],
      leg: booking.tripLeg ?? null,
      title: event ?? purpose ?? (locale === "en" ? "Trip" : "Rit"),
      purpose: event ? purpose : null,
      cargo: booking.cargoNote?.trim() || null,
      destination: booking.destination?.trim() || null,
      requester: booking.requesterType === "INTERN" || booking.requesterType === "WERKGROEP"
        ? (post ?? booking.requesterName ?? null)
        : (booking.requesterName ?? post ?? null),
      submittedBy: booking.user?.name ?? null,
      driver: booking.driver?.name ?? null,
      driverInitials: booking.driver ? driverInitials(booking.driver.name) : null,
      ...driverColors(booking.driverId, booking.driverId ? choiceOf.get(booking.driverId) : undefined),
      helpers: booking.helpers.map((helper) => helper.name),
      mine:
        booking.userId === session.user.id ||
        (booking.groupId !== null && ownGroups.has(booking.groupId)) ||
        (booking.assignedGroupId !== null && ownGroups.has(booking.assignedGroupId)),
    };
  });

  return {
    weekStart,
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      name: pick(vehicle.nameNl, vehicle.nameEn, locale) ?? vehicle.nameNl,
      needsDriver: vehicle.needsDriver,
      pattern: vehiclePattern(vehicle.pattern),
    })),
    weekNumber: isoWeekNumber(monday),
    trips,
    logistiekUrl: `${logistiekUrl()}/vervoer/bezetting?week=${weekStart}`,
  };
}

/** ISO-weeknummer van een maandag: de donderdag van die week bepaalt het jaar. */
function isoWeekNumber(monday: YMD): number {
  const thursday = shiftYMD(monday, 3);
  const date = Date.UTC(thursday.year, thursday.month - 1, thursday.day);
  const yearStart = Date.UTC(thursday.year, 0, 1);
  return Math.floor((date - yearStart) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

