/**
 * De vaste set omzettingen tussen een veld in de database en de waarde die in
 * een token belandt.
 *
 * Twee regels, en ze zijn allebei belangrijk:
 *
 * 1. Elke transformer is null-safe en totaal. Krijgt hij `null`, dan geeft hij
 *    `null` terug en valt de claim gewoon weg. Een transformer die kan gooien,
 *    legt het uitgeven van tokens plat voor élke client omdat één claim stuk is.
 * 2. De set is gesloten. Een nieuwe omzetting toevoegen is een codewijziging,
 *    en dat is precies de bedoeling: dit is de plek waar iemand meeleest voor
 *    er nieuwe logica op ledengegevens losgelaten wordt.
 */
export type TransformerName =
  | 'identity'
  | 'string'
  | 'boolean'
  | 'isNotNull'
  | 'unixSeconds'
  | 'isoDate'
  | 'localPart'
  | 'storageUrl'
  | 'bcp47'
  | 'enumArray'
  | 'enumValue'
  | 'count'
  | 'redactExceptLast';

export type TransformerArgs = { keep?: number };

/** Absolute URL: een relatief pad heeft een externe client niets aan. */
function storageUrl(key: string): string {
  const path = key.split('/').map(encodeURIComponent).join('/');
  return `${process.env.BETTER_AUTH_URL ?? ''}/api/media/${path}`;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

const TRANSFORMERS: Record<TransformerName, (value: unknown, args?: TransformerArgs) => unknown> = {
  identity: (value) => value,

  string: (value) => (value == null ? null : String(value)),

  boolean: (value) => (value == null ? null : Boolean(value)),

  // Bewust niet null-doorlatend: "is dit veld ingevuld" is ook een antwoord
  // wanneer het veld leeg is.
  isNotNull: (value) => value != null,

  unixSeconds: (value) => {
    const date = toDate(value);
    return date ? Math.floor(date.getTime() / 1000) : null;
  },

  isoDate: (value) => {
    const date = toDate(value);
    return date ? date.toISOString().slice(0, 10) : null;
  },

  localPart: (value) => (typeof value === 'string' ? (value.split('@')[0] ?? null) : null),

  storageUrl: (value) => (typeof value === 'string' && value ? storageUrl(value) : null),

  // NL -> nl-BE, EN -> en; VTK is Belgisch, dus de regiovariant hoort erbij.
  bcp47: (value) => {
    if (typeof value !== 'string') return null;
    const upper = value.toUpperCase();
    if (upper === 'NL') return 'nl-BE';
    if (upper === 'EN') return 'en';
    return value.toLowerCase();
  },

  enumArray: (value) =>
    Array.isArray(value) ? value.filter((item) => item != null).map((item) => String(item).toLowerCase()) : null,

  enumValue: (value) => (value == null ? null : String(value).toLowerCase()),

  count: (value) => (Array.isArray(value) ? value.length : null),

  // r0123456 -> ****3456. Voor een claim die enkel hoeft te tonen dat er een
  // nummer is, zonder het weg te geven.
  redactExceptLast: (value, args) => {
    if (typeof value !== 'string' || !value) return null;
    const keep = args?.keep ?? 4;
    if (value.length <= keep) return value;
    return `${'*'.repeat(value.length - keep)}${value.slice(-keep)}`;
  },
};

/**
 * Past een transformer toe. Gooit nooit: een onbekende naam of een fout in de
 * omzetting laat de claim vallen in plaats van het token te breken.
 */
export function transform(value: unknown, name: TransformerName, args?: TransformerArgs): unknown {
  const fn = TRANSFORMERS[name];
  if (!fn) return null;
  try {
    return fn(value, args);
  } catch {
    return null;
  }
}

export const TRANSFORMER_NAMES = Object.keys(TRANSFORMERS) as TransformerName[];
