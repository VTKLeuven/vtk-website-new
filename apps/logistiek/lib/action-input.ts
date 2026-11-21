/**
 * Een eerste toets op wat een ledenactie binnenkrijgt (S6 uit de audit van
 * november 2026).
 *
 * TypeScript typeert de invoer van een server action, maar wie de action
 * rechtstreeks aanroept, stuurt wat hij wil. `input.name.trim()` op een getal
 * gooide een 500, en een lijst `lines` of `hours` had geen bovengrens. Twee
 * lagen, allebei goedkoop:
 *
 * - `inputProblem` aan de rand van elke ledenactie (de wrappers onderaan
 *   `app/actions/uitleen.ts`): enkel gewone JSON-waarden, niet te diep, geen
 *   reuzentekst en geen lijst van duizenden. Wat daarbuiten valt, krijgt een
 *   gewone foutmelding in plaats van de foutpagina.
 * - `str` waar de code een veld als tekst gebruikt: een veld dat geen tekst is,
 *   wordt een lege tekst, en dan vangt de gewone controle het op ("Geef het
 *   sjabloon een naam").
 */

export const INPUT_LIMITS = {
  /** Langer dan een nota ooit mag zijn; de velden zelf knippen strenger. */
  maxString: 10_000,
  /** Meer lijnen dan een aanvraag ooit heeft (de catalogus telt er minder). */
  maxArray: 400,
  maxDepth: 6,
};

/** De tekst, of een lege tekst wanneer het geen tekst is. */
export function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** De lijst, of een lege lijst wanneer het geen lijst is. */
export function list<T>(value: readonly T[] | null | undefined): T[] {
  return Array.isArray(value) ? [...value] : [];
}

/**
 * Een aantal-lijn uit een formulier: een item-id als tekst en een positief geheel
 * aantal. Een lijn die daar niet aan voldoet, valt weg zoals een lege rij.
 */
export function isQuantityLine<T extends { itemId: unknown; quantity: unknown }>(
  line: T | null | undefined
): line is T & { itemId: string; quantity: number } {
  return (
    typeof line === 'object' &&
    line !== null &&
    typeof line.itemId === 'string' &&
    Number.isInteger(line.quantity) &&
    (line.quantity as number) > 0
  );
}

/** `null` als de invoer gewone, redelijke data is; anders waarom niet. */
export function inputProblem(value: unknown, depth = 0): 'too_deep' | 'too_long' | 'too_many' | 'invalid' | null {
  if (depth > INPUT_LIMITS.maxDepth) return 'too_deep';
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : 'invalid';
  if (typeof value === 'string') return value.length > INPUT_LIMITS.maxString ? 'too_long' : null;
  if (Array.isArray(value)) {
    if (value.length > INPUT_LIMITS.maxArray) return 'too_many';
    for (const entry of value) {
      const problem = inputProblem(entry, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return 'invalid';
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > INPUT_LIMITS.maxArray) return 'too_many';
    for (const [, entry] of entries) {
      const problem = inputProblem(entry, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  return 'invalid';
}
