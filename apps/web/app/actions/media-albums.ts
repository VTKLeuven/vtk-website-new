"use server";

/**
 * Het beheer van een bestaand fotoalbum: titel, beschrijving, cover, tabs,
 * zichtbaarheid en de foto's zelf.
 *
 * Het aanmaken en uploaden staat in `media.ts`, samen met de magazines en de
 * promovideo's; dit bestand gaat enkel over wijzigen achteraf.
 *
 * **Alles leeft in Immich**, ook de structuur: een tab is een eigen Immich-album
 * met `[parent: <slug>]` en `[tab: <naam>]` in zijn beschrijving (zie
 * `packages/gallery/src/grouping.ts`). Wijzigen betekent hier dus bijna altijd:
 * de beschrijving herschrijven met `setMarker`, zonder de `[gallery]`-merker
 * kwijt te spelen, want zonder die merker verdwijnt het album van de site.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requireAnyPermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";
import {
  addImmichAssetsToAlbum,
  createImmichGalleryAlbum,
  deleteImmichAlbum,
  deleteImmichAssets,
  galleryAlbumMarker,
  galleryHiddenAlbumMarker,
  getImmichGalleryAlbum,
  getManageableGalleryAlbum,
  refreshImmichGallerySnapshot,
  removeImmichAssetsFromAlbum,
  setImmichAlbumCover,
  succeededAssetIds,
  setMarker,
  swapMarker,
  updateImmichAlbum,
  type GalleryAlbum,
  type GallerySubAlbum,
} from "@/lib/immich-gallery";

/**
 * Wie een album mag beheren.
 *
 * De albumsectie van /admin/media staat open voor `photos.manageAlbums`, maar de
 * acties eisten `media.manage`: wie enkel het eerste recht had, zag de uploader
 * en kreeg een throw bij het opslaan. Beide rechten geven hier toegang.
 */
const ALBUM_PERMISSIONS = ["media.manage", "photos.manageAlbums"] as const;

function readField(formData: FormData, name: string, max = 200): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function readIds(formData: FormData, name = "assetIds"): string[] {
  const raw = formData.get(name);
  const list = typeof raw === "string" ? raw.split(",") : [];
  return [...new Set(list.map((id) => id.trim()).filter(Boolean))].slice(0, 500);
}

/**
 * Na elke wijziging: de momentopname opnieuw opbouwen (anders blijft de
 * wijziging tot een kwartier onzichtbaar) en de pagina's die eruit lezen
 * hertekenen, de beheerpagina's inbegrepen.
 */
async function refreshGallery(): Promise<void> {
  await refreshImmichGallerySnapshot().catch(() => null);
  revalidatePath("/media");
  revalidatePath("/en/media");
  revalidatePath("/[locale]/media/[albumSlug]", "page");
  revalidatePath("/[locale]/admin/media", "page");
  revalidatePath("/[locale]/admin/media/albums/[slug]", "page");
}

/** Het album van de momentopname, of `null` wanneer de slug niet (meer) bestaat. */
async function loadAlbum(slug: string): Promise<GalleryAlbum | null> {
  if (!slug) return null;
  return getImmichGalleryAlbum(slug).catch(() => null);
}

/**
 * De albums waaruit dit album bestaat: het album zelf wanneer er geen tabs zijn,
 * anders één per tab. `GallerySubAlbum.id` is het Immich-album-id.
 */
function albumParts(album: GalleryAlbum): Array<{ id: string; title: string }> {
  if (album.subAlbums && album.subAlbums.length > 1) {
    return album.subAlbums.map((sub) => ({ id: sub.id, title: sub.title }));
  }
  return [{ id: album.id, title: album.title }];
}

function findPart(album: GalleryAlbum, albumId: string): GallerySubAlbum | null {
  return album.subAlbums?.find((sub) => sub.id === albumId) ?? null;
}

/** De ruwe beschrijving uit Immich; de momentopname heeft de merkers er al uit. */
async function rawDescription(albumId: string): Promise<string> {
  const row = await getManageableGalleryAlbum(albumId);
  return row?.description ?? "";
}

// -----------------------------------------------------------------------------
// Het album zelf
// -----------------------------------------------------------------------------

export async function saveAlbumDetailsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const albumId = readField(formData, "albumId", 100);
  const title = readField(formData, "title");
  const description = readField(formData, "description", 1000);
  if (!albumId || !title) return saveError("INVALID_INPUT");

  const current = await getManageableGalleryAlbum(albumId);
  if (!current) return saveError("ALBUM_MISSING");

  // De merkers staan in dezelfde beschrijving en de redacteur ziet ze niet; ze
  // horen er dus opnieuw achter, niet overschreven te worden. Zonder
  // `[gallery]` verdwijnt het album van de site.
  const keep = current.description.match(/\[(?:gallery|fakbar)[^\]]*\]|\[(?:parent|group|tab):[^\]]*\]/gi) || [];
  const next = [description, keep.join(" ")].filter(Boolean).join("\n\n");

  try {
    await updateImmichAlbum(albumId, { albumName: title, description: next });
  } catch (error) {
    console.error("Immich album update failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: albumId,
    target: title,
    summary: "titel of beschrijving van het fotoalbum gewijzigd",
  });
  await refreshGallery();
  return saveOk();
}

/**
 * Van de site halen en terugzetten: `[gallery]` wisselt met `[gallery-uit]`.
 * De merker weghalen zou het album onvindbaar maken in het beheer, en dan kan je
 * het er nooit meer op zetten.
 */
export async function setAlbumVisibilityAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const albumId = readField(formData, "albumId", 100);
  const visible = formData.get("visible") === "true";
  if (!albumId) return saveError("INVALID_INPUT");

  const current = await getManageableGalleryAlbum(albumId);
  if (!current) return saveError("ALBUM_MISSING");

  const marker = galleryAlbumMarker();
  const hidden = galleryHiddenAlbumMarker();
  const next = visible
    ? swapMarker(current.description, hidden, marker)
    : swapMarker(current.description, marker, hidden);

  try {
    await updateImmichAlbum(albumId, { description: next });
  } catch (error) {
    console.error("Immich album visibility update failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: albumId,
    target: current.title,
    summary: visible ? "fotoalbum terug op de site gezet" : "fotoalbum van de site gehaald",
  });
  await refreshGallery();
  return saveOk();
}

export async function setAlbumCoverAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const albumId = readField(formData, "albumId", 100);
  const assetId = readField(formData, "assetId", 100);
  if (!albumId || !assetId) return saveError("INVALID_INPUT");

  try {
    await setImmichAlbumCover(albumId, assetId);
  } catch (error) {
    console.error("Immich album cover update failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: albumId,
    target: albumId,
    summary: "coverfoto van het album gewijzigd",
  });
  await refreshGallery();
  return saveOk();
}

/**
 * Het hele album weg, tabs inbegrepen.
 *
 * **Een Immich-album verwijderen wist de foto's niet**: ze blijven in de
 * bibliotheek staan en in elk ander album waar ze in zitten. Wie ze ook weg wil,
 * vinkt dat apart aan; die gaan dan naar de prullenmand van Immich, niet
 * definitief weg.
 */
export async function deleteAlbumAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const slug = readField(formData, "slug", 200);
  const alsoTrashPhotos = formData.get("alsoTrashPhotos") === "true";
  const album = await loadAlbum(slug);

  // Een album dat van de site gehaald is, zit niet in de momentopname; dan is
  // de slug het Immich-album-id en gaat het per definitie om één album.
  const fallback = album ? null : await getManageableGalleryAlbum(slug).catch(() => null);
  if (!album && !fallback) return saveError("ALBUM_MISSING");

  const parts = album ? albumParts(album) : [{ id: fallback!.id, title: fallback!.title }];
  const assetIds = album ? album.photos.map((photo) => photo.id) : [];
  const albumTitle = album?.title ?? fallback!.title;

  try {
    if (alsoTrashPhotos && assetIds.length > 0) {
      await deleteImmichAssets(assetIds, { force: false });
    }
    for (const part of parts) {
      await deleteImmichAlbum(part.id);
    }
  } catch (error) {
    console.error("Immich album delete failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  await prisma.galleryDetachedPhoto.deleteMany({
    where: { gallery: "MAIN", albumId: { in: parts.map((part) => part.id) } },
  });

  await logAudit({
    action: "delete",
    entity: "photoAlbum",
    entityId: parts[0].id,
    target: albumTitle,
    summary: alsoTrashPhotos
      ? `fotoalbum verwijderd, met ${assetIds.length} foto('s) naar de prullenmand`
      : "fotoalbum verwijderd; de foto's blijven in Immich staan",
  });
  await refreshGallery();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Tabs
// -----------------------------------------------------------------------------

/**
 * Een tab bijmaken: een nieuw Immich-album dat via `[parent:]` aan dit album
 * hangt. De foto's komen er daarna in via de gewone upload-actie.
 */
export async function addAlbumTabAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const slug = readField(formData, "slug", 200);
  const name = readField(formData, "tabName", 50);
  if (!name) return saveError("TAB_NAME_REQUIRED");

  const album = await loadAlbum(slug);
  if (!album) return saveError("ALBUM_MISSING");
  if (album.subAlbums?.some((sub) => sub.title.toLowerCase() === name.toLowerCase())) {
    return saveError("TAB_EXISTS");
  }

  // Het hoofdalbum moet zelf ook een tabnaam dragen, anders heet zijn tab op de
  // site "Algemeen". Staat er nog geen, dan vult dit formulier ze mee in.
  const parentTabName = readField(formData, "parentTabName", 50);

  try {
    await createImmichGalleryAlbum({
      title: `${album.title}: ${name}`,
      description: `[parent: ${album.slug}] [tab: ${name}]`,
    });

    if (parentTabName) {
      const raw = await rawDescription(album.id);
      await updateImmichAlbum(album.id, { description: setMarker(raw, "tab", parentTabName) });
    }
  } catch (error) {
    console.error("Immich tab create failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  await logAudit({
    action: "create",
    entity: "photoAlbum",
    entityId: album.id,
    target: `${album.title}: ${name}`,
    summary: "tab toegevoegd aan een fotoalbum",
  });
  await refreshGallery();
  return saveOk();
}

export async function renameAlbumTabAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const albumId = readField(formData, "albumId", 100);
  const name = readField(formData, "tabName", 50);
  if (!albumId || !name) return saveError("TAB_NAME_REQUIRED");

  try {
    const raw = await rawDescription(albumId);
    await updateImmichAlbum(albumId, { description: setMarker(raw, "tab", name) });
  } catch (error) {
    console.error("Immich tab rename failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: albumId,
    target: name,
    summary: "tab van een fotoalbum hernoemd",
  });
  await refreshGallery();
  return saveOk();
}

/**
 * Een tab opheffen: `[parent:]` en `[tab:]` weg, waardoor dat album een
 * zelfstandig album op de mediapagina wordt. De foto's blijven waar ze zijn.
 */
export async function detachAlbumTabAction(formData: FormData): Promise<void> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const albumId = readField(formData, "albumId", 100);
  if (!albumId) return;

  const raw = await rawDescription(albumId);
  const next = setMarker(setMarker(raw, "parent", null), "tab", null);
  await updateImmichAlbum(albumId, { description: next });

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: albumId,
    target: albumId,
    summary: "tab losgekoppeld; het album staat nu op zichzelf",
  });
  await refreshGallery();
}

// -----------------------------------------------------------------------------
// Foto's
// -----------------------------------------------------------------------------

/**
 * Foto's naar een andere tab van hetzelfde album.
 *
 * Eerst toevoegen, dan pas weghalen: struikelt de tweede stap, dan staat de foto
 * in twee tabs in plaats van in geen enkele.
 */
export async function movePhotosToTabAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const slug = readField(formData, "slug", 200);
  const fromId = readField(formData, "fromAlbumId", 100);
  const toId = readField(formData, "toAlbumId", 100);
  const assetIds = readIds(formData);
  if (!fromId || !toId || assetIds.length === 0) return saveError("INVALID_INPUT");
  if (fromId === toId) return saveError("SAME_TAB");

  const album = await loadAlbum(slug);
  if (!album) return saveError("ALBUM_MISSING");
  // Verplaatsen mag enkel binnen dit album; anders is dit een manier om foto's
  // naar willekeurige Immich-albums te schuiven.
  const parts = new Set(albumParts(album).map((part) => part.id));
  if (!parts.has(fromId) || !parts.has(toId)) return saveError("INVALID_INPUT");

  // Immich antwoordt met HTTP 200 en een resultaat per foto, dus enkel de
  // foto's die écht in de nieuwe tab staan mogen uit de oude gehaald worden.
  let moved: string[] = [];
  try {
    moved = succeededAssetIds(await addImmichAssetsToAlbum(toId, assetIds));
  } catch (error) {
    console.error("Immich move (add) failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }
  if (moved.length === 0) return saveError("MOVE_FAILED");

  try {
    const removed = succeededAssetIds(await removeImmichAssetsFromAlbum(fromId, moved));
    if (removed.length < moved.length) {
      await refreshGallery();
      return saveError("MOVE_HALF_DONE");
    }
  } catch (error) {
    console.error("Immich move (remove) failed", error);
    await refreshGallery();
    return saveError("MOVE_HALF_DONE");
  }

  if (moved.length < assetIds.length) {
    await refreshGallery();
    return saveError(
      "MOVE_PARTIAL",
      `${moved.length} van de ${assetIds.length} foto's zijn verplaatst; de rest bleef staan.`,
    );
  }

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: album.id,
    target: album.title,
    summary: `${assetIds.length} foto('s) naar een andere tab verplaatst`,
  });
  await refreshGallery();
  return saveOk();
}

/**
 * Foto's uit het album halen. Ze blijven in Immich staan; de rij in
 * `GalleryDetachedPhoto` is het enige spoor waarmee we ze nog terugvinden.
 */
export async function detachPhotosAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const slug = readField(formData, "slug", 200);
  const fromId = readField(formData, "fromAlbumId", 100);
  const assetIds = readIds(formData);
  if (!fromId || assetIds.length === 0) return saveError("INVALID_INPUT");

  const album = await loadAlbum(slug);
  if (!album) return saveError("ALBUM_MISSING");
  const parts = albumParts(album);
  const part = parts.find((item) => item.id === fromId);
  if (!part) return saveError("INVALID_INPUT");

  const sub = findPart(album, fromId);
  const photos = (sub?.photos ?? album.photos).filter((photo) => assetIds.includes(photo.id));

  // Enkel wat Immich echt uit het album haalde: een rij schrijven voor een foto
  // die er nog in staat, zet ze in twee lijsten tegelijk.
  let detached: string[] = [];
  try {
    detached = succeededAssetIds(await removeImmichAssetsFromAlbum(fromId, assetIds));
  } catch (error) {
    console.error("Immich detach failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }
  if (detached.length === 0) return saveError("DETACH_FAILED");

  await prisma.galleryDetachedPhoto.createMany({
    data: detached.map((assetId) => ({
      gallery: "MAIN" as const,
      assetId,
      albumId: fromId,
      albumTitle: album.title,
      tabName: parts.length > 1 ? part.title : null,
      filename: photos.find((photo) => photo.id === assetId)?.filename ?? null,
      detachedById: session.user.id,
    })),
    skipDuplicates: true,
  });

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: album.id,
    target: album.title,
    summary: `${detached.length} foto('s) uit het album gehaald; ze blijven in Immich staan`,
  });
  await refreshGallery();
  if (detached.length < assetIds.length) {
    return saveError(
      "DETACH_PARTIAL",
      `${detached.length} van de ${assetIds.length} foto's zijn uit het album gehaald; de rest bleef staan.`,
    );
  }
  return saveOk();
}

export async function restorePhotoAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const assetId = readField(formData, "assetId", 100);
  const targetId = readField(formData, "toAlbumId", 100);
  if (!assetId) return saveError("INVALID_INPUT");

  const row = await prisma.galleryDetachedPhoto.findUnique({ where: { assetId } });
  if (!row) return saveError("PHOTO_MISSING");

  // Zonder expliciete keuze gaat ze terug naar waar ze vandaan kwam.
  const destination = targetId || row.albumId;

  try {
    const restored = succeededAssetIds(await addImmichAssetsToAlbum(destination, [assetId]));
    // De rij is het enige spoor naar deze foto; ze pas weggooien wanneer de
    // foto echt terug in het album zit.
    if (restored.length === 0) return saveError("RESTORE_FAILED");
  } catch (error) {
    console.error("Immich restore failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  await prisma.galleryDetachedPhoto.delete({ where: { assetId } }).catch(() => null);

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: destination,
    target: row.albumTitle,
    summary: "foto teruggezet in het album",
  });
  await refreshGallery();
  return saveOk();
}

/**
 * Naar de prullenmand van Immich (`force: false`), niet definitief: de foto is
 * meteen van de site weg en Immich ruimt zelf op, maar een tikfout in het beheer
 * is dan geen onherstelbaar verlies. Dezelfde keuze als bij de
 * verwijderverzoeken.
 */
export async function trashPhotosAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const assetIds = readIds(formData);
  if (assetIds.length === 0) return saveError("INVALID_INPUT");

  try {
    await deleteImmichAssets(assetIds, { force: false });
  } catch (error) {
    // Al weg is precies de gewenste eindtoestand, geen fout.
    const status = (error as { status?: number })?.status;
    if (status !== 404 && status !== 400) {
      console.error("Immich trash failed", error);
      return saveError("IMMICH_UNREACHABLE");
    }
  }

  await prisma.galleryDetachedPhoto.deleteMany({ where: { assetId: { in: assetIds } } });

  await logAudit({
    action: "delete",
    entity: "photoAlbum",
    target: `${assetIds.length} foto('s)`,
    summary: "foto's naar de prullenmand van Immich",
  });
  await refreshGallery();
  return saveOk();
}
