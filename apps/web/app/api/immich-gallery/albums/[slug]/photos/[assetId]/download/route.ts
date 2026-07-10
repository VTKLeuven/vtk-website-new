import { NextResponse } from "next/server";
import {
  downloadFilenameFromImmichResponse,
  downloadImmichOriginal,
  getImmichGalleryDownloadTarget,
  immichGalleryStatus,
} from "@/lib/immich-gallery";

export const dynamic = "force-dynamic";

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; assetId: string }> },
) {
  try {
    const { slug, assetId } = await context.params;
    const target = await getImmichGalleryDownloadTarget(slug, assetId);
    const immichResponse = await downloadImmichOriginal(assetId);
    const filename = downloadFilenameFromImmichResponse(immichResponse, target.photo.filename);
    const headers = new Headers({
      "content-type": immichResponse.headers.get("content-type") || target.photo.mimeType || "application/octet-stream",
      "content-disposition": contentDisposition(filename),
      "cache-control": "no-store",
    });
    const contentLength = immichResponse.headers.get("content-length");
    if (contentLength) headers.set("content-length", contentLength);

    return new NextResponse(immichResponse.body, {
      headers,
    });
  } catch (error) {
    const status = immichGalleryStatus(error);
    return NextResponse.json(
      {
        error: status.message,
        code: status.code,
      },
      { status: status.status },
    );
  }
}
