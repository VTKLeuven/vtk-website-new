import {
  SANDBOX_CSP,
  getObjectStream,
  isInlineSafeContentType,
  isPublicMediaKey,
  objectResponse,
} from "@vtk/storage";
import { contentDisposition } from "@/lib/contentDisposition";

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
    const { stream, contentType, contentLength, contentRange, etag, lastModified } = object;
    return objectResponse(request, stream, () => {
      const headers = new Headers();
      const type = contentType ?? "application/octet-stream";
      headers.set("content-type", type);
      if (contentLength != null) headers.set("content-length", String(contentLength));
      if (contentRange) headers.set("content-range", contentRange);
      if (etag) headers.set("etag", etag);
      if (lastModified) headers.set("last-modified", lastModified.toUTCString());
      headers.set("accept-ranges", "bytes");
      headers.set("x-content-type-options", "nosniff");
      headers.set("referrer-policy", "no-referrer");
      // Allowlist, geen denylist: de oude regex miste `application/atom+xml` en
      // co, die een browser als XHTML met script uitvoert. Een `<img>` negeert
      // zowel de CSP als de disposition, dus een oud SVG-logo blijft gewoon tonen.
      const unsafeInlineType = !isInlineSafeContentType(type);
      if (unsafeInlineType) {
        headers.set("content-security-policy", SANDBOX_CSP);
      }
      const url = new URL(request.url);
      const requestedFilename = url.searchParams.get("filename")?.trim();
      const forceDownload = url.searchParams.has("download");
      const filename = requestedFilename || key.split("/").at(-1) || "download";

      if (key.startsWith("files/") || unsafeInlineType || forceDownload) {
        headers.set("content-disposition", contentDisposition("attachment", filename));
      } else if (requestedFilename) {
        headers.set("content-disposition", contentDisposition("inline", filename));
      }
      // Keys zijn content-adres-achtig (random hex) en dus onveranderlijk: hard cachen.
      headers.set("cache-control", "public, max-age=31536000, immutable");
      return { status: contentRange ? 206 : 200, headers };
    });
  } catch {
    // Object bestaat niet (meer): laat de <img> netjes terugvallen op zijn fallback.
    return new Response("Not found", { status: 404 });
  }
}
