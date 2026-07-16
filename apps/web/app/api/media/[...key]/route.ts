import { Readable } from "node:stream";
import { getObjectStream } from "@vtk/storage";

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
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await context.params;
  const key = segments.join("/");
  if (!key) return new Response("Not found", { status: 404 });

  try {
    const { stream, contentType, contentLength } = await getObjectStream(key);
    const headers = new Headers();
    headers.set("content-type", contentType ?? "application/octet-stream");
    if (contentLength != null) headers.set("content-length", String(contentLength));
    // Keys zijn content-adres-achtig (random hex) en dus onveranderlijk: hard cachen.
    headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(Readable.toWeb(stream as Readable) as unknown as BodyInit, {
      headers,
    });
  } catch {
    // Object bestaat niet (meer): laat de <img> netjes terugvallen op zijn fallback.
    return new Response("Not found", { status: 404 });
  }
}
