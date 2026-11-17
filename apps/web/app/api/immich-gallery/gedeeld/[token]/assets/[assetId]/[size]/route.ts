import { NextResponse } from "next/server";
import { contentDisposition } from "@/lib/contentDisposition";
import {
  downloadFilenameFromImmichResponse,
  downloadImmichOriginal,
  getImmichAssetThumbnail,
  immichGalleryStatus,
} from "@/lib/immich-gallery";
import { checkShareAccess, findShareLink, findSharedPhoto, loadSharedAlbum } from "@/lib/media-share";
import { getCurrentSession } from "@/lib/session";

/**
 * Eén foto van een privélink: de duimnagel, de preview voor de lightbox of het
 * origineel. Met de API-sleutel en niet via een gedeelde link van Immich, zodat
 * er geen sleutel in de foto-URL staat die het album op de fotoproxy opent.
 *
 * Bij elke foto opnieuw: bestaat de link nog, mag deze bezoeker binnen, en hoort
 * de foto bij dit album. Dat laatste is wat deze route onderscheidt van de
 * thumbnailroute van het beheer, die elk Immich-id aanneemt: een link naar één
 * album mag geen foto van de fakbargalerij of een selfie van de gezichtszoeker
 * openen. Het album komt uit een korte cache (`loadSharedAlbum`).
 */
export const dynamic = "force-dynamic";

const SIZES = new Set(["thumbnail", "preview", "original"]);

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; assetId: string; size: string }> },
) {
  const { token, assetId, size } = await context.params;
  if (!SIZES.has(size)) return fail(404, "not_found", "Niet gevonden.");

  const link = await findShareLink(token);
  if (!link) return fail(404, "link_gone", "Deze link werkt niet meer.");
  const userId = link.audience === "LINK" ? null : ((await getCurrentSession())?.user.id ?? null);
  const access = await checkShareAccess(link, userId);
  if (!access.ok) {
    return access.reason === "login"
      ? fail(401, "login_required", "Log in om dit album te zien.")
      : fail(403, "not_shared_with_you", "Dit album is niet met jou gedeeld.");
  }
  if (size === "original" && !link.allowDownload) {
    return fail(403, "download_off", "Downloaden staat uit voor deze link.");
  }

  try {
    const album = await loadSharedAlbum(link.albumId);
    const photo = album ? findSharedPhoto(album, assetId) : null;
    if (!photo) return fail(404, "photo_not_found", "Deze foto hoort niet bij dit album.");

    if (size === "original") {
      const response = await downloadImmichOriginal(assetId);
      const headers = new Headers({
        "content-type": response.headers.get("content-type") || "application/octet-stream",
        "content-disposition": contentDisposition(
          "attachment",
          downloadFilenameFromImmichResponse(response, photo.filename),
        ),
        "cache-control": "private, no-store",
      });
      const length = response.headers.get("content-length");
      if (length) headers.set("content-length", length);
      return new NextResponse(response.body, { headers });
    }

    const response = await getImmichAssetThumbnail(assetId, size === "preview" ? "preview" : "thumbnail");
    return new NextResponse(response.body, {
      headers: {
        "content-type": response.headers.get("content-type") || "image/jpeg",
        // Privé en kort: na het intrekken toont de pagina het scherm "werkt niet
        // meer", en een duimnagel uit de cache van dezelfde browser is dan geen lek.
        "cache-control": "private, max-age=600",
      },
    });
  } catch (error) {
    const status = immichGalleryStatus(error);
    return fail(status.status, status.code, status.message);
  }
}
