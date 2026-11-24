import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Wat de album-acties zelf afdwingen, los van wat het scherm toont (zie
 * `lib/media-album-access.ts`): wie albums aanmaakt maar niet beheert, krijgt
 * een nieuw album altijd verborgen; een upload gaat enkel naar een album van
 * vtk.be dat niet in de prullenmand ligt; en een album van de site bewerken of
 * publiceren is voor wie albums beheert.
 */

const mocks = vi.hoisted(() => ({
  session: { user: { id: "u1", isSuperAdmin: false }, permissions: [] as string[], groups: [] },
  createImmichGalleryAlbum: vi.fn(),
  galleryAlbumVisibilityOf: vi.fn(),
  uploadImmichAsset: vi.fn(),
  addImmichAssetsToAlbum: vi.fn(),
  listAdminGalleryAlbums: vi.fn(),
  getManageableGalleryAlbum: vi.fn(),
  updateImmichAlbum: vi.fn(),
  trashedFindFirst: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireAnyPermission: vi.fn(async (codes: string[]) => {
    if (!codes.some((code) => mocks.session.permissions.includes(code))) throw new Error("FORBIDDEN");
    return mocks.session;
  }),
  requirePermission: vi.fn(async () => mocks.session),
}));
vi.mock("@vtk/db", () => ({
  prisma: { galleryTrashedAlbum: { findFirst: mocks.trashedFindFirst } },
}));
vi.mock("@vtk/storage", () => ({ deleteObject: vi.fn(), newStorageKey: vi.fn(), putObject: vi.fn() }));
vi.mock("@/lib/magazineCover", () => ({ ensureMagazineCover: vi.fn(), ensureMagazinePages: vi.fn(), renderPdfCover: vi.fn(), storeCover: vi.fn() }));
vi.mock("@/lib/media-content", () => ({ getMediaContent: vi.fn() }));
vi.mock("@/lib/fakbar-gallery", () => ({
  fakbarGallery: { createAlbum: vi.fn(), albumVisibilityOf: vi.fn(async () => "public") },
  fakbarUploadEnabled: vi.fn(async () => true),
  setFakbarUploadEnabled: vi.fn(),
}));
vi.mock("@/lib/immich-gallery", () => ({
  addImmichAssetsToAlbum: mocks.addImmichAssetsToAlbum,
  createImmichGalleryAlbum: mocks.createImmichGalleryAlbum,
  galleryAlbumVisibilityOf: mocks.galleryAlbumVisibilityOf,
  getImmichGalleryAlbum: vi.fn(),
  getManageableGalleryAlbum: mocks.getManageableGalleryAlbum,
  refreshImmichGallerySnapshot: vi.fn(async () => undefined),
  setImmichAlbumCover: vi.fn(),
  setMarker: vi.fn(),
  succeededAssetIds: (results: Array<{ id: string; success: boolean }>) =>
    results.filter((item) => item.success).map((item) => item.id),
  updateImmichAlbum: mocks.updateImmichAlbum,
  uploadImmichAsset: mocks.uploadImmichAsset,
  // media-albums.ts
  deleteImmichAlbumSharedLinks: vi.fn(),
  deleteImmichAssets: vi.fn(),
  galleryAlbumMarker: () => "[gallery]",
  galleryHiddenAlbumMarker: () => "[gallery-uit]",
  galleryPrivateAlbumMarker: () => "[gallery-private]",
  listAdminGalleryAlbums: mocks.listAdminGalleryAlbums,
  removeImmichAssetsFromAlbum: vi.fn(),
  restoreImmichAssets: vi.fn(),
  replaceVisibilityMarker: (description: string, markers: string[], to: string) => {
    let next = description;
    for (const marker of markers) next = next.split(marker).join("");
    return `${next.trim()} ${to}`.trim();
  },
}));

import { createImmichAlbumAction, uploadImmichAlbumAssetAction } from "@/app/actions/media";
import { saveAlbumDetailsAction, setAlbumVisibilityAction } from "@/app/actions/media-albums";
import { SAVE_IDLE } from "@/lib/saveState";

function as(...permissions: string[]) {
  mocks.session.permissions = permissions;
}

function form(fields: Record<string, string | File>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function adminAlbum(visibility: "public" | "private" | "hidden") {
  return {
    id: "alb",
    slug: "cantus",
    title: "Cantus",
    description: "",
    date: null,
    photoCount: 0,
    visibility,
    hidden: visibility === "hidden",
    coverAssetId: null,
    parts: [{ id: "alb", name: "Cantus", photoCount: 0, hidden: visibility === "hidden" }],
    hasOwnTabName: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createImmichGalleryAlbum.mockResolvedValue({ id: "new" });
  mocks.galleryAlbumVisibilityOf.mockResolvedValue("public");
  mocks.trashedFindFirst.mockResolvedValue(null);
  mocks.uploadImmichAsset.mockResolvedValue({ id: "asset" });
  mocks.addImmichAssetsToAlbum.mockResolvedValue([{ id: "asset", success: true }]);
  mocks.getManageableGalleryAlbum.mockResolvedValue({ id: "alb", description: "[gallery]" });
});

describe("een album aanmaken", () => {
  it("geeft wie enkel albums aanmaakt altijd een verborgen album, wat het formulier ook zegt", async () => {
    as("photos.createAlbums");
    const result = await createImmichAlbumAction(form({ title: "Cantus", visible: "true" }));
    expect(result.ok).toBe(true);
    expect(mocks.createImmichGalleryAlbum).toHaveBeenCalledWith(expect.objectContaining({ hidden: true }));
  });

  it("laat een beheerder kiezen", async () => {
    as("photos.manageAlbums");
    await createImmichAlbumAction(form({ title: "Cantus", visible: "true" }));
    expect(mocks.createImmichGalleryAlbum).toHaveBeenCalledWith(expect.objectContaining({ hidden: false }));
  });

  it("weigert wie enkel foto's mag uploaden", async () => {
    as("photos.upload");
    await expect(createImmichAlbumAction(form({ title: "Cantus" }))).rejects.toThrow("FORBIDDEN");
    expect(mocks.createImmichGalleryAlbum).not.toHaveBeenCalled();
  });
});

describe("foto's uploaden", () => {
  const photo = () => new File(["x"], "foto.jpg", { type: "image/jpeg" });

  it("lukt voor wie enkel uploadt, naar een bestaand album van vtk.be", async () => {
    as("photos.upload");
    const result = await uploadImmichAlbumAssetAction(form({ albumId: "alb", gallery: "main", file: photo() }));
    expect(result.ok).toBe(true);
  });

  it("weigert een album dat niet bij vtk.be hoort", async () => {
    as("photos.upload");
    mocks.galleryAlbumVisibilityOf.mockResolvedValue(null);
    const result = await uploadImmichAlbumAssetAction(form({ albumId: "elders", gallery: "main", file: photo() }));
    expect(result).toEqual({ ok: false, error: "album_not_allowed" });
    expect(mocks.uploadImmichAsset).not.toHaveBeenCalled();
  });

  it("weigert een album in de prullenmand", async () => {
    as("photos.upload");
    mocks.trashedFindFirst.mockResolvedValue({ id: "t" });
    const result = await uploadImmichAlbumAssetAction(form({ albumId: "alb", gallery: "main", file: photo() }));
    expect(result.ok).toBe(false);
    expect(mocks.uploadImmichAsset).not.toHaveBeenCalled();
  });

  it("laat wie enkel uploadt niet naar de fakbargalerij", async () => {
    as("photos.upload");
    const result = await uploadImmichAlbumAssetAction(form({ albumId: "fak", gallery: "fakbar", file: photo() }));
    expect(result.ok).toBe(false);
  });
});

describe("een album bewerken en publiceren", () => {
  it("laat wie albums aanmaakt een verborgen album bewerken", async () => {
    as("photos.createAlbums");
    mocks.listAdminGalleryAlbums.mockResolvedValue([adminAlbum("hidden")]);
    const state = await saveAlbumDetailsAction(SAVE_IDLE, form({ albumId: "alb", title: "Cantus 2" }));
    expect(state.status).toBe("success");
  });

  it("maar geen album dat op de site staat, ook niet privé", async () => {
    as("photos.createAlbums");
    for (const visibility of ["public", "private"] as const) {
      mocks.listAdminGalleryAlbums.mockResolvedValue([adminAlbum(visibility)]);
      const state = await saveAlbumDetailsAction(SAVE_IDLE, form({ albumId: "alb", title: "Cantus 2" }));
      expect(state).toMatchObject({ status: "error", code: "ALBUM_PUBLISHED" });
    }
    expect(mocks.updateImmichAlbum).not.toHaveBeenCalled();
  });

  it("laat enkel wie albums beheert de stand kiezen", async () => {
    mocks.listAdminGalleryAlbums.mockResolvedValue([adminAlbum("hidden")]);
    as("photos.createAlbums");
    await expect(
      setAlbumVisibilityAction(SAVE_IDLE, form({ albumId: "alb", visibility: "public" })),
    ).rejects.toThrow("FORBIDDEN");

    as("photos.manageAlbums");
    mocks.getManageableGalleryAlbum.mockResolvedValue({ id: "alb", description: "[gallery-uit]" });
    const state = await setAlbumVisibilityAction(SAVE_IDLE, form({ albumId: "alb", visibility: "private" }));
    expect(state.status).toBe("success");
    expect(mocks.updateImmichAlbum).toHaveBeenCalledWith("alb", { description: "[gallery-private]" });
  });
});
