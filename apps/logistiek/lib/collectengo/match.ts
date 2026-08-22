/**
 * Een productnaam uit een Collect&Go-mail koppelen aan een flesserke-item.
 *
 * Colruyt schrijft "BONI Choco Bubbles 750g"; in onze catalogus staat dat als
 * naam "Choco Bubbles", merk "BONI", inhoud 750 g. Zonder die splitsing vindt
 * een letterlijke vergelijking bijna niets terug en maakt elke import dubbele
 * items aan.
 *
 * Alles hier is een **voorstel**: het importscherm laat de keuze altijd zien en
 * het team bevestigt. Zie docs/design-decisions.md.
 *
 * Puur en zonder database, zodat het in een unit test kan.
 */

import { CONTENT_UNITS } from '../uitleen';

export type ProductNameParts = {
  brand: string | null;
  name: string;
  contentAmount: string | null;
  contentUnit: string | null;
};

export type MatchCandidate = {
  id: string;
  name: string;
  brand: string | null;
  contentAmount: string | null;
  contentUnit: string | null;
};

export type MatchConfidence = 'REMEMBERED' | 'EXACT' | 'FUZZY';

export type MatchSuggestion = {
  itemId: string;
  confidence: MatchConfidence;
  /** 0-1; bij een onthouden of exacte match altijd 1. */
  score: number;
};

/** Merken die Colruyt niet in hoofdletters schrijft en dus niet vanzelf opvallen. */
const KNOWN_BRANDS = ['everyday', 'boni', 'econom', 'vivera', 'stella artois', 'cara', 'strongbow'];

const UNIT_PATTERN = new RegExp(`^(${CONTENT_UNITS.join('|')}|kg|st)$`, 'i');

/** Diakritische tekens en leestekens weg, alles klein: om te vergelijken. */
export function normalizeProductKey(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
    .replace(/ {2,}/g, ' ');
}

/**
 * "BONI Choco Bubbles 750g" → merk BONI, naam "Choco Bubbles", inhoud 750 g.
 *
 * Het merk is de reeks hoofdlettertokens vooraan (hoogstens twee, anders eet een
 * volledig in hoofdletters geschreven naam zichzelf op), aangevuld met de merken
 * die Colruyt in gemengde schrijfwijze zet. De inhoud is het maatgetal achteraan,
 * met de multiplier erbij: "6x100ml" blijft "6x100" + "ml".
 */
export function splitProductName(raw: string): ProductNameParts {
  let rest = raw.trim().replace(/\s{2,}/g, ' ');

  let brand: string | null = null;
  const lower = rest.toLowerCase();
  const known = KNOWN_BRANDS.find((candidate) => lower.startsWith(`${candidate} `));
  if (known) {
    brand = rest.slice(0, known.length);
    rest = rest.slice(known.length).trim();
  } else {
    const tokens = rest.split(' ');
    const capitals: string[] = [];
    for (const token of tokens.slice(0, 2)) {
      if (token.length >= 2 && token === token.toUpperCase() && /[A-Z]/.test(token)) {
        capitals.push(token);
      } else break;
    }
    if (capitals.length > 0 && capitals.length < tokens.length) {
      brand = capitals.join(' ');
      rest = tokens.slice(capitals.length).join(' ');
    }
  }

  let contentAmount: string | null = null;
  let contentUnit: string | null = null;
  const content = rest.match(/\s(\d+(?:[.,]\d+)?(?:x\d+(?:[.,]\d+)?)?)\s*([a-z]+)\.?$/i);
  if (content && UNIT_PATTERN.test(content[2])) {
    contentAmount = content[1];
    contentUnit = content[2].toLowerCase() === 'kg' ? 'kg' : content[2];
    rest = rest.slice(0, content.index).trim();
  }

  return { brand, name: rest || raw.trim(), contentAmount, contentUnit };
}

/** Alle woorden waarop we vergelijken: merk, naam en inhoud samen. */
function tokens(parts: ProductNameParts): Set<string> {
  const content = parts.contentAmount
    ? `${parts.contentAmount}${parts.contentUnit ?? ''}`
    : '';
  const key = normalizeProductKey([parts.brand ?? '', parts.name, content].join(' '));
  return new Set(key.split(' ').filter(Boolean));
}

/** De inhoud als vergelijkbare sleutel: "1,5 L" en "1.5l" zijn hetzelfde. */
function contentKey(parts: ProductNameParts): string {
  if (!parts.contentAmount) return '';
  return normalizeProductKey(`${parts.contentAmount.replace(',', '.')}${parts.contentUnit ?? ''}`);
}

/** Dice-coëfficiënt: hoeveel woorden delen ze, ten opzichte van hun lengte. */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/** Onder deze score is een voorstel meer ruis dan hulp. */
export const FUZZY_THRESHOLD = 0.62;

/**
 * Het beste voorstel voor één mail-lijn, of `null` wanneer niets genoeg lijkt.
 *
 * `remembered` mapt een genormaliseerde productnaam op het item waar diezelfde
 * lijn de vorige keer naartoe ging (`CollectEnGoProductMatch`).
 */
export function suggestFlesserkeItem(
  productName: string,
  items: MatchCandidate[],
  remembered: Map<string, string> = new Map()
): MatchSuggestion | null {
  const key = normalizeProductKey(productName);
  const rememberedId = remembered.get(key);
  if (rememberedId && items.some((item) => item.id === rememberedId)) {
    return { itemId: rememberedId, confidence: 'REMEMBERED', score: 1 };
  }

  const parts = splitProductName(productName);
  const mailTokens = tokens(parts);
  const mailKey = normalizeProductKey(
    [parts.brand ?? '', parts.name].join(' ')
  );

  const mailContent = contentKey(parts);

  let best: MatchSuggestion | null = null;
  for (const item of items) {
    const itemParts: ProductNameParts = {
      brand: item.brand,
      name: item.name,
      contentAmount: item.contentAmount,
      contentUnit: item.contentUnit,
    };
    const itemKey = normalizeProductKey([item.brand ?? '', item.name].join(' '));
    // Naam gelijk, met of zonder merk ervoor.
    const sameName =
      (itemKey !== '' && itemKey === mailKey) ||
      normalizeProductKey(item.name) === normalizeProductKey(parts.name);
    if (sameName) {
      // Dezelfde naam met een andere inhoud is een ander item: een fles van 2 L
      // hoort niet bij het item van 1,5 L. Dan blijft het een voorstel.
      if (contentKey(itemParts) === mailContent) {
        return { itemId: item.id, confidence: 'EXACT', score: 1 };
      }
      if (!best || best.score < 0.9) best = { itemId: item.id, confidence: 'FUZZY', score: 0.9 };
      continue;
    }
    const score = similarity(mailTokens, tokens(itemParts));
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
      best = { itemId: item.id, confidence: 'FUZZY', score };
    }
  }
  return best;
}
