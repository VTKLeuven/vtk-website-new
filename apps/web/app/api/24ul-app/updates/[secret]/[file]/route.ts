import { Readable } from "node:stream";
import { timingSafeEqual } from "node:crypto";
import { getObjectStream } from "@vtk/storage";
import { updateKey, updatePathSecret } from "@/lib/urenloopApp/config";

/**
 * De feed die de Windows-app zelf uitleest om te weten of er een nieuwe versie
 * is (electron-updater, `generic` provider).
 *
 * Deze staat bewust **niet** achter de e-mailpoort: een updater kan nergens een
 * code invoeren. Hij zit achter een onraadbaar padsegment
 * (`URENLOOP_UPDATE_PATH`), en dat is eerlijk gezegd bescherming tegen gevonden
 * worden en niet tegen wie de app al heeft: het pad staat leesbaar in
 * `app-update.yml` binnenin elke Windows-installatie. De e-mailpoort bepaalt wie
 * de app een eerste keer krijgt; daarna kan wie hem heeft ook de updates halen.
 *
 * Enkel de drie bestanden die de updater nodig heeft, en niets anders: zonder
 * die lijst zou dit pad de hele prefix vrijgeven, inclusief de Mac- en
 * Linux-downloads waar de poort wel voor bedoeld is.
 */
function secretMatches(candidate: string): boolean {
  const expected = updatePathSecret();
  // Leeg betekent uit. Zonder deze controle zou een lege env-variabele elke
  // aanvraag laten slagen, want twee lege buffers zijn aan elkaar gelijk.
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ secret: string; file: string }> },
) {
  const { secret, file } = await context.params;
  if (!secretMatches(secret)) return new Response("Not found", { status: 404 });

  const key = updateKey(file);
  if (!key) return new Response("Not found", { status: 404 });

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
    headers.set("cache-control", "no-store");
    return new Response(Readable.toWeb(object.stream as Readable) as unknown as BodyInit, {
      status: object.contentRange ? 206 : 200,
      headers,
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
