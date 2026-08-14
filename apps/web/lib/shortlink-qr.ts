import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

const OUTPUT_SIZE = 1200;
const FRAME_OUTER_INSET = 20;
const FRAME_INNER_INSET = 42;
const QR_EXTENT = OUTPUT_SIZE - FRAME_INNER_INSET * 2;
// Eén stille module houdt de donkere kader visueel los van de matrix, maar
// vermijdt de brede witte boord van de standaard QR-opmaak.
const QUIET_ZONE_MODULES = 1;
const VTK_NAVY = [14, 26, 54] as const;
const WHITE = [255, 255, 255] as const;

type Rgb = readonly [number, number, number];
type RawImage = { data: Buffer; width: number; height: number; channels: number };

function blendRgb(canvas: Buffer, x: number, y: number, colour: Rgb, opacity: number): void {
  if (x < 0 || y < 0 || x >= OUTPUT_SIZE || y >= OUTPUT_SIZE || opacity <= 0) return;
  const offset = (y * OUTPUT_SIZE + x) * 4;
  const inverse = 1 - opacity;
  canvas[offset] = Math.round(colour[0] * opacity + canvas[offset] * inverse);
  canvas[offset + 1] = Math.round(colour[1] * opacity + canvas[offset + 1] * inverse);
  canvas[offset + 2] = Math.round(colour[2] * opacity + canvas[offset + 2] * inverse);
  canvas[offset + 3] = 255;
}

/**
 * Tekent een afgeronde rechthoek rechtstreeks in een RGBA-buffer. De signed
 * distance geeft een antialiased rand van één pixel, zonder dat libvips SVG
 * hoeft te kunnen decoderen.
 */
function drawRoundedRect(
  canvas: Buffer,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  colour: Rgb,
): void {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const safeRadius = Math.min(radius, halfWidth, halfHeight);
  const centerX = x + halfWidth;
  const centerY = y + halfHeight;
  const startX = Math.max(0, Math.floor(x - 1));
  const endX = Math.min(OUTPUT_SIZE, Math.ceil(x + width + 1));
  const startY = Math.max(0, Math.floor(y - 1));
  const endY = Math.min(OUTPUT_SIZE, Math.ceil(y + height + 1));

  for (let pixelY = startY; pixelY < endY; pixelY += 1) {
    for (let pixelX = startX; pixelX < endX; pixelX += 1) {
      const qx = Math.abs(pixelX + 0.5 - centerX) - (halfWidth - safeRadius);
      const qy = Math.abs(pixelY + 0.5 - centerY) - (halfHeight - safeRadius);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const inside = Math.min(Math.max(qx, qy), 0);
      const distance = outside + inside - safeRadius;
      const coverage = Math.max(0, Math.min(1, 0.5 - distance));
      blendRgb(canvas, pixelX, pixelY, colour, coverage);
    }
  }
}

function inFinderPattern(row: number, column: number, size: number): boolean {
  return (
    (row < 7 && column < 7) ||
    (row < 7 && column >= size - 7) ||
    (row >= size - 7 && column < 7)
  );
}

function drawFinderPattern(canvas: Buffer, x: number, y: number, moduleSize: number): void {
  drawRoundedRect(canvas, x, y, moduleSize * 7, moduleSize * 7, moduleSize * 1.35, VTK_NAVY);
  drawRoundedRect(
    canvas,
    x + moduleSize,
    y + moduleSize,
    moduleSize * 5,
    moduleSize * 5,
    moduleSize,
    WHITE,
  );
  drawRoundedRect(
    canvas,
    x + moduleSize * 2,
    y + moduleSize * 2,
    moduleSize * 3,
    moduleSize * 3,
    moduleSize * 0.72,
    VTK_NAVY,
  );
}

let headerLogoBytes: Buffer | null = null;
const resizedLogoCache = new Map<string, Promise<RawImage | null>>();

function vtkHeaderLogoBytes(): Buffer {
  if (!headerLogoBytes) {
    headerLogoBytes = readFileSync(join(process.cwd(), "public", "vtk-logo.png"));
  }
  return headerLogoBytes;
}

function resizedHeaderLogo(width: number, height: number): Promise<RawImage | null> {
  const key = `${width}x${height}`;
  const cached = resizedLogoCache.get(key);
  if (cached) return cached;

  const rendering = (async () => {
    try {
      const { data, info } = await sharp(vtkHeaderLogoBytes())
        .resize(width, height, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Het headerbestand is lichtgrijs voor gebruik op de donkere navigatie.
      // In de QR gebruiken we uitsluitend het alfakanaal als masker, zodat het
      // woordmerk exact hetzelfde VTK-blauw krijgt als de QR-modules.
      for (let offset = 0; offset < data.length; offset += info.channels) {
        data[offset] = VTK_NAVY[0];
        data[offset + 1] = VTK_NAVY[1];
        data[offset + 2] = VTK_NAVY[2];
      }
      return { data, width: info.width, height: info.height, channels: info.channels };
    } catch (error) {
      // Een ontbrekende/ongeldige huisstijlasset mag nooit de scanbare QR zelf
      // breken. Het midden blijft dan gewoon als stille witte zone staan.
      console.error("Short-link QR header logo could not be rendered", error);
      return null;
    }
  })();
  resizedLogoCache.set(key, rendering);
  return rendering;
}

function compositeRawImage(canvas: Buffer, image: RawImage, left: number, top: number): void {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sourceOffset = (y * image.width + x) * image.channels;
      const alpha = image.channels >= 4 ? image.data[sourceOffset + 3] / 255 : 1;
      blendRgb(
        canvas,
        left + x,
        top + y,
        [
          image.data[sourceOffset],
          image.data[sourceOffset + 1],
          image.data[sourceOffset + 2],
        ],
        alpha,
      );
    }
  }
}

/**
 * Bouwt een scanbare QR rechtstreeks als rasterbeeld. Er komt bewust nergens
 * SVG aan Sharp te pas: sommige Alpine/libvips-builds kunnen een SVG-buffer
 * niet decoderen en gaven daardoor in productie een 500.
 */
export async function createStyledShortlinkQrPng(content: string): Promise<Buffer> {
  if (!content || content.length > 512) throw new Error("INVALID_QR_CONTENT");

  const qr = QRCode.create(content, { errorCorrectionLevel: "H" });
  const matrixSize = qr.modules.size;
  const moduleSize = QR_EXTENT / (matrixSize + QUIET_ZONE_MODULES * 2);
  const fullQrOrigin = (OUTPUT_SIZE - QR_EXTENT) / 2;
  const gridOrigin = fullQrOrigin + QUIET_ZONE_MODULES * moduleSize;
  const dotInset = moduleSize * 0.08;
  const dotSize = moduleSize - dotInset * 2;
  const canvas = Buffer.alloc(OUTPUT_SIZE * OUTPUT_SIZE * 4, 255);

  // De binnenzijde van de kader valt exact samen met de compacte stille zone;
  // zo blijft er geen extra wit vlak tussen kader en QR-matrix over.
  drawRoundedRect(
    canvas,
    FRAME_OUTER_INSET,
    FRAME_OUTER_INSET,
    OUTPUT_SIZE - FRAME_OUTER_INSET * 2,
    OUTPUT_SIZE - FRAME_OUTER_INSET * 2,
    88,
    VTK_NAVY,
  );
  drawRoundedRect(
    canvas,
    FRAME_INNER_INSET,
    FRAME_INNER_INSET,
    QR_EXTENT,
    QR_EXTENT,
    66,
    WHITE,
  );

  // Het horizontale woordmerk uit de header past in een compacte 9 × 5-zone.
  // Die witte zone hoort bij de bestaande QR-achtergrond; er wordt geen aparte
  // plaat of omlijning rond het logo getekend.
  const logoWidthModules = 9;
  const logoHeightModules = 5;
  const center = Math.floor(matrixSize / 2);
  const logoRadiusX = Math.floor(logoWidthModules / 2);
  const logoRadiusY = Math.floor(logoHeightModules / 2);
  const insideLogoPlate = (row: number, column: number) =>
    Math.abs(row - center) <= logoRadiusY && Math.abs(column - center) <= logoRadiusX;

  for (let row = 0; row < matrixSize; row += 1) {
    for (let column = 0; column < matrixSize; column += 1) {
      if (
        !qr.modules.get(row, column) ||
        inFinderPattern(row, column, matrixSize) ||
        insideLogoPlate(row, column)
      ) {
        continue;
      }
      drawRoundedRect(
        canvas,
        gridOrigin + column * moduleSize + dotInset,
        gridOrigin + row * moduleSize + dotInset,
        dotSize,
        dotSize,
        moduleSize * 0.34,
        VTK_NAVY,
      );
    }
  }

  drawFinderPattern(canvas, gridOrigin, gridOrigin, moduleSize);
  drawFinderPattern(canvas, gridOrigin + (matrixSize - 7) * moduleSize, gridOrigin, moduleSize);
  drawFinderPattern(canvas, gridOrigin, gridOrigin + (matrixSize - 7) * moduleSize, moduleSize);

  const logoZoneWidth = logoWidthModules * moduleSize;
  const logoZoneHeight = logoHeightModules * moduleSize;
  const logoZoneX = gridOrigin + (center - logoRadiusX) * moduleSize;
  const logoZoneY = gridOrigin + (center - logoRadiusY) * moduleSize;
  const logoInsetX = logoZoneWidth * 0.06;
  const logoInsetY = logoZoneHeight * 0.06;
  const logoWidth = Math.max(1, Math.round(logoZoneWidth - logoInsetX * 2));
  const logoHeight = Math.max(1, Math.round(logoZoneHeight - logoInsetY * 2));
  const logo = await resizedHeaderLogo(logoWidth, logoHeight);
  if (logo) {
    compositeRawImage(
      canvas,
      logo,
      Math.round(logoZoneX + logoInsetX),
      Math.round(logoZoneY + logoInsetY),
    );
  }

  return sharp(canvas, {
    raw: { width: OUTPUT_SIZE, height: OUTPUT_SIZE, channels: 4 },
  })
    .png()
    .toBuffer();
}
