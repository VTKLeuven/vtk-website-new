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
/**
 * Wat een broodje aan de afhaalbalie kost in medewerkersbonnetjes.
 *
 * Staat hier en niet in de action, omdat er intussen twee wegen naar toe leiden:
 * de balie op de site en de scanner in de app. Twee getallen die hetzelfde horen
 * te zijn, zijn er één te veel.
 */
export const SANDWICH_VOUCHER_COST = 2;

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

/** Wat er mis kan zijn met de uren van een verkoopdag. */
export type SessionWindowProblem = 'ORDER_WINDOW_EMPTY' | 'PICKUP_WINDOW_EMPTY';

/**
 * Kijkt of de uren van een verkoopdag elkaar niet uitsluiten.
 *
 * Een dag met een besteldeadline vóór het openingsuur staat gewoon online en is
 * door niemand te bestellen: `canOrderNow` blijft altijd false en er staat
 * nergens waarom. Dat is met een lead van 0 dagen zo gebeurd (openen om 12:00,
 * deadline om 10:30). Hetzelfde voor een afhaaluur dat eindigt voor het begint.
 *
 * Een ongeldige datum (een vervalste tijd uit een formulier) valt hier ook uit,
 * want een vergelijking met NaN is nooit waar.
 */
export function checkSessionWindows(windows: SessionWindows): SessionWindowProblem | null {
  if (!(windows.orderOpenAt < windows.orderCloseAt)) return 'ORDER_WINDOW_EMPTY';
  if (!(windows.pickupStart < windows.pickupEnd)) return 'PICKUP_WINDOW_EMPTY';
  return null;
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

/**
 * Welk broodje op een andere dag "hetzelfde" is als een broodje op de dag die je
 * als voorbeeld bewerkt.
 *
 * Elke verkoopdag heeft zijn eigen kopie van het aanbod (`TheokotSessionItem`),
 * dus een prijs voor de hele week aanpassen raakt vijf verschillende rijen. Ze
 * horen bij elkaar via het catalogusproduct waaruit ze gemaakt zijn, en anders
 * via hun naam (een broodje dat met de hand toegevoegd is, heeft geen product).
 * Hoofdletters en spaties aan de rand tellen niet mee.
 */
export function offeringKey(item: { productId: string | null; nameNl: string }): string {
  return item.productId ? `product:${item.productId}` : `name:${item.nameNl.trim().toLocaleLowerCase("nl")}`;
}

/**
 * Wat er op één dag moet gebeuren wanneer het aanbod van de week opgeslagen
 * wordt: welke rij een bestaand broodje van die dag bijwerkt, welke rij een
 * nieuw broodje wordt, en welke broodjes van die dag verdwijnen.
 *
 * `rows[i].sourceId` is het broodje op de voorbeelddag waaruit de rij komt, of
 * `null` voor een rij die in de editor toegevoegd is. Een broodje dat al
 * bestellingen heeft, verdwijnt nooit: dat zou de historiek van een echte
 * bestelling breken, net als bij het aanbod van één dag.
 */
export function planDayOffering(
  source: ReadonlyArray<{ id: string; productId: string | null; nameNl: string }>,
  target: ReadonlyArray<{ id: string; productId: string | null; nameNl: string; hasLines: boolean }>,
  rows: ReadonlyArray<{ sourceId: string | null }>,
): { update: Array<{ row: number; targetId: string }>; create: number[]; remove: string[] } {
  const sourceKey = new Map(source.map((item) => [item.id, offeringKey(item)]));
  const byKey = new Map<string, string>();
  for (const item of target) {
    const key = offeringKey(item);
    if (!byKey.has(key)) byKey.set(key, item.id);
  }
  const update: Array<{ row: number; targetId: string }> = [];
  const create: number[] = [];
  const kept = new Set<string>();
  rows.forEach((row, index) => {
    const key = row.sourceId ? sourceKey.get(row.sourceId) : undefined;
    const targetId = key ? byKey.get(key) : undefined;
    if (targetId && !kept.has(targetId)) {
      kept.add(targetId);
      update.push({ row: index, targetId });
    } else {
      create.push(index);
    }
  });
  const remove = target.filter((item) => !kept.has(item.id) && !item.hasLines).map((item) => item.id);
  return { update, create, remove };
}

/**
 * Een openstaande reservatie aan de huidige prijs van haar broodjes.
 *
 * De prijs van een reservatie volgt het aanbod van die dag zolang ze nog niet
 * opgehaald is: aan de balie betaal je wat er die dag op het bord staat, niet
 * wat er stond toen je klikte. Wie de prijs in "Aanbod bewerken" aanpast, ziet
 * die dus meteen terug in elke reservatie en op de afhaalpagina. Een opgehaalde
 * bestelling is betaald en blijft staan. Zie docs/design-decisions.md.
 *
 * Geeft `null` wanneer er niets verandert, anders de lijnen die een nieuwe prijs
 * krijgen en het nieuwe totaal.
 */
export function repriceOrder(order: {
  totalCents: number;
  lines: ReadonlyArray<{ id: string; quantity: number; unitPriceCents: number; currentPriceCents: number }>;
}): { lines: Array<{ id: string; unitPriceCents: number }>; totalCents: number } | null {
  const lines = order.lines
    .filter((line) => line.unitPriceCents !== line.currentPriceCents)
    .map((line) => ({ id: line.id, unitPriceCents: line.currentPriceCents }));
  const totalCents = order.lines.reduce((sum, line) => sum + line.quantity * line.currentPriceCents, 0);
  if (lines.length === 0 && totalCents === order.totalCents) return null;
  return { lines, totalCents };
}

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

  // Eerst optellen per broodje, dan pas toetsen.
  //
  // Twee lijnen voor hetzelfde sessie-item zijn samen één bestelling van dat
  // broodje. Wie ze los laat staan, legt elke helft apart naast de voorraad en
  // laat zo meer door dan er is: vijf lijnen van één stuk kwamen door de check
  // van een broodje waar er één van was, en enkel `maxItemsPerOrder` hield het
  // nog tegen. De bestelpagina telt zelf al per item op, maar de app-API en elke
  // rechtstreekse aanroep sturen wat ze willen.
  const wanted = new Map<string, number>();
  for (const line of input) {
    if (!Number.isInteger(line.quantity) || line.quantity < 0) {
      errors.push(`aantal voor item ${line.sessionItemId} moet een geheel getal ≥ 0 zijn`);
      continue;
    }
    if (line.quantity === 0) continue;
    wanted.set(line.sessionItemId, (wanted.get(line.sessionItemId) ?? 0) + line.quantity);
  }

  const lines: NormalizedOrder['lines'] = [];
  let totalItems = 0;
  let totalWeeklySpecial = 0;
  let totalCents = 0;

  for (const [sessionItemId, quantity] of wanted) {
    const item = byId.get(sessionItemId);
    if (!item) {
      errors.push(`item ${sessionItemId} hoort niet bij deze sessie`);
      continue;
    }
    if (quantity > item.quantity) {
      errors.push(`aantal voor dit broodje overschrijdt de voorraad (${item.quantity})`);
      continue;
    }
    lines.push({ sessionItemId: item.id, quantity, unitPriceCents: item.priceCents });
    totalItems += quantity;
    if (item.isWeeklySpecial) totalWeeklySpecial += quantity;
    totalCents += quantity * item.priceCents;
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
