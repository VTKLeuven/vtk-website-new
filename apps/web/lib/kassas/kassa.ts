/**
 * Zuivere kassa-logica: coupures, statussen, het resultaat en de instellingen.
 * Geen prisma, geen mail; dit bestand mag in een clientbundel belanden, want
 * het tel- en aanvraagformulier rekenen er live mee.
 *
 * De server-only kant (toegang, instellingen lezen, ticketinkomsten) staat in
 * `server.ts`, de mail in `mail.ts`.
 */

// -----------------------------------------------------------------------------
// Coupures
// -----------------------------------------------------------------------------

/**
 * Elke munt en elk briefje dat in een kassa kan zitten, in centen. Dezelfde elf
 * rijen als in het rekenblad van Beheer, van 5 cent tot 100 euro.
 */
export const DENOMINATIONS = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000] as const;

export type Denomination = (typeof DENOMINATIONS)[number];

/** Stuks per coupure; sleutel = de waarde in centen als tekst ("50"). */
export type Counts = Partial<Record<`${Denomination}`, number>>;

/** Meer stuks van één coupure dan dit is een tikfout, geen kassa. */
export const MAX_PIECES = 100_000;

/**
 * Een opgeslagen telling (JSON uit de database) naar een propere `Counts`:
 * enkel bekende coupures, enkel gehele aantallen vanaf 1. Wat er niet in past,
 * valt weg in plaats van het totaal stil te vervalsen.
 */
export function normaliseCounts(raw: unknown): Counts {
  const counts: Counts = {};
  if (!raw || typeof raw !== "object") return counts;
  const value = raw as Record<string, unknown>;
  for (const denomination of DENOMINATIONS) {
    const pieces = value[String(denomination)];
    if (typeof pieces === "number" && Number.isInteger(pieces) && pieces > 0 && pieces <= MAX_PIECES) {
      counts[`${denomination}`] = pieces;
    }
  }
  return counts;
}

export function piecesOf(counts: Counts, denomination: Denomination): number {
  return counts[`${denomination}`] ?? 0;
}

export function countsTotalCents(counts: Counts): number {
  return DENOMINATIONS.reduce((sum, denomination) => sum + denomination * piecesOf(counts, denomination), 0);
}

/** "5 cent", "50 cent", "€ 1", "€ 100": zo staat het op een kassablad. */
export function denominationLabel(cents: Denomination): string {
  return cents < 100 ? `${cents} cent` : `€ ${cents / 100}`;
}

/** De coupures met minstens één stuk, voor een mail of een samenvatting. */
export function countsLines(counts: Counts): Array<{ denomination: Denomination; pieces: number }> {
  return DENOMINATIONS.filter((denomination) => piecesOf(counts, denomination) > 0).map(
    (denomination) => ({ denomination, pieces: piecesOf(counts, denomination) }),
  );
}

// -----------------------------------------------------------------------------
// Statussen
// -----------------------------------------------------------------------------

/**
 * In de volgorde van de workflow. `REQUESTED` is de aanvraag; de rest is de
 * statuskolom van het rekenblad, en die zet Beheer met de hand.
 */
export const CASH_REGISTER_STATUSES = [
  "REQUESTED",
  "TO_MAKE",
  "MADE",
  "HANDED_OUT",
  "RETURNED",
  "COUNTED",
  "PASSED_ON",
  "BOOKED",
] as const;

export type CashRegisterStatus = (typeof CASH_REGISTER_STATUSES)[number];

/** Wat je met de statuskeuze kan zetten: alles behalve de aanvraag zelf. */
export const SETTABLE_STATUSES = CASH_REGISTER_STATUSES.filter(
  (status): status is Exclude<CashRegisterStatus, "REQUESTED"> => status !== "REQUESTED",
);

const STATUS_LABELS: Record<CashRegisterStatus, { nl: string; en: string }> = {
  REQUESTED: { nl: "Aangevraagd", en: "Requested" },
  TO_MAKE: { nl: "Te maken", en: "To make" },
  MADE: { nl: "Gemaakt", en: "Made" },
  HANDED_OUT: { nl: "Meegegeven", en: "Handed out" },
  RETURNED: { nl: "Teruggebracht", en: "Returned" },
  COUNTED: { nl: "Geteld", en: "Counted" },
  PASSED_ON: { nl: "Doorgegeven", en: "Passed on" },
  BOOKED: { nl: "Kasboek", en: "Cash book" },
};

export function statusLabel(status: CashRegisterStatus, nl: boolean): string {
  return nl ? STATUS_LABELS[status].nl : STATUS_LABELS[status].en;
}

/** `?status=` in de URL. Nederlands, want zo leest de link in een chat. */
export const STATUS_SLUGS: Record<CashRegisterStatus, string> = {
  REQUESTED: "aangevraagd",
  TO_MAKE: "te-maken",
  MADE: "gemaakt",
  HANDED_OUT: "meegegeven",
  RETURNED: "teruggebracht",
  COUNTED: "geteld",
  PASSED_ON: "doorgegeven",
  BOOKED: "kasboek",
};

export function statusFromSlug(slug: string | undefined): CashRegisterStatus | null {
  const match = CASH_REGISTER_STATUSES.find((status) => STATUS_SLUGS[status] === slug);
  return match ?? null;
}

export function isCashRegisterStatus(value: unknown): value is CashRegisterStatus {
  return typeof value === "string" && (CASH_REGISTER_STATUSES as readonly string[]).includes(value);
}

// -----------------------------------------------------------------------------
// Posten met een vaste kassa
// -----------------------------------------------------------------------------

/**
 * Cudi, Theokot en Fakbar hebben een kassa die het hele semester meegaat, en
 * Beheer bekijkt ze samen (in het rekenblad was dat een eigen tabblad,
 * "CUDITHEOFAK"). Op de code van de post, net als `EXPENSE_POST_SPLITS`.
 */
export const PERMANENT_POST_CODES = ["CURSUSDIENST", "THEOKOT", "FAKBAR"] as const;

/** `?post=` voor die drie samen. */
export const PERMANENT_POST_FILTER = "cudi-theo-fak";

// -----------------------------------------------------------------------------
// Bedragen en aantallen uit een formulier
// -----------------------------------------------------------------------------

/**
 * Een ingetikt bedrag naar centen, nul inbegrepen: een Bancontact-bakje dat niets
 * deed, staat op € 0,00 en dat is iets anders dan "nog niet afgelezen".
 *
 * `null` = leeg veld. `undefined` = geen bedrag (tikfout); de action maakt daar
 * een invoerfout van in plaats van stil 0 op te slaan.
 */
export function parseAmountInput(raw: string): number | null | undefined {
  const trimmed = raw.trim().replace(/^€\s*/, "");
  if (!trimmed) return null;
  const normalised = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return undefined;
  const cents = Math.round(Number(normalised) * 100);
  if (!Number.isFinite(cents) || cents > 100_000_000) return undefined;
  return cents;
}

/** Een aantal stuks of bonnen. `null` = leeg, `undefined` = geen geheel getal. */
export function parseCountInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value <= MAX_PIECES ? value : undefined;
}

/** Centen naar wat er in een bedragveld hoort: "12,50", leeg bij `null`. */
export function amountInputValue(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

// -----------------------------------------------------------------------------
// Resultaat
// -----------------------------------------------------------------------------

export type PaymentMethod = "BANCONTACT" | "PAYCONIQ";

export type ResultInput = {
  startCounts: Counts;
  /** `null` = nog niet geteld. */
  endCounts: Counts | null;
  shiftVouchers: number | null;
  elixirVouchers: number | null;
  shiftVoucherValueCents: number;
  elixirVoucherValueCents: number;
  payments: Array<{ method: PaymentMethod; amountCents: number | null }>;
  /** Netto online verkoop per gekoppelde ticketverkoop. */
  ticketIncomeCents: number[];
};

export type CashRegisterResult = {
  startCents: number;
  endCents: number | null;
  /** Eindkassa min beginkassa; `null` zolang er niet geteld is. */
  cashCents: number | null;
  bancontactCents: number;
  payconiqCents: number;
  ticketCents: number;
  voucherCents: number;
  /** Alles samen: wat de activiteit opbracht. */
  totalCents: number;
};

/**
 * Het resultaat zoals het rekenblad het rekende ("Finaal Resultaat"): wat er
 * cash bij kwam, plus Bancontact, Payconiq, de online ticketverkoop en de
 * waarde van de ontvangen bonnen. Wat nog niet geteld is, telt als nul; het
 * scherm toont zelf dat het nog niet geteld is.
 */
export function computeResult(input: ResultInput): CashRegisterResult {
  const startCents = countsTotalCents(input.startCounts);
  const endCents = input.endCounts ? countsTotalCents(input.endCounts) : null;
  const cashCents = endCents === null ? null : endCents - startCents;
  const sum = (method: PaymentMethod) =>
    input.payments
      .filter((payment) => payment.method === method)
      .reduce((total, payment) => total + (payment.amountCents ?? 0), 0);
  const bancontactCents = sum("BANCONTACT");
  const payconiqCents = sum("PAYCONIQ");
  const ticketCents = input.ticketIncomeCents.reduce((total, cents) => total + cents, 0);
  const voucherCents =
    (input.shiftVouchers ?? 0) * input.shiftVoucherValueCents +
    (input.elixirVouchers ?? 0) * input.elixirVoucherValueCents;
  return {
    startCents,
    endCents,
    cashCents,
    bancontactCents,
    payconiqCents,
    ticketCents,
    voucherCents,
    totalCents: (cashCents ?? 0) + bancontactCents + payconiqCents + ticketCents + voucherCents,
  };
}

// -----------------------------------------------------------------------------
// Instellingen (Setting `cashRegisters.config`)
// -----------------------------------------------------------------------------

export type CashRegisterConfig = {
  /**
   * De Bancontact-bakjes van de kring. "n.v.t." uit het rekenblad is geen
   * bakje: een kassa zonder Bancontact heeft gewoon geen regel.
   */
  bancontactTerminals: string[];
  /** De Payconiq-rekeningen, idem. */
  payconiqAccounts: string[];
  /** Wat één ontvangen bon waard is in het resultaat. 0 = telt niet mee. */
  shiftVoucherValueCents: number;
  elixirVoucherValueCents: number;
  /** Waar de aanvrager een ophaalmoment afspreekt; staat in de mail en is het reply-to. */
  contactEmail: string;
};

export const DEFAULT_CASH_REGISTER_CONFIG: CashRegisterConfig = {
  bancontactTerminals: ["Evenementen", "Cudi", "Theo", "Fak"],
  payconiqAccounts: ["Theo", "Evenementen 1", "Evenementen 2", "Evenementen 3", "Evenementen 4", "Fak"],
  // Het tabblad CUDITHEOFAK rekende elke bon aan € 1,20 (`=1.2*(I+J)`).
  shiftVoucherValueCents: 120,
  elixirVoucherValueCents: 120,
  contactEmail: "beheer@vtk.be",
};

/** Hoeveel bakjes of rekeningen er hoogstens zijn, en hoe lang een naam mag zijn. */
export const MAX_TERMINALS = 30;
export const MAX_TERMINAL_NAME = 40;

/** Namen opkuisen: spaties eraf, lege weg, dubbels (los van hoofdletters) weg. */
export function cleanTerminalNames(names: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const name = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TERMINAL_NAME);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    result.push(name);
    if (result.length >= MAX_TERMINALS) break;
  }
  return result;
}

function voucherValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100_000
    ? value
    : fallback;
}

export function parseCashRegisterConfig(raw: unknown): CashRegisterConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_CASH_REGISTER_CONFIG;
  const value = raw as Record<string, unknown>;
  const defaults = DEFAULT_CASH_REGISTER_CONFIG;
  return {
    // Een lijst die bewust leeg gemaakt werd, blijft leeg; enkel een ontbrekende
    // of kapotte valt terug op de standaard.
    bancontactTerminals: Array.isArray(value.bancontactTerminals)
      ? cleanTerminalNames(value.bancontactTerminals)
      : defaults.bancontactTerminals,
    payconiqAccounts: Array.isArray(value.payconiqAccounts)
      ? cleanTerminalNames(value.payconiqAccounts)
      : defaults.payconiqAccounts,
    shiftVoucherValueCents: voucherValue(value.shiftVoucherValueCents, defaults.shiftVoucherValueCents),
    elixirVoucherValueCents: voucherValue(value.elixirVoucherValueCents, defaults.elixirVoucherValueCents),
    contactEmail:
      typeof value.contactEmail === "string" && value.contactEmail.trim()
        ? value.contactEmail.trim()
        : defaults.contactEmail,
  };
}
