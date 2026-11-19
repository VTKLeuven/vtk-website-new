import {
  SANDBOX_CSP,
  getObjectStream,
  isInlineSafeContentType,
  isPublicMediaKey,
  objectResponse,
} from '@vtk/storage';

export const runtime = 'nodejs';

/**
 * Serveert opgeslagen objecten (item-foto's) via de app zelf, zodat de browser
 * enkel met deze origin praat. Keys zijn onraadbare random hex.
 *
 * Deze app deelt de bucket met de website, dus dezelfde twee regels als
 * `apps/web/app/api/media/[...key]` (zie `serve.ts` in `@vtk/storage`): een
 * private map (bonnetjes, formulierbestanden) gaat hier nooit naar buiten, en
 * enkel een type uit de allowlist opent in de browser. Zonder die regels
 * opende een formulierbestand met `text/html` hier als pagina, in een origin
 * die de sessiecookie van `.vtk.be` deelt.
 */
export async function GET(request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await context.params;
  const key = segments.join('/');
  if (!isPublicMediaKey(key)) return new Response('Not found', { status: 404 });

  try {
    const { stream, contentType, contentLength } = await getObjectStream(key);
    return objectResponse(request, stream, () => {
      const headers = new Headers();
      const type = contentType ?? 'application/octet-stream';
      headers.set('content-type', type);
      if (contentLength != null) headers.set('content-length', String(contentLength));
      headers.set('x-content-type-options', 'nosniff');
      headers.set('referrer-policy', 'no-referrer');
      if (!isInlineSafeContentType(type)) {
        headers.set('content-security-policy', SANDBOX_CSP);
        headers.set('content-disposition', 'attachment');
      }
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      return { headers };
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
