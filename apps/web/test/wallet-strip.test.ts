import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { stripImage } from "@/lib/ticketing/wallet/apple";

/** A tall photo with a red top third, blue middle and green bottom third, so
 * the focal point is visible in the resulting crop rather than merely
 * "an image came out". */
async function bandedPortrait(): Promise<Buffer> {
  const band = (r: number, g: number, b: number) =>
    sharp({ create: { width: 600, height: 400, channels: 3, background: { r, g, b } } }).png().toBuffer();
  return sharp({ create: { width: 600, height: 1200, channels: 3, background: { r: 20, g: 120, b: 200 } } })
    .composite([
      { input: await band(220, 40, 40), top: 0, left: 0 },
      { input: await band(30, 180, 60), top: 800, left: 0 },
    ])
    .jpeg()
    .toBuffer();
}

async function centrePixel(png: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const x = Math.floor(info.width / 2);
  const y = Math.floor(info.height / 2);
  const offset = (y * info.width + x) * info.channels;
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
}

describe("Apple Wallet strip image", () => {
  it("renders the event ticket strip ratio at each retina scale", async () => {
    const source = await bandedPortrait();
    for (const [scale, width, height] of [[1, 375, 144], [2, 750, 288], [3, 1125, 432]] as const) {
      const meta = await sharp(await stripImage(source, 50, 50, scale)).metadata();
      expect([meta.width, meta.height]).toEqual([width, height]);
    }
  });

  it("crops around the focal point instead of always centring", async () => {
    const source = await bandedPortrait();
    const top = await centrePixel(await stripImage(source, 50, 0, 1));
    const middle = await centrePixel(await stripImage(source, 50, 50, 1));
    const bottom = await centrePixel(await stripImage(source, 50, 100, 1));
    // Top third is red, middle blue, bottom green: a centre-only crop would
    // return the same colour three times.
    expect(top.r).toBeGreaterThan(top.g + 50);
    expect(middle.b).toBeGreaterThan(middle.r + 50);
    expect(bottom.g).toBeGreaterThan(bottom.r + 50);
  });
});
