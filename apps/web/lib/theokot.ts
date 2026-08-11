/**
 * Zuivere domeinlogica voor het Theokot-reservatiesysteem: configuratie,
 * bestelvensters en order-validatie.
 *
 * Dit bestand bevat GEEN server-only imports (geen prisma/mail), zodat het —
 * net als `lib/shift.ts` — zowel in server- als clientcomponenten bruikbaar is.
 * De DB- en mail-afhankelijke logica (config lezen, no-shows verwerken, bans)
 * staat in `lib/theokot-server.ts`; de Brussel-tijdhelpers in `lib/brussels.ts`.
 *
 * Zie docs/design-decisions.md voor het waarom achter de vensters en limieten.
 */

import { brusselsWallClock, brusselsYMD, shiftYMD } from './brussels';

// De tijdhelpers zaten hier oorspronkelijk; ze staan nu in lib/brussels.ts omdat
// ook de pianoreservaties ze nodig hebben. Blijven doorexporteren, zodat de
// bestaande imports uit `@/lib/theokot` blijven werken.
export { brusselsTimeOnDay, brusselsYMD } from './brussels';

// -----------------------------------------------------------------------------
// Configuratie
// -----------------------------------------------------------------------------

/**
 * Hoe de broodjes op de bestelpagina getoond worden. Een raster geeft de foto's
 * ruimte; een lijst blijft compacter wanneer er (nog) geen foto's zijn. De keuze
 * hoort daarom bij de beheerder en niet bij de code.
 */
export type TheokotItemLayout = 'list' | 'grid';

export type TheokotConfig = {
  /** X: maximaal aantal items per bestelling. */
  maxItemsPerOrder: number;
  /** Y: maximaal aantal "broodje van de week" per bestelling (X > Y). */
  maxWeeklySpecialPerOrder: number;
  /** Aantal dagen vooraf dat een sessie besteld kan worden (bvb 2). */
  orderLeadDays: number;
  /** Tijdstip (Brussel) waarop bestellen opent, "HH:mm". */
  orderOpenTime: string;
  /** Annulatie-/besteldeadline op de verkoopdag zelf, "HH:mm" (Brussel). */
  cancelDeadline: string;
  /** Standaard afhaal-startuur op de verkoopdag, "HH:mm". */
  pickupDefaultStart: string;
  /** Standaard afhaal-einduur op de verkoopdag, "HH:mm". */
  pickupDefaultEnd: string;
  /** Minuten na sluitingstijd voordat een bestelling als no-show telt. */
  noShowGraceMinutes: number;
  /** Aantal no-shows waarna een gebruiker geband wordt. */
  noShowThreshold: number;
  /** Duur van een ban in dagen. */
  banDurationDays: number;
  /** Weergave van het aanbod op de bestelpagina. */
  itemLayout: TheokotItemLayout;
};

export const DEFAULT_THEOKOT_CONFIG: TheokotConfig = {
  maxItemsPerOrder: 5,
  maxWeeklySpecialPerOrder: 1,
  orderLeadDays: 2,
  orderOpenTime: '12:00',
  cancelDeadline: '10:30',
  pickupDefaultStart: '12:00',
  pickupDefaultEnd: '16:00',
  noShowGraceMinutes: 15,
  noShowThreshold: 3,
  banDurationDays: 14,
  itemLayout: 'list',
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function coerceInt(value: unknown, fallback: number, min = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= min ? n : fallback;
}

function coerceTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && HHMM.test(value) ? value : fallback;
}

/** Leest de weergavekeuze; alles wat geen geldige waarde is valt terug op de default. */
export function coerceItemLayout(value: unknown, fallback: TheokotItemLayout = 'list'): TheokotItemLayout {
  return value === 'grid' || value === 'list' ? value : fallback;
}

/** Leest een (mogelijk gedeeltelijke of ongeldige) Setting-waarde uit en vult aan met defaults. */
export function parseTheokotConfig(value: unknown): TheokotConfig {
  const src = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_THEOKOT_CONFIG;
  return {
    maxItemsPerOrder: coerceInt(src.maxItemsPerOrder, d.maxItemsPerOrder, 1),
    maxWeeklySpecialPerOrder: coerceInt(src.maxWeeklySpecialPerOrder, d.maxWeeklySpecialPerOrder, 0),
    orderLeadDays: coerceInt(src.orderLeadDays, d.orderLeadDays, 0),
    orderOpenTime: coerceTime(src.orderOpenTime, d.orderOpenTime),
    cancelDeadline: coerceTime(src.cancelDeadline, d.cancelDeadline),
    pickupDefaultStart: coerceTime(src.pickupDefaultStart, d.pickupDefaultStart),
    pickupDefaultEnd: coerceTime(src.pickupDefaultEnd, d.pickupDefaultEnd),
    noShowGraceMinutes: coerceInt(src.noShowGraceMinutes, d.noShowGraceMinutes, 0),
    noShowThreshold: coerceInt(src.noShowThreshold, d.noShowThreshold, 1),
    banDurationDays: coerceInt(src.banDurationDays, d.banDurationDays, 1),
    itemLayout: coerceItemLayout(src.itemLayout, d.itemLayout),
  };
}

// -----------------------------------------------------------------------------
// Geld
// -----------------------------------------------------------------------------

/** Eurocent → "€2,60" (Belgische notatie met komma). */
export function formatEuro(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace('.', ',')}`;
}

// -----------------------------------------------------------------------------
// Sessie-vensters
// -----------------------------------------------------------------------------

export type SessionWindows = {
  orderOpenAt: Date;
  orderCloseAt: Date;
  pickupStart: Date;
  pickupEnd: Date;
};

/** Berekent de standaard order-/afhaalvensters voor een verkoopdag uit de config. */
export function defaultWindowsFor(day: Date, config: TheokotConfig): SessionWindows {
  const sellDay = brusselsYMD(day);
  const openDay = shiftYMD(sellDay, -config.orderLeadDays);
  return {
    orderOpenAt: brusselsWallClock(openDay.year, openDay.month, openDay.day, config.orderOpenTime),
    orderCloseAt: brusselsWallClock(sellDay.year, sellDay.month, sellDay.day, config.cancelDeadline),
    pickupStart: brusselsWallClock(sellDay.year, sellDay.month, sellDay.day, config.pickupDefaultStart),
    pickupEnd: brusselsWallClock(sellDay.year, sellDay.month, sellDay.day, config.pickupDefaultEnd),
  };
}

/** Minimale sessie-vorm voor de venster-checks. */
export type OrderableSession = {
  isOpen: boolean;
  orderOpenAt: Date;
  orderCloseAt: Date;
};

/** True wanneer studenten op dit moment een bestelling kunnen plaatsen. */
export function canOrderNow(session: OrderableSession, now: Date = new Date()): boolean {
  return session.isOpen && now >= session.orderOpenAt && now < session.orderCloseAt;
}

/** True wanneer een bestelling nog geannuleerd/gewijzigd mag worden (< deadline). */
export function canCancel(session: Pick<OrderableSession, 'orderCloseAt'>, now: Date = new Date()): boolean {
  return now < session.orderCloseAt;
}

// -----------------------------------------------------------------------------
// Order-validatie
// -----------------------------------------------------------------------------

export type OrderLineInput = { sessionItemId: string; quantity: number };

/** Sessie-item zoals de validatie het nodig heeft (voorraad = `quantity`). */
export type ValidatableItem = {
  id: string;
  priceCents: number;
  quantity: number;
  isWeeklySpecial: boolean;
};

export class TheokotValidationError extends Error {
  details: string[];
  constructor(details: string[]) {
    super(`Ongeldige bestelling: ${details.join('; ')}`);
    this.name = 'TheokotValidationError';
    this.details = details;
  }
}

export type NormalizedOrder = {
  lines: Array<{ sessionItemId: string; quantity: number; unitPriceCents: number }>;
  totalItems: number;
  totalWeeklySpecial: number;
  totalCents: number;
};

/**
 * Valideert bestellijnen tegen het sessie-aanbod en de config. Controleert de
 * X/Y-limieten en de per-sessie voorraad-bovengrens (`item.quantity`). De écht
 * beschikbare voorraad (rekening houdend met andere reservaties) wordt in de
 * server-action binnen een transactie gecontroleerd.
 *
 * Verzamelt álle problemen in één keer (zoals `parseShift` in lib/shift.ts).
 */
export function validateOrderLines(
  input: OrderLineInput[],
  items: ValidatableItem[],
  config: TheokotConfig,
): NormalizedOrder {
  const errors: string[] = [];
  const byId = new Map(items.map((i) => [i.id, i]));

  const lines: NormalizedOrder['lines'] = [];
  let totalItems = 0;
  let totalWeeklySpecial = 0;
  let totalCents = 0;

  for (const line of input) {
    if (!Number.isInteger(line.quantity) || line.quantity < 0) {
      errors.push(`aantal voor item ${line.sessionItemId} moet een geheel getal ≥ 0 zijn`);
      continue;
    }
    if (line.quantity === 0) continue;
    const item = byId.get(line.sessionItemId);
    if (!item) {
      errors.push(`item ${line.sessionItemId} hoort niet bij deze sessie`);
      continue;
    }
    if (line.quantity > item.quantity) {
      errors.push(`aantal voor dit broodje overschrijdt de voorraad (${item.quantity})`);
      continue;
    }
    lines.push({ sessionItemId: item.id, quantity: line.quantity, unitPriceCents: item.priceCents });
    totalItems += line.quantity;
    if (item.isWeeklySpecial) totalWeeklySpecial += line.quantity;
    totalCents += line.quantity * item.priceCents;
  }

  if (lines.length === 0) {
    errors.push('een bestelling moet minstens één broodje bevatten');
  }
  if (totalItems > config.maxItemsPerOrder) {
    errors.push(`maximaal ${config.maxItemsPerOrder} broodjes per bestelling`);
  }
  if (totalWeeklySpecial > config.maxWeeklySpecialPerOrder) {
    errors.push(`maximaal ${config.maxWeeklySpecialPerOrder} broodje(s) van de week per bestelling`);
  }

  if (errors.length > 0) throw new TheokotValidationError(errors);

  return { lines, totalItems, totalWeeklySpecial, totalCents };
}
