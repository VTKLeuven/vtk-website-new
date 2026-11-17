import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFilenameFromResponse, galleryStatus } from "@vtk/gallery";

/**
 * De routes achter een privélink: één foto en de zip. De databank, de sessie en
 * Immich zijn nagemaakt; `lib/media-share.ts` zelf is echt. Wat hier getoetst
 * wordt, is wat een link wel en niet opent: enkel de foto's van zijn eigen
 * album, enkel voor wie erbij hoort, en het origineel enkel als downloaden aan
 * staat.
 */

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  getCurrentSession: vi.fn(),
  loadLibraryAlbums: vi.fn(),
  listImmichAlbumAssets: vi.fn(),
  getImmichAssetThumbnail: vi.fn(),
  downloadImmichOriginal: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    galleryShareLink: { findUnique: mocks.findUnique, update: vi.fn() },
    groupMembership: { findFirst: mocks.findFirst },
  },
}));
vi.mock("@/lib/session", () => ({ getCurrentSession: mocks.getCurrentSession }));
vi.mock("@/lib/media-admin", () => ({ loadLibraryAlbums: mocks.loadLibraryAlbums }));
vi.mock("@/lib/immich-gallery", () => ({
  listImmichAlbumAssets: mocks.listImmichAlbumAssets,
  getImmichAssetThumbnail: mocks.getImmichAssetThumbnail,
  downloadImmichOriginal: mocks.downloadImmichOriginal,
  downloadFilenameFromImmichResponse: downloadFilenameFromResponse,
  immichGalleryStatus: galleryStatus,
}));

import { GET as getAsset } from "@/app/api/immich-gallery/gedeeld/[token]/assets/[assetId]/[size]/route";
import { GET as getZip } from "@/app/api/immich-gallery/gedeeld/[token]/download/route";
import { hashShareToken } from "@/lib/media-share-token";
import { currentWorkingYear } from "@/lib/workingYear";

const TOKEN = "Q2h7xKf0pV9sT4wYb8NcE1uR6dHa3jZ5gk0oPiAq2Mx";
const request = new Request("https://vtk.be/api/immich-gallery/gedeeld/test");

function link(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    gallery: "MAIN",
    albumId: "album-1",
    audience: "LINK",
    groupId: null,
    allowDownload: true,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

/** Zoals Immich ze geeft: enkel wat in het album zit. Verborgen foto's staan er dus niet in. */
const ASSETS: Record<string, Array<{ id: string; originalFileName: string; type: string }>> = {
  "album-1": [
    { id: "a1", originalFileName: "IMG_1.jpg", type: "IMAGE" },
    { id: "a2", originalFileName: "IMG_2.jpg", type: "IMAGE" },
    { id: "v1", originalFileName: "clip.mov", type: "VIDEO" },
  ],
  "part-2": [{ id: "b1", originalFileName: "IMG_3.jpg", type: "IMAGE" }],
};

const asset = (token: string, assetId: string, size: string) => ({
  params: Promise.resolve({ token, assetId, size }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(link());
  mocks.findFirst.mockResolvedValue(null);
  mocks.getCurrentSession.mockResolvedValue(null);
  mocks.loadLibraryAlbums.mockResolvedValue([
    {
      id: "album-1",
      title: "Praesidiumweekend 2026",
      description: "",
      date: "2026-10-04",
      parts: [
        { id: "album-1", name: "Zaterdag" },
        { id: "part-2", name: "Zondag" },
      ],
    },
  ]);
  mocks.listImmichAlbumAssets.mockImplementation(async (id: string) => ASSETS[id] ?? []);
  mocks.getImmichAssetThumbnail.mockImplementation(
    async () => new Response("duimnagel", { headers: { "content-type": "image/jpeg" } }),
  );
  mocks.downloadImmichOriginal.mockImplementation(
    async (id: string) => new Response(`origineel-${id}`, { headers: { "content-type": "image/jpeg" } }),
  );
});

describe("GET /api/immich-gallery/gedeeld/[token]/assets/[assetId]/[size]", () => {
  it("geeft de duimnagel van een foto uit het album, privé gecachet", async () => {
    const response = await getAsset(request, asset(TOKEN, "a1", "thumbnail"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=600");
    expect(mocks.getImmichAssetThumbnail).toHaveBeenCalledWith("a1", "thumbnail");
    // Opgezocht op de hash, nooit op het token zelf.
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashShareToken(TOKEN) } }),
    );
  });

  it("opent geen foto buiten het album, ook niet met een geldige link", async () => {
    const response = await getAsset(request, asset(TOKEN, "fakbar-foto", "preview"));
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("photo_not_found");
    expect(mocks.getImmichAssetThumbnail).not.toHaveBeenCalled();
  });

  it("geeft geen video, net als de albumpagina", async () => {
    const response = await getAsset(request, asset(TOKEN, "v1", "thumbnail"));
    expect(response.status).toBe(404);
  });

  it("geeft het origineel enkel als downloaden aan staat", async () => {
    mocks.findUnique.mockResolvedValue(link({ allowDownload: false }));
    const refused = await getAsset(request, asset(TOKEN, "a1", "original"));
    expect(refused.status).toBe(403);
    expect((await refused.json()).code).toBe("download_off");
    expect(mocks.downloadImmichOriginal).not.toHaveBeenCalled();

    // Bekijken mag dan wel.
    const preview = await getAsset(request, asset(TOKEN, "a1", "preview"));
    expect(preview.status).toBe(200);
  });

  it("geeft het origineel als bijlage met de bestandsnaam", async () => {
    const response = await getAsset(request, asset(TOKEN, "b1", "original"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("IMG_3.jpg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("raakt de databank niet voor een token dat er niet als een token uitziet", async () => {
    const response = await getAsset(request, asset("kort", "a1", "thumbnail"));
    expect(response.status).toBe(404);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("een verlopen of onbekende link werkt niet meer", async () => {
    mocks.findUnique.mockResolvedValue(link({ expiresAt: new Date(Date.now() - 1000) }));
    expect((await getAsset(request, asset(TOKEN, "a1", "thumbnail"))).status).toBe(404);
    mocks.findUnique.mockResolvedValue(null);
    expect((await getAsset(request, asset(TOKEN, "a1", "thumbnail"))).status).toBe(404);
  });

  it("een link voor het praesidium vraagt een sessie en een post in het werkingsjaar van vandaag", async () => {
    mocks.findUnique.mockResolvedValue(link({ audience: "PRAESIDIUM" }));

    const anonymous = await getAsset(request, asset(TOKEN, "a1", "thumbnail"));
    expect(anonymous.status).toBe(401);

    mocks.getCurrentSession.mockResolvedValue({ user: { id: "student" } });
    const student = await getAsset(request, asset(TOKEN, "a1", "thumbnail"));
    expect(student.status).toBe(403);
    expect(mocks.findFirst).toHaveBeenLastCalledWith({
      where: { userId: "student", year: currentWorkingYear(), group: { type: "PRAESIDIUM" } },
      select: { id: true },
    });

    mocks.findFirst.mockResolvedValue({ id: "lidmaatschap" });
    const member = await getAsset(request, asset(TOKEN, "a1", "thumbnail"));
    expect(member.status).toBe(200);
  });

  it("een link voor een werkgroep kijkt naar die werkgroep, en zonder werkgroep naar niemand", async () => {
    mocks.getCurrentSession.mockResolvedValue({ user: { id: "lid" } });
    mocks.findUnique.mockResolvedValue(link({ audience: "GROUP", groupId: "revue" }));
    mocks.findFirst.mockResolvedValue({ id: "lidmaatschap" });
    expect((await getAsset(request, asset(TOKEN, "a1", "thumbnail"))).status).toBe(200);
    expect(mocks.findFirst).toHaveBeenLastCalledWith({
      where: { userId: "lid", year: currentWorkingYear(), groupId: "revue" },
      select: { id: true },
    });

    mocks.findFirst.mockClear();
    mocks.findUnique.mockResolvedValue(link({ audience: "GROUP", groupId: null }));
    expect((await getAsset(request, asset(TOKEN, "a1", "thumbnail"))).status).toBe(403);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("vraagt voor een link voor iedereen geen sessie op", async () => {
    await getAsset(request, asset(TOKEN, "a1", "thumbnail"));
    expect(mocks.getCurrentSession).not.toHaveBeenCalled();
  });
});

describe("GET /api/immich-gallery/gedeeld/[token]/download", () => {
  const context = (token = TOKEN) => ({ params: Promise.resolve({ token }) });

  it("zipt de foto's van elke tab, en enkel die", async () => {
    const response = await getZip(request, context());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain("Praesidiumweekend");
    await response.arrayBuffer();
    expect(mocks.downloadImmichOriginal.mock.calls.map(([id]) => id)).toEqual(["a1", "a2", "b1"]);
  });

  it("weigert de zip als downloaden uit staat", async () => {
    mocks.findUnique.mockResolvedValue(link({ allowDownload: false }));
    const response = await getZip(request, context());
    expect(response.status).toBe(403);
    expect(mocks.listImmichAlbumAssets).not.toHaveBeenCalled();
  });

  it("weigert de zip zonder sessie bij een link voor het praesidium", async () => {
    mocks.findUnique.mockResolvedValue(link({ audience: "PRAESIDIUM" }));
    expect((await getZip(request, context())).status).toBe(401);
  });
});
