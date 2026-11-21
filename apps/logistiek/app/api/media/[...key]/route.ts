import { getObjectBuffer, getObjectStream, mediaResponseInit, objectResponse, putObject } from '@vtk/storage';
import { originalOfThumb } from '@/lib/photo-url';
import { makeThumb } from '@/lib/upload';

export const runtime = 'nodejs';

/**
 * Serveert opgeslagen objecten (item-foto's en pdf's) via de app zelf, zodat de
 * browser enkel met deze origin praat. Keys zijn onraadbare random hex, dus het
 * toegangsmodel blijft gelijk.
 *
 * Dezelfde headers als vtk.be (`mediaResponseInit` in @vtk/storage): Range voor
 * een pdf-lezer, ETag, `nosniff`, en een sandbox plus download voor een type dat
 * in de browser code kan draaien. Die laatste stond hier niet, en een upload
 * bewaarde tot november 2026 ruwe bytes onder het type dat de browser opgaf.
 */
export async function GET(request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await context.params;
  const key = segments.join('/');
  if (!key) return new Response('Not found', { status: 404 });

  try {
    const object = await getObjectStream(key, request.headers.get('range'));
    return objectResponse(request, object.stream, () => mediaResponseInit(request, key, object));
  } catch {
    // Een thumbnail die er nog niet is (een foto van vóór de thumbnails, P2):
    // maak hem nu uit de foto zelf en bewaar hem, zodat de volgende vraag hem
    // gewoon vindt.
    const original = originalOfThumb(key);
    if (original) {
      try {
        const thumb = await makeThumb(await getObjectBuffer(original));
        await putObject(key, thumb, 'image/jpeg').catch((error) =>
          console.error('[media] thumbnail bewaren mislukt:', error)
        );
        return new Response(new Uint8Array(thumb), {
          headers: {
            'content-type': 'image/jpeg',
            'content-length': String(thumb.length),
            'cache-control': 'public, max-age=31536000, immutable',
            'x-content-type-options': 'nosniff',
          },
        });
      } catch {
        // Ook de foto zelf is er niet: gewoon niet gevonden.
      }
    }
    return new Response('Not found', { status: 404 });
  }
}
