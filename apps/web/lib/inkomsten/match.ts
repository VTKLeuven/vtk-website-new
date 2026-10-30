/**
 * De koppelregels van /admin/inkomsten, als pure functie. Per transactie wint de
 * eerste regel die past:
 *
 *   1. met de hand (raakt deze functie nooit: de beller slaat die over);
 *   2. een betaling van de site, op haar betaal-ID;
 *   3. een boekhoudcode in de omschrijving, de referentie of de `bulk_id`;
 *   4. een kassa die het toestel had, met haar code;
 *   5. een tekst die Beheer onthield;
 *   6. de standaardcode van het kanaal;
 *   7. anders: Na te kijken (`null`).
 *
 * Zie docs/inkomsten.md.
 */
import { brusselsMinutesOfDay, brusselsYMD, ymdKey } from "@/lib/brussels";
import type { IncomeKindCode, IncomeSourceCode } from "./parse";

/**
 * Een dag in Na te kijken (en voor de uitloop van een avondkassa) loopt van
 * 9:00 tot 9:00 de volgende ochtend op de Brusselse klok.
 */
export const REVIEW_DAY_START_HOUR = 9;

export function reviewDay(at: Date): string {
  const ymd = brusselsYMD(at);
  if (brusselsMinutesOfDay(at) >= REVIEW_DAY_START_HOUR * 60) return ymdKey(ymd);
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day - 1)).toISOString().slice(0, 10);
}

export type IncomeRuleCode = "MANUAL" | "WEBSITE" | "CODE_IN_TEXT" | "NAME_RULE" | "CHANNEL_DEFAULT" | "CASH_REGISTER";

export type CodeSnapshot = { code: string; name: string };

/** Een standaardcode vanaf een dag ("2026-09-30"). `code` null: vanaf die dag geen. */
export type ChannelCodeEntry = { from: string; code: CodeSnapshot | null };

/**
 * Een aanvaarde kassa op het toestel van een kanaal: haar uren (of de hele dag
 * zonder uren) en haar code. `code` null: Beheer koos er nog geen.
 */
export type KassaSpan = { id: string; start: Date; end: Date; code: CodeSnapshot | null };

/** Een betaling van de site, met de code die in haar betaalinfo stond. */
export type WebsitePayment = {
  code: string | null;
  name: string | null;
  ticketPaymentId?: string;
  membershipPaymentId?: string;
  uitleenPaymentId?: string;
};

export type MatchContext = {
  /** Betalingen van de site per betaal-ID, voor de bron van de export. */
  website: ReadonlyMap<string, WebsitePayment>;
  /** De codes uit het register, op hun cijfers zonder spatie ("70012012002"). */
  codes: ReadonlyMap<string, CodeSnapshot>;
  /** Onthouden teksten, op `nameRuleKey`. */
  nameRules: ReadonlyMap<string, CodeSnapshot>;
  /** Per kanaal-id de standaardcodes met hun vanaf-dag, voor de kanalen die er hebben. */
  channelCodes: ReadonlyMap<string, readonly ChannelCodeEntry[]>;
  /** Per kanaal-id met een toestel: de aanvaarde kassa's met dat toestel. */
  cashRegisters: ReadonlyMap<string, readonly KassaSpan[]>;
};

export type MatchInput = {
  source: IncomeSourceCode;
  kind: IncomeKindCode;
  providerId: string | null;
  description: string | null;
  reference: string | null;
  bulkId: string | null;
  channelId: string | null;
  /** Voor de kassa en de standaardcode van dat moment, op de Brusselse klok. */
  occurredAt: Date;
};

export type MatchResult = {
  rule: Exclude<IncomeRuleCode, "MANUAL"> | null;
  code: CodeSnapshot | null;
  ticketPaymentId: string | null;
  membershipPaymentId: string | null;
  uitleenPaymentId: string | null;
  /** De kassa waarvan de code komt (regel 4). */
  cashRegisterId: string | null;
};

/** De sleutel waarop het register een code opzoekt: enkel cijfers. */
export function codeKey(code: string): string {
  return code.replace(/\D/g, "");
}

/**
 * De standaardcode van een kanaal op een dag: die van de laatste regel op of
 * voor die dag, zoals de rekening (`accountOn`). Voor de eerste regel, of
 * vanaf een regel zonder code, heeft het kanaal er geen.
 */
export function channelCodeOn(entries: readonly ChannelCodeEntry[], day: string): CodeSnapshot | null {
  let best: ChannelCodeEntry | null = null;
  for (const entry of entries) {
    if (entry.from <= day && (!best || entry.from > best.from)) best = entry;
  }
  return best?.code ?? null;
}

/**
 * De kassa die het toestel had op een moment. Een toestel van een post (een
 * kanaal met een standaardcode op die dag: de SumUp van Theokot) hoort enkel
 * tijdens haar uren bij een kassa; daarvoor en daarna geldt de standaardcode
 * weer. Een gedeeld toestel (de stickers en de terminal van evenementen) hoort
 * bij een kassa tijdens haar uren plus de uitloop van diezelfde avond/nacht
 * (tot 9:00 de ochtend erna, zolang er geen volgende kassa begon). Wat op een
 * andere dag buiten een kassa binnenkomt, gaat naar Na te kijken.
 */
export function kassaAt(spans: readonly KassaSpan[], at: Date, postDevice: boolean): KassaSpan | null {
  const active = spans.find((span) => span.start <= at && at < span.end);
  if (active || postDevice) return active ?? null;
  let latest: KassaSpan | null = null;
  for (const span of spans) {
    if (span.start <= at && (!latest || span.start > latest.start)) latest = span;
  }
  if (!latest) return null;
  const endMoment = new Date(Math.max(latest.start.getTime(), latest.end.getTime() - 1));
  return reviewDay(at) === reviewDay(endMoment) ? latest : null;
}

/**
 * De tekst waarop een onthouden toewijzing werkt: zonder ordernummer, zodat één
 * keer toewijzen voor elke volgende betaling geldt.
 *
 *   "BE3A8577 - 1 ticket(s) for event Onthaaldagen"  -> "onthaaldagen"
 *   "Oktoberfest - VTK-26-4A15A3AB89"                 -> "oktoberfest"
 *   "VTK uitleendienst - 3F9A21BC"                    -> "vtk uitleendienst"
 *   "Uniflow Printer Credit"                          -> "uniflow printer credit"
 */
export function incomeRuleText(description: string | null): string | null {
  return incomeRuleLabel(description)?.toLocaleLowerCase("nl-BE") ?? null;
}

/** Dezelfde tekst, met de hoofdletters zoals ze in de export stonden: om te tonen. */
export function incomeRuleLabel(description: string | null): string | null {
  if (!description) return null;
  let text = description.trim();
  const event = /\bfor event (.+)$/i.exec(text);
  if (event) text = event[1];
  // Een ordernummer achteraan: een token met minstens één cijfer, na " - ".
  text = text.replace(/\s+-\s+(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{6,}$/, "");
  text = text.replace(/\s+/g, " ").trim();
  return text || null;
}

export function nameRuleKey(source: IncomeSourceCode, text: string): string {
  return `${source}:${text}`;
}

/**
 * Een boekhoudcode vooraan in een tekst: "700100 10001 Cantus" of, zoals ze
 * vroeger aaneen stond, "70010010001 Cantus". Enkel een code die in het
 * register staat, telt.
 */
export function codeAtStart(text: string | null, codes: ReadonlyMap<string, CodeSnapshot>): CodeSnapshot | null {
  if (!text) return null;
  const match = /^\s*(\d{6})(?:[ .]?(\d{5}))?(?!\d)/.exec(text);
  if (!match) return null;
  if (match[2]) {
    const sub = codes.get(match[1] + match[2]);
    if (sub) return sub;
  }
  return codes.get(match[1]) ?? null;
}

/** Een veld dat enkel een code is (de `reference` of `bulk_id` van Bancontact). */
function codeAlone(text: string | null, codes: ReadonlyMap<string, CodeSnapshot>): CodeSnapshot | null {
  if (!text || !/^[\d\s.]+$/.test(text)) return null;
  return codes.get(codeKey(text)) ?? null;
}

/**
 * Wat het toestel van een betaling op dat moment was: de kassa die het had
 * (regel 4, ook een zonder code) en de standaardcode van het kanaal die dag
 * (regel 6). Na te kijken gebruikt de kassa zonder code als hint.
 */
export function deviceAt(
  input: Pick<MatchInput, "channelId" | "occurredAt">,
  context: Pick<MatchContext, "channelCodes" | "cashRegisters">,
): { kassa: KassaSpan | null; channelCode: CodeSnapshot | null } {
  const entries = input.channelId ? context.channelCodes.get(input.channelId) : undefined;
  const channelCode = entries ? channelCodeOn(entries, ymdKey(brusselsYMD(input.occurredAt))) : null;
  const spans = input.channelId ? context.cashRegisters.get(input.channelId) : undefined;
  const kassa = spans?.length ? kassaAt(spans, input.occurredAt, channelCode !== null) : null;
  return { kassa, channelCode };
}

export function matchTransaction(input: MatchInput, context: MatchContext): MatchResult {
  const none: MatchResult = {
    rule: null,
    code: null,
    ticketPaymentId: null,
    membershipPaymentId: null,
    uitleenPaymentId: null,
    cashRegisterId: null,
  };
  if (input.kind !== "PAYMENT" && input.kind !== "REFUND") return none;

  // 2. Een betaling van de site. Ook zonder code (de uitleendienst) blijft de
  // link naar de betaling staan; de code komt dan uit een onthouden tekst.
  const website = input.providerId ? context.website.get(input.providerId) : undefined;
  const links = {
    ticketPaymentId: website?.ticketPaymentId ?? null,
    membershipPaymentId: website?.membershipPaymentId ?? null,
    uitleenPaymentId: website?.uitleenPaymentId ?? null,
    cashRegisterId: null,
  };
  if (website?.code) {
    return { ...links, rule: "WEBSITE", code: { code: website.code, name: website.name ?? website.code } };
  }

  // 3. De code in de tekst.
  const inText =
    codeAtStart(input.description, context.codes) ??
    codeAlone(input.reference, context.codes) ??
    codeAlone(input.bulkId, context.codes);
  if (inText) return { ...links, rule: "CODE_IN_TEXT", code: inText };

  // 4. Een kassa die het toestel had. Een kassa zonder code koppelt niets: wat
  // ze had, valt door naar de regels hieronder.
  const { kassa, channelCode } = deviceAt(input, context);
  if (kassa?.code) return { ...links, rule: "CASH_REGISTER", code: kassa.code, cashRegisterId: kassa.id };

  // 5. Een onthouden tekst.
  const text = incomeRuleText(input.description);
  const remembered = text ? context.nameRules.get(nameRuleKey(input.source, text)) : undefined;
  if (remembered) return { ...links, rule: "NAME_RULE", code: remembered };

  // 6. De standaardcode van het kanaal op de dag van de betaling.
  if (channelCode) return { ...links, rule: "CHANNEL_DEFAULT", code: channelCode };

  return { ...none, ...links };
}
