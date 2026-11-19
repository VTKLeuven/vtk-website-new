import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { streamZip } from "@vtk/storage";
import { albumZipEntries, albumZipFilename } from "@/lib/media-album-zip";
import { albumZipUrl, photoDownloadUrl } from "@/lib/media-admin-shared";

/**
 * De zip van een album in het mediabeheer: welke bestanden erin komen, onder
 * welke naam, en hoe het archief gestreamd wordt.
 */

const photo = (id: string, filename: string, extra: Partial<{ hidden: boolean; video: boolean }> = {}) => ({
  id,
  filename,
  hidden: false,
  video: false,
  ...extra,
});

describe("albumZipEntries", () => {
  it("houdt een album zonder tabs plat, in de volgorde van het scherm", () => {
    const entries = albumZipEntries([{ name: "Algemeen", photos: [photo("a", "een.jpg"), photo("b", "twee.jpg")] }]);
    expect(entries).toEqual([
      { assetId: "a", name: "een.jpg" },
      { assetId: "b", name: "twee.jpg" },
    ]);
  });

  it("zet elke tab in een eigen map zodra er meer dan één is", () => {
    const entries = albumZipEntries([
      { name: "Zaal", photos: [photo("a", "een.jpg")] },
      { name: "Photobooth", photos: [photo("b", "een.jpg")] },
    ]);
    expect(entries.map((entry) => entry.name)).toEqual(["Zaal/een.jpg", "Photobooth/een.jpg"]);
  });

  it("neemt ook de verborgen foto's mee, achter de zichtbare van hun tab", () => {
    const entries = albumZipEntries([
      {
        name: "Algemeen",
        photos: [photo("a", "zichtbaar.jpg"), photo("b", "verborgen.jpg", { hidden: true })],
      },
    ]);
    expect(entries).toEqual([
      { assetId: "a", name: "zichtbaar.jpg" },
      { assetId: "b", name: "verborgen.jpg" },
    ]);
  });

  it("geeft twee foto's met dezelfde naam elk hun eigen naam", () => {
    const entries = albumZipEntries([
      {
        name: "Algemeen",
        photos: [photo("a", "IMG_0001.jpg"), photo("b", "IMG_0001.jpg"), photo("c", "img_0001.JPG"), photo("d", "kaart")],
      },
    ]);
    expect(entries.map((entry) => entry.name)).toEqual([
      "IMG_0001.jpg",
      "IMG_0001 (2).jpg",
      "img_0001 (3).JPG",
      "kaart",
    ]);
  });

  it("laat een naam met een pad of enkel punten niet uit zijn map ontsnappen", () => {
    const entries = albumZipEntries([
      { name: "../Zaal", photos: [photo("a", "../../etc/passwd"), photo("b", ".."), photo("c", "")] },
      { name: "Andere", photos: [] },
    ]);
    for (const entry of entries) {
      const segments = entry.name.split("/");
      expect(segments).toHaveLength(2);
      expect(segments).not.toContain("..");
    }
    expect(entries.map((entry) => entry.name)).toEqual([
      "..-Zaal/passwd",
      "..-Zaal/foto-0002.jpg",
      "..-Zaal/foto-0003.jpg",
    ]);
  });

  it("geeft een foto zonder naam een nummer, met .mp4 voor een video", () => {
    const entries = albumZipEntries([
      { name: "Algemeen", photos: [photo("a", ""), photo("b", "", { video: true })] },
    ]);
    expect(entries.map((entry) => entry.name)).toEqual(["foto-0001.jpg", "foto-0002.mp4"]);
  });

  it("neemt een album mee waar alles verborgen is", () => {
    const entries = albumZipEntries([{ name: "Algemeen", photos: [photo("a", "x.jpg", { hidden: true })] }]);
    expect(entries).toEqual([{ assetId: "a", name: "x.jpg" }]);
  });

  it("geeft niets terug voor een album zonder foto's", () => {
    expect(albumZipEntries([{ name: "Algemeen", photos: [] }])).toEqual([]);
  });
});

describe("albumZipFilename en adressen", () => {
  it("neemt de titel van het album, zonder tekens die een bestandsnaam breken", () => {
    expect(albumZipFilename("Galabal 2026")).toBe("Galabal 2026.zip");
    expect(albumZipFilename("Cantus: najaar/2026")).toBe("Cantus- najaar-2026.zip");
    expect(albumZipFilename("   ")).toBe("album.zip");
  });

  it("codeert het album en de foto in het adres", () => {
    expect(albumZipUrl("a/b")).toBe("/api/admin/immich-gallery/albums/a%2Fb/download");
    expect(photoDownloadUrl("album-1", "foto 1")).toBe(
      "/api/admin/immich-gallery/albums/album-1/photos/foto%201/download",
    );
  });
});

async function drain(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

describe("streamZip", () => {
  it("opent één entry per keer en schrijft zonder compressie", async () => {
    let open = 0;
    let mostOpen = 0;
    const content = "x".repeat(2000);
    const stream = streamZip(
      [{ name: "een.txt" }, { name: "map/twee.txt" }, { name: "drie.txt" }],
      async (entry) => {
        open += 1;
        mostOpen = Math.max(mostOpen, open);
        const source = Readable.from([Buffer.from(`${entry.name}:${content}`)]);
        source.once("end", () => {
          open -= 1;
        });
        return source;
      },
      { store: true },
    );

    const zip = await drain(stream);

    expect(mostOpen).toBe(1);
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    // Zonder compressie staat de inhoud letterlijk in het archief; mét zlib
    // zou "xxxx..." tot een paar bytes krimpen.
    expect(zip.includes(Buffer.from(`map/twee.txt:${content}`))).toBe(true);
    for (const name of ["een.txt", "map/twee.txt", "drie.txt"]) {
      expect(zip.includes(Buffer.from(name))).toBe(true);
    }
  });

  it("breekt af wanneer een entry niet opent, in plaats van een onvolledige zip te leveren", async () => {
    const stream = streamZip([{ name: "een.txt" }, { name: "kapot.txt" }], async (entry) => {
      if (entry.name === "kapot.txt") throw new Error("Immich antwoordde niet");
      return Readable.from([Buffer.from("inhoud")]);
    });

    await expect(drain(stream)).rejects.toThrow("Immich antwoordde niet");
  });

  it("sluit het openstaande bestand wanneer de lezer stopt", async () => {
    let source: Readable | undefined;
    const stream = streamZip([{ name: "groot.bin" }, { name: "nooit.bin" }], async (entry) => {
      if (entry.name === "nooit.bin") throw new Error("mocht nooit geopend worden");
      // Een bron die blijft doorstromen, zoals een video van enkele gigabytes.
      source = new Readable({
        read() {
          this.push(Buffer.alloc(64 * 1024));
        },
      });
      return source;
    });

    const reader = stream.getReader();
    await reader.read();
    expect(source?.destroyed).toBe(false);
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(source?.destroyed).toBe(true);
  });
});
