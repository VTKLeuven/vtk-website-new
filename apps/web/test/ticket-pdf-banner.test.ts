import { PDFDocument, PDFName, PDFDict, PDFRawStream } from "pdf-lib";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_TICKET_DESIGN } from "@/lib/ticketing/design";

/** Twee herkenbare foto's in de "bucket": een WebP-banner en een JPEG-affiche. */
const objects = new Map<string, Buffer>();
const requested: string[] = [];
vi.mock("@vtk/storage", () => ({
  getObjectBuffer: async (key: string) => {
    requested.push(key);
    const bytes = objects.get(key);
    if (!bytes) throw new Error("NoSuchKey");
    return bytes;
  },
}));

const { generateTicketsPdf } = await import("@/lib/ticketing/pdf");

beforeAll(async () => {
  objects.set("images/banner.webp", await sharp({ create: { width: 320, height: 180, channels: 3, background: "#c0392b" } }).webp().toBuffer());
  objects.set("ticket-design/event-1/artwork.jpg", await sharp({ create: { width: 300, height: 200, channels: 3, background: "#27ae60" } }).jpeg().toBuffer());
});

/** Breedte en hoogte van elke JPEG die in de PDF ingebed is. */
async function embeddedJpegs(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  return pdf.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFRawStream)) return [];
    const dict: PDFDict = object.dict;
    if (dict.get(PDFName.of("Filter")) !== PDFName.of("DCTDecode")) return [];
    return [`${dict.get(PDFName.of("Width"))}x${dict.get(PDFName.of("Height"))}`];
  });
}

function render(artwork: boolean, variant: "colour" | "print" = "colour") {
  return generateTicketsPdf({
    orderNumber: "VTK-BANNER",
    currency: "EUR",
    variant,
    event: {
      id: "event-1",
      title: "Bannertest",
      startsAt: new Date("2027-04-03T18:00:00Z"),
      location: "Leuven",
      banner: { key: "images/banner.webp", focalX: 50, focalY: 50 },
    },
    tickets: [1, 2].map((n) => ({
      publicId: `ticket-${n}`,
      qrVersion: 1,
      attendeeName: "Alex",
      typeName: "Standaard",
      unitPriceCents: 1_000,
      designSnapshot: {
        ...DEFAULT_TICKET_DESIGN,
        artwork: artwork ? { key: "ticket-design/event-1/artwork.jpg", focalX: 50, focalY: 50 } : undefined,
        revision: 1,
        publishedAt: "2027-01-01T00:00:00.000Z",
      },
    })),
  });
}

describe("banner van het ticketevent op de kleurversie", () => {
  it("zonder affiche staat de banner erop, één keer ingebed voor alle tickets", async () => {
    requested.length = 0;
    expect(await embeddedJpegs(await render(false))).toEqual(["320x180"]);
    expect(requested.filter((key) => key === "images/banner.webp")).toHaveLength(1);
  }, 20_000);

  it("een affiche in het ontwerp overschrijft de banner", async () => {
    requested.length = 0;
    const jpegs = await embeddedJpegs(await render(true));
    expect(jpegs).toContain("300x200");
    expect(jpegs).not.toContain("320x180");
    expect(requested).not.toContain("images/banner.webp");
  }, 20_000);

  it("de printversie tekent geen banner", async () => {
    expect(await embeddedJpegs(await render(false, "print"))).toEqual([]);
  }, 20_000);
});
