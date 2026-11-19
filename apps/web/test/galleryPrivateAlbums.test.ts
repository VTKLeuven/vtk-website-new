import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  albumVisibility,
  createGalleryClient,
  galleryMarker,
  hiddenMarker,
  privateMarker,
  replaceVisibilityMarker,
} from "@vtk/gallery";
import { canEditAlbum } from "@/lib/media-album-access-shared";

/**
 * De derde stand van een album: privé (`[gallery-private]`). Gepubliceerd, dus
 * in de momentopname en op zijn eigen adres, maar niet in het overzicht. Zie
 * `privateMarker` in `packages/gallery/src/config.ts`.
 */

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Album = { id: string; albumName: string; description: string; startDate?: string; assetCount?: number };

function asset(id: string) {
  return {
    id,
    type: "IMAGE",
    originalFileName: `${id}.jpg`,
    originalMimeType: "image/jpeg",
    fileCreatedAt: "2026-03-14T20:00:00.000Z",
  };
}

const sharedLinkRequests: string[] = [];

function installImmich(albums: Album[]) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/shared-links")) {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { albumId: string };
        sharedLinkRequests.push(body.albumId);
        return jsonResponse({ id: `l-${body.albumId}`, key: `key-${body.albumId}`, type: "ALBUM", albumId: body.albumId });
      }
      return jsonResponse([]);
    }
    if (url.endsWith("/albums")) return jsonResponse(albums);
    const match = url.match(/\/albums\/([^/?]+)/);
    const album = match ? albums.find((item) => item.id === decodeURIComponent(match[1])) : undefined;
    if (album) {
      const withoutAssets = url.includes("withoutAssets=true");
      return jsonResponse({ ...album, assets: withoutAssets ? undefined : [asset(`${album.id}-1`)], assetCount: 1 });
    }
    return jsonResponse({}, 404);
  });
}

function client() {
  return createGalleryClient({ id: "main", downloadPath: (slug, assetId) => `/media/${slug}/${assetId}` });
}

beforeEach(() => {
  sharedLinkRequests.length = 0;
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

describe("de merkers", () => {
  it("botsen niet met de gewone merker", () => {
    expect(privateMarker("main")).toBe("[gallery-private]");
    expect(privateMarker("fakbar")).toBe("[fakbar-private]");
    expect(privateMarker("main").includes(galleryMarker("main"))).toBe(false);
  });

  it("lezen de stand uit de beschrijving, de meest openbare eerst", () => {
    expect(albumVisibility("main", "Cantus [gallery]")).toBe("public");
    expect(albumVisibility("main", "Cantus [gallery-private]")).toBe("private");
    expect(albumVisibility("main", "Cantus [gallery-uit]")).toBe("hidden");
    expect(albumVisibility("main", "Cantus")).toBeNull();
    expect(albumVisibility("main", "[gallery-private] [gallery]")).toBe("public");
  });

  it("wisselen van elke stand naar elke andere, met precies één merker na afloop", () => {
    const markers = [galleryMarker("main"), privateMarker("main"), hiddenMarker("main")];
    const description = "Fotos van de avond\n\n[gallery] [tab: Zaal]";

    const privé = replaceVisibilityMarker(description, markers, "[gallery-private]");
    expect(privé).toBe("Fotos van de avond\n\n[gallery-private] [tab: Zaal]");

    const verborgen = replaceVisibilityMarker(privé, markers, "[gallery-uit]");
    expect(verborgen).toBe("Fotos van de avond\n\n[gallery-uit] [tab: Zaal]");

    // Twee merkers tegelijk (met de hand in Immich gezet): één blijft over.
    expect(replaceVisibilityMarker("[gallery] [gallery-uit]", markers, "[gallery-private]")).toBe("[gallery-private]");
    // Geen merker: achteraan erbij.
    expect(replaceVisibilityMarker("Losse tekst", markers, "[gallery]")).toBe("Losse tekst\n\n[gallery]");
  });
});

describe("een privé album op de site", () => {
  const albums: Album[] = [
    { id: "pub", albumName: "Schuimfuif", description: "[gallery]", startDate: "2026-04-30" },
    { id: "priv", albumName: "Bedankavond", description: "Voor de helpers [gallery-private]", startDate: "2026-05-02" },
    { id: "off", albumName: "Proffentap", description: "[gallery-uit]", startDate: "2026-05-05" },
  ];

  it("staat niet in het overzicht, maar opent wel op zijn adres", async () => {
    installImmich(albums);
    const gallery = client();

    const { albums: overview } = await gallery.listAlbums();
    expect(overview.map((album) => album.id)).toEqual(["pub"]);

    const album = await gallery.getAlbum("bedankavond");
    expect(album).toMatchObject({ id: "priv", unlisted: true, description: "Voor de helpers" });
    expect(album?.photos).toHaveLength(1);
    // Zijn foto's lopen via een gedeelde link, net als bij een openbaar album.
    expect(sharedLinkRequests).toContain("priv");
    // Een verborgen album krijgt er geen.
    expect(sharedLinkRequests).not.toContain("off");
    expect(await gallery.getAlbum("proffentap")).toBeNull();
  });

  it("staat in het overzicht voor het beheer wanneer dat erom vraagt", async () => {
    installImmich(albums);
    const { albums: all } = await client().listAlbums({ includeUnlisted: true });
    expect(all.map((album) => album.id).sort()).toEqual(["priv", "pub"]);
  });

  it("toont in het beheer zijn stand, met de slug zoals op de site", async () => {
    installImmich([
      ...albums,
      // Zelfde titel, nieuwer maar verborgen: mag de slug van het privé album niet inpikken.
      { id: "off-2", albumName: "Bedankavond", description: "[gallery-uit]", startDate: "2027-05-02" },
    ]);
    const rows = await client().listAdminAlbums();
    const row = (id: string) => rows.find((album) => album.id === id);

    expect(row("priv")).toMatchObject({ visibility: "private", hidden: false, slug: "bedankavond" });
    expect(row("off-2")).toMatchObject({ visibility: "hidden", hidden: true, slug: "bedankavond-2" });
    expect(row("pub")?.visibility).toBe("public");
  });

  it("kent bij het uploaden enkel albums van deze galerij", async () => {
    installImmich([
      ...albums,
      { id: "fak", albumName: "Fakbar", description: "[fakbar]" },
      { id: "both", albumName: "Twijfel", description: "[gallery] [fakbar]" },
    ]);
    const gallery = client();

    expect(await gallery.albumVisibilityOf("priv")).toBe("private");
    expect(await gallery.albumVisibilityOf("off")).toBe("hidden");
    expect(await gallery.albumVisibilityOf("fak")).toBeNull();
    expect(await gallery.albumVisibilityOf("both")).toBeNull();
    expect(await gallery.albumVisibilityOf("bestaat-niet")).toBeNull();
  });

  it("geeft een nieuwe tab de stand van zijn album", async () => {
    const created: string[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      created.push(JSON.parse(String(init?.body)).description);
      return jsonResponse({ id: "new" });
    });
    await client().createAlbum({ title: "Tab", description: "[parent: x] [tab: Y]", visibility: "private" });
    await client().createAlbum({ title: "Klad", hidden: true });
    expect(created).toEqual(["[parent: x] [tab: Y]\n\n[gallery-private]", "[gallery-uit]"]);
  });
});

describe("wie een album mag bewerken", () => {
  const uploader = { upload: true, create: false, manage: false };
  const maker = { upload: true, create: true, manage: false };
  const beheerder = { upload: true, create: true, manage: true };

  it("een beheerder altijd, wie albums aanmaakt enkel een verborgen album", () => {
    expect(canEditAlbum(beheerder, { hidden: false })).toBe(true);
    expect(canEditAlbum(maker, { hidden: true })).toBe(true);
    expect(canEditAlbum(maker, { hidden: false })).toBe(false);
    expect(canEditAlbum(uploader, { hidden: true })).toBe(false);
  });
});
