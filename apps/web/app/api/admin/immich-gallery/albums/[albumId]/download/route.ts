import { NextResponse } from "next/server";
import { streamZip } from "@vtk/storage";
import { contentDisposition } from "@/lib/contentDisposition";
import { immichGalleryStatus } from "@/lib/immich-gallery";
import { loadLibraryAlbum } from "@/lib/media-admin";
import { albumZipEntries, albumZipFilename } from "@/lib/media-album-zip";
import { withHiddenPhotoDetails } from "@/lib/media-hidden-photos";
import { openZipOriginal } from "@/lib/media-zip-originals";
import { authErrorResponse, requireAnyPermission } from "@/lib/session";

/**
 * Het hele album als zip, in de originele kwaliteit: alle tabs, en ook een
 * album dat van de site staat (`[gallery-uit]`). De communicatieploeg haalt hier
 * de foto's van een evenement op voor een partner of een nieuwsbrief.
 *
 * Hetzelfde recht als de rest van het mediabeheer. Het album komt uit
 * `loadLibraryAlbum`, net als op het scherm, dus verborgen albums en verborgen
 * foto's horen erbij, en wat in de prullenmand ligt niet. Een verborgen foto
 * kent haar eigen naam niet; die haalt `withHiddenPhotoDetails` eerst op.
 *
 * De zip wordt gestreamd, een origineel per keer: een album is zo gauw enkele
 * gigabytes, en dat past niet in het geheugen. Zonder compressie, want foto's en
 * video's krimpen niet meer. Het archief wordt vanzelf Zip64 boven 4 GB.
 * Bijgevolg is de lengte vooraf niet bekend en toont de browser geen percentage.
 *
 * Mislukt een origineel halverwege, dan breekt de download af in plaats van een
 * zip te leveren waar stilletjes foto's ontbreken: de browser meldt een
 * mislukte download en de fout staat in de log.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ albumId: string }> },
) {
  try {
    await requireAnyPermission(["media.manage", "photos.manageAlbums"]);
  } catch (error) {
    return authErrorResponse(error);
  }

  try {
    const { albumId } = await context.params;
    const loaded = await loadLibraryAlbum(albumId);
    if (!loaded) {
      return NextResponse.json({ error: "Album niet gevonden.", code: "album_not_found" }, { status: 404 });
    }

    const entries = albumZipEntries(await withHiddenPhotoDetails(loaded.parts));
    if (entries.length === 0) {
      return NextResponse.json({ error: "Dit album bevat geen foto's.", code: "album_empty" }, { status: 404 });
    }

    return new Response(streamZip(entries, openZipOriginal, { store: true }) as unknown as BodyInit, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": contentDisposition("attachment", albumZipFilename(loaded.album.title)),
        // Privé en nooit bewaard: dit zijn originelen, ook van een verborgen album.
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const status = immichGalleryStatus(error);
    return NextResponse.json({ error: status.message, code: status.code }, { status: status.status });
  }
}
