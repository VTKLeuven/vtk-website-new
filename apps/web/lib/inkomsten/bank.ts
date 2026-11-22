/**
 * Bankafschriften van KBC (CSV, één rekening per bestand), als pure functies:
 * lezen, de regels van providers herkennen, ze aan een uitbetaling koppelen,
 * en per rekening afstemmen met wat de site verwacht. Zie docs/inkomsten.md,
 * "Bankafschriften".
 *
 * Een afschrift bevat namen, rekeningnummers en mededelingen van leden. Daarom
 * houdt deze parser enkel de regels van SumUp, Payconiq, Mollie en Europabank
 * over, herkend aan de naam van de tegenpartij en nooit aan de mededeling (die
 * typt een lid zelf), en van die regels enkel de dag, het bedrag en de
 * referentie van de uitbetaling. Al de rest verlaat deze functie niet, en het
 * bestand zelf bewaart de site niet.
 */
import { parseYMD, shiftYMD, ymdKey } from "@/lib/brussels";
import { BANK_COLUMNS } from "./columns";
import {
  columnsOf,
  detectDelimiter,
  indexes,
  parseCsv,
  parseDecimalCents,
  parseLocalDateTime,
  recognises,
  type IncomeSourceCode,
} from "./parse";

export { BANK_COLUMNS };

/** De bronnen die op een afschrift staan: de exports, niet de overschrijvingen met de hand. */
export type BankProvider = Exclude<IncomeSourceCode, "TRANSFER">;

/** Een rekening zoals de site ze vergelijkt: hoofdletters, zonder spaties of punten. */
export function normaliseAccount(raw: string): string {
  return raw.replace(/[\s.]/g, "").toUpperCase();
}

/** De rechtsvorm achter de naam van een bedrijf: "N.V.", "B.V.", "Limited". */
const COMPANY = String.raw`(?:n\.?\s?v\.?|b\.?\s?v\.?|s\.?a\.?|ltd\.?|limited)`;

/**
 * De namen waaronder de providers op een afschrift van KBC staan: telkens de
 * naam van het bedrijf, nooit enkel het woord. Een lid dat Mollie of Sumup
 * heet, is zo geen provider: anders telde zijn overschrijving als een regel
 * van Mollie, en gaf de afstemming per rekening een vals verschil.
 */
const PROVIDER_NAMES: ReadonlyArray<[BankProvider, RegExp]> = [
  ["MOLLIE", new RegExp(String.raw`^(?:stichting\s+mollie\s+payments|mollie\s+(?:payments|${COMPANY}))(?:\s+${COMPANY})?$`)],
  ["SUMUP", new RegExp(String.raw`^sumup(?:\s+payments)?\s+${COMPANY}$`)],
  ["PAYCONIQ", new RegExp(String.raw`^(?:bancontact\s+company|payconiq\s+(?:international|belgium))(?:\s+${COMPANY})?$`)],
  ["EUROPABANK", new RegExp(String.raw`^europabank(?:\s+${COMPANY})?$`)],
];

/**
 * Van welke provider een regel komt, op de naam van de tegenpartij. Enkel
 * kennis over de providers, niets over de kring.
 */
export function bankProviderOf(counterparty: string): BankProvider | null {
  const name = counterparty.replace(/\s+/g, " ").trim().toLowerCase();
  if (!name) return null;
  return PROVIDER_NAMES.find(([, pattern]) => pattern.test(name))?.[0] ?? null;
}

/**
 * De referentie van de uitbetaling in de mededeling van een provider:
 * - SumUp: de hele mededeling ("MDA PID1317737"), zoals het Uitbetalingsnummer
 *   in de export; het nummer na PID komt bij meerdere accounts terug;
 * - Mollie: de referentie van de overschrijving ("REF T17112539.2608.01
 *   MOLLIE"), zoals in het balansrapport;
 * - Payconiq: het stuk na de dag ("20260917-PA...-NONE-..."), de payoutId uit
 *   de export die hem noemt;
 * - Europabank: het nummer na OV.REF., de OV-ref uit de export.
 */
export function bankReferenceOf(provider: BankProvider, message: string): string | null {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return null;
  switch (provider) {
    case "SUMUP":
      return text.toUpperCase();
    case "MOLLIE":
      return /\d+\.\d{4}\.\d{2}/.exec(text)?.[0] ?? null;
    case "PAYCONIQ":
      return /^\d{8}-([A-Za-z0-9]+)(?:-|$)/.exec(text)?.[1]?.toUpperCase() ?? null;
    case "EUROPABANK":
      return /OV\.?\s*REF\.?\s*(\d+)/i.exec(text)?.[1]?.replace(/^0+(?=\d)/, "") ?? null;
  }
}

/**
 * De sleutel waarop een uitbetaling van de site en een bankregel elkaar vinden:
 * de bron en de referentie, met hoofdletters en spaties gelijkgetrokken. Een
 * payoutId van Payconiq staat in de export soms in kleine letters.
 */
export function payoutKey(source: BankProvider, reference: string): string {
  let text = reference.replace(/\s+/g, " ").trim().toUpperCase();
  if (source === "EUROPABANK") text = text.replace(/^0+(?=\d)/, "");
  return `${source}|${text}`;
}

export type ParsedBankLine = {
  /** "2026-09-17" */
  bookedOn: string;
  amountCents: number;
  provider: BankProvider;
  reference: string | null;
  /** Dezelfde regel in twee afschriften krijgt dezelfde sleutel. */
  externalKey: string;
};

export type BankParseResult =
  | {
      ok: true;
      /** De eigen rekening uit het bestand, genormaliseerd. */
      account: string;
      /** De dagen die het afschrift dekt ("2026-08-01"), uit de bestandsnaam of de regels. */
      coveredFrom: string;
      coveredTo: string;
      /** Regels in het bestand, ook die van leden. */
      lineCount: number;
      lines: ParsedBankLine[];
    }
  | { ok: false; error: "EMPTY" | "BAD_ROW" | "MIXED_ACCOUNTS"; detail?: string };

/** Of een tekst een afschrift van KBC is, aan de kolomkoppen. */
export function recognisesBankStatement(text: string): boolean {
  const rows = parseCsv(text.slice(0, 4000), detectDelimiter(text));
  return rows.length > 0 && recognises(columnsOf(rows[0]), BANK_COLUMNS);
}

/**
 * De dagen in een bestandsnaam zoals KBC die geeft:
 * `BE00000000000000_01-08-2026_tot_30-09-2026.csv`.
 */
export function coveredFromFileName(fileName: string): { from: string; to: string } | null {
  const match = /(\d{2})-(\d{2})-(\d{4})_tot_(\d{2})-(\d{2})-(\d{4})/i.exec(fileName);
  if (!match) return null;
  const from = parseYMD(`${match[3]}-${match[2]}-${match[1]}`);
  const to = parseYMD(`${match[6]}-${match[5]}-${match[4]}`);
  if (!from || !to || ymdKey(from) > ymdKey(to)) return null;
  return { from: ymdKey(from), to: ymdKey(to) };
}

/**
 * Een korte, vaste hash (FNV-1a, twee keer 32 bits) in gewone JavaScript. Ze
 * hoeft enkel dezelfde regel in twee afschriften dezelfde sleutel te geven; de
 * dag en het bedrag staan er leesbaar voor.
 */
function hash(parts: string[]): string {
  const text = parts.join("␟");
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/**
 * Een afschrift lezen. Enkel de regels van providers komen eruit; elke andere
 * regel telt enkel mee in `lineCount` en in de dagen die het afschrift dekt.
 */
export function parseBankStatement(text: string, fileName = ""): BankParseResult {
  const rows = parseCsv(text, detectDelimiter(text));
  if (rows.length < 2) return { ok: false, error: "EMPTY" };
  const c = indexes(columnsOf(rows[0]), BANK_COLUMNS);
  const accounts = new Set<string>();
  const lines: ParsedBankLine[] = [];
  const seen = new Map<string, number>();
  let first: string | null = null;
  let last: string | null = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (index: number | undefined) => (index === undefined ? "" : (row[index] ?? ""));
    const account = normaliseAccount(get(c.account));
    const date = parseLocalDateTime(get(c.date));
    const amount = parseDecimalCents(get(c.amount));
    if (!account || !date || amount === null) return { ok: false, error: "BAD_ROW", detail: `regel ${i + 1}` };
    accounts.add(account);
    const day = ymdKey(date);
    if (!first || day < first) first = day;
    if (!last || day > last) last = day;

    const provider = bankProviderOf(get(c.counterparty));
    if (!provider) continue;
    const message = get(c.message);
    const base = `${day}:${amount}:${hash([account, get(c.statement).trim(), message.replace(/\s+/g, " ").trim()])}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    lines.push({ bookedOn: day, amountCents: amount, provider, reference: bankReferenceOf(provider, message), externalKey: `${base}:${count}` });
  }
  if (accounts.size > 1) return { ok: false, error: "MIXED_ACCOUNTS" };
  const [account] = accounts;
  const named = coveredFromFileName(fileName);
  return {
    ok: true,
    account,
    coveredFrom: named?.from ?? first!,
    coveredTo: named?.to ?? last!,
    lineCount: rows.length - 1,
    lines,
  };
}

// -----------------------------------------------------------------------------
// Koppelen
// -----------------------------------------------------------------------------

/** Waarom een regel van een provider geen uitbetaling op de site vond. */
export type UnmatchedReason =
  /** De mededeling heeft geen referentie die de site herkent. */
  | "NO_REFERENCE"
  /** Payconiq: de export op de site noemt geen enkele payoutId. Die export moet opnieuw. */
  | "PAYCONIQ_WITHOUT_PAYOUT_ID"
  /** Geen uitbetaling met die referentie: de export van die periode staat er (nog) niet. */
  | "NOT_FOUND";

export type BankMatch = { payoutKey: string; reference: string } | { payoutKey: null; reason: UnmatchedReason };

/**
 * Een regel van een provider aan een uitbetaling van de site koppelen, op de
 * referentie en nooit op dag en bedrag: wanneer Payconiq een dag afsluit,
 * hangt af van de soort winkel (Ticketsysteem van middag tot middag, de
 * stickers per dag in UTC), en twee gelijke bedragen op een dag zijn geen
 * uitzondering. `known` zijn de uitbetalingen van de site, op `payoutKey`, met
 * hun referentie zoals ze op de site staat.
 */
export function matchBankLine(
  line: Pick<ParsedBankLine, "provider" | "reference">,
  known: ReadonlyMap<string, string>,
  payconiqHasPayoutIds: boolean,
): BankMatch {
  if (!line.reference) return { payoutKey: null, reason: "NO_REFERENCE" };
  const key = payoutKey(line.provider, line.reference);
  const reference = known.get(key);
  if (reference !== undefined) return { payoutKey: key, reference };
  if (line.provider === "PAYCONIQ" && !payconiqHasPayoutIds) return { payoutKey: null, reason: "PAYCONIQ_WITHOUT_PAYOUT_ID" };
  return { payoutKey: null, reason: "NOT_FOUND" };
}

// -----------------------------------------------------------------------------
// De volgende bankdag
// -----------------------------------------------------------------------------

/** Paaszondag van een jaar (Gregoriaans, het algoritme van Meeus). */
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Of de banken die dag overschrijven: geen weekend en geen sluitingsdag van
 * TARGET2 (1 januari, Goede Vrijdag, Paasmaandag, 1 mei, 25 en 26 december).
 */
export function isBankingDay(day: string): boolean {
  const ymd = parseYMD(day);
  if (!ymd) return false;
  const weekday = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const md = day.slice(5);
  if (md === "01-01" || md === "05-01" || md === "12-25" || md === "12-26") return false;
  const sunday = parseYMD(easter(ymd.year))!;
  return day !== ymdKey(shiftYMD(sunday, -2)) && day !== ymdKey(shiftYMD(sunday, 1));
}

/**
 * De bankdag na een verkoop: zo betalen SumUp, Payconiq en Europabank uit
 * (gezien op de afschriften van het derde kwartaal van 2026: een verkoop op
 * vrijdag, zaterdag of zondag staat er maandag). Een schatting: de dag van een
 * gekoppelde bankregel of van de uitbetaling zelf gaat altijd voor.
 */
export function nextBankingDay(day: string): string {
  let ymd = shiftYMD(parseYMD(day)!, 1);
  while (!isBankingDay(ymdKey(ymd))) ymd = shiftYMD(ymd, 1);
  return ymdKey(ymd);
}

// -----------------------------------------------------------------------------
// Per rekening afstemmen
// -----------------------------------------------------------------------------

/** Een transactie van SumUp, Payconiq of Europabank, voor de afstemming. */
export type ReconRow = {
  source: Exclude<BankProvider, "MOLLIE">;
  /** De rekening van het kanaal op de dag van de verkoop, genormaliseerd; null = niet ingesteld. */
  account: string | null;
  /** De Brusselse kalenderdag van de verkoop: daarop telt ze in een periode. */
  saleDay: string;
  /** Elke regel, ook wat niet meetelt en de kosten: het geld kwam toch op de bank, of ging eraf. */
  amountCents: number;
  /** De sleutel van haar uitbetaling (`payoutKey`), of null. */
  payout: string | null;
};

/** Een overschrijving van Mollie: die vergelijkt de afstemming, niet de betalingen erachter. */
export type ReconTransfer = { account: string | null; paidOn: string; amountCents: number; payout: string };

/** Een bankregel, zonder dubbels, met haar koppeling. */
export type ReconLine = { account: string; bookedOn: string; amountCents: number; payout: string | null };

export type ReconPart = { cents: number; count: number; estimated: number };

export type AccountRecon = {
  account: string;
  /** Een afschrift dekt elke dag van de periode: pas dan is er een oordeel. */
  covered: boolean;
  /** Verkocht in de periode (SumUp, Payconiq, Europabank), alles samen. */
  sold: ReconPart;
  /** Verkocht in de periode, op de bank na de periode. */
  laterOut: ReconPart;
  /** Op de bank in de periode, verkocht ervoor. */
  earlierIn: ReconPart;
  /** De overschrijvingen van Mollie op de bank in de periode. */
  mollie: ReconPart;
  expected: number;
  /** Wat de regels van providers op het afschrift samen zijn. */
  bank: number;
  bankCount: number;
  difference: number;
  /** Overschrijvingen met de hand: geen regel van een provider, dus enkel ter info. */
  byHand: number;
};

/**
 * Per rekening: wat de site verwacht op de bank in de periode, naast wat de
 * regels van providers op het afschrift zijn.
 *
 *   verwacht = verkocht in de periode
 *            - verkocht in de periode, op de bank erna
 *            + verkocht ervoor, op de bank in de periode
 *            + de overschrijvingen van Mollie in de periode
 *
 * Een verkoop telt in de periode van haar kalenderdag (Beheer, november 2026),
 * maar haar geld komt een bankdag later: wat op de laatste dag(en) verkocht
 * werd, staat op het afschrift van de volgende periode, en de eerste dagen van
 * deze brengen het geld van de vorige. Dat zijn geen verschillen; pas wat
 * overblijft, is er een. Per regel en niet per uitbetaling: één uitbetaling kan
 * verkopen van twee periodes dragen.
 *
 * De dag waarop een regel op de bank komt: die van de bankregel van haar
 * uitbetaling, anders de dag van de uitbetaling zelf (SumUp, Europabank), en
 * anders de volgende bankdag, als schatting (`estimated`).
 */
export function reconcileAccounts(input: {
  /** "2026-07-01" en "2026-09-30" */
  from: string;
  to: string;
  rows: readonly ReconRow[];
  transfers: readonly ReconTransfer[];
  /** De dag van een uitbetaling volgens de provider, op `payoutKey`. */
  payoutDays: ReadonlyMap<string, string>;
  lines: readonly ReconLine[];
  /** Per rekening de dagen die een afschrift dekt. */
  coverage: ReadonlyMap<string, ReadonlyArray<{ from: string; to: string }>>;
  /** Overschrijvingen met de hand in de periode, per rekening. */
  byHand: ReadonlyMap<string, number>;
}): AccountRecon[] {
  const lineDay = new Map<string, string>();
  for (const line of input.lines) {
    if (!line.payout) continue;
    const known = lineDay.get(line.payout);
    if (!known || line.bookedOn < known) lineDay.set(line.payout, line.bookedOn);
  }
  const inPeriod = (day: string) => input.from <= day && day <= input.to;
  const empty = (): ReconPart => ({ cents: 0, count: 0, estimated: 0 });
  const result = new Map<string, AccountRecon>();
  const accountOf = (account: string) => {
    let recon = result.get(account);
    if (!recon) {
      recon = {
        account,
        covered: isCovered(input.coverage.get(account) ?? [], input.from, input.to),
        sold: empty(),
        laterOut: empty(),
        earlierIn: empty(),
        mollie: empty(),
        expected: 0,
        bank: 0,
        bankCount: 0,
        difference: 0,
        byHand: input.byHand.get(account) ?? 0,
      };
      result.set(account, recon);
    }
    return recon;
  };
  const add = (part: ReconPart, cents: number, estimated: boolean) => {
    part.cents += cents;
    part.count += 1;
    if (estimated) part.estimated += 1;
  };

  for (const row of input.rows) {
    if (!row.account) continue;
    const real = row.payout ? (lineDay.get(row.payout) ?? input.payoutDays.get(row.payout)) : undefined;
    const bankDay = real ?? nextBankingDay(row.saleDay);
    const estimated = real === undefined;
    const sold = inPeriod(row.saleDay);
    const banked = inPeriod(bankDay);
    if (!sold && !banked) continue;
    const recon = accountOf(row.account);
    if (sold) add(recon.sold, row.amountCents, false);
    if (sold && bankDay > input.to) add(recon.laterOut, row.amountCents, estimated);
    if (!sold && banked && row.saleDay < input.from) add(recon.earlierIn, row.amountCents, estimated);
  }
  for (const transfer of input.transfers) {
    if (!transfer.account) continue;
    const bankDay = lineDay.get(transfer.payout) ?? transfer.paidOn;
    if (!inPeriod(bankDay)) continue;
    add(accountOf(transfer.account).mollie, transfer.amountCents, false);
  }
  for (const line of input.lines) {
    if (!inPeriod(line.bookedOn)) continue;
    const recon = accountOf(line.account);
    recon.bank += line.amountCents;
    recon.bankCount += 1;
  }
  for (const [account] of input.byHand) accountOf(account);
  for (const recon of result.values()) {
    recon.expected = recon.sold.cents - recon.laterOut.cents + recon.earlierIn.cents + recon.mollie.cents;
    recon.difference = recon.bank - recon.expected;
  }
  return [...result.values()].sort((a, b) => a.account.localeCompare(b.account));
}

/** Of de afschriften samen elke dag van `from` tot en met `to` dekken. */
export function isCovered(ranges: ReadonlyArray<{ from: string; to: string }>, from: string, to: string): boolean {
  let reached = from;
  for (const range of [...ranges].sort((a, b) => a.from.localeCompare(b.from))) {
    if (range.from > reached) break;
    if (range.to >= reached) reached = ymdKey(shiftYMD(parseYMD(range.to)!, 1));
    if (reached > to) return true;
  }
  return reached > to;
}
