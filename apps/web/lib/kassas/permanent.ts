/**
 * Zuivere logica van de vaste kassa's: de kassa die Cursusdienst, Theokot en
 * Fakbar het hele semester houden (`PERMANENT_POST_CODES`). Geen prisma; het
 * telformulier rekent er live mee.
 *
 * Een vaste kassa komt niet terug na een activiteit. Beheer geeft geld mee
 * (de startkassa, extra munten), de post geeft tussendoor geld af, en de post
 * telt op gezette tijden. De winst van een periode volgt daaruit zoals Beheer
 * ze rekende: wat binnenkwam bij Beheer (de afgiftes en de slottelling) min wat
 * eruit ging (de openingstelling en wat meegegeven werd). Die winst rekent
 * enkel met cash: de bonnen tellen voor het resultaat van de post, niet voor
 * Beheer (november 2026, zie docs/design-decisions.md).
 */

export const PERMANENT_ENTRY_KINDS = ["HANDED_OUT", "RETURNED", "COUNT"] as const;

export type PermanentEntryKind = (typeof PERMANENT_ENTRY_KINDS)[number];

export function isPermanentEntryKind(value: unknown): value is PermanentEntryKind {
  return typeof value === "string" && (PERMANENT_ENTRY_KINDS as readonly string[]).includes(value);
}

/**
 * Gaat het cash van deze regel per munt en briefje? Ja, behalve bij meegeven of
 * teruggeven van voor november 2026: zo'n regel heeft enkel een bedrag (`counts`
 * NULL, `cash` ingevuld) en houdt haar bedragveld, want welke munten het waren
 * is niet meer te kennen en een leeg raster zou het bedrag op nul zetten.
 */
export function entersCashPerPiece(kind: PermanentEntryKind, counts: object | null, cash: string): boolean {
  return kind === "COUNT" || counts !== null || cash === "";
}

/**
 * De soorten bonnen in een vaste kassa. Elke soort heeft in
 * `PermanentCashEntry` een kolom `<key>Vouchers` (het aantal) en
 * `<key>VoucherValueCents` (de waarde van één bon, vastgeklikt bij het
 * ingeven), en een waarde in de instellingen (`CashRegisterConfig`).
 */
export const PERMANENT_VOUCHERS = [
  { key: "shift", labelNl: "Shiftersbonnen", labelEn: "Shift vouchers", nl: ["shiftersbon", "shiftersbonnen"], en: ["shift voucher", "shift vouchers"] },
  { key: "elixir", labelNl: "Elixirbonnen", labelEn: "Elixir vouchers", nl: ["elixirbon", "elixirbonnen"], en: ["elixir voucher", "elixir vouchers"] },
  { key: "guido", labelNl: "Guidobonnen", labelEn: "Guido vouchers", nl: ["Guidobon", "Guidobonnen"], en: ["Guido voucher", "Guido vouchers"] },
  {
    key: "sandwich",
    labelNl: "Bonnen gratis broodje",
    labelEn: "Free sandwich vouchers",
    nl: ["bon voor een gratis broodje", "bonnen voor een gratis broodje"],
    en: ["free sandwich voucher", "free sandwich vouchers"],
  },
] as const;

export type PermanentVoucherKey = (typeof PERMANENT_VOUCHERS)[number]["key"];
export type VoucherCounts = { [K in PermanentVoucherKey as `${K}Vouchers`]: number };
export type VoucherValues = { [K in PermanentVoucherKey as `${K}VoucherValueCents`]: number };

export function voucherCountOf(entry: VoucherCounts, key: PermanentVoucherKey): number {
  return entry[`${key}Vouchers`];
}

export function voucherValueOf(entry: VoucherValues, key: PermanentVoucherKey): number {
  return entry[`${key}VoucherValueCents`];
}

/**
 * Aan welke waarde de bonnen van een regel tellen. De waarde wordt vastgeklikt
 * bij het ingeven (`current` komt uit de instellingen), zodat een nieuwe waarde
 * geen telling van vorig jaar herrekent. Een soort die een bestaande regel nog
 * niet had (de Guidobonnen en broodjes kwamen er in november 2026 bij, met
 * waarde 0), krijgt de huidige waarde: met nul stuks telde ze nergens mee.
 */
export function voucherValuesFor(
  existing: (VoucherCounts & VoucherValues) | null,
  current: VoucherValues,
): VoucherValues {
  const values = {} as VoucherValues;
  for (const voucher of PERMANENT_VOUCHERS) {
    const field = `${voucher.key}VoucherValueCents` as const;
    const unused = !existing || (existing[field] === 0 && voucherCountOf(existing, voucher.key) === 0);
    values[field] = unused ? current[field] : existing[field];
  }
  return values;
}

/** "3 shiftersbonnen". */
export function voucherCountText(key: PermanentVoucherKey, count: number, nl: boolean): string {
  const voucher = PERMANENT_VOUCHERS.find((candidate) => candidate.key === key)!;
  const [one, many] = nl ? voucher.nl : voucher.en;
  return `${count} ${count === 1 ? one : many}`;
}

/** "3 shiftersbonnen, 1 Guidobon": enkel de soorten die er zijn. */
export function vouchersText(entry: VoucherCounts, nl: boolean): string[] {
  return PERMANENT_VOUCHERS.flatMap((voucher) => {
    const count = voucherCountOf(entry, voucher.key);
    return count ? [voucherCountText(voucher.key, count, nl)] : [];
  });
}

/** Wat de berekening van een regel nodig heeft, zoals het uit de database komt. */
export type PermanentEntry = VoucherCounts &
  VoucherValues & {
    id: string;
    kind: PermanentEntryKind;
    /** De kalenderdag (`@db.Date`): middernacht UTC. */
    date: Date;
    createdAt: Date;
    cashCents: number;
    closesRegister: boolean;
  };

/** De bonnen aan hun vastgeklikte waarde. */
export function entryVoucherCents(entry: VoucherCounts & VoucherValues): number {
  return PERMANENT_VOUCHERS.reduce(
    (sum, voucher) => sum + voucherCountOf(entry, voucher.key) * voucherValueOf(entry, voucher.key),
    0,
  );
}

/**
 * Cash plus de bonnen: wat de post in haar kassa telde. Enkel voor wat de post
 * ziet; Beheer telt enkel het cash (`entryCashCents`), want de bonnen zeggen
 * iets over het resultaat van de post maar brengen Beheer geen geld op.
 */
export function entryValueCents(entry: Pick<PermanentEntry, "cashCents"> & VoucherCounts & VoucherValues): number {
  return entry.cashCents + entryVoucherCents(entry);
}

/** Wat een regel voor Beheer waard is: enkel het cash. */
export function entryCashCents(entry: Pick<PermanentEntry, "cashCents">): number {
  return entry.cashCents;
}

/** Op datum, en op dezelfde dag in de volgorde van ingeven. */
export function sortEntries<T extends Pick<PermanentEntry, "id" | "date" | "createdAt">>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Een ijkpunt: een moment waarop vaststaat wat er in de kassa zit. Dat is een
 * telling, of een teruggave van de volledige kassa (daarna zit er niets meer in).
 */
export function isCheckpoint(entry: Pick<PermanentEntry, "kind" | "closesRegister">): boolean {
  return entry.kind === "COUNT" || (entry.kind === "RETURNED" && entry.closesRegister);
}

/** Wat er na een ijkpunt in de kassa zit, in cash (zie `entryCashCents`). */
function checkpointValueCents(entry: PermanentEntry): number {
  return entry.kind === "COUNT" ? entryCashCents(entry) : 0;
}

// -----------------------------------------------------------------------------
// Kwartalen
// -----------------------------------------------------------------------------

/** Een kalenderkwartaal: 1 is januari tot maart. */
export type Quarter = { year: number; quarter: 1 | 2 | 3 | 4 };

export function quarterOf(date: Date): Quarter {
  return { year: date.getUTCFullYear(), quarter: (Math.floor(date.getUTCMonth() / 3) + 1) as Quarter["quarter"] };
}

/** De eerste dag, middernacht UTC. */
export function quarterStart(q: Quarter): Date {
  return new Date(Date.UTC(q.year, (q.quarter - 1) * 3, 1));
}

/** De laatste dag, middernacht UTC. */
export function quarterEnd(q: Quarter): Date {
  return new Date(Date.UTC(q.year, q.quarter * 3, 0));
}

export function sameQuarter(a: Quarter, b: Quarter): boolean {
  return a.year === b.year && a.quarter === b.quarter;
}

export function previousQuarter(q: Quarter): Quarter {
  return q.quarter === 1 ? { year: q.year - 1, quarter: 4 } : { year: q.year, quarter: (q.quarter - 1) as Quarter["quarter"] };
}

/**
 * Het jaar van het kasboek: juli tot juni, zodat de startkassa van september en
 * het tweede semester in hetzelfde jaar staan. Dat is het werkingsjaar zonder
 * de grens van 15 juli: een kwartaal valt er zo nooit half buiten.
 */
export function ledgerYearOf(date: Date): number {
  return date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

/** De vier kwartalen van een kasboekjaar, van juli tot juni. */
export function ledgerYearQuarters(year: number): Quarter[] {
  return [
    { year, quarter: 3 },
    { year, quarter: 4 },
    { year: year + 1, quarter: 1 },
    { year: year + 1, quarter: 2 },
  ];
}

const MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Oktober tot december 2026". */
export function quarterLabel(q: Quarter, nl: boolean): string {
  const months = nl ? MONTHS_NL : MONTHS_EN;
  const first = months[(q.quarter - 1) * 3];
  const last = months[q.quarter * 3 - 1];
  const label = `${first} ${nl ? "tot" : "to"} ${last} ${q.year}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "Q4 2026". */
export function quarterShort(q: Quarter): string {
  return `Q${q.quarter} ${q.year}`;
}

/** "31 december", voor "tel tegen ...". */
export function quarterEndLabel(q: Quarter, nl: boolean): string {
  const end = quarterEnd(q);
  return `${end.getUTCDate()} ${(nl ? MONTHS_NL : MONTHS_EN)[end.getUTCMonth()]}`;
}

// -----------------------------------------------------------------------------
// Winst
// -----------------------------------------------------------------------------

export type PeriodResult = {
  /** Het ijkpunt waar de periode begint; `null` = de kassa begon leeg. */
  opening: PermanentEntry | null;
  closing: PermanentEntry;
  handedOutCents: number;
  /** Wat de post afgaf, de teruggave van de volledige kassa inbegrepen. */
  returnedCents: number;
  /** Binnengekomen bij Beheer min uitgegaan, in cash: de winst van de periode. */
  resultCents: number;
};

/**
 * De winst tussen twee ijkpunten in een gesorteerde lijst: alles na het
 * openingspunt tot en met het slotpunt. `openingIndex` -1 = vanaf het begin.
 */
function periodBetween(sorted: PermanentEntry[], openingIndex: number, closingIndex: number): PeriodResult {
  const opening = openingIndex >= 0 ? sorted[openingIndex] : null;
  const closing = sorted[closingIndex];
  let handedOutCents = 0;
  let returnedCents = 0;
  for (let index = openingIndex + 1; index <= closingIndex; index++) {
    const entry = sorted[index];
    if (entry.kind === "HANDED_OUT") handedOutCents += entryCashCents(entry);
    if (entry.kind === "RETURNED") returnedCents += entryCashCents(entry);
  }
  const resultCents =
    checkpointValueCents(closing) + returnedCents - handedOutCents - (opening ? checkpointValueCents(opening) : 0);
  return { opening, closing, handedOutCents, returnedCents, resultCents };
}

/** Per ijkpunt de winst sinds het vorige, op id. */
export function resultsPerCheckpoint(sorted: PermanentEntry[]): Map<string, PeriodResult> {
  const results = new Map<string, PeriodResult>();
  let previous = -1;
  sorted.forEach((entry, index) => {
    if (!isCheckpoint(entry)) return;
    results.set(entry.id, periodBetween(sorted, previous, index));
    previous = index;
  });
  return results;
}

export type QuarterResult =
  | ({ state: "done" } & PeriodResult)
  /** Het kwartaal is voorbij en er is niet in geteld. */
  | { state: "missing" }
  /** Het kwartaal loopt nog en er is nog niet in geteld. */
  | { state: "open" }
  | { state: "future" };

/**
 * De winst van een kwartaal: van het laatste ijkpunt voor het kwartaal tot het
 * laatste erin. Is er op het einde van een kwartaal niet geteld, dan schuift
 * die winst door naar het volgende kwartaal waarin wel geteld wordt; zo telt
 * elke euro precies één keer.
 *
 * `today` is de kalenderdag van vandaag in Brussel, als middernacht UTC.
 */
export function quarterResult(sorted: PermanentEntry[], quarter: Quarter, today: Date): QuarterResult {
  const start = quarterStart(quarter).getTime();
  const end = quarterEnd(quarter).getTime();
  if (start > today.getTime()) return { state: "future" };
  let opening = -1;
  let closing = -1;
  sorted.forEach((entry, index) => {
    if (!isCheckpoint(entry)) return;
    const time = entry.date.getTime();
    if (time < start) opening = index;
    else if (time <= end) closing = index;
  });
  if (closing < 0) return { state: end < today.getTime() ? "missing" : "open" };
  return { state: "done", ...periodBetween(sorted, opening, closing) };
}

/** De som van de afgerekende kwartalen van een kasboekjaar. */
export function ledgerYearResultCents(sorted: PermanentEntry[], year: number, today: Date): number {
  return ledgerYearQuarters(year).reduce((sum, quarter) => {
    const result = quarterResult(sorted, quarter, today);
    return sum + (result.state === "done" ? result.resultCents : 0);
  }, 0);
}

/** Het laatste kwartaal dat helemaal voorbij is. */
export function lastClosedQuarter(today: Date): Quarter {
  return previousQuarter(quarterOf(today));
}

// -----------------------------------------------------------------------------
// Wie mag wat
// -----------------------------------------------------------------------------

/**
 * Hoe ver een post een telling terug mag dateren, en hoe lang ze die daarna nog
 * aanpast. Lang genoeg om de telling van 31 maart op 2 april in te geven of een
 * tikfout recht te zetten; kort genoeg dat een kwartaal dat Beheer al afrekende,
 * niet stil verandert. Beheer mag altijd.
 */
export const POST_COUNT_WINDOW_DAYS = 14;

const DAY_MS = 86_400_000;

/** Ligt `date` tussen `today` min het venster en `today`? */
export function withinPostWindow(date: Date, today: Date): boolean {
  const time = date.getTime();
  return time <= today.getTime() && time >= today.getTime() - POST_COUNT_WINDOW_DAYS * DAY_MS;
}

/** Hele dagen tussen twee kalenderdagen. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** `?post=` in de URL: de code van de post in kleine letters ("theokot"). */
export function postSlug(code: string): string {
  return code.toLowerCase();
}
