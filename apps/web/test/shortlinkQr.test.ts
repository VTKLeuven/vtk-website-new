import {
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from "@zxing/library";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createStyledShortlinkQrPng } from "@/lib/shortlink-qr";

describe("styled short-link QR code", () => {
  const publicUrl = "https://on.vtk.be/welkom";

  it("renders rounded VTK styling directly as a 1200px raster image", async () => {
    const png = await createStyledShortlinkQrPng(publicUrl);
    const metadata = await sharp(png).metadata();
    expect(metadata).toMatchObject({ format: "png", width: 1200, height: 1200 });

    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return [...data.subarray(offset, offset + 3)];
    };

    // Afgeronde buitenhoek, blauwe kader, witte binnenzijde.
    expect(pixel(24, 24)).toEqual([255, 255, 255]);
    expect(pixel(32, 600)).toEqual([14, 26, 54]);
    expect(pixel(70, 600)).toEqual([255, 255, 255]);

    // Het VTK-schild voegt herkenbaar geel toe rond het midden.
    let yellowPixels = 0;
    for (let y = 500; y < 700; y += 1) {
      for (let x = 500; x < 700; x += 1) {
        const [red, green, blue] = pixel(x, y);
        if (red > 180 && green > 150 && blue < 100) yellowPixels += 1;
      }
    }
    expect(yellowPixels).toBeGreaterThan(100);
  });

  it("still decodes to the exact short URL", async () => {
    const png = await createStyledShortlinkQrPng(publicUrl);

    const { data, info } = await sharp(png)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const source = new RGBLuminanceSource(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
    );
    const result = new QRCodeReader().decode(
      new BinaryBitmap(new HybridBinarizer(source)),
    );

    expect(result.getText()).toBe(publicUrl);
  });
});
