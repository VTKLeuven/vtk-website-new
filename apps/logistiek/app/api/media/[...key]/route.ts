import {
  getObjectBuffer,
  getObjectStream,
  isPublicMediaKey,
  mediaResponseInit,
  objectResponse,
  putObject,
} from '@vtk/storage';
import { originalOfThumb } from '@/lib/photo-url';
import { makeThumb } from '@/lib/upload';

export const runtime = 'nodejs';

/**
 * Serveert opgeslagen objecten (item-foto's en pdf's) via de app zelf, zodat de
 * browser enkel met deze origin praat. Keys zijn onraadbare random hex, dus het
 * toegangsmodel blijft gelijk.
 *
 * Deze app deelt de bucket met vtk.be, dus dezelfde regels (`@vtk/storage`): een
 * private map (bonnetjes, formulierbestanden) gaat hier nooit naar buiten
 * (`isPublicMediaKey`), en `mediaResponseInit` geeft dezelfde headers: Range voor
 * een pdf-lezer, ETag, `nosniff`, en een sandbox plus download voor elk type
 * buiten de allowlist. Zonder die regels opende een formulierbestand met
 * `text/html` hier als pagina, in een origin die de sessiecookie van `.vtk.be`
 * deelt.
 */
export async function GET(request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await context.params;
  const key = segments.join('/');
  if (!isPublicMediaKey(key)) return new Response('Not found', { status: 404 });

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
