import { Readable } from "node:stream";
import { prisma } from "@vtk/db";
import { getObjectStream } from "@vtk/storage";
import { readAccessCookie } from "@/lib/urenloopApp/access";
import { PLATFORM_FILES, isPlatformId, platformKey } from "@/lib/urenloopApp/config";

/**
 * Serveert een installatiebestand aan wie een code heeft ingewisseld.
 *
 * De cookie alleen volstaat niet: hij is een dag geldig en zegt enkel dat het
 * adres ooit een code inwisselde. Daarom wordt bij elke download opnieuw
 * nagegaan of dat adres nog op de lijst staat, zodat iemand verwijderen ook
 * meteen werkt voor wie al ingelogd was.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ platform: string }> },
) {
  const { platform } = await context.params;
  if (!isPlatformId(platform)) return new Response("Not found", { status: 404 });

  const email = await readAccessCookie();
  if (!email) return new Response("Forbidden", { status: 403 });

  const allowed = await prisma.urenloopDownloadEmail.findUnique({ where: { email } });
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const file = PLATFORM_FILES[platform];
  const range = request.headers.get("range");

  try {
    const object = await getObjectStream(platformKey(platform), range);
    const headers = new Headers();
    headers.set("content-type", file.contentType);
    if (object.contentLength != null) headers.set("content-length", String(object.contentLength));
    if (object.contentRange) headers.set("content-range", object.contentRange);
    if (object.etag) headers.set("etag", object.etag);
    if (object.lastModified) headers.set("last-modified", object.lastModified.toUTCString());
    headers.set("accept-ranges", "bytes");
    headers.set("content-disposition", `attachment; filename="${file.filename}"`);
    headers.set("x-content-type-options", "nosniff");
    // Nooit cachen: de bestandsnaam draagt geen versie, dus een gecachte kopie
    // is stilletjes de vorige release.
    headers.set("cache-control", "private, no-store");
    return new Response(Readable.toWeb(object.stream as Readable) as unknown as BodyInit, {
      status: object.contentRange ? 206 : 200,
      headers,
    });
  } catch {
    // Nog geen build geüpload, of de opslag ligt eruit.
    return new Response("Not found", { status: 404 });
  }
}
