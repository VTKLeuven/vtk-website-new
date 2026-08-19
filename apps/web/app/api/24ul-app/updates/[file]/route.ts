import { Readable } from "node:stream";
import { getObjectStream } from "@vtk/storage";
import { updateKey } from "@/lib/urenloopApp/config";
import { bearerFrom, checkDeviceToken } from "@/lib/urenloopApp/devices";

/**
 * De feed die de Windows-app uitleest om te weten of er een nieuwe versie is
 * (electron-updater, `generic` provider).
 *
 * Een updater kan geen mail lezen en geen code intikken, dus draagt hij een
 * apparaat-token dat de app één keer per computer heeft opgehaald
 * (`/api/24ul-app/pair/*`). Daarmee hangen de updates aan dezelfde lijst als de
 * downloads: haal een adres van de lijst en zijn computers stoppen bij de
 * volgende controle, zonder dat iemand anders er iets van merkt.
 *
 * Enkel de drie bestanden die de updater nodig heeft, en niets anders: anders
 * zou een gekoppelde computer langs deze weg ook de Mac- en Linux-downloads
 * kunnen halen, waar de poort net voor bestaat.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params;
  const key = updateKey(file);
  if (!key) return new Response("Not found", { status: 404 });

  const token = bearerFrom(request.headers.get("authorization"));
  if (!token) return new Response("Unauthorized", { status: 401 });

  const check = await checkDeviceToken(token, request.headers.get("x-app-version"));
  if (!check.ok) {
    // 401 en niet 403: de app leest dit als "opnieuw koppelen", wat voor alle
    // drie de redenen (onbekend, ingetrokken, adres van de lijst) de juiste
    // volgende stap is.
    return new Response("Unauthorized", { status: 401 });
  }

  const range = request.headers.get("range");

  try {
    const object = await getObjectStream(key, range);
    const headers = new Headers();
    headers.set(
      "content-type",
      file.endsWith(".yml") ? "text/yaml; charset=utf-8" : "application/octet-stream",
    );
    if (object.contentLength != null) headers.set("content-length", String(object.contentLength));
    if (object.contentRange) headers.set("content-range", object.contentRange);
    if (object.etag) headers.set("etag", object.etag);
    if (object.lastModified) headers.set("last-modified", object.lastModified.toUTCString());
    headers.set("accept-ranges", "bytes");
    headers.set("x-content-type-options", "nosniff");
    // latest.yml is precies het bestand dat nieuwer moet zijn dan wat de app al
    // weet; cachen zou een update dagen kunnen ophouden.
    headers.set("cache-control", "private, no-store");
    return new Response(Readable.toWeb(object.stream as Readable) as unknown as BodyInit, {
      status: object.contentRange ? 206 : 200,
      headers,
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
