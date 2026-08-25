/**
 * De meetkunde van de skyline, los van het tekenen.
 *
 * Apart van `Skyline.tsx` om dezelfde reden als bij de QR: dit is pure
 * rekenkunde, en zo kan ze buiten React gedraaid en bekeken worden. Een gebouw
 * dat er in de app scheef bij staat, wil je zien voor je het opstuurt en niet
 * erna.
 *
 * De vormen komen uit het VTK-posterbeeld: silhouetten met platte, terugspringende
 * en gepunte daken, ramen die warm of koel branden, en een kraan bij wat nog in
 * aanbouw is.
 */

export type Building = {
  /** Bepaalt het silhouet. Gebruik iets stabiels: een gebruikers-id. */
  key: string;
  /** Hoogte in verdiepingen. Wordt begrensd op iets dat nog past. */
  floors: number;
  /** Hoeveel verdiepingen er licht branden, van onder naar boven. */
  lit: number;
  /** Nu bezig: er staat een kraan op en de ramen branden voluit. */
  building?: boolean;
};

export const VIEW_WIDTH = 320;
export const FLOOR_HEIGHT = 8;
export const GROUND = 4;
const MIN_FLOORS = 2;
/**
 * Ruimte boven het hoogste gebouw. Een spits en zeker een kraan steken boven de
 * romp uit; zonder deze marge worden ze door de rand afgesneden, en dan lijkt het
 * of de tekening stuk is in plaats van hoog.
 */
const HEADROOM = 26;
/** De breedte die een gebouw uit zichzelf heeft, voor er iets gerekt wordt. */
const NATURAL_WIDTH = 26;
const WIDTH_VARIATION = 14;
const GAP = 4;

export const SKY_TOP = '#0A1024';
export const SKY_HORIZON = '#1C3566';
export const WALL = '#080D1C';
export const WALL_BACK = '#111C36';
export const WINDOW_ON = '#FFD23F';
export const WINDOW_COOL = '#2F4E8C';
export const WINDOW_OFF = '#1A2743';
export const GROUND_LINE = '#05080F';
export const CRANE = '#FFD23F';
/** De stad achter de jouwe: donkerder, en er brandt nauwelijks licht. */
export const WALL_BACKDROP = '#0C1730';

/** Kleine, stabiele hash. Niet cryptografisch, wel altijd hetzelfde. */
function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/** Deterministische reeks getallen tussen 0 en 1. */
function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Hoeveel verdiepingen er in dit paneel passen, marge inbegrepen. */
export function maxFloorsFor(height: number): number {
  return Math.max(3, Math.floor((height - GROUND - HEADROOM) / FLOOR_HEIGHT));
}

function clampFloors(floors: number, max: number): number {
  return Math.max(MIN_FLOORS, Math.min(max, Math.round(floors)));
}

export type PlacedBuilding = {
  key: string;
  x: number;
  width: number;
  floors: number;
  /** De bovenkant van de romp, zonder dak. */
  top: number;
  fill: string;
  /** Het dak als pad, of `null` bij een plat dak. */
  roof: string | null;
  /** De kraan als pad, of `null` wanneer er niet gebouwd wordt. */
  crane: string | null;
  windows: { x: number; y: number; width: number; height: number; fill: string; opacity: number }[];
};

function roofPath(kind: number, x: number, y: number, width: number): string | null {
  if (kind === 1) {
    // Terugspringend: een smallere verdieping bovenop.
    const inset = width * 0.2;
    const w = width - inset * 2;
    return `M${x + inset},${y - FLOOR_HEIGHT} h${w} v${FLOOR_HEIGHT} h-${w} Z`;
  }
  if (kind === 2) {
    // Gepunt: een spits die in het midden uitloopt.
    const half = width / 2;
    return `M${x + half},${y - FLOOR_HEIGHT * 1.7} L${x + width * 0.82},${y} L${x + width * 0.18},${y} Z`;
  }
  if (kind === 3) {
    // Antenne: een dun staafje met een verdikking onderaan.
    const mid = x + width / 2;
    const mast = FLOOR_HEIGHT * 2.2;
    return (
      `M${mid - 0.7},${y - mast} h1.4 v${mast} h-1.4 Z ` +
      `M${mid - 3},${y - FLOOR_HEIGHT * 0.5} h6 v${FLOOR_HEIGHT * 0.5} h-6 Z`
    );
  }
  return null;
}

/** De kraan boven een gebouw dat nu in aanbouw is. */
function cranePath(x: number, top: number, width: number): string {
  const mast = x + width * 0.42;
  const height = FLOOR_HEIGHT * 2.8;
  const armY = top - height;
  const armLeft = mast - width * 0.3;
  const armRight = mast + width * 0.66;
  return (
    `M${mast - 0.9},${top} h1.8 v-${height} h-1.8 Z ` +
    `M${armLeft},${armY} h${armRight - armLeft} v2 h-${armRight - armLeft} Z ` +
    `M${armRight - 4},${armY + 2} h0.9 v${FLOOR_HEIGHT * 1.2} h-0.9 Z ` +
    `M${armRight - 5.6},${armY + 2 + FLOOR_HEIGHT * 1.2} h4 v2.4 h-4 Z`
  );
}

/** Bouwt één gebouw op een gegeven plaats. */
function makeBuilding(
  building: Building,
  x: number,
  width: number,
  height: number,
  maxFloors: number,
  backdrop: boolean,
): PlacedBuilding {
  const seed = hash(building.key);
  const floors = clampFloors(building.floors, maxFloors);
  const top = height - GROUND - floors * FLOOR_HEIGHT;
  // Elk tweede gebouw staat een tint lichter: dat geeft de rij diepte zonder dat
  // er een tweede rij achter getekend hoeft te worden.
  const fill = backdrop ? WALL_BACKDROP : seed % 2 === 1 ? WALL_BACK : WALL;

  const light = rng(seed ^ 0x9e3779b9);
  const columns = width > 34 ? 3 : 2;
  const windowWidth = Math.max(2.2, Math.min(4.6, width / (columns * 3.1)));
  const windowHeight = FLOOR_HEIGHT * 0.42;
  const spacing = (width - columns * windowWidth) / (columns + 1);
  const windows: PlacedBuilding['windows'] = [];

  for (let floor = 0; floor < floors; floor += 1) {
    const y = height - GROUND - (floor + 1) * FLOOR_HEIGHT + (FLOOR_HEIGHT - windowHeight) / 2;
    for (let column = 0; column < columns; column += 1) {
      const roll = light();
      // Niet elk raam brandt, ook niet op een verlichte verdieping. Een gebouw
      // waarin alles tegelijk aan staat, leest als een raster en niet als een huis.
      const on = !backdrop && floor < building.lit && roll > 0.24;
      const cool = !on && roll > (backdrop ? 0.86 : 0.7);
      windows.push({
        x: x + spacing + column * (windowWidth + spacing),
        y,
        width: windowWidth,
        height: windowHeight,
        fill: on ? WINDOW_ON : cool ? WINDOW_COOL : WINDOW_OFF,
        opacity: on ? (building.building ? 1 : 0.86) : cool ? 0.45 : backdrop ? 0.18 : 0.32,
      });
    }
  }

  return {
    key: building.key,
    x,
    width,
    floors,
    top,
    fill,
    roof: roofPath(seed % 4, x, top, width),
    crane: building.building ? cranePath(x, top, width) : null,
    windows,
  };
}

/**
 * Legt de rij gebouwen uit, met een stad erachter.
 *
 * **Eén gebouw wordt niet uitgerekt tot de volle breedte.** Dat was de eerste
 * poging, en dan zijn je ramen brede balken en lijkt het nergens op. Een gebouw
 * heeft een eigen breedte; blijft er ruimte over, dan vullen donkere silhouetten
 * de horizon op. Zo staat jouw toren in een stad in plaats van in een leegte, en
 * dat is precies wat het posterbeeld doet.
 *
 * Passen ze niet, dan krimpen ze samen tot ze wel passen. Er verdwijnt nooit een
 * gebouw: een groepslid dat niet getekend wordt, is erger dan een smalle toren.
 */
export function placeSkyline(buildings: Building[], height: number): PlacedBuilding[] {
  if (buildings.length === 0) return [];

  const maxFloors = maxFloorsFor(height);
  const widths = buildings.map((building) => {
    const shape = rng(hash(building.key) ^ 0x5bf03635);
    return NATURAL_WIDTH + shape() * WIDTH_VARIATION;
  });

  const natural = widths.reduce((total, width) => total + width, 0) + GAP * (buildings.length - 1);
  const scale = natural > VIEW_WIDTH ? VIEW_WIDTH / natural : 1;
  const gap = GAP * scale;
  const scaled = widths.map((width) => width * scale);
  const used = scaled.reduce((total, width) => total + width, 0) + gap * (buildings.length - 1);

  const placed: PlacedBuilding[] = [];
  let cursor = (VIEW_WIDTH - used) / 2;
  const left = cursor;

  for (const [index, building] of buildings.entries()) {
    placed.push(makeBuilding(building, cursor, scaled[index], height, maxFloors, false));
    cursor += scaled[index] + gap;
  }

  // De stad erachter, links en rechts van wat er al staat.
  const backdrop = rng(778899);
  const fill = (from: number, to: number, side: string) => {
    let x = from;
    let index = 0;
    while (x < to - 12) {
      const width = 20 + backdrop() * 16;
      const floors = 3 + Math.round(backdrop() * (maxFloors * 0.55));
      placed.unshift(
        makeBuilding(
          { key: `backdrop-${side}-${index}`, floors, lit: 0 },
          x,
          Math.min(width, to - x),
          height,
          maxFloors,
          true,
        ),
      );
      x += width + 2;
      index += 1;
    }
  };
  fill(-6, left, 'l');
  fill(left + used, VIEW_WIDTH + 6, 'r');

  return placed;
}

/**
 * Sterren. Vast patroon uit een vaste seed: een lucht die bij elke render
 * herschikt, valt op als geflikker en niet als sterrenhemel.
 */
export function starsFor(height: number): { cx: number; cy: number; r: number; opacity: number }[] {
  const random = rng(20260825);
  const stars = [];
  for (let index = 0; index < 52; index += 1) {
    stars.push({
      cx: random() * VIEW_WIDTH,
      cy: random() * height * 0.7,
      r: 0.4 + random() * 0.9,
      opacity: 0.2 + random() * 0.55,
    });
  }
  return stars;
}

/**
 * Van gestudeerde tijd naar een gebouw.
 *
 * Tien minuten is één verdieping. Onder het kwartier staat er dus al iets: een
 * leeg stuk grond nadat je net begonnen bent, voelt alsof de app je niet gezien
 * heeft. Het begrenzen op wat er past, gebeurt bij het plaatsen.
 */
export function buildingFor(key: string, seconds: number, building = false): Building {
  const floors = Math.max(MIN_FLOORS, Math.round(2 + seconds / 600));
  return {
    key,
    floors,
    lit: building ? floors : Math.max(1, Math.round(floors * 0.55)),
    building,
  };
}

/**
 * Een rij waarin de **onderlinge** verhouding telt en niet de absolute tijd.
 *
 * Voor een groep of een week: de langste zit staat op volle hoogte en de rest
 * daaronder. Zou je hier tien minuten per verdieping nemen, dan staat na een dag
 * blokken iedereen tegen het plafond en zegt het beeld niets meer.
 */
export function relativeBuildings(
  entries: { key: string; seconds: number; active?: boolean }[],
  height: number,
): Building[] {
  const max = maxFloorsFor(height);
  const best = Math.max(1, ...entries.map((entry) => entry.seconds));

  return entries.map((entry) => {
    const share = entry.seconds / best;
    const floors = Math.max(MIN_FLOORS, Math.round(MIN_FLOORS + share * (max - MIN_FLOORS)));
    return {
      key: entry.key,
      floors,
      // Wie nu bezig is, staat helemaal verlicht; de rest naar wat hij deed.
      lit: entry.active ? floors : Math.round(floors * Math.max(0.25, share)),
      building: entry.active ?? false,
    };
  });
}
