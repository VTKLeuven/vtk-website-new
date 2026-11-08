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
 * - **De rand en de streep zijn de staat.** Nog geen chauffeur is de enige
 *   toestand die nog werk is: neutraal grijs met een streepjesrand. Nog te
 *   beslissen krijgt een streep langs de bovenrand, en nooit een tweede
 *   arcering; zie `.trip-requested` in `app/globals.css`.
 *
 * De kleur volgt standaard uit de id van de chauffeur en niet uit een instelling:
 * het doel is onderscheiden wie welke rit doet, niet dat Jonas geel wil. Een
 * vaste hash geeft dezelfde persoon altijd dezelfde kleur zonder dat iemand
 * kleuren moet gaan zitten kiezen. Maar twee chauffeurs die toevallig op bijna
 * dezelfde tint uitkomen, moet het team kunnen rechtzetten; daarom kan
 * `UitleenDriver.colorIndex` de hash overschrijven. Wie ook buiten het palet iets
 * zoekt, stelt een {@link CustomDriverColor} in met drie schuiven
 * (`UitleenDriver.customColor`).
 *
 * De kleuren zelf staan als tokens in `app/design/theme.css` (`--driver-1` tot
 * `--driver-40`, en de grenzen van de schuiven), zodat ze op één plek bijgesteld
 * kunnen worden.
 */
export const AUTO_COLOR_COUNT = 24;

/**
 * Het aantal kleuren dat het team kan kiezen (F6.7): de vierentwintig van de hash
 * en daarbovenop zestien middentonen die enkel met de hand gekozen worden.
 *
 * **De hash rekent met {@link AUTO_COLOR_COUNT} en nooit met dit getal.** Wie de
 * modulus verhoogt, geeft elke chauffeur zonder gekozen kleur een andere, en
 * "laat ieder zijn huidige kleur behouden" was precies de eis. De nieuwe kleuren
 * zijn dus nooit een uitkomst van de hash, enkel een keuze.
 */
export const DRIVER_COLOR_COUNT = 40;

/**
 * De kleur die een toegevoegde chauffeur krijgt (Salie). Een vaste kleur in
 * plaats van de hash: zo valt een nieuwe chauffeur niet toevallig samen met
 * iemand die al een kleur heeft gekozen, en weet het team dat "Salie" nog niet
 * bewust gekozen is.
 */
export const NEW_DRIVER_COLOR_INDEX = 24;

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
 * Een eigen kleur, gekozen met schuiven in plaats van uit het palet. Drie
 * hele getallen, en geen hex: een hex is één vaste kleur, terwijl dit in de
 * lichte en de donkere modus een andere vulling moet worden met dezelfde tint.
 *
 * - `hue`: de tint, 0 tot en met 359 graden op het kleurenwiel.
 * - `chroma`: hoe levendig, 0 (grijs) tot en met 100 (zo levendig als hier mag).
 * - `tone`: hoe krachtig, 0 (zacht, het dichtst bij het vlak eronder) tot en met
 *   100 (krachtig, de diepste vulling waar de tekst nog leesbaar op blijft).
 *
 * **Geen vrije helderheid.** De tekst in een blok heeft één kleur en de arcering
 * van het voertuig ligt eroverheen, dus een vulling mag niet verder van het vlak
 * af dan waar die tekst nog 4.5:1 haalt. De schuiven kiezen binnen dat bereik
 * (`--driver-l0` tot `--driver-l1` in `app/design/theme.css`, per modus) en
 * `test/driver-colors.test.ts` rekent het na over het hele kleurenwiel.
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

/**
 * De tekst in `UitleenDriver.customColor`: `tint,levendigheid,kracht`, bv.
 * `210,60,35`. Eén kolom in plaats van drie, want de drie horen samen: een rij
 * met een tint maar zonder kracht zou een halve kleur zijn.
 */
export function serializeCustomColor(color: CustomDriverColor): string {
  return `${color.hue},${color.chroma},${color.tone}`;
}

/**
 * Leest `UitleenDriver.customColor` terug. `null` voor alles wat geen kleur is:
 * een lege kolom, een handmatige update, een tekst uit een toekomstige versie.
 * Dan geldt de paletkleur of de hash, net zoals bij een onzinnige `colorIndex`;
 * een blok zonder vulling ziet eruit als een blok zonder chauffeur.
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
 * De CSS-kleur van een eigen kleur.
 *
 * `oklch` omdat gelijke stappen daar ook gelijk lijken: bij `hsl` is geel bij
 * dezelfde "lightness" veel lichter dan blauw en liggen de schuiven scheef.
 * De helderheid en het maximum aan levendigheid komen uit tokens, per modus, en
 * de kleur rekent dus mee wanneer de modus wisselt, zonder dat iemand opnieuw
 * iets opslaat. Ook in een SVG-`fill` en in `color-mix` bruikbaar.
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

/**
 * Kleuren die het team zelf gezet heeft, op chauffeur-id. Wat er niet in staat,
 * valt terug op de hash.
 */
export type DriverColorOverrides = Readonly<Record<string, DriverColorChoice>>;

/** Ligt deze keuze binnen de tokens die `app/design/theme.css` kent? */
export function isDriverColorIndex(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= DRIVER_COLOR_COUNT;
}

/**
 * 1 tot en met {@link DRIVER_COLOR_COUNT}; 0 wanneer er geen chauffeur is.
 *
 * Een ingestelde paletkleur wint; een onzinnige waarde in de databank (een
 * handmatige update, een oude rij na het verkleinen van het palet) valt terug op
 * de hash in plaats van een kleur te vragen die niet bestaat.
 *
 * **Een eigen kleur heeft geen nummer.** Heeft de chauffeur er een, dan geeft
 * dit toch de hash terug, en dat is dus niet wat er op het scherm staat. Wie de
 * kleur zelf nodig heeft, vraagt {@link driverColorVar}.
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
 * De CSS-variabele van een kleurnummer uit {@link driverColorIndex}; 0 is de
 * neutrale kleur zonder chauffeur.
 *
 * Apart van {@link driverColorVar} omdat het statistiekenscherm het nummer al
 * bewaart per chauffeur en de overrides daar niet meer bij de hand heeft: dat
 * scherm draait in de browser en haalt geen chauffeurs op.
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
