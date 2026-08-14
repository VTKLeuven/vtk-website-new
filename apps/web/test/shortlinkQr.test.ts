import {
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from "@zxing/library";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createStyledShortlinkQrPng,
  createStyledShortlinkQrSvg,
} from "@/lib/shortlink-qr";

describe("styled short-link QR code", () => {
  const publicUrl = "https://on.vtk.be/welkom";

  it("uses rounded VTK styling and reserves a shield in the centre", () => {
    const svg = createStyledShortlinkQrSvg(publicUrl, "data:image/png;base64,shield");

    expect(svg).toContain('width="1200" height="1200"');
    expect(svg).toContain('fill="#0e1a36"');
    expect(svg).toContain("<image ");
    expect(svg).toContain('rx="');
  });

  it("renders a 1200px PNG that still decodes to the short URL", async () => {
    const png = await createStyledShortlinkQrPng(publicUrl);
    const metadata = await sharp(png).metadata();
    expect(metadata).toMatchObject({ format: "png", width: 1200, height: 1200 });

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
