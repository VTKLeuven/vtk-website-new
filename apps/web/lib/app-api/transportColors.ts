/**
 * De kleuren van de transportplanning, voor de app.
 *
 * Op logistiek.vtk.be is de vulkleur van een rit de chauffeur en mengt de browser
 * de rest in CSS: een paletkleur (`--driver-1` tot `--driver-40` in
 * apps/logistiek/app/design/theme.css), een eigen kleur in `oklch`, en de
 * donkere toon van het bolletje met de initialen (`oklch(from ... 0.64 c*1.8+0.02 h)`).
 * Een telefoon kent geen `oklch(from ...)`, dus rekenen we hier hetzelfde uit en
 * sturen we hex. **Houd dit gelijk met `lib/driver-colors.ts` en `theme.css` in
 * apps/logistiek** (lichte modus); apps/web kan die code niet importeren.
 *
 * Geen server-imports, zodat de test dit los kan draaien.
 */

/** `--driver-1` tot `--driver-40`, lichte modus. */
const PALETTE = [
  "#cfe0ff", "#bdd4f7", "#c3e2f2", "#c2e8ee", "#c6eee6", "#c9edd7", "#d7f0d8", "#dff0c4",
  "#e8ecc4", "#f2eec0", "#ffeeb8", "#ffe4b3", "#ffdcc2", "#ffd3c0", "#ffcccc", "#ffcedd",
  "#f9d2ea", "#eed4f4", "#e2d9f8", "#d3d6f6", "#e6ded2", "#ded9cd", "#d8dde6", "#d6dcd8",
  "#f59aa1", "#f2a07c", "#e1ad63", "#c2bb64", "#99c77f", "#6ccea6", "#4fcdcd", "#5ec6ec",
  "#87bafd", "#b0adfb", "#d2a2e8", "#ea9bc7", "#d67d5e", "#5dad70", "#639be1", "#c27cbb",
] as const;

/** `--driver-none`: een rit zonder chauffeur. */
export const NO_DRIVER_FILL = "#e2e6ee";

/** De hash kiest uit de eerste 24, nooit uit alle 40 (`AUTO_COLOR_COUNT`). */
const AUTO_COLOR_COUNT = 24;
/** `--driver-l0`, `--driver-l1`, `--driver-c-max`, `--driver-tone-l`. */
const L0 = 0.94;
const L1 = 0.7;
const C_MAX = 0.13;
const TONE_L = 0.64;

export type DriverChoice = { colorIndex: number | null; customColor: string | null };

function hash(value: string): number {
  let result = 5381;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) + result + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

// -- oklch <-> sRGB (Björn Ottosson) --------------------------------------

type Oklch = { l: number; c: number; h: number };

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function hexToOklch(hex: string): Oklch {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255));
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

function oklchToHex({ l, c, h }: Oklch): string {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  // Buiten sRGB knippen we af; de browser doet gamut mapping, het verschil is klein.
  return `#${rgb
    .map((v) => Math.round(Math.min(1, Math.max(0, fromLinear(v))) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function customColor(value: string | null): Oklch | null {
  if (!value) return null;
  const parts = value.split(",");
  if (parts.length !== 3 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const [hue, chroma, tone] = parts.map(Number);
  if (hue > 359 || chroma > 100 || tone > 100) return null;
  return { l: L0 + (L1 - L0) * (tone / 100), c: C_MAX * (chroma / 100), h: hue };
}

/** De vulkleur en de toon van het bolletje van een chauffeur, zoals logistiek.vtk.be ze tekent. */
export function driverColors(driverId: string | null, choice?: DriverChoice): { fill: string; tone: string | null } {
  if (!driverId) return { fill: NO_DRIVER_FILL, tone: null };
  const custom = customColor(choice?.customColor ?? null);
  const index =
    choice?.colorIndex && choice.colorIndex >= 1 && choice.colorIndex <= PALETTE.length
      ? choice.colorIndex
      : (hash(driverId) % AUTO_COLOR_COUNT) + 1;
  const base = custom ?? hexToOklch(PALETTE[index - 1]);
  return {
    fill: custom ? oklchToHex(custom) : PALETTE[index - 1],
    tone: oklchToHex({ l: TONE_L, c: base.c * 1.8 + 0.02, h: base.h }),
  };
}

/** "Arne Janssens" wordt AJ, "Lotte" wordt LO; wat tussen haakjes staat telt niet mee. */
export function driverInitials(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export const VEHICLE_PATTERNS = ["diagonal", "vertical", "dots", "grid"] as const;
export type VehiclePattern = (typeof VEHICLE_PATTERNS)[number];

export function vehiclePattern(value: string | null | undefined): VehiclePattern | null {
  return (VEHICLE_PATTERNS as readonly string[]).includes(value ?? "") ? (value as VehiclePattern) : null;
}
