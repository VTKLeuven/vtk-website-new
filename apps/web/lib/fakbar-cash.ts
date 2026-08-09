/**
 * Kastelling van een toogshift: welke munten en biljetten er geteld worden en
 * hoe de omzet van een shift daaruit volgt.
 *
 * Alles in eurocent (Int), zoals overal in deze codebase. Een telling is een map
 * van denominatie -> aantal stuks; de denominatielijst staat hier en niet in de
 * databank, zodat een muntstuk erbij of eraf geen migratie kost.
 */

export type Denomination = {
  /** Waarde van één stuk, in eurocent. Ook de sleutel in een telling. */
  cents: number;
  kind: "COIN" | "BILL";
};

/** Munten van 1 cent tot € 2. */
export const COIN_DENOMINATIONS: Denomination[] = [
  { cents: 1, kind: "COIN" },
  { cents: 2, kind: "COIN" },
  { cents: 5, kind: "COIN" },
  { cents: 10, kind: "COIN" },
  { cents: 20, kind: "COIN" },
  { cents: 50, kind: "COIN" },
  { cents: 100, kind: "COIN" },
  { cents: 200, kind: "COIN" },
];

/** Biljetten van € 5 tot € 200. Het biljet van € 500 staat er bewust niet bij:
 *  dat wordt aan de toog niet aanvaard. */
export const BILL_DENOMINATIONS: Denomination[] = [
  { cents: 500, kind: "BILL" },
  { cents: 1000, kind: "BILL" },
  { cents: 2000, kind: "BILL" },
  { cents: 5000, kind: "BILL" },
  { cents: 10000, kind: "BILL" },
  { cents: 20000, kind: "BILL" },
];

export const DENOMINATIONS: Denomination[] = [...COIN_DENOMINATIONS, ...BILL_DENOMINATIONS];

const KNOWN_CENTS = new Set(DENOMINATIONS.map((d) => d.cents));

export function isKnownDenomination(cents: number): boolean {
  return KNOWN_CENTS.has(cents);
}

/** Denominatie (in cent) -> aantal stuks. Ontbrekende sleutels tellen als 0. */
export type CashCount = Record<number, number>;

/** Wat een telling waard is, in eurocent. Onbekende denominaties tellen niet
 *  mee: die horen niet in een telling en zouden het totaal stil vervalsen. */
export function cashCountTotalCents(count: CashCount): number {
  let total = 0;
  for (const denomination of DENOMINATIONS) {
    const quantity = count[denomination.cents] ?? 0;
    if (Number.isFinite(quantity) && quantity > 0) {
      total += denomination.cents * Math.floor(quantity);
    }
  }
  return total;
}

/** Lege telling: elke denominatie op 0, zodat een formulier alle velden toont. */
export function emptyCashCount(): CashCount {
  return Object.fromEntries(DENOMINATIONS.map((d) => [d.cents, 0]));
}

/** Rijen uit de databank -> telling. */
export function toCashCount(rows: Array<{ denominationCents: number; quantity: number }>): CashCount {
  const count = emptyCashCount();
  for (const row of rows) {
    if (isKnownDenomination(row.denominationCents)) count[row.denominationCents] = row.quantity;
  }
  return count;
}

export type ShiftTotalsInput = {
  /** Kassatelling bij het openen. */
  startCents: number;
  /** Kassatelling bij het afsluiten. Null zolang de shift openstaat. */
  endCents: number | null;
  /** Wat er naar de kluis ging. */
  vaultCents: number;
  /** Wat er aan bonnen binnenkwam (aantal x waarde). */
  couponCents: number;
  /** Kaartomzet. */
  sumUpCents: number;
};

export type ShiftTotals = {
  startCents: number;
  endCents: number | null;
  vaultCents: number;
  couponCents: number;
  sumUpCents: number;
  /** Cash die er tijdens de shift bij kwam. */
  cashRevenueCents: number | null;
  /** Cash + bonnen + kaart. */
  totalRevenueCents: number | null;
};

/**
 * De omzet van een shift.
 *
 * De cash-omzet is `eindtelling + kluis - starttelling`: wat er in de kassa
 * bijkwam, plus wat er onderweg uitgehaald en weggebracht werd. Zonder die
 * kluis-term zou elke afroming als verlies tellen.
 *
 * Er is geen "verwacht" bedrag om tegen af te toetsen: de toog registreert
 * (nog) geen verkopen per drank, dus dit is een telling, geen kascontrole.
 */
export function shiftTotals(input: ShiftTotalsInput): ShiftTotals {
  const cashRevenueCents =
    input.endCents === null ? null : input.endCents + input.vaultCents - input.startCents;

  return {
    startCents: input.startCents,
    endCents: input.endCents,
    vaultCents: input.vaultCents,
    couponCents: input.couponCents,
    sumUpCents: input.sumUpCents,
    cashRevenueCents,
    totalRevenueCents:
      cashRevenueCents === null
        ? null
        : cashRevenueCents + input.couponCents + input.sumUpCents,
  };
}
