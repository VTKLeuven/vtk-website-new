"use server";

/**
 * Het beheer van een bestaand fotoalbum: titel, beschrijving, cover, tabs,
 * zichtbaarheid, de foto's zelf en de prullenmand.
 *
 * Het aanmaken en uploaden staat in `media.ts`, samen met de magazines en de
 * aftermovies; dit bestand gaat enkel over wijzigen achteraf.
 *
 * **Alles leeft in Immich**, ook de structuur: een tab is een eigen Immich-album
 * met `[parent: <slug>]` en `[tab: <naam>]` in zijn beschrijving (zie
 * `packages/gallery/src/grouping.ts`). Wijzigen betekent hier dus bijna altijd:
 * de beschrijving herschrijven met `setMarker`, zonder de `[gallery]`-merker
 * kwijt te spelen, want zonder die merker verdwijnt het album van de site.
 *
 * Een album wordt aangewezen met het Immich-id van zijn hoofdalbum, niet met de
 * slug van de site: een verborgen album staat niet in de momentopname en heeft
 * dus geen slug, en een slug verandert mee met de titel.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requireAnyPermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";
import {
  addImmichAssetsToAlbum,
  createImmichGalleryAlbum,
  deleteImmichAssets,
  galleryAlbumMarker,
  galleryHiddenAlbumMarker,
  getManageableGalleryAlbum,
  listAdminGalleryAlbums,
  refreshImmichGallerySnapshot,
  removeImmichAssetsFromAlbum,
  restoreImmichAssets,
  setImmichAlbumCover,
  succeededAssetIds,
  setMarker,
  swapMarker,
  updateImmichAlbum,
  type AdminAlbum,
} from "@/lib/immich-gallery";
import { trashCutoff } from "@/lib/media-admin-shared";

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
 * wijziging tot een kwartier onzichtbaar op de site) en zowel de site als het
 * hele beheer hertekenen, de albumlijst links inbegrepen.
 */
async function refreshGallery(): Promise<void> {
  await refreshImmichGallerySnapshot().catch(() => null);
  revalidatePath("/media");
  revalidatePath("/en/media");
  revalidatePath("/[locale]/media/[albumSlug]", "page");
  revalidatePath("/[locale]/admin/media", "layout");
}

/** Het album met al zijn delen, op het id van het hoofdalbum. */
async function loadAlbum(albumId: string): Promise<AdminAlbum | null> {
  if (!albumId) return null;
  const albums = await listAdminGalleryAlbums().catch(() => null);
  return albums?.find((album) => album.id === albumId) ?? null;
}

function partOf(album: AdminAlbum, partId: string) {
  return album.parts.find((part) => part.id === partId) ?? null;
}

/** De tabnaam om in een rij te bewaren, of `null` wanneer het album geen tabs heeft. */
function tabNameOf(album: AdminAlbum, partId: string): string | null {
  return album.parts.length > 1 ? partOf(album, partId)?.name ?? null : null;
}

/** Zet de galerijmerker op elk deel van het album aan of uit. */
async function setPartsVisible(partIds: string[], visible: boolean): Promise<void> {
  const marker = galleryAlbumMarker();
  const hidden = galleryHiddenAlbumMarker();
  for (const id of partIds) {
    const current = await getManageableGalleryAlbum(id);
    if (!current) continue;
    const next = visible
      ? swapMarker(current.description, hidden, marker)
      : swapMarker(current.description, marker, hidden);
    if (next !== current.description) await updateImmichAlbum(id, { description: next });
  }
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
 * Op de site zetten en eraf halen: `[gallery]` wisselt met `[gallery-uit]`, op
 * **elk** deel van het album. Enkel het hoofdalbum omzetten liet de tabs als
 * losse albums op de site staan, want hun `[parent:]` wees dan naar niets.
 */
export async function setAlbumVisibilityAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const albumId = readField(formData, "albumId", 100);
  const visible = formData.get("visible") === "true";
  const album = await loadAlbum(albumId);
  if (!album) return saveError("ALBUM_MISSING");

  try {
    await setPartsVisible(album.parts.map((part) => part.id), visible);
  } catch (error) {
    console.error("Immich album visibility update failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: album.id,
    target: album.title,
    summary: visible ? "fotoalbum op de site gezet" : "fotoalbum van de site gehaald",
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
    // Immich aanvaardt als cover enkel een foto uit dat album zelf, en de cover
    // hangt aan het hoofdalbum: een foto uit een andere tab kan dat niet zijn.
    const status = (error as { status?: number })?.status;
    if (status === 400) return saveError("COVER_OTHER_TAB");
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
 * Het album naar de prullenmand van het beheer.
 *
 * Er wordt nog niets verwijderd: elk deel krijgt de uit-merker, zodat het meteen
 * van de site is, en een rij in `GalleryTrashedAlbum` haalt het uit de lijst.
 * Terugzetten is die twee dingen ongedaan maken. Pas na 30 dagen gaat het echt
 * weg (`purgeExpiredGalleryTrash`).
 */
export async function trashAlbumAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const album = await loadAlbum(readField(formData, "albumId", 100));
  if (!album) return saveError("ALBUM_MISSING");
  const partIds = album.parts.map((part) => part.id);

  try {
    await setPartsVisible(partIds, false);
  } catch (error) {
    console.error("Immich album trash failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  await prisma.galleryTrashedAlbum.upsert({
    where: { albumId: album.id },
    create: {
      gallery: "MAIN",
      albumId: album.id,
      partIds,
      title: album.title,
      photoCount: album.photoCount,
      wasHidden: album.hidden,
      trashedById: session.user.id,
    },
    update: { partIds, title: album.title, photoCount: album.photoCount, trashedAt: new Date() },
  });

  await logAudit({
    action: "delete",
    entity: "photoAlbum",
    entityId: album.id,
    target: album.title,
    summary: "fotoalbum naar de prullenmand van het mediabeheer",
  });
  await refreshGallery();
  return saveOk();
}

export async function restoreAlbumAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const albumId = readField(formData, "albumId", 100);
  const row = await prisma.galleryTrashedAlbum.findUnique({ where: { albumId } });
  if (!row || row.gallery !== "MAIN") return saveError("TRASH_MISSING");
  if (row.trashedAt < trashCutoff(new Date())) return saveError("TRASH_EXPIRED");

  try {
    // Stond het al van de site voor het weggegooid werd, dan blijft het dat.
    if (!row.wasHidden) await setPartsVisible(row.partIds, true);
  } catch (error) {
    console.error("Immich album restore failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  await prisma.galleryTrashedAlbum.delete({ where: { id: row.id } });
  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: row.albumId,
    target: row.title,
    summary: "fotoalbum uit de prullenmand teruggezet",
  });
  await refreshGallery();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Tabs
// -----------------------------------------------------------------------------

/**
 * Een tab bijmaken: een nieuw Immich-album dat via `[parent:]` aan dit album
 * hangt. De foto's komen er daarna in via de gewone upload-actie. Staat het
 * album van de site, dan de nieuwe tab ook.
 */
export async function addAlbumTabAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const name = readField(formData, "tabName", 50);
  if (!name) return saveError("TAB_NAME_REQUIRED");

  const album = await loadAlbum(readField(formData, "albumId", 100));
  if (!album) return saveError("ALBUM_MISSING");
  if (album.parts.some((part) => part.name.toLowerCase() === name.toLowerCase())) {
    return saveError("TAB_EXISTS");
  }

  // Het hoofdalbum moet zelf ook een tabnaam dragen, anders heet zijn tab op de
  // site "Algemeen". Staat er nog geen, dan vult dit formulier ze mee in.
  const parentTabName = readField(formData, "parentTabName", 50);

  try {
    await createImmichGalleryAlbum({
      title: `${album.title}: ${name}`,
      description: `[parent: ${album.slug}] [tab: ${name}]`,
      hidden: album.hidden,
    });

    if (parentTabName && !album.hasOwnTabName) {
      const raw = (await getManageableGalleryAlbum(album.id))?.description ?? "";
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

  const partId = readField(formData, "partId", 100);
  const name = readField(formData, "tabName", 50);
  if (!partId || !name) return saveError("TAB_NAME_REQUIRED");

  try {
    const raw = (await getManageableGalleryAlbum(partId))?.description;
    if (raw === undefined) return saveError("ALBUM_MISSING");
    await updateImmichAlbum(partId, { description: setMarker(raw, "tab", name) });
  } catch (error) {
    console.error("Immich tab rename failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: partId,
    target: name,
    summary: "tab van een fotoalbum hernoemd",
  });
  await refreshGallery();
  return saveOk();
}

/**
 * Een tab opheffen: `[parent:]` en `[tab:]` weg, waardoor dat album een
 * zelfstandig album wordt. De foto's blijven waar ze zijn.
 */
export async function detachAlbumTabAction(formData: FormData): Promise<void> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const partId = readField(formData, "partId", 100);
  if (!partId) return;

  const raw = (await getManageableGalleryAlbum(partId))?.description ?? "";
  const next = setMarker(setMarker(raw, "parent", null), "tab", null);
  await updateImmichAlbum(partId, { description: next });

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: partId,
    target: partId,
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

  const fromId = readField(formData, "fromPartId", 100);
  const toId = readField(formData, "toPartId", 100);
  const assetIds = readIds(formData);
  if (!fromId || !toId || assetIds.length === 0) return saveError("INVALID_INPUT");
  if (fromId === toId) return saveError("SAME_TAB");

  const album = await loadAlbum(readField(formData, "albumId", 100));
  if (!album) return saveError("ALBUM_MISSING");
  // Verplaatsen mag enkel binnen dit album; anders is dit een manier om foto's
  // naar willekeurige Immich-albums te schuiven.
  if (!partOf(album, fromId) || !partOf(album, toId)) return saveError("INVALID_INPUT");

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

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: album.id,
    target: album.title,
    summary: `${moved.length} foto('s) naar een andere tab verplaatst`,
  });
  await refreshGallery();
  if (moved.length < assetIds.length) {
    return saveError(
      "MOVE_PARTIAL",
      `${moved.length} van de ${assetIds.length} foto's zijn verplaatst; de rest bleef staan.`,
    );
  }
  return saveOk();
}

/**
 * Foto's verbergen: ze gaan uit het album en dus van de site, maar blijven in
 * het beheer staan (gedimd) zodat je ze terug kan tonen. De rij in
 * `GalleryDetachedPhoto` is wat het beheer nodig heeft om ze terug te vinden.
 */
export async function hidePhotosAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const partId = readField(formData, "partId", 100);
  const assetIds = readIds(formData);
  if (!partId || assetIds.length === 0) return saveError("INVALID_INPUT");

  const album = await loadAlbum(readField(formData, "albumId", 100));
  if (!album) return saveError("ALBUM_MISSING");
  if (!partOf(album, partId)) return saveError("INVALID_INPUT");

  // Enkel wat Immich echt uit het album haalde: een rij schrijven voor een foto
  // die er nog in staat, zet ze in twee lijsten tegelijk.
  let hidden: string[] = [];
  try {
    hidden = succeededAssetIds(await removeImmichAssetsFromAlbum(partId, assetIds));
  } catch (error) {
    console.error("Immich hide failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }
  if (hidden.length === 0) return saveError("HIDE_FAILED");

  await prisma.galleryDetachedPhoto.createMany({
    data: hidden.map((assetId) => ({
      gallery: "MAIN" as const,
      assetId,
      albumId: partId,
      albumTitle: album.title,
      tabName: tabNameOf(album, partId),
      detachedById: session.user.id,
    })),
    skipDuplicates: true,
  });

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: album.id,
    target: album.title,
    summary: `${hidden.length} foto('s) verborgen op de site`,
  });
  await refreshGallery();
  if (hidden.length < assetIds.length) {
    return saveError(
      "HIDE_PARTIAL",
      `${hidden.length} van de ${assetIds.length} foto's zijn verborgen; de rest staat nog op de site.`,
    );
  }
  return saveOk();
}

/** Verborgen foto's weer tonen: terug in het album waar ze uit kwamen. */
export async function showPhotosAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const assetIds = readIds(formData);
  if (assetIds.length === 0) return saveError("INVALID_INPUT");

  const rows = await prisma.galleryDetachedPhoto.findMany({
    where: { gallery: "MAIN", assetId: { in: assetIds } },
  });
  if (rows.length === 0) return saveError("PHOTO_MISSING");

  const shown: string[] = [];
  try {
    for (const albumId of new Set(rows.map((row) => row.albumId))) {
      const ids = rows.filter((row) => row.albumId === albumId).map((row) => row.assetId);
      shown.push(...succeededAssetIds(await addImmichAssetsToAlbum(albumId, ids)));
    }
  } catch (error) {
    console.error("Immich show failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }
  // De rij is het enige spoor naar deze foto; ze pas weggooien wanneer de foto
  // echt terug in het album zit.
  if (shown.length === 0) return saveError("SHOW_FAILED");
  await prisma.galleryDetachedPhoto.deleteMany({ where: { assetId: { in: shown } } });

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: rows[0].albumId,
    target: rows[0].albumTitle,
    summary: `${shown.length} foto('s) weer op de site gezet`,
  });
  await refreshGallery();
  return saveOk();
}

/**
 * Naar de prullenmand van Immich (`force: false`), niet definitief: de foto is
 * meteen van de site weg, en de rij in `GalleryTrashedPhoto` laat het beheer
 * haar 30 dagen tonen en terugzetten zonder dat iemand in Immich moet.
 */
export async function trashPhotosAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const partId = readField(formData, "partId", 100);
  const assetIds = readIds(formData);
  if (assetIds.length === 0) return saveError("INVALID_INPUT");

  const album = await loadAlbum(readField(formData, "albumId", 100));
  if (!album) return saveError("ALBUM_MISSING");
  // Een verborgen foto zit in geen album meer; waar ze vandaan kwam, staat in
  // haar rij. Die gaat mee naar de prullenmand, zodat terugzetten ze daar weer
  // in legt.
  const detached = await prisma.galleryDetachedPhoto.findMany({
    where: { gallery: "MAIN", assetId: { in: assetIds } },
  });
  const origin = new Map(detached.map((row) => [row.assetId, row.albumId]));

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

  await prisma.$transaction([
    prisma.galleryTrashedPhoto.createMany({
      data: assetIds.map((assetId) => {
        const from = origin.get(assetId) ?? partId;
        return {
          gallery: "MAIN" as const,
          assetId,
          albumId: from,
          albumTitle: album.title,
          tabName: tabNameOf(album, from),
          trashedById: session.user.id,
        };
      }),
      skipDuplicates: true,
    }),
    prisma.galleryDetachedPhoto.deleteMany({ where: { assetId: { in: assetIds } } }),
  ]);

  await logAudit({
    action: "delete",
    entity: "photoAlbum",
    entityId: album.id,
    target: album.title,
    summary: `${assetIds.length} foto('s) naar de prullenmand`,
  });
  await refreshGallery();
  return saveOk();
}

/**
 * Foto's uit de prullenmand terugzetten. Immich legt ze zelf terug in hun
 * album; voor de zekerheid voegen we ze er nog eens aan toe (een foto die er
 * al in zit, telt als gelukt).
 */
export async function restorePhotosAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requireAnyPermission([...ALBUM_PERMISSIONS]);

  const assetIds = readIds(formData);
  if (assetIds.length === 0) return saveError("INVALID_INPUT");

  const rows = await prisma.galleryTrashedPhoto.findMany({
    where: { gallery: "MAIN", assetId: { in: assetIds }, trashedAt: { gte: trashCutoff(new Date()) } },
  });
  if (rows.length === 0) return saveError("TRASH_MISSING");

  try {
    await restoreImmichAssets(rows.map((row) => row.assetId));
  } catch (error) {
    // Immich ruimt zijn prullenmand op zijn eigen termijn op; staat die korter
    // dan 30 dagen, dan is de foto daar al weg.
    const status = (error as { status?: number })?.status;
    if (status === 400 || status === 404) return saveError("TRASH_EXPIRED");
    console.error("Immich restore failed", error);
    return saveError("IMMICH_UNREACHABLE");
  }

  for (const albumId of new Set(rows.map((row) => row.albumId))) {
    const ids = rows.filter((row) => row.albumId === albumId).map((row) => row.assetId);
    await addImmichAssetsToAlbum(albumId, ids).catch(() => null);
  }
  await prisma.galleryTrashedPhoto.deleteMany({ where: { assetId: { in: rows.map((row) => row.assetId) } } });

  await logAudit({
    action: "update",
    entity: "photoAlbum",
    entityId: rows[0].albumId,
    target: rows[0].albumTitle,
    summary: `${rows.length} foto('s) uit de prullenmand teruggezet`,
  });
  await refreshGallery();
  return saveOk();
}
