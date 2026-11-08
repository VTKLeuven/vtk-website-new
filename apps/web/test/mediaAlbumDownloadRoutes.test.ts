import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFilenameFromResponse, galleryStatus } from "@vtk/gallery";

/**
 * De twee downloadroutes van het mediabeheer: het hele album als zip en één
 * foto. Immich en de albumlader zijn nagemaakt; wat hier getoetst wordt, is wat
 * de routes zelf beslissen: wie het mag, wat erin zit en wat er 404 geeft.
 */

const mocks = vi.hoisted(() => ({
  requireAnyPermission: vi.fn(),
  loadLibraryAlbum: vi.fn(),
  downloadImmichOriginal: vi.fn(),
  getImmichAsset: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireAnyPermission: mocks.requireAnyPermission,
  authErrorResponse: () => new Response("Forbidden", { status: 403 }),
}));
vi.mock("@/lib/media-admin", () => ({ loadLibraryAlbum: mocks.loadLibraryAlbum }));
vi.mock("@/lib/immich-gallery", () => ({
  downloadImmichOriginal: mocks.downloadImmichOriginal,
  getImmichAsset: mocks.getImmichAsset,
  downloadFilenameFromImmichResponse: downloadFilenameFromResponse,
  immichGalleryStatus: galleryStatus,
}));

import { GET as downloadAlbum } from "@/app/api/admin/immich-gallery/albums/[albumId]/download/route";
import { GET as downloadPhoto } from "@/app/api/admin/immich-gallery/albums/[albumId]/photos/[assetId]/download/route";
import { withHiddenPhotoDetails } from "@/lib/media-hidden-photos";

const request = new Request("https://vtk.be/api/admin/immich-gallery/test");

/**
 * Zoals `loadLibraryAlbum` ze geeft: een verborgen foto heeft geen naam (de
 * verberg-actie bewaart er geen) en staat altijd als foto, nooit als video.
 */
function album(overrides: { hidden?: boolean; title?: string } = {}) {
  return {
    album: { id: "album-1", title: overrides.title ?? "Galabal 2026", hidden: overrides.hidden ?? false },
    parts: [
      {
        id: "album-1",
        name: "Zaal",
        photos: [
          { id: "a1", filename: "dans.jpg", hidden: false, video: false },
          { id: "a2", filename: "", hidden: true, video: false },
          { id: "a3", filename: "", hidden: true, video: false },
        ],
      },
      { id: "part-2", name: "Photobooth", photos: [{ id: "b1", filename: "dans.jpg", hidden: false, video: false }] },
    ],
    publicPath: null,
  };
}

function original(id: string, headers: Record<string, string> = {}) {
  return new Response(`inhoud-van-${id}`, { headers: { "content-type": "image/jpeg", ...headers } });
}

const ASSETS: Record<string, { id: string; originalFileName: string; type: string }> = {
  a2: { id: "a2", originalFileName: "IMG_9.jpg", type: "IMAGE" },
  a3: { id: "a3", originalFileName: "clip.mov", type: "VIDEO" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAnyPermission.mockResolvedValue(undefined);
  mocks.loadLibraryAlbum.mockResolvedValue(album());
  mocks.downloadImmichOriginal.mockImplementation(async (id: string) => original(id));
  mocks.getImmichAsset.mockImplementation(async (id: string) => ASSETS[id]);
});

describe("GET /api/admin/immich-gallery/albums/[albumId]/download", () => {
  const context = (albumId = "album-1") => ({ params: Promise.resolve({ albumId }) });

  it("levert een zip met elke tab in een map, verborgen foto's inbegrepen", async () => {
    const response = await downloadAlbum(request, context());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain('filename="Galabal 2026.zip"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    const zip = Buffer.from(await response.arrayBuffer());
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    for (const part of [
      "Zaal/dans.jpg",
      "Photobooth/dans.jpg",
      "inhoud-van-a1",
      "inhoud-van-a2",
      "inhoud-van-a3",
      "inhoud-van-b1",
    ]) {
      expect(zip.includes(Buffer.from(part))).toBe(true);
    }
    expect(mocks.downloadImmichOriginal.mock.calls.map(([id]) => id)).toEqual(["a1", "a2", "a3", "b1"]);
  });

  it("geeft een verborgen foto haar echte naam en een verborgen video haar echte extensie", async () => {
    const response = await downloadAlbum(request, context());
    const zip = Buffer.from(await response.arrayBuffer());

    expect(zip.includes(Buffer.from("Zaal/IMG_9.jpg"))).toBe(true);
    expect(zip.includes(Buffer.from("Zaal/clip.mov"))).toBe(true);
    // Zonder aanvulling zouden ze foto-0002.jpg en foto-0003.jpg heten.
    expect(zip.includes(Buffer.from("foto-000"))).toBe(false);
    // Enkel de verborgen foto's worden bij Immich nagevraagd.
    expect(mocks.getImmichAsset.mock.calls.map(([id]) => id).sort()).toEqual(["a2", "a3"]);
  });

  it("valt terug op een nummer wanneer Immich de naam van een verborgen foto niet kent", async () => {
    mocks.getImmichAsset.mockRejectedValue(new Error("Immich antwoordde niet"));

    const response = await downloadAlbum(request, context());
    const zip = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(zip.includes(Buffer.from("Zaal/foto-0002.jpg"))).toBe(true);
    expect(zip.includes(Buffer.from("Zaal/foto-0003.jpg"))).toBe(true);
    expect(zip.includes(Buffer.from("inhoud-van-a2"))).toBe(true);
  });

  it("neemt een verborgen album mee: het album staat enkel van de site, de foto's zijn er nog", async () => {
    mocks.loadLibraryAlbum.mockResolvedValue(album({ hidden: true }));

    const response = await downloadAlbum(request, context());
    // De zip stroomt pas door als iemand leest: zonder dit loopt de rest van de
    // stream door in de volgende test.
    await response.arrayBuffer();

    expect(response.status).toBe(200);
    expect(mocks.downloadImmichOriginal).toHaveBeenCalledTimes(4);
  });

  it("weigert wie het mediabeheer niet mag gebruiken, zonder Immich aan te raken", async () => {
    mocks.requireAnyPermission.mockRejectedValue(new Error("FORBIDDEN"));

    const response = await downloadAlbum(request, context());

    expect(response.status).toBe(403);
    expect(mocks.requireAnyPermission).toHaveBeenCalledWith(["media.manage", "photos.manageAlbums"]);
    expect(mocks.loadLibraryAlbum).not.toHaveBeenCalled();
    expect(mocks.downloadImmichOriginal).not.toHaveBeenCalled();
  });

  it("geeft 404 voor een album dat niet bestaat of in de prullenmand ligt", async () => {
    mocks.loadLibraryAlbum.mockResolvedValue(null);

    const response = await downloadAlbum(request, context("weg"));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "album_not_found" });
  });

  it("geeft 404 voor een album zonder foto's, in plaats van een lege zip", async () => {
    const empty = album();
    empty.parts = [{ id: "album-1", name: "Zaal", photos: [] }];
    mocks.loadLibraryAlbum.mockResolvedValue(empty);

    const response = await downloadAlbum(request, context());

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "album_empty" });
  });

  it("levert een zip voor een album waar alle foto's verborgen zijn", async () => {
    const allHidden = album();
    allHidden.parts = [{ id: "album-1", name: "Zaal", photos: [{ id: "a2", filename: "", hidden: true, video: false }] }];
    mocks.loadLibraryAlbum.mockResolvedValue(allHidden);

    const response = await downloadAlbum(request, context());
    const zip = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(zip.includes(Buffer.from("IMG_9.jpg"))).toBe(true);
  });

  it("breekt af wanneer een origineel ook na een tweede poging niet opent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.downloadImmichOriginal.mockImplementation(async (id: string) => {
      if (id === "b1") throw new Error("NFS hapert");
      return original(id);
    });

    const response = await downloadAlbum(request, context());

    await expect(response.arrayBuffer()).rejects.toThrow("NFS hapert");
    // b1 kreeg twee pogingen, de andere drie elk één.
    expect(mocks.downloadImmichOriginal.mock.calls.map(([id]) => id)).toEqual(["a1", "a2", "a3", "b1", "b1"]);
  });
});

describe("withHiddenPhotoDetails", () => {
  const photo = (id: string, extra: Partial<{ filename: string; hidden: boolean }> = {}) => ({
    id,
    filename: "",
    hidden: false,
    video: false,
    ...extra,
  });

  it("raakt Immich niet aan wanneer er niets verborgen is", async () => {
    const parts = [{ photos: [photo("a", { filename: "a.jpg" })] }];

    expect(await withHiddenPhotoDetails(parts)).toBe(parts);
    expect(mocks.getImmichAsset).not.toHaveBeenCalled();
  });

  it("laat de zichtbare foto's en een naam die al bekend is staan", async () => {
    const parts = [{ photos: [photo("a", { filename: "a.jpg" }), photo("a2", { filename: "eigen.jpg", hidden: true })] }];

    const [result] = await withHiddenPhotoDetails(parts);

    expect(result.photos[0]).toEqual(parts[0].photos[0]);
    // Een naam die de rij wel had, wint van die van Immich; het soort komt van Immich.
    expect(result.photos[1]).toMatchObject({ id: "a2", filename: "eigen.jpg", video: false });
    expect(mocks.getImmichAsset.mock.calls.map(([id]) => id)).toEqual(["a2"]);
  });

  it("vult ook meer verborgen foto's aan dan er tegelijk nagevraagd worden", async () => {
    mocks.getImmichAsset.mockImplementation(async (id: string) => ({
      id,
      originalFileName: `${id}.jpg`,
      type: "IMAGE",
    }));
    const parts = [{ photos: Array.from({ length: 20 }, (_, index) => photo(`h${index}`, { hidden: true })) }];

    const [result] = await withHiddenPhotoDetails(parts);

    expect(result.photos.map((item) => item.filename)).toEqual(parts[0].photos.map((item) => `${item.id}.jpg`));
  });
});

describe("GET /api/admin/immich-gallery/albums/[albumId]/photos/[assetId]/download", () => {
  const context = (assetId: string) => ({ params: Promise.resolve({ albumId: "album-1", assetId }) });

  it("levert het origineel als download, met de naam die Immich meegeeft", async () => {
    mocks.downloadImmichOriginal.mockResolvedValue(
      original("a1", { "content-disposition": 'attachment; filename="IMG_4410.jpg"', "content-length": "13" }),
    );

    const response = await downloadPhoto(request, context("a1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-disposition")).toContain('filename="IMG_4410.jpg"');
    expect(response.headers.get("content-length")).toBe("13");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("inhoud-van-a1");
  });

  it("laat ook een verborgen foto toe: ze staat gedimd in het beheer en is er nog", async () => {
    mocks.downloadImmichOriginal.mockResolvedValue(
      original("a2", { "content-disposition": 'attachment; filename="IMG_9.jpg"' }),
    );

    const response = await downloadPhoto(request, context("a2"));

    expect(response.status).toBe(200);
    expect(mocks.downloadImmichOriginal).toHaveBeenCalledWith("a2");
    expect(response.headers.get("content-disposition")).toContain('filename="IMG_9.jpg"');
  });

  it("weigert een foto die niet bij dit album hoort: geen algemene proxy op Immich", async () => {
    const response = await downloadPhoto(request, context("ergens-anders"));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "photo_not_found" });
    expect(mocks.downloadImmichOriginal).not.toHaveBeenCalled();
  });

  it("weigert wie het mediabeheer niet mag gebruiken", async () => {
    mocks.requireAnyPermission.mockRejectedValue(new Error("FORBIDDEN"));

    const response = await downloadPhoto(request, context("a1"));

    expect(response.status).toBe(403);
    expect(mocks.loadLibraryAlbum).not.toHaveBeenCalled();
  });

  it("geeft 404 wanneer het album zelf er niet meer is", async () => {
    mocks.loadLibraryAlbum.mockResolvedValue(null);

    const response = await downloadPhoto(request, context("a1"));

    expect(response.status).toBe(404);
    expect(mocks.downloadImmichOriginal).not.toHaveBeenCalled();
  });
});
