import { NextResponse } from "next/server";
import { contentDisposition } from "@/lib/contentDisposition";
import {
  downloadFilenameFromImmichResponse,
  downloadImmichOriginal,
  immichGalleryStatus,
} from "@/lib/immich-gallery";
import { loadLibraryAlbum } from "@/lib/media-admin";
import { authErrorResponse, requireAnyPermission } from "@/lib/session";

/**
 * Het origineel van één foto of video uit een album, vanuit het mediabeheer.
 *
 * De publieke downloadroute (`/api/immich-gallery/albums/<slug>/photos/...`)
 * helpt hier niet: ze werkt enkel voor een foto die op de site staat. Het beheer
 * toont ook een verborgen foto (uit het album gehaald) en een album dat van de
 * site staat, en ook die moet je kunnen ophalen.
 *
 * Anders dan de thumbnail geeft dit een origineel terug, dus de foto moet echt
 * bij dit album horen: zo is de route geen algemene proxy op alles wat in
 * Immich staat (de fakbargalerij, een tijdelijke selfie van de gezichtszoeker).
 * Het album komt uit `loadLibraryAlbum`, net als op het scherm; wat in de
 * prullenmand ligt, is er niet meer in te vinden.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ albumId: string; assetId: string }> },
) {
  try {
    await requireAnyPermission(["media.manage", "photos.manageAlbums"]);
  } catch (error) {
    return authErrorResponse(error);
  }

  try {
    const { albumId, assetId } = await context.params;
    const loaded = await loadLibraryAlbum(albumId);
    const photo = loaded?.parts.flatMap((part) => part.photos).find((item) => item.id === assetId);
    if (!photo) {
      return NextResponse.json({ error: "Foto niet gevonden in dit album.", code: "photo_not_found" }, { status: 404 });
    }

    const immichResponse = await downloadImmichOriginal(assetId);
    const filename = downloadFilenameFromImmichResponse(immichResponse, photo.filename || (photo.video ? "video.mp4" : "foto.jpg"));
    const headers = new Headers({
      "content-type": immichResponse.headers.get("content-type") || "application/octet-stream",
      "content-disposition": contentDisposition("attachment", filename),
      // Privé en nooit bewaard: een origineel, ook van een verborgen album of foto.
      "cache-control": "private, no-store",
    });
    const contentLength = immichResponse.headers.get("content-length");
    if (contentLength) headers.set("content-length", contentLength);

    return new NextResponse(immichResponse.body, { headers });
  } catch (error) {
    const status = immichGalleryStatus(error);
    return NextResponse.json({ error: status.message, code: status.code }, { status: status.status });
  }
}
