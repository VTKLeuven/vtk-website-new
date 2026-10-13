import { NextResponse } from "next/server";
import { getImmichAssetThumbnail, immichGalleryStatus } from "@/lib/immich-gallery";
import { authErrorResponse, requireAnyPermission } from "@/lib/session";

/**
 * De thumbnail van één foto, met de API-sleutel in plaats van via een gedeelde
 * link. Elke duimnagel in het mediabeheer loopt hierlangs.
 *
 * Het beheer toont ook wat de site niet heeft: een verborgen foto (uit het album
 * gehaald), een album dat van de site staat (zonder gedeelde link) en de
 * prullenmand. De publieke foto-URL's (`/share/photo/<sleutel>/...`) hangen aan
 * de gedeelde link van een zichtbaar *album* en dekken dat dus niet.
 *
 * Achter `media.manage` of `photos.manageAlbums`, privé gecachet, en enkel de
 * kleine thumbnail: dit is een beheerweergave, geen fotoproxy voor de site.
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
