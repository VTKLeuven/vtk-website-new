/**
 * De host waarop de bezoeker deze aanvraag deed, voor een adres dat we hem
 * tonen of in een QR-code zetten.
 *
 * Lees daarvoor niet enkel `host`: op de server droeg die in een admin-pagina
 * de interne waarde `localhost:3000`, zodat /admin/links elke verkorte link als
 * `on.localhost:3000/<slug>` toonde en de gedownloade QR daar ook naartoe wees.
 * Caddy zet de host van de bezoeker in `x-forwarded-host` (en overschrijft wat
 * een client daar zelf meestuurt), net zoals `requestOrigin` in
 * `lib/app-api/media.ts` al leest. Lokaal, zonder proxy, valt dit terug op `host`.
 *
 * Gebruik dit niet voor een toegangsbeslissing: een header blijft een header.
 */
export function publicRequestHost(headers: Headers, fallback: string): string {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || headers.get("host")?.trim() || fallback;
}
