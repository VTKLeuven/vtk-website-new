import { getObjectStream, mediaResponseInit, objectResponse } from '@vtk/storage';

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
    return new Response('Not found', { status: 404 });
  }
}
