import { getObjectStream, isPublicMediaKey, mediaResponseInit, objectResponse } from "@vtk/storage";

/**
 * Serveert opgeslagen objecten (logo's, afbeeldingen, pagina-bijlagen, foto's)
 * via de app zelf, zodat de browser enkel met deze origin praat.
 *
 * Vroeger stopte `publicUrl()` een directe object-storage-URL in `<img src>`.
 * Dat maakte de browser afhankelijk van een publiek bereikbare bucket en de
 * juiste CORS/policy-instellingen, terwijl de upload server-side wel kon
 * slagen. Daardoor leek een geslaagde upload soms verdwenen.
 *
 * Deze route haalt het object server-side op en streamt het terug. De bucket
 * hoeft niet publiek te zijn en zijn host hoeft niet bereikbaar te zijn vanuit
 * de browser. De keys zijn onraadbare random hex, dus het toegangsmodel blijft
 * gelijk aan de vorige publieke-URL-aanpak.
 *
 * Twee uitzonderingen, allebei in `@vtk/storage` (`serve.ts`): een private map
 * (bonnetjes, formulierbestanden) gaat hier nooit naar buiten, want die heeft
 * een eigen leesroute met rechten; en enkel een type uit de allowlist opent in
 * de browser, al de rest is een download in een sandbox.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await context.params;
  const key = segments.join("/");
  // 404 en geen 403: een private key hoort er voor deze route niet te zijn.
  if (!isPublicMediaKey(key)) return new Response("Not found", { status: 404 });

  // Range doorgeven aan S3: een PDF-lezer haalt zo enkel de stukken op die hij
  // nodig heeft, in plaats van het hele bestand voor bladzijde 1.
  const range = request.headers.get("range");

  try {
    const object = await getObjectStream(key, range);
    // De headers (range, ETag, sandbox buiten de allowlist, downloads) staan in
    // @vtk/storage, gedeeld met de uitleendienst. `files/` gaat hier altijd
    // als download.
    return objectResponse(request, object.stream, () =>
      mediaResponseInit(request, key, object, { attachmentPrefixes: ["files/"] }),
    );
  } catch {
    // Object bestaat niet (meer): laat de <img> netjes terugvallen op zijn fallback.
    return new Response("Not found", { status: 404 });
  }
}
