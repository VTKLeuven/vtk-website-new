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

  async function decode(png: Buffer): Promise<string> {
    const { data, info } = await sharp(png)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const source = new RGBLuminanceSource(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
    );
    return new QRCodeReader()
      .decode(new BinaryBitmap(new HybridBinarizer(source)))
      .getText();
  }

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
    expect(pixel(20, 20)).toEqual([255, 255, 255]);
    expect(pixel(28, 600)).toEqual([14, 26, 54]);
    expect(pixel(50, 600)).toEqual([255, 255, 255]);

    // Het headerwoordmerk gebruikt hetzelfde blauw als de QR, zonder gekleurde
    // plaat of omlijning erachter.
    let logoPixels = 0;
    for (let y = 500; y < 700; y += 1) {
      for (let x = 500; x < 700; x += 1) {
        const [red, green, blue] = pixel(x, y);
        if (red === 14 && green === 26 && blue === 54) {
          logoPixels += 1;
        }
      }
    }
    expect(logoPixels).toBeGreaterThan(100);
    expect(pixel(500, 550)).toEqual([255, 255, 255]);

    // Met slechts één stille module ligt de eerste finder veel dichter tegen
    // de kader dan in de vroegere opmaak met drie stille modules.
    expect(pixel(80, 180)).toEqual([14, 26, 54]);
  });

  it("still decodes at full and compact preview sizes", async () => {
    const png = await createStyledShortlinkQrPng(publicUrl);
    const compact = await sharp(png).resize(320, 320).png().toBuffer();
    const small = await sharp(png).resize(240, 240).png().toBuffer();

    expect(await decode(png)).toBe(publicUrl);
    expect(await decode(compact)).toBe(publicUrl);
    expect(await decode(small)).toBe(publicUrl);
  });
});
