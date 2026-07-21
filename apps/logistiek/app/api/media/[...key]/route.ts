import { Readable } from 'node:stream';
import { getObjectStream } from '@vtk/storage';

export const runtime = 'nodejs';

/**
 * Serveert opgeslagen objecten (item-foto's) via de app zelf, zodat de browser
 * enkel met deze origin praat. Identiek aan apps/web/app/api/media/[...key].
 * Keys zijn onraadbare random hex, dus het toegangsmodel blijft gelijk.
 */
export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await context.params;
  const key = segments.join('/');
  if (!key) return new Response('Not found', { status: 404 });

  try {
    const { stream, contentType, contentLength } = await getObjectStream(key);
    const headers = new Headers();
    headers.set('content-type', contentType ?? 'application/octet-stream');
    if (contentLength != null) headers.set('content-length', String(contentLength));
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    return new Response(Readable.toWeb(stream as Readable) as unknown as BodyInit, { headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
