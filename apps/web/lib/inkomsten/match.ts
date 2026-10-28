/**
 * De koppelregels van /admin/inkomsten, als pure functie. Per transactie wint de
 * eerste regel die past:
 *
 *   1. met de hand (raakt deze functie nooit: de beller slaat die over);
 *   2. een betaling van de site, op haar betaal-ID;
 *   3. een boekhoudcode in de omschrijving, de referentie of de `bulk_id`;
 *   5. een tekst die Beheer onthield;
 *   6. het kanaal stort op de eigen rekening van een post: telt niet mee;
 *   7. anders: Na te kijken (`null`).
 *
 * Regel 4 (de kassa's) komt in fase 2; dan telt ook een kassa van een andere
 * post op zo'n kanaal weer mee.
 * Zie docs/inkomsten.md.
 */
import type { IncomeKindCode, IncomeSourceCode } from "./parse";

export type IncomeRuleCode = "MANUAL" | "WEBSITE" | "CODE_IN_TEXT" | "NAME_RULE" | "OWN_ACCOUNT";

export type CodeSnapshot = { code: string; name: string };

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
  /** Kanalen die op de eigen rekening van een post storten: kanaal-id naar post. */
  ownAccountChannels: ReadonlyMap<string, string>;
};

export type MatchInput = {
  source: IncomeSourceCode;
  kind: IncomeKindCode;
  providerId: string | null;
  description: string | null;
  reference: string | null;
  bulkId: string | null;
  channelId: string | null;
};

export type MatchResult = {
  rule: Exclude<IncomeRuleCode, "MANUAL"> | null;
  code: CodeSnapshot | null;
  ticketPaymentId: string | null;
  membershipPaymentId: string | null;
  uitleenPaymentId: string | null;
};

/** De sleutel waarop het register een code opzoekt: enkel cijfers. */
export function codeKey(code: string): string {
  return code.replace(/\D/g, "");
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

export function matchTransaction(input: MatchInput, context: MatchContext): MatchResult {
  const none: MatchResult = {
    rule: null,
    code: null,
    ticketPaymentId: null,
    membershipPaymentId: null,
    uitleenPaymentId: null,
  };
  if (input.kind !== "PAYMENT" && input.kind !== "REFUND") return none;

  // 2. Een betaling van de site. Ook zonder code (de uitleendienst) blijft de
  // link naar de betaling staan; de code komt dan uit een onthouden tekst.
  const website = input.providerId ? context.website.get(input.providerId) : undefined;
  const links = {
    ticketPaymentId: website?.ticketPaymentId ?? null,
    membershipPaymentId: website?.membershipPaymentId ?? null,
    uitleenPaymentId: website?.uitleenPaymentId ?? null,
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

  // 5. Een onthouden tekst.
  const text = incomeRuleText(input.description);
  const remembered = text ? context.nameRules.get(nameRuleKey(input.source, text)) : undefined;
  if (remembered) return { ...links, rule: "NAME_RULE", code: remembered };

  // 6. Het kanaal stort op de eigen rekening van een post: geen code, telt niet mee.
  if (input.channelId && context.ownAccountChannels.has(input.channelId)) {
    return { ...links, rule: "OWN_ACCOUNT", code: null };
  }

  return { ...none, ...links };
}
