/**
 * Hoe een rit eruitziet in de transportplanning (B4, T7, K1).
 *
 * Twee assen, want er zijn twee vragen tegelijk:
 *
 * - **De vulkleur is de chauffeur.** Wie rijdt is de vraag bij het plannen.
 * - **De arcering is het voertuig.** Wat er rijdt is de tweede vraag, en die
 *   hoort niet de eerste te verdringen. Het icoon in het blok zegt hetzelfde,
 *   maar een icoon van 12 pixels lees je pas van dichtbij; een streeppatroon
 *   herken je over de hele week heen.
 * - **Geen chauffeur schreeuwt.** Dat is de enige toestand die nog werk is; ze
 *   krijgt de gele vulling van het huis en een rode streepjesrand.
 *
 * De kleur volgt standaard uit de id van de chauffeur en niet uit een instelling:
 * het doel is onderscheiden wie welke rit doet, niet dat Jonas geel wil. Een
 * vaste hash geeft dezelfde persoon altijd dezelfde kleur zonder dat iemand
 * kleuren moet gaan zitten kiezen. Maar twee chauffeurs die toevallig op bijna
 * dezelfde tint uitkomen, moet het team kunnen rechtzetten; daarom kan
 * `UitleenDriver.colorIndex` de hash overschrijven.
 *
 * De kleuren zelf staan als tokens in `app/globals.css` (`--driver-1` tot
 * `--driver-24`), zodat ze op één plek bijgesteld kunnen worden.
 */
export const DRIVER_COLOR_COUNT = 24;

/**
 * De namen van het palet, in dezelfde volgorde als de tokens.
 *
 * Nodig omdat "Kleur 17" niets zegt: het kiesscherm toont ze als tooltip en als
 * screenreader-tekst, zodat je een kleur ook kan kiezen en benoemen zonder ze
 * te zien. De volgorde is de huisvolgorde van het spectrum, niet alfabetisch.
 */
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
];

/** De naam van kleur `index` (1-gebaseerd), of een nummer als terugval. */
export function driverColorName(index: number): string {
  return DRIVER_COLOR_NAMES[index - 1] ?? `Kleur ${index}`;
}

/**
 * Stabiele, kleine hash (djb2). Niet cryptografisch: hij moet enkel dezelfde
 * uitkomst geven op de server en in de browser, en dat doet hij.
 */
function hash(value: string): number {
  let result = 5381;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) + result + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

/**
 * Kleuren die het team zelf gezet heeft, op chauffeur-id. Wat er niet in staat,
 * valt terug op de hash.
 */
export type DriverColorOverrides = Readonly<Record<string, number>>;

/** Ligt deze keuze binnen de tokens die `app/globals.css` kent? */
export function isDriverColorIndex(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= DRIVER_COLOR_COUNT;
}

/**
 * 1 tot en met {@link DRIVER_COLOR_COUNT}; 0 wanneer er geen chauffeur is.
 *
 * Een ingestelde kleur wint; een onzinnige waarde in de databank (een
 * handmatige update, een oude rij na het verkleinen van het palet) valt terug op
 * de hash in plaats van een kleur te vragen die niet bestaat.
 */
export function driverColorIndex(
  driverId: string | null | undefined,
  overrides?: DriverColorOverrides
): number {
  if (!driverId) return 0;
  const chosen = overrides?.[driverId];
  if (isDriverColorIndex(chosen)) return chosen;
  return (hash(driverId) % DRIVER_COLOR_COUNT) + 1;
}

/** De CSS-variabele voor deze chauffeur, of de neutrale kleur zonder chauffeur. */
export function driverColorVar(
  driverId: string | null | undefined,
  overrides?: DriverColorOverrides
): string {
  const index = driverColorIndex(driverId, overrides);
  return index === 0 ? 'var(--driver-none)' : `var(--driver-${index})`;
}

/**
 * De arceringen die een voertuig kan dragen. De waarde is de opgeslagen string
 * (`UitleenVehicle.pattern`) en tegelijk het achtervoegsel van de CSS-klasse.
 *
 * `none` staat er expliciet bij zodat het beheerscherm een keuze "geen" kan
 * tonen; in de databank is dat dezelfde toestand als `null`.
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

/**
 * De CSS-klasse voor deze arcering, of een lege string.
 *
 * Een lege string en geen `undefined`: de aanroepers plakken de klasse in een
 * lijst die ze daarna met `.filter(Boolean)` opkuisen, en "geen arcering" mag
 * daar geen `"undefined"` in achterlaten.
 */
export function vehiclePatternClass(pattern: string | null | undefined): string {
  return isVehiclePattern(pattern) && pattern !== 'none' ? `trip-pattern-${pattern}` : '';
}
