/**
 * De exports van Payconiq, Mollie, SumUp en Europabank lezen, voor
 * /admin/inkomsten. Puur: geen database, zodat het zonder database te testen is
 * (`test/inkomsten.test.ts`).
 *
 * Hier staat enkel kennis over de bestanden: hun kolommen, welke regels
 * meetellen, hoe een datum of bedrag eruitziet, en wat Mollie "Withheld fees"
 * noemt. Alles over VTK zelf (welke sticker, welke rekening, welke code) is
 * data die Beheer in de site invult. Zie docs/inkomsten.md.
 *
 * De kolommen staan één keer, in `EXPORT_COLUMNS`: het herkennen en het lezen
 * gebruiken ze, en de uitleg bij het opladen toont dezelfde lijst.
 */
import { createHash } from "node:crypto";
import { brusselsWallClockMinutes } from "@/lib/brussels";
import { detectDelimiter, parseCsv } from "@/lib/csv";

/**
 * Een bron van inkomsten: de vier exports, en de overschrijvingen die Beheer
 * met de hand invoert (`TRANSFER`, zie `transfers.ts`). De parser hier geeft
 * enkel de vier exports terug.
 */
export type IncomeSourceCode = "PAYCONIQ" | "MOLLIE" | "SUMUP" | "EUROPABANK" | "TRANSFER";
export type IncomeKindCode = "PAYMENT" | "REFUND" | "FEE" | "RESERVE";

/** Het kanaal van Mollie: één profiel, dus één naam. */
export const MOLLIE_CHANNEL = "Mollie";

/** Het kanaal van een SumUp-export zonder kolom met het account. */
export const SUMUP_CHANNEL = "SumUp";

export type ParsedIncomeRow = {
  source: IncomeSourceCode;
  kind: IncomeKindCode;
  /** Soort plus ID van de provider, of een hash van de regel zonder ID. */
  externalKey: string;
  providerId: string | null;
  occurredAt: Date;
  /**
   * "2026-10": waar de regel in het overzicht telt. De maand van de transactie
   * op de Brusselse klok, voor elke bron, ook Mollie (Beheer, november 2026).
   */
  periodMonth: string;
  amountCents: number;
  refundedCents: number;
  description: string | null;
  reference: string | null;
  bulkId: string | null;
  payoutReference: string | null;
  /**
   * Het kanaal zoals in de export: de sticker bij Payconiq, "Mollie" bij
   * Mollie, het account bij SumUp, het terminalnummer bij Europabank.
   */
  channel: string;
  /**
   * Een kostenregel die de parser maakte uit de kosten op een betaling (SumUp,
   * Europabank): geen eigen regel in het bestand, dus niet meegeteld in wat
   * het opladen over het bestand zegt.
   */
  derived?: boolean;
};

export type IncomeParseError = "EMPTY" | "UNKNOWN_FORMAT" | "BAD_ROW";

/** Welk formaat de parser herkende; staat ook op `IncomeImport.format`. */
export type IncomeFormat = "payconiq" | "mollie" | "mollie-balance" | "sumup" | "europabank";

/**
 * Een uitbetaling zoals de export ze noemt: een overschrijving van de provider
 * naar de bank, met haar referentie. Mollie geeft in het balansrapport het
 * bedrag; SumUp enkel per verkoop wat ervan in welke uitbetaling zat, en dan
 * is de som van die verkopen het bedrag.
 */
export type ParsedPayout = {
  reference: string;
  /** De dag van de overschrijving, "2026-09-30". */
  paidOn: string;
  /** Wat er volgens de provider naar de bank ging, in centen; null als de export het niet zegt. */
  amountCents: number | null;
};

/** Een betaling zoals het balansrapport van Mollie ze noemt; geen naam of rekening. */
export type ParsedBalancePayment = { paymentId: string; month: string; amountCents: number };

export type IncomeParseResult =
  | {
      ok: true;
      format: IncomeFormat;
      source: IncomeSourceCode;
      rows: ParsedIncomeRow[];
      /** Regels die niet meetellen: mislukt, vervallen, geannuleerd. */
      skipped: number;
      /**
       * Regels die geen transactie zijn, maar hetzelfde geld nog eens: de
       * uitbetalingsregel die SumUp bij elke verkoop zet, of een betaling in
       * het balansrapport van Mollie (die komt uit de betalingenexport).
       */
      ignored: number;
      total: number;
      /** De uitbetalingen die het bestand noemt. */
      payouts: ParsedPayout[];
      /**
       * Wat het balansrapport van Mollie over elke betaling zegt (ID, maand,
       * bedrag): de controle dat de betalingenexport volledig is. Enkel bij
       * `mollie-balance`.
       */
      balancePayments?: ParsedBalancePayment[];
    }
  | IncomeParseFailure;

/** Het formaat waar een onbekend bestand het meest op lijkt, en welke verplichte kolommen het mist. */
export type ClosestFormat = { format: IncomeFormat; missing: string[] };

export type IncomeParseFailure = { ok: false; error: IncomeParseError; detail?: string; closest?: ClosestFormat };

// -----------------------------------------------------------------------------
// CSV
// -----------------------------------------------------------------------------

export { detectDelimiter, parseCsv } from "@/lib/csv";

// -----------------------------------------------------------------------------
// Bedragen, datums, tekst
// -----------------------------------------------------------------------------

/**
 * Een bedrag naar centen, met teken. Aanvaardt "19.20", "19,20", "-1.17",
 * "1.234,56" en "1,234.56". `null` bij een lege cel of iets wat geen bedrag is:
 * nooit `Number()`, dat van een lege cel stil 0 maakt.
 */
export function parseDecimalCents(raw: string | undefined): number | null {
  let value = (raw ?? "").trim().replace(/^€\s*/, "").replace(/\s/g, "");
  if (!value) return null;
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma > lastDot) {
    // De komma is de decimale: punten zijn duizendtallen.
    value = value.replace(/\./g, "").replace(",", ".");
  } else {
    value = value.replace(/,/g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isFinite(cents) ? cents : null;
}

type LocalDateTime = { year: number; month: number; day: number; minutes: number; seconds: number };

/**
 * Een datum en uur zoals de exports ze schrijven, op de Brusselse klok:
 * "2026-08-01 03:35:15" (Mollie), "16/08/2026" plus "00:52:40" (Payconiq), en
 * "4-8-2025 6:14:00" of "30/09/2025" (een tabblad uit Google Sheets).
 */
export function parseLocalDateTime(dateRaw: string, timeRaw = ""): LocalDateTime | null {
  const text = `${dateRaw.trim()} ${timeRaw.trim()}`.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?!\d)/.exec(text);
  let year: number, month: number, day: number;
  if (match) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
    if (!match) return null;
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;
  const second = match[6] ? Number(match[6]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  if (year < 2000 || year > 2100) return null;
  // 31 februari bestaat niet: Date.UTC zou het stil naar maart schuiven.
  if (new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return null;
  return { year, month, day, minutes: hour * 60 + minute, seconds: second };
}

/**
 * Een uur zoals Europabank het schrijft: "103804" is 10:38:04, en een uur voor
 * tien uur verliest zijn voorloopnul ("93015"). Een ".0" erachter komt van een
 * rekenblad dat het als getal las.
 */
export function compactTime(raw: string): string | null {
  const digits = raw.trim().replace(/\.0+$/, "");
  if (!/^\d{1,6}$/.test(digits)) return null;
  const padded = digits.padStart(6, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4)}`;
}

function toInstant(local: LocalDateTime): Date {
  const atMinute = brusselsWallClockMinutes({ year: local.year, month: local.month, day: local.day }, local.minutes);
  return new Date(atMinute.getTime() + local.seconds * 1000);
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

const EMAIL = /[^\s:;,<>()"']+@[^\s:;,<>()"']+\.[a-z]{2,}/gi;

/**
 * Een omschrijving zonder e-mailadressen: Uniflow zet dat van de student in het
 * printkrediet ("Uniflow Printer Credit: ...@student.kuleuven.be"). Leeg = null.
 */
export function cleanDescription(raw: string | undefined): string | null {
  const text = (raw ?? "")
    .replace(EMAIL, "")
    .replace(/\s+/g, " ")
    .replace(/[\s:;,-]+$/, "")
    .trim();
  return text || null;
}

function emptyToNull(raw: string | undefined): string | null {
  const text = (raw ?? "").trim();
  return text || null;
}

function rowHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("\u241f")).digest("hex").slice(0, 24);
}

// -----------------------------------------------------------------------------
// Formaten
// -----------------------------------------------------------------------------

export { EXPORT_COLUMNS, may, need, type ExportColumn } from "./columns";
import { EXPORT_COLUMNS, type ExportColumn } from "./columns";

export type Columns = Map<string, number>;

/**
 * Een kolomkop zoals de site hem vergelijkt: zonder hoofdletters, spaties,
 * underscores of accenten. Zo is `shop_name` dezelfde kolom als `shopName`,
 * en `Commissie (EUR)` dezelfde als `commissie (eur)`: een portaal dat zijn
 * koppen anders schrijft, maakt een export niet onleesbaar.
 */
export function headerKey(name: string): string {
  return name
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "");
}

/** De kolommen van een bestand; staat een kop er twee keer, dan telt de eerste. */
export function columnsOf(header: string[]): Columns {
  const columns: Columns = new Map();
  header.forEach((name, index) => {
    const key = headerKey(name);
    if (!columns.has(key)) columns.set(key, index);
  });
  return columns;
}

/** Waar elke kolom van een formaat staat; `undefined` als het bestand ze niet heeft. */
export function indexes<T extends Record<string, ExportColumn>>(columns: Columns, spec: T): { [K in keyof T]: number | undefined } {
  const found = {} as { [K in keyof T]: number | undefined };
  for (const key of Object.keys(spec) as Array<keyof T>) {
    found[key] = spec[key].names.map((name) => columns.get(headerKey(name))).find((index) => index !== undefined);
  }
  return found;
}

/** De verplichte kolommen van een formaat die het bestand niet heeft, bij hun eerste naam. */
function missingColumns(columns: Columns, spec: Record<string, ExportColumn>): { missing: string[]; required: number } {
  const required = Object.values(spec).filter((column) => column.required);
  const missing = required.filter((column) => !column.names.some((name) => columns.has(headerKey(name))));
  return { missing: missing.map((column) => column.names[0]), required: required.length };
}

export function recognises(columns: Columns, spec: Record<string, ExportColumn>): boolean {
  return missingColumns(columns, spec).missing.length === 0;
}

/**
 * Het formaat waar een onbekend bestand het meest op lijkt: dat met het
 * grootste deel van zijn verplichte kolommen, als dat minstens de helft is.
 * Zo zegt de fout "lijkt op Payconiq, maar mist shop_name" in plaats van
 * enkel dat de site het bestand niet kent.
 */
function closestFormat(columns: Columns): ClosestFormat | undefined {
  let best: (ClosestFormat & { share: number }) | undefined;
  for (const format of Object.keys(EXPORT_COLUMNS) as IncomeFormat[]) {
    const { missing, required } = missingColumns(columns, EXPORT_COLUMNS[format]);
    const share = (required - missing.length) / required;
    if (share >= 0.5 && (!best || share > best.share)) best = { format, missing, share };
  }
  return best ? { format: best.format, missing: best.missing } : undefined;
}

/** Lees een export: herken het formaat aan de kolomkoppen. */
export function parseIncomeExport(text: string): IncomeParseResult {
  const rows = parseCsv(text, detectDelimiter(text));
  if (rows.length < 2) return { ok: false, error: "EMPTY" };
  const columns = columnsOf(rows[0]);

  if (recognises(columns, EXPORT_COLUMNS.payconiq)) return parsePayconiq(rows, columns);
  if (recognises(columns, EXPORT_COLUMNS["mollie-balance"])) return parseMollieBalance(rows, columns);
  if (recognises(columns, EXPORT_COLUMNS.mollie)) return parseMollie(rows, columns);
  if (recognises(columns, EXPORT_COLUMNS.sumup)) return parseSumUp(rows, columns);
  if (recognises(columns, EXPORT_COLUMNS.europabank)) return parseEuropabank(rows, columns);
  return { ok: false, error: "UNKNOWN_FORMAT", closest: closestFormat(columns) };
}

function ymdOf(local: LocalDateTime): string {
  return `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
}

function parsePayconiq(rows: string[][], columns: Columns): IncomeParseResult {
  const c = indexes(columns, EXPORT_COLUMNS.payconiq);
  const result: ParsedIncomeRow[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (index: number | undefined) => (index === undefined ? "" : (row[index] ?? ""));
    if (get(c.status).trim().toUpperCase() !== "SUCCEEDED") {
      skipped++;
      continue;
    }
    const local = parseLocalDateTime(get(c.date), get(c.time));
    const amount = parseDecimalCents(get(c.amount));
    const id = get(c.id).trim();
    if (!local || amount === null || !id) {
      return { ok: false, error: "BAD_ROW", detail: `regel ${i + 1}` };
    }
    const debit = get(c.type).trim().toUpperCase() === "DEBIT";
    const kind: IncomeKindCode = debit ? "REFUND" : "PAYMENT";
    result.push({
      source: "PAYCONIQ",
      kind,
      externalKey: `${kind}:${id}`,
      providerId: id,
      occurredAt: toInstant(local),
      periodMonth: monthKey(local.year, local.month),
      amountCents: debit ? -Math.abs(amount) : amount,
      refundedCents: 0,
      description: cleanDescription(get(c.description)),
      reference: emptyToNull(get(c.reference)),
      bulkId: emptyToNull(get(c.bulkId)),
      // Bewaard zoals in de export, ook al toont de lijst per uitbetaling
      // Payconiq nog niet: later invullen kan enkel door opnieuw te uploaden,
      // en nooit meer in een afgesloten maand.
      payoutReference: emptyToNull(get(c.payout)),
      channel: get(c.shop).trim() || "(zonder naam)",
    });
  }
  return { ok: true, format: "payconiq", source: "PAYCONIQ", rows: result, skipped, ignored: 0, total: rows.length - 1, payouts: [] };
}

/** Statussen van een Mollie-betaling die geld opleverden. */
const MOLLIE_COUNTED = new Set(["paid", "paidout", "refunded"]);

/**
 * De betalingenexport van Mollie, met Engelse of Nederlandse koppen. Beheer
 * gebruikte er een met extra regels voor de kosten ("Withheld fees", "Invoice
 * Compensation", "Balance correction"), de reserve ("... rolling reserve") en de terugbetalingen
 * (betaalmethode "refund"); zonder die regels kan het overzicht de kosten en
 * de reserve niet tonen, en zegt het dat. Een betaling met status "refunded"
 * telt voor haar volle bedrag, zoals in het rekenblad: de terugbetaling zelf is
 * een eigen regel in de uitbetaling waarvan ze afging.
 */
function parseMollie(rows: string[][], columns: Columns): IncomeParseResult {
  const c = indexes(columns, EXPORT_COLUMNS.mollie);
  const dateCol = c.date;
  const amountCol = c.amount;
  const statusCol = c.status;
  const idCol = c.id;
  const descriptionCol = c.description;
  const methodCol = c.method;
  const settlementAmountCol = c.settlementAmount;
  const settlementRefCol = c.settlementReference;
  const refundedCol = c.refunded;

  const result: ParsedIncomeRow[] = [];
  const seenHashes = new Map<string, number>();
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (index: number | undefined) => (index === undefined ? "" : (row[index] ?? ""));
    const rawDescription = get(descriptionCol).trim();
    const lower = rawDescription.toLowerCase();
    const method = get(methodCol).trim().toLowerCase();
    const status = get(statusCol).trim().toLowerCase();

    let kind: IncomeKindCode;
    // "Balance correction" (en "Reverting Balance correction") is een correctie
    // op een factuur, zonder status; Beheer telde ze als kosten.
    if (lower.startsWith("withheld fees") || lower.startsWith("invoice compensation") || lower.includes("balance correction")) kind = "FEE";
    else if (lower.includes("rolling reserve") || method === "rollingreserve") kind = "RESERVE";
    // Een terugbetaling of chargeback is een eigen regel zonder status, met een
    // negatief bedrag in de uitbetaling waarvan ze afging (ID `re_...`).
    else if (method === "refund" || method === "chargeback") kind = "REFUND";
    else if (MOLLIE_COUNTED.has(status)) kind = "PAYMENT";
    else {
      skipped++;
      continue;
    }

    const local = parseLocalDateTime(get(dateCol));
    // Het uitbetaalde bedrag, zoals het rekenblad telt; zonder uitbetaling het
    // bedrag van de betaling. Een cel die er staat maar onleesbaar is, is een
    // fout en geen reden om stil een ander bedrag te nemen.
    const settledRaw = get(settlementAmountCol).trim();
    const amount = parseDecimalCents(settledRaw ? settledRaw : get(amountCol));
    if (!local || amount === null) return { ok: false, error: "BAD_ROW", detail: `regel ${i + 1}` };

    const payoutReference = emptyToNull(get(settlementRefCol));
    const id = get(idCol).trim();
    let externalKey: string;
    if (id) {
      externalKey = `${kind}:${id}`;
    } else {
      const base = rowHash([get(dateCol).trim(), kind, rawDescription, String(amount), payoutReference ?? ""]);
      const seen = seenHashes.get(base) ?? 0;
      seenHashes.set(base, seen + 1);
      externalKey = `${kind}:h:${base}:${seen}`;
    }

    result.push({
      source: "MOLLIE",
      kind,
      externalKey,
      providerId: id || null,
      occurredAt: toInstant(local),
      periodMonth: monthKey(local.year, local.month),
      amountCents: amount,
      refundedCents: Math.abs(parseDecimalCents(get(refundedCol)) ?? 0),
      description: cleanDescription(rawDescription),
      reference: null,
      bulkId: null,
      payoutReference,
      channel: MOLLIE_CHANNEL,
    });
  }
  return { ok: true, format: "mollie", source: "MOLLIE", rows: result, skipped, ignored: 0, total: rows.length - 1, payouts: [] };
}

/**
 * Het stuk in de sleutel van een kost of reserve uit het balansrapport
 * (`FEE:bal:...`). Zo herkent de site een maand waarin de kosten uit twee
 * soorten bestanden komen: de maandfactuur hier, en "Withheld fees" per
 * uitbetaling in de export van Beheer. Dat is twee keer hetzelfde geld.
 */
export const BALANCE_KEY = "bal";

/** Soorten in het balansrapport van Mollie die een eigen regel worden. */
function balanceKind(type: string): IncomeKindCode | null {
  if (type === "invoice") return "FEE";
  if (type.includes("reserve")) return "RESERVE";
  if (/refund|chargeback/.test(type)) return "REFUND";
  return null;
}

/**
 * Het balansrapport van Mollie: elke beweging op het Mollie-saldo. Daaruit komt
 * wat de betalingenexport niet heeft: de overschrijvingen naar de bank
 * ("transfer", met de referentie van de uitbetaling en het bedrag dat op het
 * uittreksel staat), de kosten die Mollie per maand factureert ("invoice"),
 * de reserve en de terugbetalingen. De betalingen staan er ook in, maar zonder
 * uitbetaling: die komen uit de betalingenexport, dus hier tellen ze niet.
 * Hun ID, maand en bedrag gaan wel mee (`balancePayments`): zo ziet de site of
 * de betalingenexport volledig is, en daar hangt de berekende reserve van af.
 *
 * Elke regel telt in haar eigen maand, zoals de betalingen. De maandfactuur en
 * de reserve staan op de laatste seconde van de maand, na de laatste
 * overschrijving, maar het geld ging er al die maand af: Mollie houdt de
 * kosten en de reserve wekelijks in op elke overschrijving (in de export per
 * uitbetaling staan ze zo, met het nummer van de factuur van die maand), en
 * zet ze in het balansrapport nog eens als één regel per maand.
 *
 * Een terugbetaling krijgt de eerstvolgende overschrijving als uitbetaling,
 * zoals in de export per uitbetaling, zodat de lijst per uitbetaling ze bij
 * die overschrijving zet. Staat er in het bestand nog geen overschrijving na,
 * dan heeft ze (nog) geen uitbetaling.
 */
function parseMollieBalance(rows: string[][], columns: Columns): IncomeParseResult {
  const c = indexes(columns, EXPORT_COLUMNS["mollie-balance"]);
  type Line = { local: LocalDateTime; at: Date; type: string; amount: number; reference: string; rawDate: string; description: string };
  const lines: Line[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (index: number | undefined) => (index === undefined ? "" : (row[index] ?? ""));
    const local = parseLocalDateTime(get(c.date));
    const amount = parseDecimalCents(get(c.amount));
    if (!local || amount === null) return { ok: false, error: "BAD_ROW", detail: `regel ${i + 1}` };
    lines.push({
      local,
      at: toInstant(local),
      type: get(c.type).trim().toLowerCase(),
      amount,
      reference: get(c.reference).trim(),
      rawDate: get(c.date).trim(),
      description: get(c.description).trim(),
    });
  }

  // Van achter naar voor: elke regel krijgt de eerste overschrijving erna. Een
  // stabiele sortering, zodat regels met hetzelfde uur hun volgorde houden.
  const ordered = lines.map((line, index) => ({ line, index })).sort((a, b) => a.line.at.getTime() - b.line.at.getTime() || a.index - b.index);
  const nextTransfer = new Map<Line, string | null>();
  let next: string | null = null;
  for (let k = ordered.length - 1; k >= 0; k--) {
    const { line } = ordered[k];
    if (line.type === "transfer") next = line.reference || null;
    else nextTransfer.set(line, next);
  }

  const result: ParsedIncomeRow[] = [];
  const payouts: ParsedPayout[] = [];
  const balancePayments: ParsedBalancePayment[] = [];
  const seenHashes = new Map<string, number>();
  let skipped = 0;
  let ignored = 0;
  for (const line of lines) {
    if (line.type === "payment") {
      // Telt niet: de betaling komt uit de betalingenexport. Haar ID en bedrag
      // gaan wel mee, om na te kijken dat die export volledig is.
      ignored++;
      if (line.reference) {
        balancePayments.push({ paymentId: line.reference, month: monthKey(line.local.year, line.local.month), amountCents: line.amount });
      }
      continue;
    }
    if (line.type === "transfer") {
      if (!line.reference) {
        skipped++;
        continue;
      }
      payouts.push({ reference: line.reference, paidOn: ymdOf(line.local), amountCents: -line.amount });
      continue;
    }
    const kind = balanceKind(line.type);
    if (!kind) {
      skipped++;
      continue;
    }
    let externalKey: string;
    if (kind === "REFUND" && line.reference) {
      externalKey = `REFUND:${line.reference}`;
    } else {
      const base = rowHash([line.rawDate, line.type, line.description, String(line.amount), line.reference]);
      const seen = seenHashes.get(base) ?? 0;
      seenHashes.set(base, seen + 1);
      externalKey = `${kind}:${BALANCE_KEY}:${base}:${seen}`;
    }
    // Een terugbetaling gaat mee met de eerstvolgende overschrijving (zo groepeert
    // de lijst per uitbetaling ze), maar telt zoals elke regel in haar eigen maand.
    const payoutReference = kind === "REFUND" ? (nextTransfer.get(line) ?? null) : null;
    result.push({
      source: "MOLLIE",
      kind,
      externalKey,
      providerId: kind === "REFUND" ? line.reference || null : null,
      occurredAt: line.at,
      periodMonth: monthKey(line.local.year, line.local.month),
      amountCents: line.amount,
      refundedCents: 0,
      description: cleanDescription(line.description),
      reference: null,
      bulkId: null,
      payoutReference,
      channel: MOLLIE_CHANNEL,
    });
  }
  return { ok: true, format: "mollie-balance", source: "MOLLIE", rows: result, skipped, ignored, total: rows.length - 1, payouts, balancePayments };
}


/** Een kostenregel bij een betaling van SumUp of Europabank: altijd negatief. */
function feeRow(payment: ParsedIncomeRow, key: string, feeCents: number): ParsedIncomeRow {
  return {
    ...payment,
    kind: "FEE",
    externalKey: `FEE:${key}`,
    amountCents: -Math.abs(feeCents),
    description: null,
    reference: null,
    derived: true,
  };
}

/** Een terugbetaling of terugboeking bij SumUp. */
const SUMUP_REFUND = /terugbetaling|terugboeking/;

/**
 * De transactie-export van SumUp, één per account. Een verkoop ("Omzet") die
 * lukte, telt voor haar totaalbedrag, zoals in het rekenblad, en de
 * transactiekosten worden een eigen kostenregel. Een verkoop die later
 * terugbetaald werd, telt voor haar volle bedrag en de terugbetaling als eigen
 * regel, zoals bij Mollie. Mislukte betalingen tellen niet: de formule van het
 * rekenblad nam ze wel mee. Naast elke verkoop zet SumUp een regel
 * "Uitbetaling" met dezelfde ID en hetzelfde bedrag: dat is hetzelfde geld
 * nog eens, en die regels slaat de site over zonder ze "niet meegeteld" te
 * noemen. Kaartgegevens en autorisatiecodes worden niet overgenomen.
 */
function parseSumUp(rows: string[][], columns: Columns): IncomeParseResult {
  const c = indexes(columns, EXPORT_COLUMNS.sumup);
  const accountCol = c.account;
  const dateCol = c.date;
  const idCol = c.id;
  const typeCol = c.type;
  const statusCol = c.status;
  const amountCol = c.amount;
  const feeCol = c.fee;
  const descriptionCol = c.description;
  const referenceCol = c.reference;

  // Eerst de uitbetalingsregels: die dragen het nummer en de dag van de
  // uitbetaling, de verkoop met dezelfde ID niet.
  const payoutOf = new Map<string, string>();
  const payouts = new Map<string, ParsedPayout>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (index: number | undefined) => (index === undefined ? "" : (row[index] ?? ""));
    if (get(typeCol).trim().toLowerCase() !== "uitbetaling") continue;
    const reference = get(c.payout).trim();
    const day = parseLocalDateTime(get(c.payoutDate));
    if (!reference || !day) continue;
    payoutOf.set(get(idCol).trim(), reference);
    if (!payouts.has(reference)) payouts.set(reference, { reference, paidOn: ymdOf(day), amountCents: null });
  }

  const result: ParsedIncomeRow[] = [];
  let skipped = 0;
  let ignored = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (index: number | undefined) => (index === undefined ? "" : (row[index] ?? ""));
    const type = get(typeCol).trim().toLowerCase();
    const status = get(statusCol).trim().toLowerCase();

    if (type === "uitbetaling") {
      ignored++;
      continue;
    }
    let kind: IncomeKindCode;
    if (SUMUP_REFUND.test(type) && status === "succesvol") kind = "REFUND";
    else if (type === "omzet" && (status === "succesvol" || status.startsWith("terugbetaald"))) kind = "PAYMENT";
    else {
      skipped++;
      continue;
    }

    const local = parseLocalDateTime(get(dateCol));
    const amount = parseDecimalCents(get(amountCol));
    const fee = feeCol === undefined || !get(feeCol).trim() ? 0 : parseDecimalCents(get(feeCol));
    const id = get(idCol).trim();
    if (!local || amount === null || fee === null || !id) {
      return { ok: false, error: "BAD_ROW", detail: `regel ${i + 1}` };
    }

    const payment: ParsedIncomeRow = {
      source: "SUMUP",
      kind,
      externalKey: `${kind}:${id}`,
      providerId: id,
      occurredAt: toInstant(local),
      periodMonth: monthKey(local.year, local.month),
      amountCents: kind === "REFUND" ? -Math.abs(amount) : amount,
      refundedCents: 0,
      description: cleanDescription(get(descriptionCol)),
      reference: emptyToNull(get(referenceCol)),
      bulkId: null,
      payoutReference: payoutOf.get(id) ?? null,
      channel: get(accountCol).trim() || SUMUP_CHANNEL,
    };
    result.push(payment);
    if (fee) result.push(feeRow(payment, id, fee));
  }
  return { ok: true, format: "sumup", source: "SUMUP", rows: result, skipped, ignored, total: rows.length - 1, payouts: [...payouts.values()] };
}

/** Resultaten van een Europabank-transactie die geld opleverde: de oude en de nieuwe opmaak. */
const EUROPABANK_APPROVED = new Set(["sale", "goedgekeurd"]);

/**
 * De transacties van een Europabank-terminal, in de opmaak tot maart 2026
 * ("Origineel bedrag (EUR)", resultaat "Sale") of die erna ("Bedrag",
 * resultaat "Goedgekeurd"). De datum en het uur komen uit "Datum" en "Tijd"; de
 * kolom "Datum en tijd" in het rekenblad is een formule van Beheer en wordt
 * genegeerd. De commissie is een kost, wat haar teken ook is: negatief in de
 * oude opmaak, positief in de nieuwe. Interchange en schemakost telt het
 * rekenblad niet als kost, de site dus ook niet.
 *
 * Europabank geeft geen eigen ID. De sleutel is een hash van terminal, datum,
 * uur, bedrag en autorisatienummer, die in beide opmaken hetzelfde zijn; twee
 * identieke regels in één bestand krijgen een volgnummer. Kaartgegevens worden
 * niet overgenomen.
 */
function parseEuropabank(rows: string[][], columns: Columns): IncomeParseResult {
  const c = indexes(columns, EXPORT_COLUMNS.europabank);
  const dateCol = c.date;
  const timeCol = c.time;
  const terminalCol = c.terminal;
  const amountCol = c.amount;
  const resultCol = c.result;
  const typeCol = c.type;
  const commissionCol = c.commission;
  const authorisationCol = c.authorisation;
  const referenceCol = c.reference;

  const result: ParsedIncomeRow[] = [];
  const payouts = new Map<string, ParsedPayout>();
  const seenHashes = new Map<string, number>();
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (index: number | undefined) => (index === undefined ? "" : (row[index] ?? ""));
    if (!EUROPABANK_APPROVED.has(get(resultCol).trim().toLowerCase())) {
      skipped++;
      continue;
    }

    // Enkel de dag uit "Datum": een rekenblad zet er soms 00:00:00 achter, en
    // dan zou het uur uit "Tijd" wegvallen.
    const time = compactTime(get(timeCol));
    const local = time ? parseLocalDateTime(get(dateCol).trim().split(/[ T]/)[0], time) : null;
    const amount = parseDecimalCents(get(amountCol));
    const commission = commissionCol === undefined || !get(commissionCol).trim() ? 0 : parseDecimalCents(get(commissionCol));
    // Een getal uit een rekenblad verliest zijn voorloopnullen; een download
    // uit het portaal niet. Zonder nullen is de sleutel in beide gelijk.
    const terminal = get(terminalCol).trim().replace(/\.0+$/, "");
    const authorisation = get(authorisationCol).trim().replace(/\.0+$/, "").replace(/^0+/, "");
    if (!local || amount === null || commission === null || !terminal) {
      return { ok: false, error: "BAD_ROW", detail: `regel ${i + 1}` };
    }

    const refund = amount < 0 || /terugbetaling|terugstorting/.test(get(typeCol).toLowerCase());
    const kind: IncomeKindCode = refund ? "REFUND" : "PAYMENT";
    const day = ymdOf(local);
    const base = rowHash([terminal.replace(/^0+/, ""), day, String(local.minutes * 60 + local.seconds), String(Math.abs(amount)), authorisation]);
    const seen = seenHashes.get(base) ?? 0;
    seenHashes.set(base, seen + 1);
    const key = `eb:${base}:${seen}`;

    // De OV-ref is de overschrijving naar de bank: één per kaartmerk en dag,
    // het bruto min de commissie, op de Boekingsdatum. Ze staat ook in de
    // mededeling op het afschrift. Zonder voorloopnullen, zoals daar.
    const ovRef = get(c.payout).trim().replace(/\.0+$/, "").replace(/^0+(?=\d)/, "") || null;
    const booked = ovRef ? parseLocalDateTime(get(c.payoutDate).trim().split(/[ T]/)[0]) : null;
    if (ovRef && booked && !payouts.has(ovRef)) payouts.set(ovRef, { reference: ovRef, paidOn: ymdOf(booked), amountCents: null });

    const payment: ParsedIncomeRow = {
      source: "EUROPABANK",
      kind,
      externalKey: `${kind}:${key}`,
      providerId: null,
      occurredAt: toInstant(local),
      periodMonth: monthKey(local.year, local.month),
      amountCents: refund ? -Math.abs(amount) : amount,
      refundedCents: 0,
      description: null,
      reference: emptyToNull(get(referenceCol)),
      bulkId: null,
      payoutReference: ovRef,
      channel: terminal,
    };
    result.push(payment);
    if (commission) result.push(feeRow(payment, key, commission));
  }
  return {
    ok: true,
    format: "europabank",
    source: "EUROPABANK",
    rows: result,
    skipped,
    ignored: 0,
    total: rows.length - 1,
    payouts: [...payouts.values()],
  };
}

// -----------------------------------------------------------------------------
// Maanden
// -----------------------------------------------------------------------------

/** "2026-10" naar de eerste dag van die maand, zoals `periodMonth` in de database. */
export function monthToDate(month: string): Date {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1));
}

/** De eerste dag van een maand (uit de database) naar "2026-10". */
export function dateToMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** "2026-10", of null als het geen geldige maand is. */
export function parseMonth(raw: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec((raw ?? "").trim());
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? match[0] : null;
}

/** De maand na deze: "2026-12" wordt "2027-01". */
export function nextMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return m === 12 ? monthKey(year + 1, 1) : monthKey(year, m + 1);
}
