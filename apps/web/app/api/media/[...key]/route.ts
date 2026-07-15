import { Readable } from "node:stream";
import { getObjectStream } from "@vtk/storage";

/**
 * Serveert opgeslagen objecten (logo's, afbeeldingen, pagina-bijlagen, foto's)
 * via de app zelf, zodat de browser enkel met deze origin praat.
 *
 * Vroeger stopte `publicUrl()` een directe bucket-URL in `<img src>`, bv.
 * `http://localhost:9000/vtk/...`. Dat werkt nooit in de browser van een
 * bezoeker: `localhost` is diens eigen machine, niet de server, en MinIO
 * luistert daar bovendien enkel op `127.0.0.1`. De upload sloeg het bestand wel
 * op (server-side bereikt de app MinIO via `S3_ENDPOINT`), dus het leek alsof
 * "er niks gebeurt": het beeld laadde gewoon nooit terug.
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
