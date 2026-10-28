/**
 * De exports van Payconiq, Mollie, SumUp en Europabank lezen, voor
 * /admin/inkomsten. Puur: geen database, zodat het zonder database te testen is
 * (`test/inkomsten.test.ts`).
 *
 * Hier staat enkel kennis over de bestanden: hun kolommen, welke regels
 * meetellen, hoe een datum of bedrag eruitziet, en wat Mollie "Withheld fees"
 * noemt. Alles over VTK zelf (welke sticker, welke rekening, welke code) is
 * data die Beheer in de site invult. Zie docs/inkomsten.md.
 */
import { createHash } from "node:crypto";
import { brusselsWallClockMinutes } from "@/lib/brussels";
import { detectDelimiter, parseCsv } from "@/lib/csv";

export type IncomeSourceCode = "PAYCONIQ" | "MOLLIE" | "SUMUP" | "EUROPABANK";
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
  /** "2026-10": waar de regel in het overzicht telt. Null bij Mollie zonder uitbetaling. */
  periodMonth: string | null;
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

export type IncomeParseError = "EMPTY" | "UNKNOWN_FORMAT" | "MOLLIE_BALANCE" | "BAD_ROW";

/** Welk formaat de parser herkende; staat ook op `IncomeImport.format`. */
export type IncomeFormat = "payconiq" | "mollie" | "sumup" | "europabank";

export type IncomeParseResult =
  | {
      ok: true;
      format: IncomeFormat;
      source: IncomeSourceCode;
      rows: ParsedIncomeRow[];
      /** Regels die niet meetellen: mislukt, vervallen, geannuleerd. */
      skipped: number;
      total: number;
    }
  | { ok: false; error: IncomeParseError; detail?: string };

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

/**
 * De maand van een Mollie-uitbetaling uit haar referentie: in
 * "17112539.2510.03" staat 2510, oktober 2025. Zo rekent ook het rekenblad van
 * Beheer (`MID(referentie; 10; 4)`).
 */
export function payoutMonth(reference: string | null | undefined): string | null {
  const match = /^\d+\.(\d{2})(\d{2})\.\d+$/.exec((reference ?? "").trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return monthKey(2000 + Number(match[1]), month);
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

type Columns = Map<string, number>;

function columnsOf(header: string[]): Columns {
  return new Map(header.map((name, index) => [name.trim().toLowerCase(), index]));
}

/** De eerste kolom die bestaat, uit een paar namen (Engelse en Nederlandse koppen). */
function pick(columns: Columns, ...names: string[]): number | undefined {
  for (const name of names) {
    const index = columns.get(name);
    if (index !== undefined) return index;
  }
  return undefined;
}

/** Lees een export: herken het formaat aan de kolomkoppen. */
export function parseIncomeExport(text: string): IncomeParseResult {
  const rows = parseCsv(text, detectDelimiter(text));
  if (rows.length < 2) return { ok: false, error: "EMPTY" };
  const columns = columnsOf(rows[0]);
  const has = (...names: string[]) => names.every((name) => columns.has(name));

  if (has("id", "date", "time", "amount", "status", "shop_name")) return parsePayconiq(rows, columns);
  if (has("transaction type", "settlement amount")) return { ok: false, error: "MOLLIE_BALANCE" };
  if (pick(columns, "id") !== undefined && pick(columns, "status") !== undefined && pick(columns, "settlement reference", "uitbetalingsreferentie") !== undefined) {
    return parseMollie(rows, columns);
  }
  if (has("datum", "transactie-id", "transactietype", "status", "totaal bedrag")) return parseSumUp(rows, columns);
  if (has("datum", "tijd", "terminal", "resultaat") && pick(columns, "origineel bedrag (eur)", "bedrag") !== undefined) {
    return parseEuropabank(rows, columns);
  }
  return { ok: false, error: "UNKNOWN_FORMAT" };
}

function parsePayconiq(rows: string[][], columns: Columns): IncomeParseResult {
  const col = (name: string) => columns.get(name)!;
  const optional = (name: string) => columns.get(name);
  const result: ParsedIncomeRow[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (index: number | undefined) => (index === undefined ? "" : (row[index] ?? ""));
    if (get(col("status")).trim().toUpperCase() !== "SUCCEEDED") {
      skipped++;
      continue;
    }
    const local = parseLocalDateTime(get(col("date")), get(col("time")));
    const amount = parseDecimalCents(get(col("amount")));
    const id = get(col("id")).trim();
    if (!local || amount === null || !id) {
      return { ok: false, error: "BAD_ROW", detail: `regel ${i + 1}` };
    }
    const debit = get(optional("type")).trim().toUpperCase() === "DEBIT";
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
      description: cleanDescription(get(optional("description"))),
      reference: emptyToNull(get(optional("reference"))),
      bulkId: emptyToNull(get(optional("bulk_id"))),
      payoutReference: null,
      channel: get(col("shop_name")).trim() || "(zonder naam)",
    });
  }
  return { ok: true, format: "payconiq", source: "PAYCONIQ", rows: result, skipped, total: rows.length - 1 };
}

/** Statussen van een Mollie-betaling die geld opleverden. */
const MOLLIE_COUNTED = new Set(["paid", "paidout", "refunded"]);

/**
 * De betalingenexport van Mollie, met Engelse of Nederlandse koppen. Beheer
 * gebruikte er een met extra regels voor de kosten ("Withheld fees", "Invoice
 * Compensation"), de reserve ("... rolling reserve") en de terugbetalingen
 * (betaalmethode "refund"); zonder die regels kan het overzicht de kosten en
 * de reserve niet tonen, en zegt het dat. Een betaling met status "refunded"
 * telt voor haar volle bedrag, zoals in het rekenblad: de terugbetaling zelf is
 * een eigen regel in de uitbetaling waarvan ze afging.
 */
function parseMollie(rows: string[][], columns: Columns): IncomeParseResult {
  const dateCol = pick(columns, "date", "datum");
  const amountCol = pick(columns, "amount", "bedrag");
  const statusCol = pick(columns, "status")!;
  const idCol = pick(columns, "id")!;
  const descriptionCol = pick(columns, "description", "omschrijving");
  const methodCol = pick(columns, "payment method", "betaalmethode");
  const settlementAmountCol = pick(columns, "settlement amount", "uitbetalingsbedrag");
  const settlementRefCol = pick(columns, "settlement reference", "uitbetalingsreferentie")!;
  const refundedCol = pick(columns, "amount refunded", "teruggestort bedrag");
  if (dateCol === undefined || amountCol === undefined) return { ok: false, error: "UNKNOWN_FORMAT" };

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
    if (lower.startsWith("withheld fees") || lower.startsWith("invoice compensation")) kind = "FEE";
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
      periodMonth: payoutMonth(payoutReference),
      amountCents: amount,
      refundedCents: Math.abs(parseDecimalCents(get(refundedCol)) ?? 0),
      description: cleanDescription(rawDescription),
      reference: null,
      bulkId: null,
      payoutReference,
      channel: MOLLIE_CHANNEL,
    });
  }
  return { ok: true, format: "mollie", source: "MOLLIE", rows: result, skipped, total: rows.length - 1 };
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
 * rekenblad nam ze wel mee. Kaartgegevens en autorisatiecodes worden niet
 * overgenomen.
 */
function parseSumUp(rows: string[][], columns: Columns): IncomeParseResult {
  const accountCol = pick(columns, "email", "e-mail", "e-mailadres", "account");
  const dateCol = pick(columns, "datum")!;
  const idCol = pick(columns, "transactie-id")!;
  const typeCol = pick(columns, "transactietype")!;
  const statusCol = pick(columns, "status")!;
  const amountCol = pick(columns, "totaal bedrag")!;
  const feeCol = pick(columns, "transactiekosten");
  const descriptionCol = pick(columns, "beschrijving");
  const referenceCol = pick(columns, "kenmerk");

  const result: ParsedIncomeRow[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (index: number | undefined) => (index === undefined ? "" : (row[index] ?? ""));
    const type = get(typeCol).trim().toLowerCase();
    const status = get(statusCol).trim().toLowerCase();

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
      payoutReference: null,
      channel: get(accountCol).trim() || SUMUP_CHANNEL,
    };
    result.push(payment);
    if (fee) result.push(feeRow(payment, id, fee));
  }
  return { ok: true, format: "sumup", source: "SUMUP", rows: result, skipped, total: rows.length - 1 };
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
  const dateCol = pick(columns, "datum")!;
  const timeCol = pick(columns, "tijd")!;
  const terminalCol = pick(columns, "terminal")!;
  const amountCol = pick(columns, "origineel bedrag (eur)", "bedrag")!;
  const resultCol = pick(columns, "resultaat")!;
  const typeCol = pick(columns, "transactietype");
  const commissionCol = pick(columns, "commissie (eur)");
  const authorisationCol = pick(columns, "autorisatie nr", "authorisatie nr");
  const referenceCol = pick(columns, "uw ref", "ticket/uw ref");

  const result: ParsedIncomeRow[] = [];
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
    const day = `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
    const base = rowHash([terminal.replace(/^0+/, ""), day, String(local.minutes * 60 + local.seconds), String(Math.abs(amount)), authorisation]);
    const seen = seenHashes.get(base) ?? 0;
    seenHashes.set(base, seen + 1);
    const key = `eb:${base}:${seen}`;

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
      payoutReference: null,
      channel: terminal,
    };
    result.push(payment);
    if (commission) result.push(feeRow(payment, key, commission));
  }
  return { ok: true, format: "europabank", source: "EUROPABANK", rows: result, skipped, total: rows.length - 1 };
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
