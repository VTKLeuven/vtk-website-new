/**
 * Zuivere logica van de vaste kassa's: de kassa die Cursusdienst, Theokot en
 * Fakbar het hele semester houden (`PERMANENT_POST_CODES`). Geen prisma; het
 * telformulier rekent er live mee.
 *
 * Een vaste kassa komt niet terug na een activiteit. Beheer geeft geld mee
 * (de startkassa, extra munten), de post geeft tussendoor geld af, en de post
 * telt op gezette tijden. De winst van een periode volgt daaruit zoals Beheer
 * ze rekende: wat binnenkwam bij Beheer (de afgiftes en de slottelling) min wat
 * eruit ging (de openingstelling en wat meegegeven werd).
 */

export const PERMANENT_ENTRY_KINDS = ["HANDED_OUT", "RETURNED", "COUNT"] as const;

export type PermanentEntryKind = (typeof PERMANENT_ENTRY_KINDS)[number];

export function isPermanentEntryKind(value: unknown): value is PermanentEntryKind {
  return typeof value === "string" && (PERMANENT_ENTRY_KINDS as readonly string[]).includes(value);
}

/** Wat de berekening van een regel nodig heeft, zoals het uit de database komt. */
export type PermanentEntry = {
  id: string;
  kind: PermanentEntryKind;
  /** De kalenderdag (`@db.Date`): middernacht UTC. */
  date: Date;
  createdAt: Date;
  cashCents: number;
  shiftVouchers: number;
  elixirVouchers: number;
  shiftVoucherValueCents: number;
  elixirVoucherValueCents: number;
  closesRegister: boolean;
};

type Valued = Pick<
  PermanentEntry,
  "cashCents" | "shiftVouchers" | "elixirVouchers" | "shiftVoucherValueCents" | "elixirVoucherValueCents"
>;

/** Cash plus de bonnen aan hun vastgeklikte waarde. */
export function entryValueCents(entry: Valued): number {
  return (
    entry.cashCents +
    entry.shiftVouchers * entry.shiftVoucherValueCents +
    entry.elixirVouchers * entry.elixirVoucherValueCents
  );
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

/** Wat er na een ijkpunt in de kassa zit. */
function checkpointValueCents(entry: PermanentEntry): number {
  return entry.kind === "COUNT" ? entryValueCents(entry) : 0;
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
  /** Binnengekomen bij Beheer min uitgegaan: de winst van de periode. */
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
    if (entry.kind === "HANDED_OUT") handedOutCents += entryValueCents(entry);
    if (entry.kind === "RETURNED") returnedCents += entryValueCents(entry);
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
