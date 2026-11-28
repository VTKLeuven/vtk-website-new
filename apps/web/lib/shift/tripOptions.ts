/**
 * De ritten waaruit je in /admin/shiften een bijrijdshift aan haar rit hangt.
 *
 * Puur en zonder server-imports: het shiftvenster (client) leest dit type, de
 * route `GET /api/shift/trips` en de beheerpagina bouwen het op.
 */
export type ShiftTripOption = {
  id: string;
  /** "Vrijdag 28 november", in Belgische tijd. */
  day: string;
  /** "18:00" en "20:00", in Belgische tijd. */
  start: string;
  end: string;
  /** Waarvoor de rit dient, zoals Logistiek hem noemt. */
  purpose: string;
  /** De post waarvoor de rit rijdt, of de naam van een werkgroep of externe. */
  requester: string | null;
  vehicle: string;
  /** Wie er nu op staat; null zolang Logistiek niemand koos. */
  driver: string | null;
  /** Een aanvraag die nog beslist moet worden, rijdt misschien niet. */
  requested: boolean;
};

const dayFormat = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const timeFormat = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

/** Een rit zoals Prisma hem levert, omgezet naar wat het venster toont. */
export function toShiftTripOption(trip: {
  id: string;
  startAt: Date;
  endAt: Date;
  purpose: string;
  status: string;
  requesterName: string | null;
  group: { nameNl: string } | null;
  vehicle: { nameNl: string };
  driver: { name: string } | null;
}): ShiftTripOption {
  const day = dayFormat.format(trip.startAt);
  return {
    id: trip.id,
    day: day.charAt(0).toUpperCase() + day.slice(1),
    start: timeFormat.format(trip.startAt),
    end: timeFormat.format(trip.endAt),
    purpose: trip.purpose,
    requester: trip.group?.nameNl ?? trip.requesterName,
    vehicle: trip.vehicle.nameNl,
    driver: trip.driver?.name ?? null,
    requested: trip.status === 'REQUESTED',
  };
}

/** Wat de query nodig heeft voor `toShiftTripOption`. */
export const SHIFT_TRIP_SELECT = {
  id: true,
  startAt: true,
  endAt: true,
  purpose: true,
  status: true,
  requesterName: true,
  group: { select: { nameNl: true } },
  vehicle: { select: { nameNl: true } },
  driver: { select: { name: true } },
} as const;
