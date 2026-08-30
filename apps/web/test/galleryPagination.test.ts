import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGalleryClient } from "@vtk/gallery";

/**
 * Albums met meer foto's dan één pagina, en wat er gebeurt als er één stukgaat.
 *
 * Beide zijn hier ooit samengekomen. Immich geeft `nextPage` terug als string
 * ("2"), maar `/search/metadata` valideert `page` als getal en weigert die
 * string met HTTP 400. Dat trof enkel albums met meer dan 1000 foto's, en die
 * waren er niet tot het oude fotoarchief geïmporteerd werd. Omdat de
 * momentopname toen via `Promise.all` liep, nam dat ene album de volledige
 * galerij mee: `/media` toonde niets meer, ook de albums die er al stonden niet.
 *
 * Deze tests staan in `apps/web` en niet in `packages/gallery`, om dezelfde
 * reden als `gallerySeparation.test.ts`: enkel deze suite draait in `npm run
 * verify` en in de CI.
 */

type Handler = (url: string, init: RequestInit | undefined) => unknown;

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
    exifInfo: { dateTimeOriginal: "2026-01-01T00:00:00.000Z" },
  };
}

/** Houdt bij welke `page`-waarden er echt over de lijn gingen. */
const pagesSent: unknown[] = [];

function installFetch(handler: Handler) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/search/metadata")) {
      pagesSent.push(JSON.parse(String(init?.body)).page);
    }
    const body = handler(url, init);
    if (body instanceof Response) return body;
    return jsonResponse(body);
  });
}

function client(id: "main" | "fakbar" = "main") {
  return createGalleryClient({
    id,
    downloadPath: (slug, assetId) => `/media/${slug}/${assetId}`,
  });
}

beforeEach(() => {
  pagesSent.length = 0;
  vi.stubEnv("GALLERY_IMMICH_API_URL", "http://immich.test/api");
  vi.stubEnv("GALLERY_IMMICH_API_KEY", "test-key");
  vi.stubEnv("GALLERY_PUBLIC_PROXY_URL", "http://proxy.test");
  vi.stubEnv("GALLERY_ALBUM_MARKER", "[gallery]");
  vi.stubEnv("GALLERY_FAKBAR_ALBUM_MARKER", "[fakbar]");
  vi.stubEnv("GALLERY_CACHE_TTL_SECONDS", "0");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("albums over meerdere pagina's", () => {
  it("stuurt nextPage terug als getal, niet als de string die Immich teruggaf", async () => {
    installFetch((url) => {
      if (url.endsWith("/albums")) {
        return [{ id: "groot", albumName: "Galabal", description: "[gallery]", assetCount: 2 }];
      }
      if (url.includes("/albums/groot")) {
        return { id: "groot", albumName: "Galabal", description: "[gallery]", assetCount: 2 };
      }
      if (url.includes("/search/metadata")) {
        const page = pagesSent[pagesSent.length - 1];
        // Immich weigert een string; de tweede pagina moet dus getal 2 zijn.
        if (typeof page !== "number") {
          return jsonResponse({ message: "Validation failed" }, 400);
        }
        return page === 1
          ? { assets: { items: [asset("een")], nextPage: "2" } }
          : { assets: { items: [asset("twee")], nextPage: null } };
      }
      if (url.includes("/shared-links")) return [{ id: "l", key: "sleutel", type: "ALBUM", albumId: "groot" }];
      return [];
    });

    const album = await client().getAlbum("galabal");

    expect(pagesSent).toEqual([1, 2]);
    expect(album?.photos).toHaveLength(2);
  });

  /**
   * De fakbar draait op dezelfde `createGalleryClient`; er is geen tweede
   * implementatie. Deze test is er zodat een kopie voor 't ElixIr niet stil kan
   * ontstaan met dezelfde fout erin.
   */
  it("doet dat ook voor de fakbargalerij", async () => {
    installFetch((url) => {
      if (url.endsWith("/albums")) {
        return [{ id: "groot", albumName: "Cantus", description: "[fakbar]", assetCount: 2 }];
      }
      if (url.includes("/albums/groot")) {
        return { id: "groot", albumName: "Cantus", description: "[fakbar]", assetCount: 2 };
      }
      if (url.includes("/search/metadata")) {
        const page = pagesSent[pagesSent.length - 1];
        if (typeof page !== "number") return jsonResponse({ message: "Validation failed" }, 400);
        return page === 1
          ? { assets: { items: [asset("een")], nextPage: "2" } }
          : { assets: { items: [asset("twee")], nextPage: null } };
      }
      if (url.includes("/shared-links")) return [{ id: "l", key: "sleutel", type: "ALBUM", albumId: "groot" }];
      return [];
    });

    const { albums } = await client("fakbar").listAlbums();

    expect(pagesSent).toEqual([1, 2]);
    expect(albums[0]?.photoCount).toBe(2);
  });

  it("laat één stuk album de rest van de galerij niet meenemen", async () => {
    installFetch((url) => {
      if (url.endsWith("/albums")) {
        return [
          { id: "stuk", albumName: "Stuk album", description: "[gallery]", assetCount: 5 },
          { id: "goed", albumName: "Goed album", description: "[gallery]", assetCount: 1 },
        ];
      }
      if (url.includes("/albums/stuk")) return jsonResponse({ message: "kapot" }, 500);
      if (url.includes("/albums/goed")) {
        return { id: "goed", albumName: "Goed album", description: "[gallery]", assetCount: 1 };
      }
      if (url.includes("/search/metadata")) return { assets: { items: [asset("foto")], nextPage: null } };
      if (url.includes("/shared-links")) return [{ id: "l", key: "sleutel", type: "ALBUM", albumId: "goed" }];
      return [];
    });

    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { albums } = await client().listAlbums();

    expect(albums.map((album) => album.title)).toEqual(["Goed album"]);
  });

  it("haalt de foto's van een album van de andere galerij niet op", async () => {
    const detailCalls: string[] = [];
    installFetch((url) => {
      if (url.endsWith("/albums")) {
        return [
          { id: "onze", albumName: "Onze", description: "[gallery]", assetCount: 1 },
          { id: "hunne", albumName: "Hunne", description: "[fakbar]", assetCount: 1 },
        ];
      }
      if (url.includes("/albums/")) {
        detailCalls.push(url);
        return { id: "onze", albumName: "Onze", description: "[gallery]", assetCount: 1 };
      }
      if (url.includes("/search/metadata")) return { assets: { items: [asset("foto")], nextPage: null } };
      if (url.includes("/shared-links")) return [{ id: "l", key: "sleutel", type: "ALBUM", albumId: "onze" }];
      return [];
    });

    await client().listAlbums();

    expect(detailCalls).toHaveLength(1);
    expect(detailCalls[0]).toContain("onze");
  });
});
