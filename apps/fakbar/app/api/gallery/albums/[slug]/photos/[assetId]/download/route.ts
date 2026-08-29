import { NextResponse } from 'next/server';
import { downloadFilenameFromResponse, downloadImmichOriginal, galleryStatus } from '@vtk/gallery';
import { fakbarGallery } from '@/lib/gallery';

export const dynamic = 'force-dynamic';

/**
 * De originele foto downloaden.
 *
 * De asset wordt eerst opgezocht *in deze galerij*: zonder die stap zou dit
 * endpoint elke asset-id uit heel Immich doorgeven, ook die van albums die
 * hier niet horen. `getDownloadTarget` gooit een 404 wanneer de foto niet in
 * een fakbaralbum zit.
 */
function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; assetId: string }> },
) {
  try {
    const { slug, assetId } = await context.params;
    const target = await fakbarGallery.getDownloadTarget(slug, assetId);
    const immichResponse = await downloadImmichOriginal(assetId);
    const filename = downloadFilenameFromResponse(immichResponse, target.photo.filename);

    const headers = new Headers({
      'content-type':
        immichResponse.headers.get('content-type') || target.photo.mimeType || 'application/octet-stream',
      'content-disposition': contentDisposition(filename),
      'cache-control': 'no-store',
    });
    const contentLength = immichResponse.headers.get('content-length');
    if (contentLength) headers.set('content-length', contentLength);

    return new NextResponse(immichResponse.body, { headers });
  } catch (error) {
    const status = galleryStatus(error);
    return NextResponse.json({ error: status.message, code: status.code }, { status: status.status });
  }
}
