/**
 * Hoe een rit eruitziet in de transportplanning (B4, T7, K1):
 *
 * - de vulkleur is de chauffeur, wie rijdt is de vraag bij het plannen;
 * - de arcering is het voertuig, herkenbaar over de hele week waar een icoon
 *   van 12 px dat niet is;
 * - de rand en de streep zijn de staat: zonder chauffeur neutraal grijs met een
 *   streepjesrand, nog te beslissen een streep bovenaan (`.trip-requested`).
 *
 * De kleur volgt uit een hash van de id, zodat niemand kleuren hoeft te kiezen;
 * het team kan ze overschrijven met een paletkleur (`UitleenDriver.colorIndex`)
 * of een eigen kleur ({@link CustomDriverColor}). De kleuren zelf zijn tokens in
 * `app/design/theme.css` (`--driver-1` tot `--driver-40`).
 */
export const AUTO_COLOR_COUNT = 24;

/**
 * Het aantal kleuren dat het team kan kiezen (F6.7): de 24 van de hash plus 16
 * middentonen die enkel met de hand gekozen worden. **De hash rekent met
 * {@link AUTO_COLOR_COUNT}, nooit met dit getal**: een grotere modulus geeft elke
 * chauffeur zonder gekozen kleur een andere.
 */
export const DRIVER_COLOR_COUNT = 40;

/** De vaste kleur van een toegevoegde chauffeur (Salie): valt met niemand samen en zegt "nog niet gekozen". */
export const NEW_DRIVER_COLOR_INDEX = 24;

/** De namen van het palet, in de volgorde van de tokens, voor tooltip en screenreader. */
export const DRIVER_COLOR_NAMES: readonly string[] = [
  'Hemelblauw',
  'Korenbloem',
  'Staalblauw',
  'Aqua',
  'Turkoois',
  'Mint',
  'Lichtgroen',
  'Grasgroen',
  'Olijf',
  'Limoen',
  'Boter',
  'Amber',
  'Perzik',
  'Zalm',
  'Koraal',
  'Roze',
  'Framboos',
  'Orchidee',
  'Lavendel',
  'Iris',
  'Zand',
  'Klei',
  'Leisteen',
  'Salie',
  // Middentonen (F6.7), enkel te kiezen: ze liggen een stuk donkerder dan de
  // pastels hierboven, zodat ze er niet bijna mee samenvallen.
  'Watermeloen',
  'Mandarijn',
  'Honing',
  'Mosterd',
  'Appel',
  'Jade',
  'Lagune',
  'Oceaan',
  'Kobalt',
  'Viooltje',
  'Pruim',
  'Kers',
  'Terracotta',
  'Dennengroen',
  'Inkt',
  'Aubergine',
];

/** De naam van kleur `index` (1-gebaseerd), of een nummer als terugval. */
export function driverColorName(index: number): string {
  return DRIVER_COLOR_NAMES[index - 1] ?? `Kleur ${index}`;
}

/** Stabiele hash (djb2), dezelfde op de server en in de browser; niet cryptografisch. */
function hash(value: string): number {
  let result = 5381;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) + result + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

/**
 * Een eigen kleur met schuiven: tint (`hue`, 0-359), levendigheid (`chroma`,
 * 0-100) en kracht (`tone`, 0-100). Geen hex, want dezelfde tint moet in de
 * lichte en de donkere modus een andere vulling worden.
 *
 * **Geen vrije helderheid**: de tekst in een blok moet 4.5:1 blijven halen, dus
 * kiezen de schuiven binnen `--driver-l0` tot `--driver-l1` (per modus), en
 * `test/driver-colors.test.ts` rekent dat na over het hele kleurenwiel.
 */
export type CustomDriverColor = {
  hue: number;
  chroma: number;
  tone: number;
};

/** Waar de schuiven staan wanneer iemand een eigen kleur begint te maken. */
export const CUSTOM_COLOR_START: CustomDriverColor = { hue: 200, chroma: 55, tone: 35 };

export const CUSTOM_COLOR_NAME = 'Eigen kleur';

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Ligt dit binnen wat de schuiven kunnen opleveren? Hele getallen, binnen het bereik. */
export function isCustomDriverColor(value: unknown): value is CustomDriverColor {
  if (typeof value !== 'object' || value === null) return false;
  const color = value as Record<string, unknown>;
  return inRange(color.hue, 0, 359) && inRange(color.chroma, 0, 100) && inRange(color.tone, 0, 100);
}

/** De tekst in `UitleenDriver.customColor`, bv. `210,60,35`: één kolom, want een halve kleur bestaat niet. */
export function serializeCustomColor(color: CustomDriverColor): string {
  return `${color.hue},${color.chroma},${color.tone}`;
}

/**
 * Leest `UitleenDriver.customColor` terug; `null` voor alles wat geen kleur is,
 * en dan geldt de paletkleur of de hash. Een blok zonder vulling zou eruitzien
 * als een rit zonder chauffeur.
 */
export function parseCustomColor(value: string | null | undefined): CustomDriverColor | null {
  if (!value) return null;
  const parts = value.split(',');
  if (parts.length !== 3 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const [hue, chroma, tone] = parts.map(Number);
  const color = { hue, chroma, tone };
  return isCustomDriverColor(color) ? color : null;
}

/**
 * De CSS-kleur van een eigen kleur, in `oklch`: daar lijken gelijke stappen ook
 * gelijk, bij `hsl` niet. Helderheid en levendigheid komen uit tokens per modus,
 * dus de kleur wisselt mee met de modus.
 */
export function customColorCss(color: CustomDriverColor): string {
  const tone = color.tone / 100;
  const chroma = color.chroma / 100;
  const lightness = `calc(var(--driver-l0) + (var(--driver-l1) - var(--driver-l0)) * ${tone})`;
  return `oklch(${lightness} calc(var(--driver-c-max) * ${chroma}) ${color.hue})`;
}

/**
 * De keuze van het team voor één chauffeur: een nummer uit het palet, of een
 * eigen kleur. Nooit beide; zie `setDriverColorAction`.
 */
export type DriverColorChoice = number | CustomDriverColor;

/** Kleuren die het team zelf koos, op chauffeur-id; de rest valt terug op de hash. */
export type DriverColorOverrides = Readonly<Record<string, DriverColorChoice>>;

/** Ligt deze keuze binnen de tokens die `app/design/theme.css` kent? */
export function isDriverColorIndex(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= DRIVER_COLOR_COUNT;
}

/**
 * 1 tot en met {@link DRIVER_COLOR_COUNT}, 0 zonder chauffeur. Een gekozen
 * paletkleur wint, een onzinnige waarde valt terug op de hash. **Een eigen kleur
 * heeft geen nummer**: dan geeft dit de hash, en de kleur zelf komt uit
 * {@link driverColorVar}.
 */
export function driverColorIndex(
  driverId: string | null | undefined,
  overrides?: DriverColorOverrides
): number {
  if (!driverId) return 0;
  const chosen = overrides?.[driverId];
  if (typeof chosen === 'number' && isDriverColorIndex(chosen)) return chosen;
  return (hash(driverId) % AUTO_COLOR_COUNT) + 1;
}

/**
 * De CSS-variabele van een kleurnummer; 0 is de neutrale kleur. Apart voor het
 * statistiekenscherm, dat enkel het nummer heeft en geen overrides.
 */
export function driverColorVarFromIndex(index: number): string {
  return index === 0 ? 'var(--driver-none)' : `var(--driver-${index})`;
}

/**
 * De CSS-kleur voor deze chauffeur: zijn eigen kleur, anders zijn paletkleur,
 * anders de hash; de neutrale kleur zonder chauffeur.
 */
export function driverColorVar(
  driverId: string | null | undefined,
  overrides?: DriverColorOverrides
): string {
  if (driverId) {
    const chosen = overrides?.[driverId];
    if (isCustomDriverColor(chosen)) return customColorCss(chosen);
  }
  return driverColorVarFromIndex(driverColorIndex(driverId, overrides));
}

/**
 * De arceringen van een voertuig: de opgeslagen waarde (`UitleenVehicle.pattern`)
 * en het achtervoegsel van de CSS-klasse. `none` is hetzelfde als `null`, maar
 * geeft het beheerscherm een keuze "geen".
 */
export const VEHICLE_PATTERNS = ['none', 'diagonal', 'vertical', 'dots', 'grid'] as const;

export type VehiclePattern = (typeof VEHICLE_PATTERNS)[number];

export const VEHICLE_PATTERN_LABELS: Record<VehiclePattern, string> = {
  none: 'Geen arcering',
  diagonal: 'Schuine strepen',
  vertical: 'Verticale strepen',
  dots: 'Stippen',
  grid: 'Ruitjes',
};

export function isVehiclePattern(value: unknown): value is VehiclePattern {
  return typeof value === 'string' && (VEHICLE_PATTERNS as readonly string[]).includes(value);
}

/** De CSS-klasse voor deze arcering, of een lege string (nooit `undefined` in een klassenlijst). */
export function vehiclePatternClass(pattern: string | null | undefined): string {
  return isVehiclePattern(pattern) && pattern !== 'none' ? `trip-pattern-${pattern}` : '';
}
