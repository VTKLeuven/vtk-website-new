import "server-only";

import { prisma } from "@vtk/db";
import { logAudit } from "@/lib/audit";
import {
  deleteImmichAlbum,
  deleteImmichAssets,
  listAdminGalleryAlbums,
  listImmichAlbumAssets,
  listImmichGalleryAlbums,
  type AdminAlbum,
} from "@/lib/immich-gallery";
import { TRASH_DAYS, trashCutoff } from "@/lib/media-admin-shared";

/**
 * Wat het mediabeheer (/admin/media) uit Immich en de databank leest.
 *
 * Het beheer leest **niet** uit de momentopname van de site. Die bevat enkel de
 * zichtbare albums, met duimnagels via de publieke gedeelde link, en loopt tot
 * een kwartier achter. Hier komt alles recht uit Immich, ook een verborgen
 * album en een verborgen foto, en de duimnagels lopen via de afgeschermde
 * beheerroute (`adminThumbnailUrl`).
 */

export type LibraryPhoto = {
  id: string;
  filename: string;
  /** Verborgen: uit het album gehaald, met een rij in `GalleryDetachedPhoto`. */
  hidden: boolean;
  video: boolean;
};

export type LibraryPart = {
  id: string;
  name: string;
  photos: LibraryPhoto[];
};

export type LibraryAlbum = {
  album: AdminAlbum;
  parts: LibraryPart[];
  /** `/media/<slug>` wanneer het album op de site staat, anders `null`. */
  publicPath: string | null;
};

export type TrashedPhoto = {
  assetId: string;
  albumId: string;
  albumTitle: string;
  tabName: string | null;
  trashedAt: string;
};

export type TrashedAlbum = {
  albumId: string;
  title: string;
  photoCount: number;
  trashedAt: string;
};

/** De albums van de lijst links: alles van vtk.be, behalve wat in de prullenmand ligt. */
export async function loadLibraryAlbums(): Promise<AdminAlbum[]> {
  const [albums, trashed] = await Promise.all([
    listAdminGalleryAlbums(),
    prisma.galleryTrashedAlbum.findMany({
      where: { gallery: "MAIN" },
      select: { albumId: true, partIds: true },
    }),
  ]);
  const gone = new Set(trashed.flatMap((row) => [row.albumId, ...row.partIds]));
  return albums.filter((album) => !gone.has(album.id));
}

/** De datum waarop een foto genomen is, zoals de site de foto's ook sorteert. */
function takenAt(asset: { localDateTime?: string | null; fileCreatedAt?: string | null; createdAt?: string | null }): number {
  const raw = asset.localDateTime || asset.fileCreatedAt || asset.createdAt || "";
  const time = Date.parse(raw);
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Eén album met de foto's van elk deel, verborgen foto's inbegrepen.
 *
 * Aanvaardt het Immich-id van het album of van een tab, en ook nog de slug van
 * de site: oude links naar /admin/media/albums/<slug> blijven zo werken.
 */
export async function loadLibraryAlbum(idOrSlug: string): Promise<LibraryAlbum | null> {
  const albums = await loadLibraryAlbums();
  const album =
    albums.find((item) => item.id === idOrSlug || item.parts.some((part) => part.id === idOrSlug)) ??
    albums.find((item) => item.slug === idOrSlug) ??
    null;
  if (!album) return null;

  const partIds = album.parts.map((part) => part.id);
  const [assetLists, detached, snapshot] = await Promise.all([
    Promise.all(partIds.map((id) => listImmichAlbumAssets(id))),
    prisma.galleryDetachedPhoto.findMany({
      where: { gallery: "MAIN", albumId: { in: partIds } },
      orderBy: { detachedAt: "desc" },
      select: { assetId: true, albumId: true, filename: true },
    }),
    // Enkel voor de link naar de site; een momentopname die niet laadt, mag het
    // beheer niet tegenhouden.
    album.hidden ? null : listImmichGalleryAlbums().catch(() => null),
  ]);

  const parts = album.parts.map((part, index) => {
    const visible = [...assetLists[index]]
      .sort((left, right) => takenAt(left) - takenAt(right))
      .map((asset) => ({
        id: asset.id,
        filename: asset.originalFileName || "",
        hidden: false,
        video: asset.type === "VIDEO",
      }));
    const hidden = detached
      .filter((row) => row.albumId === part.id)
      .map((row) => ({ id: row.assetId, filename: row.filename || "", hidden: true, video: false }));
    return { id: part.id, name: part.name, photos: [...visible, ...hidden] };
  });

  // De slug van de momentopname als die er is; anders die van de lijst, die op
  // dezelfde manier toegekend wordt. Een momentopname die net niet ververst
  // raakte, mag de link naar de site niet doen verdwijnen.
  const live = snapshot?.albums.find((summary) => summary.id === album.id);
  const slug = album.hidden ? null : live?.slug ?? album.slug;
  return { album, parts, publicPath: slug ? `/media/${slug}` : null };
}

/** Wat er de voorbije {@link TRASH_DAYS} dagen naar de prullenmand ging. */
export async function loadTrash(now = new Date()): Promise<{ photos: TrashedPhoto[]; albums: TrashedAlbum[] }> {
  const cutoff = trashCutoff(now);
  const [photos, albums] = await Promise.all([
    prisma.galleryTrashedPhoto.findMany({
      where: { gallery: "MAIN", trashedAt: { gte: cutoff } },
      orderBy: { trashedAt: "desc" },
    }),
    prisma.galleryTrashedAlbum.findMany({
      where: { gallery: "MAIN", trashedAt: { gte: cutoff } },
      orderBy: { trashedAt: "desc" },
    }),
  ]);
  return {
    photos: photos.map((row) => ({
      assetId: row.assetId,
      albumId: row.albumId,
      albumTitle: row.albumTitle,
      tabName: row.tabName,
      trashedAt: row.trashedAt.toISOString(),
    })),
    albums: albums.map((row) => ({
      albumId: row.albumId,
      title: row.title,
      photoCount: row.photoCount,
      trashedAt: row.trashedAt.toISOString(),
    })),
  };
}

export async function countTrash(now = new Date()): Promise<number> {
  const cutoff = trashCutoff(now);
  const [photos, albums] = await Promise.all([
    prisma.galleryTrashedPhoto.count({ where: { gallery: "MAIN", trashedAt: { gte: cutoff } } }),
    prisma.galleryTrashedAlbum.count({ where: { gallery: "MAIN", trashedAt: { gte: cutoff } } }),
  ]);
  return photos + albums;
}

/** Immich verwerkt een bulkverwijdering in één keer; houd de body klein. */
function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/**
 * Ruimt op wat langer dan {@link TRASH_DAYS} dagen in de prullenmand ligt.
 *
 * Een foto ligt al in de prullenmand van Immich; hier verdwijnt enkel de rij.
 * Een album gaat nu pas echt weg: zijn foto's naar de prullenmand van Immich
 * (die ze op zijn eigen termijn leegt) en de albums zelf uit Immich.
 *
 * Lui, bij het openen van het beheer, en niet in een worker: wie de prullenmand
 * een tijd niet bekijkt, merkt het verschil niet, want een album in de
 * prullenmand staat al niet op de site.
 */
export async function purgeExpiredGalleryTrash(now = new Date()): Promise<void> {
  const cutoff = trashCutoff(now);
  await prisma.galleryTrashedPhoto.deleteMany({ where: { gallery: "MAIN", trashedAt: { lt: cutoff } } });

  const expired = await prisma.galleryTrashedAlbum.findMany({
    where: { gallery: "MAIN", trashedAt: { lt: cutoff } },
  });
  for (const row of expired) {
    try {
      const assets = (await Promise.all(row.partIds.map((id) => listImmichAlbumAssets(id).catch(() => [])))).flat();
      const detached = await prisma.galleryDetachedPhoto.findMany({
        where: { albumId: { in: row.partIds } },
        select: { assetId: true },
      });
      const assetIds = [...new Set([...assets.map((asset) => asset.id), ...detached.map((item) => item.assetId)])];
      for (const batch of chunks(assetIds, 500)) {
        await deleteImmichAssets(batch, { force: false });
      }
      for (const id of row.partIds) {
        // Al weg is ook goed: dan is iemand ons in Immich zelf voor geweest.
        await deleteImmichAlbum(id).catch(() => null);
      }
      await prisma.galleryDetachedPhoto.deleteMany({ where: { albumId: { in: row.partIds } } });
      await prisma.galleryTrashedAlbum.delete({ where: { id: row.id } });
      await logAudit({
        action: "delete",
        entity: "photoAlbum",
        entityId: row.albumId,
        target: row.title,
        summary: `fotoalbum na ${TRASH_DAYS} dagen in de prullenmand definitief verwijderd, met ${assetIds.length} foto('s) naar de prullenmand van Immich`,
      });
    } catch (error) {
      // De volgende keer opnieuw; tot dan blijft het album verborgen staan.
      console.error("Gallery trash purge failed", row.albumId, error);
    }
  }
}
