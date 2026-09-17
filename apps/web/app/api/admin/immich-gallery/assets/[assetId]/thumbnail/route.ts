import { NextResponse } from "next/server";
import { getImmichAssetThumbnail, immichGalleryStatus } from "@/lib/immich-gallery";
import { authErrorResponse, requireAnyPermission } from "@/lib/session";

/**
 * De thumbnail van één foto, met de API-sleutel in plaats van via een gedeelde
 * link.
 *
 * Nodig voor foto's die uit hun album gehaald zijn: de publieke foto-URL's
 * (`/share/photo/<sleutel>/...`) hangen aan de gedeelde link van een *album*, en
 * die hebben zulke foto's niet meer. Alle andere thumbnails in het beheer blijven
 * gewoon via de publieke proxy lopen; deze route is geen algemene fotoproxy.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  try {
    await requireAnyPermission(["media.manage", "photos.manageAlbums"]);
  } catch (error) {
    return authErrorResponse(error);
  }

  try {
    const { assetId } = await context.params;
    const immichResponse = await getImmichAssetThumbnail(assetId);

    return new NextResponse(immichResponse.body, {
      headers: {
        "content-type": immichResponse.headers.get("content-type") || "image/jpeg",
        // Privé en kortstondig: dit is een beheerweergave, geen publieke foto.
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    const status = immichGalleryStatus(error);
    return NextResponse.json({ error: status.message, code: status.code }, { status: status.status });
  }
}
