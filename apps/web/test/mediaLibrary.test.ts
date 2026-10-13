import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGalleryClient, hiddenMarker } from "@vtk/gallery";
import { TRASH_DAYS, trashCutoff, trashDaysLeft } from "@/lib/media-admin-shared";

/**
 * De albumlijst van het mediabeheer (`listAdminAlbums`) en de prullenmand.
 *
 * De lijst leest Immich rechtstreeks in plaats van de momentopname van de site,
 * zodat ook verborgen albums erin staan. Dat mag niet betekenen dat ze anders
 * gegroepeerd worden of een andere slug krijgen dan op de site: een nieuwe tab
 * schrijft `[parent: <slug>]`, en die slug moet naar hetzelfde album wijzen.
 */

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type ImmichAlbum = {
  id: string;
  albumName: string;
  description: string;
  startDate?: string | null;
  assetCount?: number;
  albumThumbnailAssetId?: string | null;
};

const posted: Array<{ url: string; body: unknown }> = [];

function installImmich(albums: ImmichAlbum[]) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      posted.push({ url, body: JSON.parse(String(init.body)) });
      return jsonResponse({ id: "new-album" });
    }
    if (url.endsWith("/albums")) return jsonResponse(albums);
    return jsonResponse({}, 404);
  });
}

function client() {
  return createGalleryClient({ id: "main", downloadPath: (slug, assetId) => `/media/${slug}/${assetId}` });
}

beforeEach(() => {
  posted.length = 0;
  vi.stubEnv("GALLERY_IMMICH_API_URL", "http://immich.test/api");
  vi.stubEnv("GALLERY_IMMICH_API_KEY", "test-key");
  vi.stubEnv("GALLERY_PUBLIC_PROXY_URL", "http://proxy.test");
  vi.stubEnv("GALLERY_ALBUM_MARKER", "[gallery]");
  vi.stubEnv("GALLERY_FAKBAR_ALBUM_MARKER", "[fakbar]");
  vi.stubEnv("GALLERY_CACHE_TTL_SECONDS", "0");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("listAdminAlbums", () => {
  it("toont zichtbare en verborgen albums samen, nieuwste bovenaan", async () => {
    const off = hiddenMarker("main");
    installImmich([
      { id: "old", albumName: "Kerstcantus", description: "[gallery]", startDate: "2025-12-11", assetCount: 58 },
      { id: "off", albumName: "Proffentap", description: `Nog nakijken ${off}`, startDate: "2026-03-04", assetCount: 47 },
      { id: "new", albumName: "Schuimfuif", description: "[gallery]", startDate: "2026-04-30", assetCount: 407 },
    ]);

    const albums = await client().listAdminAlbums();

    expect(albums.map((album) => album.id)).toEqual(["new", "off", "old"]);
    expect(albums.find((album) => album.id === "off")).toMatchObject({
      hidden: true,
      description: "Nog nakijken",
      photoCount: 47,
    });
    expect(albums.find((album) => album.id === "new")?.hidden).toBe(false);
  });

  it("laat albums van een andere galerij en dubbelzinnige albums weg", async () => {
    installImmich([
      { id: "mine", albumName: "Livecantus", description: "[gallery]", startDate: "2025-12-01" },
      { id: "fakbar", albumName: "Fakbar avond", description: "[fakbar]", startDate: "2025-12-02" },
      { id: "both", albumName: "Twijfel", description: "[gallery] [fakbar]", startDate: "2025-12-03" },
      { id: "none", albumName: "Privé", description: "", startDate: "2025-12-04" },
    ]);

    const albums = await client().listAdminAlbums();

    expect(albums.map((album) => album.id)).toEqual(["mine"]);
  });

  it("groepeert tabs zoals de site, ook onder een verborgen hoofdalbum", async () => {
    const off = hiddenMarker("main");
    installImmich([
      {
        id: "zaal",
        albumName: "Galabal 2026",
        description: `${off} [tab: Zaal]`,
        startDate: "2026-04-03",
        assetCount: 877,
        albumThumbnailAssetId: "cover-asset",
      },
      {
        id: "booth",
        albumName: "Galabal 2026: Photobooth",
        description: "[gallery] [parent: galabal-2026] [tab: Photobooth]",
        startDate: "2026-04-03",
        assetCount: 668,
      },
    ]);

    const [album] = await client().listAdminAlbums();

    expect(album).toMatchObject({
      id: "zaal",
      title: "Galabal 2026",
      photoCount: 1545,
      hidden: true,
      coverAssetId: "cover-asset",
      hasOwnTabName: true,
    });
    expect(album.parts).toEqual([
      { id: "zaal", name: "Zaal", photoCount: 877, hidden: true },
      { id: "booth", name: "Photobooth", photoCount: 668, hidden: false },
    ]);
  });

  it("kent slugs toe zoals de momentopname: eerst de zichtbare, dan de verborgen", async () => {
    const off = hiddenMarker("main");
    installImmich([
      // Het nieuwste, maar verborgen: de site kent het niet, dus het mag de slug
      // van een zichtbaar album niet inpikken.
      { id: "2027", albumName: "Schuimfuif", description: off, startDate: "2027-04-28" },
      { id: "2026", albumName: "Schuimfuif", description: "[gallery]", startDate: "2026-04-30" },
      { id: "2025", albumName: "Schuimfuif", description: "[gallery]", startDate: "2025-05-01" },
    ]);

    const albums = await client().listAdminAlbums();
    const slugOf = (id: string) => albums.find((album) => album.id === id)?.slug;

    expect(slugOf("2026")).toBe("schuimfuif");
    expect(slugOf("2025")).toBe("schuimfuif-2");
    expect(slugOf("2027")).toBe("schuimfuif-3");
  });
});

describe("createAlbum", () => {
  it("zet een verborgen album meteen met de uit-merker, en een gewoon met de galerijmerker", async () => {
    installImmich([]);

    await client().createAlbum({ title: "Openingsavond", hidden: true });
    await client().createAlbum({ title: "Kerstcantus", description: "Gezellig" });

    expect(posted[0].body).toEqual({ albumName: "Openingsavond", description: hiddenMarker("main") });
    expect(posted[1].body).toEqual({ albumName: "Kerstcantus", description: "Gezellig\n\n[gallery]" });
  });
});

describe("prullenmand", () => {
  const now = new Date("2026-10-12T12:00:00Z");

  it("telt de dagen af tot 0, nooit eronder", () => {
    expect(trashDaysLeft(now, now)).toBe(TRASH_DAYS);
    expect(trashDaysLeft(new Date("2026-10-02T12:00:00Z"), now)).toBe(TRASH_DAYS - 10);
    expect(trashDaysLeft(new Date("2026-08-01T12:00:00Z"), now)).toBe(0);
  });

  it("legt de grens precies 30 dagen terug", () => {
    expect(trashCutoff(now).toISOString()).toBe("2026-09-12T12:00:00.000Z");
  });
});
