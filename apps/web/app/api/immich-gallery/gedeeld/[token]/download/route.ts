import { NextResponse } from "next/server";
import { streamZip } from "@vtk/storage";
import { contentDisposition } from "@/lib/contentDisposition";
import { immichGalleryStatus } from "@/lib/immich-gallery";
import { albumZipEntries, albumZipFilename } from "@/lib/media-album-zip";
import { checkShareAccess, findShareLink, loadSharedAlbum } from "@/lib/media-share";
import { openZipOriginal } from "@/lib/media-zip-originals";
import { getCurrentSession } from "@/lib/session";

/**
 * Het hele album van een privélink als zip, in originele kwaliteit, met een map
 * per tab. Enkel wanneer downloaden aan staat voor de link.
 *
 * Anders dan de zip van het beheer zitten de verborgen foto's er **niet** in:
 * die zip blijft binnen Communicatie, een link gaat naar buiten, en een foto
 * wordt vaak verborgen na een verwijderverzoek. Zie docs/design-decisions.md.
 * Gestreamd, een origineel per keer, zoals de zip van het beheer.
 */
export const dynamic = "force-dynamic";

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  const link = await findShareLink(token);
  if (!link) return fail(404, "link_gone", "Deze link werkt niet meer.");
  const userId = link.audience === "LINK" ? null : ((await getCurrentSession())?.user.id ?? null);
  const access = await checkShareAccess(link, userId);
  if (!access.ok) {
    return access.reason === "login"
      ? fail(401, "login_required", "Log in om dit album te zien.")
      : fail(403, "not_shared_with_you", "Dit album is niet met jou gedeeld.");
  }
  if (!link.allowDownload) return fail(403, "download_off", "Downloaden staat uit voor deze link.");

  try {
    const album = await loadSharedAlbum(link.albumId, { fresh: true });
    if (!album) return fail(404, "link_gone", "Deze link werkt niet meer.");

    const entries = albumZipEntries(
      album.parts.map((part) => ({
        name: part.name,
        photos: part.photos.map((photo) => ({ id: photo.id, filename: photo.filename, video: false })),
      })),
    );
    if (entries.length === 0) return fail(404, "album_empty", "Dit album bevat geen foto's.");

    return new Response(streamZip(entries, openZipOriginal, { store: true }) as unknown as BodyInit, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": contentDisposition("attachment", albumZipFilename(album.title)),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const status = immichGalleryStatus(error);
    return fail(status.status, status.code, status.message);
  }
}
