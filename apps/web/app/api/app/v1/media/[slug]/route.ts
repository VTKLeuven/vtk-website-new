import { corsPreflight } from "@/lib/cors";
import { getImmichGalleryAlbum } from "@/lib/immich-gallery";
import type { AppAlbumDetail } from "@/lib/app-api/contract";
import { absoluteUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson, appNotFound } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Eén fotoalbum met zijn foto's.
 *
 * Elke foto komt in twee maten: een thumbnail voor het raster en een
 * schermklare versie voor wie erop tikt. Het **origineel** zit er bewust niet
 * bij: dat zijn bestanden van tien megabyte en meer, en op mobiele data is dat
 * een galerij die niet laadt. Wie het origineel wil, downloadt het op de site.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;

    const album = await getImmichGalleryAlbum(slug);
    if (!album) return appNotFound(request, "Dit album bestaat niet.");

    const payload: AppAlbumDetail = {
      slug: album.slug,
      title: album.title,
      description: album.description || null,
      date: album.date,
      photoCount: album.photoCount,
      coverUrl: absoluteUrl(request, album.coverPhoto?.thumbnailUrl ?? null),
      photos: album.photos.map((photo) => ({
        id: photo.id,
        url: absoluteUrl(request, photo.previewUrl) as string,
        thumbUrl: absoluteUrl(request, photo.thumbnailUrl) as string,
      })),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
