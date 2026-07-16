/**
 * Zuivere domeinlogica voor het Theokot-reservatiesysteem: configuratie,
 * Brussel-tijd, bestelvensters en order-validatie.
 *
 * Dit bestand bevat GEEN server-only imports (geen prisma/mail), zodat het —
 * net als `lib/shift.ts` — zowel in server- als clientcomponenten bruikbaar is.
 * De DB- en mail-afhankelijke logica (config lezen, no-shows verwerken, bans)
 * staat in `lib/theokot-server.ts`.
 *
 * Zie docs/design-decisions.md voor het waarom achter de vensters en limieten.
 */

// -----------------------------------------------------------------------------
// Configuratie
// -----------------------------------------------------------------------------

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
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function coerceInt(value: unknown, fallback: number, min = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= min ? n : fallback;
}

function coerceTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && HHMM.test(value) ? value : fallback;
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
// Brussel-tijd (correct in zomer- én winteruur)
// -----------------------------------------------------------------------------

const BRUSSELS_TZ = 'Europe/Brussels';

/**
 * Offset (minuten toe te voegen aan UTC om Brussel-lokaaltijd te krijgen) op het
 * gegeven instant. Afgeleid via Intl zodat DST automatisch klopt.
 */
function brusselsOffsetMinutes(instant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: BRUSSELS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get('hour');
  if (hour === 24) hour = 0; // sommige runtimes geven 24 voor middernacht
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** De Brussel-kalenderdatum (jaar/maand/dag) van een instant. */
export function brusselsYMD(date: Date): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRUSSELS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = dtf.format(date).split('-').map(Number);
  return { year, month, day };
}

/** Instant voor een wandkloktijd (jaar/maand/dag + "HH:mm") in Europe/Brussels. */
function brusselsWallClock(year: number, month: number, day: number, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  // Eerste gok: behandel de wandklok alsof ze UTC is, corrigeer daarna met de
  // offset op dat (ongeveer) instant. Voldoende nauwkeurig buiten DST-overgangen.
  const guess = Date.UTC(year, month - 1, day, h, m);
  const offset = brusselsOffsetMinutes(new Date(guess));
  return new Date(guess - offset * 60000);
}

/** Instant voor "HH:mm" Brussel-tijd op de Brussel-kalenderdag van `day`. */
export function brusselsTimeOnDay(day: Date, hhmm: string): Date {
  const { year, month, day: d } = brusselsYMD(day);
  return brusselsWallClock(year, month, d, hhmm);
}

/** `n` dagen bij een kalenderdatum optellen/aftrekken (blijft correct rond DST). */
function shiftYMD(ymd: { year: number; month: number; day: number }, deltaDays: number) {
  // Middag-UTC gebruiken zodat het optellen van dagen nooit over een DST-grens
  // naar een verkeerde kalenderdag springt.
  const base = Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12) + deltaDays * 86400000;
  const dt = new Date(base);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
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
