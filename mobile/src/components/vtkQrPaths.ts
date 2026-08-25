import QRCode from 'qrcode';

/**
 * De meetkunde van de VTK-QR, los van het tekenen.
 *
 * **Dit is een port van `apps/web/lib/shortlink-qr.ts`.** De site rendert die QR
 * server-side naar een PNG met `sharp`; dat kan hier niet, en het beeld ophalen
 * zou een ticket onbruikbaar maken op precies het moment dat het telt: aan de
 * ingang van een zaal is het netwerk vaak weg, en de app tekent daarom uit het
 * `credential` dat al in de leescache staat. De getallen hieronder zijn met opzet
 * exact dezelfde als daar; wijzigt de opmaak op de site, dan hoort ze hier mee te
 * wijzigen, anders drijven de twee stilletjes uit elkaar.
 *
 * Apart van `VtkQr.tsx` omdat dit pure rekenkunde is: zo kan ze buiten React
 * gedraaid en nagerekend worden, en dat is hier geen luxe. Een QR die er goed
 * uitziet maar niet scant, merk je anders pas aan de deur van een cantus.
 */

export const CANVAS = 1200;
export const FRAME_OUTER_INSET = 20;
export const FRAME_INNER_INSET = 42;
export const FRAME_OUTER_RADIUS = 88;
export const FRAME_INNER_RADIUS = 66;
export const QR_EXTENT = CANVAS - FRAME_INNER_INSET * 2;
/** Eén stille module houdt de kader los van de matrix zonder brede witte boord. */
const QUIET_ZONE_MODULES = 1;
export const NAVY = '#0E1A36';
export const WHITE = '#FFFFFF';
/** Het woordmerk is horizontaal; 9 op 5 modules komt overeen met zijn verhouding. */
const LOGO_WIDTH_MODULES = 9;
const LOGO_HEIGHT_MODULES = 5;
const LOGO_INSET_RATIO = 0.06;

/** Een afgeronde rechthoek als pad, zodat alles van één kleur in één `Path` past. */
export function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const r = Math.min(radius, width / 2, height / 2);
  const right = x + width;
  const bottom = y + height;
  return (
    `M${x + r},${y}H${right - r}A${r},${r} 0 0 1 ${right},${y + r}` +
    `V${bottom - r}A${r},${r} 0 0 1 ${right - r},${bottom}` +
    `H${x + r}A${r},${r} 0 0 1 ${x},${bottom - r}` +
    `V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`
  );
}

function inFinderPattern(row: number, column: number, size: number): boolean {
  return (
    (row < 7 && column < 7) || (row < 7 && column >= size - 7) || (row >= size - 7 && column < 7)
  );
}

export type QrDrawing = {
  /** De stippen plus de buitenrand van de drie zoekpatronen. */
  navy: string;
  /** Het witte vlak binnen elk zoekpatroon. */
  white: string;
  /** Het navy blokje in het hart van elk zoekpatroon, bovenop dat witte vlak. */
  navyCore: string;
  /** Waar het woordmerk komt, in canvas-eenheden. */
  logo: { x: number; y: number; width: number; height: number };
};

/** Geeft `null` wanneer de waarde niet in een QR past; de beller toont dan niets. */
export function qrDrawing(value: string): QrDrawing | null {
  let matrix;
  try {
    matrix = QRCode.create(value, { errorCorrectionLevel: 'H' }).modules;
  } catch {
    return null;
  }

  const size = matrix.size;
  const moduleSize = QR_EXTENT / (size + QUIET_ZONE_MODULES * 2);
  const gridOrigin = (CANVAS - QR_EXTENT) / 2 + QUIET_ZONE_MODULES * moduleSize;
  const dotInset = moduleSize * 0.08;
  const dotSize = moduleSize - dotInset * 2;
  const dotRadius = moduleSize * 0.34;

  const center = Math.floor(size / 2);
  const logoRadiusX = Math.floor(LOGO_WIDTH_MODULES / 2);
  const logoRadiusY = Math.floor(LOGO_HEIGHT_MODULES / 2);
  const insideLogo = (row: number, column: number) =>
    Math.abs(row - center) <= logoRadiusY && Math.abs(column - center) <= logoRadiusX;

  let navy = '';
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (
        !matrix.get(row, column) ||
        inFinderPattern(row, column, size) ||
        insideLogo(row, column)
      ) {
        continue;
      }
      navy += roundedRect(
        gridOrigin + column * moduleSize + dotInset,
        gridOrigin + row * moduleSize + dotInset,
        dotSize,
        dotSize,
        dotRadius,
      );
    }
  }

  let white = '';
  let navyCore = '';
  // Linksboven, rechtsboven, linksonder: als [kolom, rij].
  const corners: [number, number][] = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ];
  for (const [column, row] of corners) {
    const x = gridOrigin + column * moduleSize;
    const y = gridOrigin + row * moduleSize;
    navy += roundedRect(x, y, moduleSize * 7, moduleSize * 7, moduleSize * 1.35);
    white += roundedRect(x + moduleSize, y + moduleSize, moduleSize * 5, moduleSize * 5, moduleSize);
    navyCore += roundedRect(
      x + moduleSize * 2,
      y + moduleSize * 2,
      moduleSize * 3,
      moduleSize * 3,
      moduleSize * 0.72,
    );
  }

  const zoneWidth = LOGO_WIDTH_MODULES * moduleSize;
  const zoneHeight = LOGO_HEIGHT_MODULES * moduleSize;
  const insetX = zoneWidth * LOGO_INSET_RATIO;
  const insetY = zoneHeight * LOGO_INSET_RATIO;

  return {
    navy,
    white,
    navyCore,
    logo: {
      x: gridOrigin + (center - logoRadiusX) * moduleSize + insetX,
      y: gridOrigin + (center - logoRadiusY) * moduleSize + insetY,
      width: zoneWidth - insetX * 2,
      height: zoneHeight - insetY * 2,
    },
  };
}
