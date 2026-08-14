import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

const OUTPUT_SIZE = 1200;
const QR_EXTENT = 1000;
const QUIET_ZONE_MODULES = 4;
const VTK_NAVY = "#0e1a36";

function number(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
): string {
  return `<rect x="${number(x)}" y="${number(y)}" width="${number(width)}" height="${number(height)}" rx="${number(radius)}" fill="${fill}"/>`;
}

function inFinderPattern(row: number, column: number, size: number): boolean {
  return (
    (row < 7 && column < 7) ||
    (row < 7 && column >= size - 7) ||
    (row >= size - 7 && column < 7)
  );
}

function finderPattern(x: number, y: number, moduleSize: number): string {
  return [
    roundedRect(x, y, moduleSize * 7, moduleSize * 7, moduleSize * 1.35, VTK_NAVY),
    roundedRect(
      x + moduleSize,
      y + moduleSize,
      moduleSize * 5,
      moduleSize * 5,
      moduleSize,
      "#ffffff",
    ),
    roundedRect(
      x + moduleSize * 2,
      y + moduleSize * 2,
      moduleSize * 3,
      moduleSize * 3,
      moduleSize * 0.72,
      VTK_NAVY,
    ),
  ].join("");
}

/**
 * Bouwt een scanbare QR in de VTK-huisstijl. De functionele patronen in drie
 * hoeken blijven herkenbare gehelen; alleen de overige modules worden zachte
 * blokjes. Foutcorrectie H laat ruimte voor het kleine schild in het midden.
 */
export function createStyledShortlinkQrSvg(content: string, shieldDataUri: string): string {
  if (!content || content.length > 512) throw new Error("INVALID_QR_CONTENT");

  const qr = QRCode.create(content, { errorCorrectionLevel: "H" });
  const matrixSize = qr.modules.size;
  const moduleSize = QR_EXTENT / (matrixSize + QUIET_ZONE_MODULES * 2);
  const fullQrOrigin = (OUTPUT_SIZE - QR_EXTENT) / 2;
  const gridOrigin = fullQrOrigin + QUIET_ZONE_MODULES * moduleSize;
  const dotInset = moduleSize * 0.08;
  const dotSize = moduleSize - dotInset * 2;

  // Een oneven middenvlak blijft exact op de QR-matrix uitgelijnd. Zeven
  // modules is bij onze korte URL's ruim onder de herstelcapaciteit van niveau H.
  let logoModules = Math.max(7, Math.floor(matrixSize * 0.21));
  if (logoModules % 2 === 0) logoModules += 1;
  logoModules = Math.min(logoModules, 9);
  const center = Math.floor(matrixSize / 2);
  const logoRadius = Math.floor(logoModules / 2);
  const insideLogoPlate = (row: number, column: number) =>
    Math.abs(row - center) <= logoRadius && Math.abs(column - center) <= logoRadius;

  const modules: string[] = [];
  for (let row = 0; row < matrixSize; row += 1) {
    for (let column = 0; column < matrixSize; column += 1) {
      if (
        !qr.modules.get(row, column) ||
        inFinderPattern(row, column, matrixSize) ||
        insideLogoPlate(row, column)
      ) {
        continue;
      }
      modules.push(
        roundedRect(
          gridOrigin + column * moduleSize + dotInset,
          gridOrigin + row * moduleSize + dotInset,
          dotSize,
          dotSize,
          moduleSize * 0.34,
          VTK_NAVY,
        ),
      );
    }
  }

  const finderTopLeft = finderPattern(gridOrigin, gridOrigin, moduleSize);
  const finderTopRight = finderPattern(
    gridOrigin + (matrixSize - 7) * moduleSize,
    gridOrigin,
    moduleSize,
  );
  const finderBottomLeft = finderPattern(
    gridOrigin,
    gridOrigin + (matrixSize - 7) * moduleSize,
    moduleSize,
  );

  const logoPlateSize = logoModules * moduleSize;
  const logoPlateOrigin = gridOrigin + (center - logoRadius) * moduleSize;
  const logoInset = logoPlateSize * 0.12;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" viewBox="0 0 ${OUTPUT_SIZE} ${OUTPUT_SIZE}" shape-rendering="geometricPrecision">`,
    `<rect width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" fill="#ffffff"/>`,
    roundedRect(24, 24, 1152, 1152, 96, VTK_NAVY),
    roundedRect(56, 56, 1088, 1088, 70, "#ffffff"),
    ...modules,
    finderTopLeft,
    finderTopRight,
    finderBottomLeft,
    roundedRect(
      logoPlateOrigin,
      logoPlateOrigin,
      logoPlateSize,
      logoPlateSize,
      moduleSize * 1.15,
      "#ffffff",
    ),
    `<image href="${shieldDataUri}" x="${number(logoPlateOrigin + logoInset)}" y="${number(logoPlateOrigin + logoInset)}" width="${number(logoPlateSize - logoInset * 2)}" height="${number(logoPlateSize - logoInset * 2)}" preserveAspectRatio="xMidYMid meet"/>`,
    "</svg>",
  ].join("");
}

let cachedShieldDataUri: string | null = null;

function vtkShieldDataUri(): string {
  if (cachedShieldDataUri) return cachedShieldDataUri;
  const bytes = readFileSync(join(process.cwd(), "public", "vtk-shield-favicon.png"));
  cachedShieldDataUri = `data:image/png;base64,${bytes.toString("base64")}`;
  return cachedShieldDataUri;
}

export async function createStyledShortlinkQrPng(content: string): Promise<Buffer> {
  const svg = createStyledShortlinkQrSvg(content, vtkShieldDataUri());
  return sharp(Buffer.from(svg)).png().toBuffer();
}
