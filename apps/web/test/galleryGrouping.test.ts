import { describe, expect, it, vi } from "vitest";
import {
  groupAlbums,
  hiddenMarker,
  parseAlbumMarkers,
  setMarker,
  stripMarkers,
  swapMarker,
  type MappedAlbumEntry,
  type GalleryAlbum,
} from "@vtk/gallery";

function mockAlbum(id: string, title: string, count = 2): GalleryAlbum {
  return {
    id,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    description: "Beschrijving",
    date: "2026-03-14",
    year: 2026,
    photoCount: count,
    coverPhoto: null,
    photos: Array.from({ length: count }, (_, i) => ({
      id: `${id}-photo-${i + 1}`,
      title: `Foto ${i + 1}`,
      description: "",
      date: "2026-03-14",
      width: 1600,
      height: 1067,
      filename: `${id}-${i + 1}.jpg`,
      mimeType: "image/jpeg",
      thumbnailUrl: `http://proxy.test/thumb/${id}-${i + 1}`,
      previewUrl: `http://proxy.test/prev/${id}-${i + 1}`,
      originalUrl: `http://proxy.test/orig/${id}-${i + 1}`,
      downloadUrl: `/media/${id}/${id}-photo-${i + 1}`,
    })),
    shareUrl: `http://proxy.test/share/${id}`,
    updatedAt: "2026-03-15",
  };
}

function entry(
  id: string,
  title: string,
  description: string,
  count = 2,
): MappedAlbumEntry {
  const album = mockAlbum(id, title, count);
  const markers = parseAlbumMarkers(description, title);
  return {
    album,
    markers,
    rawTitle: title,
    rawDescription: description,
  };
}

describe("parseAlbumMarkers", () => {
  it("extraheert parent, group en tab merkers", () => {
    const res = parseAlbumMarkers(
      "Feestje!\n\n[gallery] [parent: galabal-2026] [tab: Photobooth]",
      "Galabal 2026 - Photobooth",
    );
    expect(res.parent).toBe("galabal-2026");
    expect(res.tab).toBe("Photobooth");
  });

  it("extraheert group merkers", () => {
    const res = parseAlbumMarkers(
      "[gallery] [group: galabal-2026] [tab: Zaal]",
      "Galabal 2026 - Zaal",
    );
    expect(res.group).toBe("galabal-2026");
    expect(res.tab).toBe("Zaal");
  });

  it("herkent titelpatronen met scheidingstekens", () => {
    const res1 = parseAlbumMarkers("[gallery]", "Galabal 2026: Zaal");
    expect(res1.titlePrefix).toBe("Galabal 2026");
    expect(res1.titleSuffix).toBe("Zaal");

    const res2 = parseAlbumMarkers("[gallery]", "Galabal 2026 // Photobooth");
    expect(res2.titlePrefix).toBe("Galabal 2026");
    expect(res2.titleSuffix).toBe("Photobooth");
  });
});

describe("stripMarkers", () => {
  it("verwijdert [parent:...], [group:...] en [tab:...] netjes uit de beschrijving", () => {
    const text = "Leuk feest!\n\n[gallery] [parent: galabal-2026] [tab: Photobooth]";
    expect(stripMarkers(text, ["[gallery]"])).toBe("Leuk feest!");
  });
});

describe("setMarker", () => {
  it("voegt een merker toe achter de bestaande beschrijving", () => {
    expect(setMarker("Leuk feest!", "tab", "Zaal")).toBe("Leuk feest!\n\n[tab: Zaal]");
  });

  it("vervangt een bestaande merker zonder de rest aan te raken", () => {
    const before = "Leuk feest!\n\n[gallery] [parent: galabal-2026] [tab: Zaal]";
    const after = setMarker(before, "tab", "Photobooth");
    expect(after).toContain("[tab: Photobooth]");
    expect(after).not.toContain("[tab: Zaal]");
    // Zonder [gallery] verdwijnt het album van de site; dat mag hier niet gebeuren.
    expect(after).toContain("[gallery]");
    expect(after).toContain("[parent: galabal-2026]");
    expect(after).toContain("Leuk feest!");
  });

  it("verwijdert de merker bij een lege waarde, zonder dubbele spaties", () => {
    const after = setMarker("[gallery] [parent: galabal-2026] [tab: Zaal]", "parent", null);
    expect(after).toBe("[gallery] [tab: Zaal]");
  });

  it("laat een beschrijving zonder die merker ongemoeid bij verwijderen", () => {
    expect(setMarker("Leuk feest!\n\n[gallery]", "tab", null)).toBe("Leuk feest!\n\n[gallery]");
  });
});

describe("swapMarker", () => {
  it("wisselt de galerijmerker voor de verborgen variant en terug", () => {
    const hidden = hiddenMarker("main");
    expect(hidden).toBe("[gallery-uit]");

    const off = swapMarker("Leuk feest!\n\n[gallery]", "[gallery]", hidden);
    expect(off).toBe("Leuk feest!\n\n[gallery-uit]");
    // De verborgen merker mag niet als de gewone gelezen worden, anders staat
    // het album gewoon terug op de site.
    expect(off.includes("[gallery]")).toBe(false);

    expect(swapMarker(off, hidden, "[gallery]")).toBe("Leuk feest!\n\n[gallery]");
  });

  it("voegt de merker toe wanneer er nog geen staat", () => {
    expect(swapMarker("Leuk feest!", "[gallery]", "[gallery-uit]")).toBe("Leuk feest!\n\n[gallery-uit]");
  });
});

describe("groupAlbums", () => {
  it("gebruikt de tabnaam van het hoofdalbum in plaats van \"Algemeen\"", () => {
    // Het hoofdalbum draagt zelf een [tab:]; enkel zonder die merker valt de tab
    // terug op "Algemeen", en dat was jarenlang niet in te vullen.
    const main = entry("a1", "Galabal 2026", "[gallery] [tab: Zaal]", 2);
    const sub = entry("a2", "Galabal 2026: Photobooth", "[gallery] [parent: galabal-2026] [tab: Photobooth]", 1);

    const grouped = groupAlbums([main, sub]);
    expect(grouped[0].subAlbums?.map((s) => s.title)).toEqual(["Zaal", "Photobooth"]);
  });

  it("valt terug op \"Algemeen\" wanneer het hoofdalbum geen tabnaam draagt", () => {
    const main = entry("a1", "Galabal 2026", "[gallery]", 2);
    const sub = entry("a2", "Galabal 2026: Photobooth", "[gallery] [parent: galabal-2026] [tab: Photobooth]", 1);

    const grouped = groupAlbums([main, sub]);
    expect(grouped[0].subAlbums?.[0].title).toBe("Algemeen");
  });

  it("groepeert een deelalbum onder zijn parentalbum via [parent:...]", () => {
    const main = entry("a1", "Galabal 2026", "Foto's van het bal.\n\n[gallery] [tab: Zaal]", 5);
    const sub = entry(
      "a2",
      "Galabal 2026 - Photobooth",
      "[gallery] [parent: galabal-2026] [tab: Photobooth]",
      3,
    );

    const grouped = groupAlbums([main, sub], (slug, assetId) => `/media/${slug}/${assetId}`);

    expect(grouped).toHaveLength(1);
    const event = grouped[0];
    expect(event.slug).toBe("galabal-2026");
    expect(event.title).toBe("Galabal 2026");
    expect(event.photoCount).toBe(8);
    expect(event.photos).toHaveLength(8);
    expect(event.subAlbums).toHaveLength(2);
    expect(event.subAlbums?.[0].title).toBe("Zaal");
    expect(event.subAlbums?.[0].slug).toBe("zaal");
    expect(event.subAlbums?.[0].photoCount).toBe(5);
    expect(event.subAlbums?.[1].title).toBe("Photobooth");
    expect(event.subAlbums?.[1].slug).toBe("photobooth");
    expect(event.subAlbums?.[1].photoCount).toBe(3);
    // Download URLs moeten de gecombineerde slug dragen
    expect(event.subAlbums?.[1].photos[0].downloadUrl).toBe(
      `/media/galabal-2026/${event.subAlbums?.[1].photos[0].id}`,
    );
  });

  it("groepeert twee albums via [group:...]", () => {
    const zaal = entry("a1", "Galabal 2026 - Zaal", "[gallery] [group: galabal-2026] [tab: Zaal]", 4);
    const booth = entry("a2", "Galabal 2026 - Photobooth", "[gallery] [group: galabal-2026] [tab: Photobooth]", 2);

    const grouped = groupAlbums([zaal, booth]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].slug).toBe("galabal-2026");
    expect(grouped[0].photoCount).toBe(6);
    expect(grouped[0].subAlbums).toHaveLength(2);
  });

  it("groepeert albums met titelpatroon 'Event: Tab' wanneer er 2 of meer zijn", () => {
    const e1 = entry("a1", "Galabal 2026: Zaal", "[gallery]", 3);
    const e2 = entry("a2", "Galabal 2026: Photobooth", "[gallery]", 2);

    const grouped = groupAlbums([e1, e2]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].slug).toBe("galabal-2026");
    expect(grouped[0].title).toBe("Galabal 2026");
    expect(grouped[0].photoCount).toBe(5);
    expect(grouped[0].subAlbums?.[0].title).toBe("Zaal");
    expect(grouped[0].subAlbums?.[1].title).toBe("Photobooth");
  });

  it("laat een enkel album met een dubbele punt in de titel met rust", () => {
    const single = entry("a1", "Workshop: AI", "[gallery]", 4);
    const grouped = groupAlbums([single]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].slug).toBe("workshop-ai");
    expect(grouped[0].subAlbums).toBeUndefined();
  });

  it("valt netjes terug als een ouder-album niet bestaat", () => {
    const orphan = entry("a1", "Photobooth", "[gallery] [parent: niet-bestaand] [tab: Photobooth]", 2);
    const grouped = groupAlbums([orphan]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].title).toBe("Photobooth");
  });
});

describe("createGalleryClient integratie met sub-albums", () => {
  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function asset(id: string) {
    return {
      id,
      type: "IMAGE",
      originalFileName: `${id}.jpg`,
      originalMimeType: "image/jpeg",
      fileCreatedAt: "2026-03-14T20:00:00.000Z",
    };
  }

  it("laadt en combineert sub-albums via de client", async () => {
    vi.stubEnv("GALLERY_IMMICH_API_URL", "http://immich.test/api");
    vi.stubEnv("GALLERY_IMMICH_API_KEY", "test-key");
    vi.stubEnv("GALLERY_PUBLIC_PROXY_URL", "http://proxy.test");
    vi.stubEnv("GALLERY_ALBUM_MARKER", "[gallery]");
    vi.stubEnv("GALLERY_CACHE_TTL_SECONDS", "0");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/albums")) {
        return jsonResponse([
          { id: "main-alb", albumName: "Galabal 2026", description: "[gallery] [tab: Zaal]", assetCount: 2 },
          { id: "booth-alb", albumName: "Galabal 2026 - Photobooth", description: "[gallery] [parent: galabal-2026] [tab: Photobooth]", assetCount: 1 },
        ]);
      }
      if (url.includes("/albums/main-alb")) {
        return jsonResponse({
          id: "main-alb",
          albumName: "Galabal 2026",
          description: "[gallery] [tab: Zaal]",
          assets: [asset("zaal-1"), asset("zaal-2")],
          assetCount: 2,
        });
      }
      if (url.includes("/albums/booth-alb")) {
        return jsonResponse({
          id: "booth-alb",
          albumName: "Galabal 2026 - Photobooth",
          description: "[gallery] [parent: galabal-2026] [tab: Photobooth]",
          assets: [asset("booth-1")],
          assetCount: 1,
        });
      }
      if (url.includes("/shared-links")) {
        const id = url.includes("booth-alb") ? "booth-alb" : "main-alb";
        return jsonResponse([{ id: `l-${id}`, key: `key-${id}`, type: "ALBUM", albumId: id }]);
      }
      return jsonResponse({});
    });

    try {
      const client = (await import("@vtk/gallery")).createGalleryClient({
        id: "main",
        downloadPath: (slug, assetId) => `/api/download/${slug}/${assetId}`,
      });

      // 1. listAlbums toont 1 overkoepelend album met samengevoegde telling
      const { albums } = await client.listAlbums();
      expect(albums).toHaveLength(1);
      expect(albums[0].slug).toBe("galabal-2026");
      expect(albums[0].photoCount).toBe(3);
      expect(albums[0].subAlbums).toHaveLength(2);
      expect(albums[0].subAlbums?.[0].title).toBe("Zaal");
      expect(albums[0].subAlbums?.[1].title).toBe("Photobooth");

      // 2. getAlbum geeft het album met subAlbums en foto's per tab
      const album = await client.getAlbum("galabal-2026");
      expect(album).not.toBeNull();
      expect(album?.subAlbums).toHaveLength(2);
      expect(album?.subAlbums?.[0].photos).toHaveLength(2);
      expect(album?.subAlbums?.[1].photos).toHaveLength(1);
      expect(album?.photos).toHaveLength(3);

      // 3. getDownloadTarget vindt foto's uit de sub-albums
      const target = await client.getDownloadTarget("galabal-2026", "booth-1");
      expect(target.photo.id).toBe("booth-1");

      // 4. getAlbum via de deelalbum-slug verwijst door naar het hoofdalbum
      const aliased = await client.getAlbum("galabal-2026-photobooth");
      expect(aliased?.slug).toBe("galabal-2026");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
