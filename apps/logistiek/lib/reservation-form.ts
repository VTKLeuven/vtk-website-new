import 'server-only';

import { prisma } from '@vtk/db';
import { parseDateOnly, todayDateOnly, type ReservationLineInput } from './uitleen';

/** Max lengte van een uitleenperiode; langere aanvragen verlopen via e-mail. */
export const MAX_RESERVATION_DAYS = 14;
export const MAX_NOTE_LENGTH = 1000;
const FIELD_MAX = 300;

export type ReservationFormInput = {
  requesterType: string;
  groupId?: string | null;
  requesterName?: string;
  eventName: string;
  eventLocation?: string;
  eventStart?: string; // datetime-local
  expectedAttendance?: string;
  contactName?: string;
  contactPhone?: string;
  delivery?: boolean;
  deliveryNote?: string;
  pickupDate: string;
  returnDate: string;
  note?: string;
  lines: ReservationLineInput[];
  flesserkeLines?: ReservationLineInput[];
};

export type ReservationLineCreate = {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  unitDepositCents: number;
};

export type FlesserkeLineCreate = { flesserkeItemId: string; itemName: string; quantity: number };

export type ReservationScalars = {
  requesterType: 'INTERN' | 'WERKGROEP' | 'EXTERN';
  groupId: string | null;
  requesterName: string | null;
  eventName: string;
  eventLocation: string | null;
  eventStart: Date | null;
  expectedAttendance: number | null;
  contactName: string | null;
  contactPhone: string | null;
  delivery: boolean;
  deliveryNote: string | null;
  pickupDate: Date;
  returnDate: Date;
  memberNote: string | null;
  totalPriceCents: number;
  totalDepositCents: number;
};

/**
 * "YYYY-MM-DDTHH:mm" uit een datetime-local-input, gelezen als Belgische
 * wall-clock tijd en omgezet naar een absoluut tijdstip.
 */
export function parseBrusselsDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const asUtc = new Date(`${value}:00.000Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(asUtc).map((part) => [part.type, part.value]));
  const brusselsAsUtc = new Date(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}:00.000Z`
  );
  const offsetMs = brusselsAsUtc.getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - offsetMs);
}

/**
 * Valideert het aanvraagformulier en normaliseert het naar de scalaire
 * reservatievelden + lijnen. Gedeeld door lid-aanmaken/bewerken en team-bewerken.
 * `allowedGroupIds` beperkt de INTERN-postkeuze; geef `null` om elke post toe te
 * laten (team-context).
 */
export async function buildReservationData(
  input: ReservationFormInput,
  allowedGroupIds: string[] | null
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      scalars: ReservationScalars;
      lineCreates: ReservationLineCreate[];
      flesserkeLineCreates: FlesserkeLineCreate[];
    }
> {
  const eventName = (input.eventName ?? '').trim();
  if (!eventName) return { ok: false, error: 'Geef je activiteit een naam.' };

  const requesterType = input.requesterType;
  if (requesterType !== 'INTERN' && requesterType !== 'WERKGROEP' && requesterType !== 'EXTERN') {
    return { ok: false, error: 'Kies namens wie je aanvraagt.' };
  }
  let groupId: string | null = null;
  let requesterName: string | null = null;
  if (requesterType === 'INTERN') {
    const chosen = (input.groupId ?? '').trim();
    if (!chosen) return { ok: false, error: 'Kies de post waarvoor je aanvraagt.' };
    if (allowedGroupIds !== null && !allowedGroupIds.includes(chosen)) {
      return { ok: false, error: 'Je kan enkel aanvragen voor een post waar je lid van bent.' };
    }
    groupId = chosen;
  } else {
    requesterName = (input.requesterName ?? '').trim();
    if (!requesterName) {
      return {
        ok: false,
        error:
          requesterType === 'WERKGROEP'
            ? 'Geef de naam van de werkgroep of jaarwerking.'
            : 'Geef de naam van de aanvrager.',
      };
    }
  }

  const pickupDate = parseDateOnly(input.pickupDate);
  const returnDate = parseDateOnly(input.returnDate);
  if (!pickupDate || !returnDate) return { ok: false, error: 'Kies een afhaal- en terugbrengdatum.' };
  if (pickupDate < todayDateOnly()) return { ok: false, error: 'De afhaaldatum ligt in het verleden.' };
  if (returnDate < pickupDate) {
    return { ok: false, error: 'De terugbrengdatum ligt voor de afhaaldatum.' };
  }
  const days = (returnDate.getTime() - pickupDate.getTime()) / (24 * 60 * 60 * 1000) + 1;
  if (days > MAX_RESERVATION_DAYS) {
    return {
      ok: false,
      error: `Een reservatie kan maximaal ${MAX_RESERVATION_DAYS} dagen duren; mail logistiek@vtk.be voor langere periodes.`,
    };
  }

  let expectedAttendance: number | null = null;
  if (input.expectedAttendance && input.expectedAttendance.trim() !== '') {
    const parsed = Number.parseInt(input.expectedAttendance, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, error: 'De verwachte opkomst moet een positief getal zijn.' };
    }
    expectedAttendance = parsed;
  }

  const eventStart = input.eventStart ? parseBrusselsDateTime(input.eventStart) : null;
  if (input.eventStart && !eventStart) {
    return { ok: false, error: 'Het startmoment van het evenement is ongeldig.' };
  }

  const lines = input.lines.filter((line) => Number.isInteger(line.quantity) && line.quantity > 0);
  const itemIds = lines.map((line) => line.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    return { ok: false, error: 'Elk item mag maar één keer in de aanvraag staan.' };
  }

  const items = itemIds.length
    ? await prisma.uitleenItem.findMany({ where: { id: { in: itemIds }, active: true } })
    : [];
  if (items.length !== itemIds.length) {
    return { ok: false, error: 'Een van de gekozen items bestaat niet meer; herlaad de catalogus.' };
  }
  const byId = new Map(items.map((item) => [item.id, item]));

  for (const line of lines) {
    const item = byId.get(line.itemId)!;
    if (line.quantity > item.quantity) {
      return { ok: false, error: `Van "${item.name}" zijn er maar ${item.quantity} beschikbaar.` };
    }
  }

  // Flesserke (verbruiksgoederen) enkel voor interne werking.
  const flesserkeInput = (input.flesserkeLines ?? []).filter(
    (line) => Number.isInteger(line.quantity) && line.quantity > 0
  );
  if (flesserkeInput.length > 0 && requesterType === 'EXTERN') {
    return { ok: false, error: 'Flesserke is enkel voor interne werking beschikbaar.' };
  }
  const flesserkeIds = flesserkeInput.map((l) => l.itemId);
  if (new Set(flesserkeIds).size !== flesserkeIds.length) {
    return { ok: false, error: 'Elk flesserke-item mag maar één keer in de aanvraag staan.' };
  }
  const flesserkeItems = flesserkeIds.length
    ? await prisma.uitleenFlesserkeItem.findMany({ where: { id: { in: flesserkeIds }, active: true } })
    : [];
  if (flesserkeItems.length !== flesserkeIds.length) {
    return { ok: false, error: 'Een van de flesserke-items bestaat niet meer; herlaad de lijst.' };
  }
  const flesserkeById = new Map(flesserkeItems.map((i) => [i.id, i]));
  for (const line of flesserkeInput) {
    const item = flesserkeById.get(line.itemId)!;
    if (line.quantity > item.quantity) {
      return { ok: false, error: `Van "${item.name}" zijn er maar ${item.quantity} in stock.` };
    }
  }

  if (lines.length === 0 && flesserkeInput.length === 0) {
    return { ok: false, error: 'Kies minstens één item.' };
  }

  let totalPriceCents = 0;
  let totalDepositCents = 0;
  const lineCreates: ReservationLineCreate[] = lines.map((line) => {
    const item = byId.get(line.itemId)!;
    totalPriceCents += item.priceCents * line.quantity;
    totalDepositCents += item.depositCents * line.quantity;
    return {
      itemId: item.id,
      itemName: item.name,
      quantity: line.quantity,
      unitPriceCents: item.priceCents,
      unitDepositCents: item.depositCents,
    };
  });

  const flesserkeLineCreates: FlesserkeLineCreate[] = flesserkeInput.map((line) => ({
    flesserkeItemId: line.itemId,
    itemName: flesserkeById.get(line.itemId)!.name,
    quantity: line.quantity,
  }));

  const trim = (v?: string) => (v && v.trim() ? v.trim().slice(0, FIELD_MAX) : null);

  return {
    ok: true,
    scalars: {
      requesterType,
      groupId,
      requesterName,
      eventName: eventName.slice(0, FIELD_MAX),
      eventLocation: trim(input.eventLocation),
      eventStart,
      expectedAttendance,
      contactName: trim(input.contactName),
      contactPhone: trim(input.contactPhone),
      delivery: Boolean(input.delivery),
      deliveryNote: Boolean(input.delivery) ? trim(input.deliveryNote) : null,
      pickupDate,
      returnDate,
      memberNote: input.note && input.note.trim() ? input.note.trim().slice(0, MAX_NOTE_LENGTH) : null,
      totalPriceCents,
      totalDepositCents,
    },
    lineCreates,
    flesserkeLineCreates,
  };
}
