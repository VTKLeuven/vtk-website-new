import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

const OUTPUT_SIZE = 1200;
const QR_EXTENT = 1000;
const QUIET_ZONE_MODULES = 4;
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

let shieldBytes: Buffer | null = null;
const resizedShieldCache = new Map<number, Promise<RawImage | null>>();

function vtkShieldBytes(): Buffer {
  if (!shieldBytes) {
    shieldBytes = readFileSync(join(process.cwd(), "public", "vtk-shield-favicon.png"));
  }
  return shieldBytes;
}

function resizedShield(size: number): Promise<RawImage | null> {
  const cached = resizedShieldCache.get(size);
  if (cached) return cached;

  const rendering = (async () => {
    try {
      const { data, info } = await sharp(vtkShieldBytes())
        .resize(size, size, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { data, width: info.width, height: info.height, channels: info.channels };
    } catch (error) {
      // Een ontbrekende/ongeldige huisstijlasset mag nooit de scanbare QR zelf
      // breken. De witte middenplaat blijft dan gewoon zonder schild staan.
      console.error("Short-link QR shield could not be rendered", error);
      return null;
    }
  })();
  resizedShieldCache.set(size, rendering);
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

  // Afgeronde VTK-kader met voldoende witte marge voor betrouwbare detectie.
  drawRoundedRect(canvas, 24, 24, 1152, 1152, 96, VTK_NAVY);
  drawRoundedRect(canvas, 56, 56, 1088, 1088, 70, WHITE);

  let logoModules = Math.max(7, Math.floor(matrixSize * 0.21));
  if (logoModules % 2 === 0) logoModules += 1;
  logoModules = Math.min(logoModules, 9);
  const center = Math.floor(matrixSize / 2);
  const logoRadius = Math.floor(logoModules / 2);
  const insideLogoPlate = (row: number, column: number) =>
    Math.abs(row - center) <= logoRadius && Math.abs(column - center) <= logoRadius;

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

  const logoPlateSize = logoModules * moduleSize;
  const logoPlateOrigin = gridOrigin + (center - logoRadius) * moduleSize;
  const logoInset = logoPlateSize * 0.12;
  drawRoundedRect(
    canvas,
    logoPlateOrigin,
    logoPlateOrigin,
    logoPlateSize,
    logoPlateSize,
    moduleSize * 1.15,
    WHITE,
  );

  const logoSize = Math.max(1, Math.round(logoPlateSize - logoInset * 2));
  const logo = await resizedShield(logoSize);
  if (logo) {
    compositeRawImage(
      canvas,
      logo,
      Math.round(logoPlateOrigin + logoInset),
      Math.round(logoPlateOrigin + logoInset),
    );
  }

  return sharp(canvas, {
    raw: { width: OUTPUT_SIZE, height: OUTPUT_SIZE, channels: 4 },
  })
    .png()
    .toBuffer();
}
