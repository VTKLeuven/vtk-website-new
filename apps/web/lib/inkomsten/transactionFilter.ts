/**
 * De filter van /admin/inkomsten/transacties, gelezen uit de URL. Dezelfde
 * functies lezen de filter wanneer Beheer "alles wat aan de filter voldoet"
 * een code geeft: zo raakt de actie precies de rijen die het scherm telde.
 */
import type { Prisma } from "@prisma/client";
import { brusselsWallClockMinutes, parseYMD, shiftYMD, ymdKey } from "@/lib/brussels";
import { INCOME_SOURCES, REVIEW_DAY_START_HOUR } from "./overview";
import { monthToDate, parseMonth, type IncomeKindCode, type IncomeSourceCode } from "./parse";

export type IncomeRuleCode = "MANUAL" | "WEBSITE" | "CODE_IN_TEXT" | "NAME_RULE" | "CHANNEL_DEFAULT" | "CASH_REGISTER";

/** Een stand ("na te kijken") of de regel die de code gaf; samen één keuzelijst. */
export type TransactionState =
  | { type: "all" }
  | { type: "open" }
  | { type: "matched" }
  | { type: "excluded" }
  | { type: "rule"; rule: IncomeRuleCode };

export type TransactionFilter = {
  source: IncomeSourceCode | null;
  channelId: string | null;
  state: TransactionState;
  kind: IncomeKindCode | null;
  from: string | null;
  to: string | null;
  /** "2026-10-09": de dag zoals in Na te kijken, van 9:00 tot 9:00 de ochtend erna. */
  day: string | null;
  /** Een volledige code, het begin van een nummer, of een stuk van de naam: zie `codeWhere`. */
  code: string | null;
  query: string | null;
};

/** `?status=` in de URL. De regels staan in de volgorde van de koppeling. */
export const STATE_PARAMS: Record<string, TransactionState> = {
  "na-te-kijken": { type: "open" },
  gekoppeld: { type: "matched" },
  "telt-niet-mee": { type: "excluded" },
  "met-de-hand": { type: "rule", rule: "MANUAL" },
  site: { type: "rule", rule: "WEBSITE" },
  "code-in-tekst": { type: "rule", rule: "CODE_IN_TEXT" },
  "onthouden-tekst": { type: "rule", rule: "NAME_RULE" },
  kassa: { type: "rule", rule: "CASH_REGISTER" },
  standaardcode: { type: "rule", rule: "CHANNEL_DEFAULT" },
};

/** `?soort=` in de URL. */
export const KIND_PARAMS: Record<string, IncomeKindCode> = {
  betaling: "PAYMENT",
  terugbetaling: "REFUND",
  kosten: "FEE",
  reserve: "RESERVE",
};

/** Wat met de hand een code kan krijgen: kosten en reserve hebben hun eigen regel. */
export const ASSIGNABLE_KINDS: readonly IncomeKindCode[] = ["PAYMENT", "REFUND"];

/** De filter uit de parameters van de URL, of uit de velden van een formulier. */
export function parseTransactionFilter(get: (key: string) => string): TransactionFilter {
  const source = get("bron").toUpperCase();
  return {
    source: INCOME_SOURCES.find((candidate) => candidate === source) ?? null,
    channelId: get("kanaal").trim() || null,
    state: Object.hasOwn(STATE_PARAMS, get("status")) ? STATE_PARAMS[get("status")] : { type: "all" },
    kind: Object.hasOwn(KIND_PARAMS, get("soort")) ? KIND_PARAMS[get("soort")] : null,
    from: parseMonth(get("van")),
    to: parseMonth(get("tot")),
    day: dayParam(get("dag")),
    code: get("code").trim() || null,
    query: get("q").trim().slice(0, 100) || null,
  };
}

function dayParam(value: string): string | null {
  const ymd = parseYMD(value);
  return ymd ? ymdKey(ymd) : null;
}

/** Een `URLSearchParams` of de `searchParams` van een pagina, als `get`. */
export function paramGetter(params: URLSearchParams | Record<string, string | string[] | undefined>): (key: string) => string {
  if (params instanceof URLSearchParams) return (key) => params.get(key) ?? "";
  return (key) => (typeof params[key] === "string" ? (params[key] as string) : "");
}

/** Wat een stand vraagt, los van de rest van de filter. */
function stateWhere(state: TransactionState): Prisma.IncomeTransactionWhereInput {
  switch (state.type) {
    case "open":
      return { rule: null, excluded: false, kind: { in: [...ASSIGNABLE_KINDS] } };
    case "matched":
      return { rule: { not: null }, excluded: false };
    case "excluded":
      return { excluded: true };
    case "rule":
      return { rule: state.rule, excluded: false };
    case "all":
      return {};
  }
}

/**
 * Wat het veld Code vraagt. Een volledige code ("700100" of "700100 10002") is
 * die code en niets anders: zo linkt een rij van het overzicht hierheen, en dan
 * moet het totaal bovenaan hetzelfde zijn als in die rij, ook wanneer 700100 en
 * haar subcodes elk een eigen rij hebben. Aaneen getypt ("70010010002", zoals
 * een code vroeger stond) zijn het beide schrijfwijzen. Een deel van een nummer
 * ("7001") is het begin van de code, en wat letters heeft ("theokot") zoekt in
 * de naam.
 */
export function codeWhere(value: string): Prisma.IncomeTransactionWhereInput {
  const text = value.replace(/\s+/g, " ").trim();
  const digits = text.replace(/ /g, "");
  if (!/^\d+$/.test(digits)) return { accountingCodeName: { contains: text, mode: "insensitive" } };
  if (/^\d{6}( \d{5})?$/.test(text)) return { accountingCode: text };
  // Zoals het register de code schrijft: zes cijfers, een spatie, de rest.
  const spaced = digits.length > 6 ? `${digits.slice(0, 6)} ${digits.slice(6)}` : digits;
  if (digits.length === 11) return { accountingCode: { in: [spaced, digits] } };
  return { accountingCode: { startsWith: spaced } };
}

/** Een dag zoals in Na te kijken: van 9:00 tot 9:00 de ochtend erna, op de Brusselse klok. */
function dayWhere(day: string): Prisma.IncomeTransactionWhereInput {
  const ymd = parseYMD(day);
  if (!ymd) return {};
  return {
    occurredAt: {
      gte: brusselsWallClockMinutes(ymd, REVIEW_DAY_START_HOUR * 60),
      lt: brusselsWallClockMinutes(shiftYMD(ymd, 1), REVIEW_DAY_START_HOUR * 60),
    },
  };
}

export function transactionWhere(filter: TransactionFilter): Prisma.IncomeTransactionWhereInput {
  return {
    // Een stand en een soort samen ("na te kijken" en "kosten") moeten allebei
    // gelden; in één object zou de ene `kind` de andere overschrijven.
    AND: [stateWhere(filter.state), filter.kind ? { kind: filter.kind } : {}],
    ...(filter.source ? { source: filter.source } : {}),
    ...(filter.channelId ? { channelId: filter.channelId } : {}),
    ...(filter.from || filter.to
      ? {
          periodMonth: {
            ...(filter.from ? { gte: monthToDate(filter.from) } : {}),
            ...(filter.to ? { lte: monthToDate(filter.to) } : {}),
          },
        }
      : {}),
    ...(filter.day ? dayWhere(filter.day) : {}),
    ...(filter.code ? codeWhere(filter.code) : {}),
    ...(filter.query
      ? {
          OR: [
            { description: { contains: filter.query, mode: "insensitive" as const } },
            { providerId: { contains: filter.query } },
            { reference: { contains: filter.query } },
            { payoutReference: { contains: filter.query } },
          ],
        }
      : {}),
  };
}
