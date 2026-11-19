/**
 * Welke opgeslagen objecten de publieke mediaroute (`/api/media/...`, op de
 * website en op de uitleendienst) mag serveren, en hoe.
 *
 * Twee regels, en beide zijn een allowlist in plaats van een denylist:
 *
 * 1. **Private mappen gaan er nooit uit.** Een bonnetje of een bestand bij een
 *    formulier heeft een eigen leesroute die de rechten controleert. De key is
 *    niet te raden, maar wie hem kent (de uploader leest hem uit zijn
 *    upload-token) kwam er via `/api/media` zonder login aan.
 * 2. **Enkel types waarvan we zeker zijn, openen in de browser.** De vorige
 *    check zocht naar gevaarlijke types (`text/html`, `svg+xml`, ...) en miste
 *    er dan een, zoals `application/atom+xml`, dat de browser als XHTML met
 *    script uitvoert. Al de rest wordt een download met een sandbox-CSP, zodat
 *    het nooit in een VTK-origin kan draaien.
 */

/**
 * Mappen met een eigen, afgeschermde leesroute (of zonder lezer). Voeg hier een
 * map toe wanneer haar bestanden persoonsgegevens dragen.
 */
export const PRIVATE_MEDIA_PREFIXES = ["forms/", "bonnetjes/", "feedback/"] as const;

/**
 * Mag deze key via de publieke mediaroute? Ook een key met een leeg, `.` of
 * `..`-segment weigeren we: S3 normaliseert die niet, maar een andere
 * objectopslag of een proxy ervoor kan dat wel doen, en dan zou
 * `x/../forms/...` de prefixcheck omzeilen.
 */
export function isPublicMediaKey(key: string): boolean {
  if (!key) return false;
  const segments = key.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }
  return !PRIVATE_MEDIA_PREFIXES.some((prefix) => key.startsWith(prefix));
}

const INLINE_SAFE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
]);

/** Het type zonder parameters en in kleine letters: `Image/PNG; x=y` wordt `image/png`. */
export function normalizeContentType(type: string | null | undefined): string {
  return (type ?? "").split(";")[0].trim().toLowerCase();
}

/** Mag een object van dit type in de browser openen in plaats van als download? */
export function isInlineSafeContentType(type: string | null | undefined): boolean {
  return INLINE_SAFE_TYPES.has(normalizeContentType(type));
}

/** Voor alles wat niet inline mag: een document dat zo toch opent, draait zonder origin. */
export const SANDBOX_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'";

const UPLOAD_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".zip": "application/zip",
};

/**
 * Het type om bij een upload van een bezoeker te bewaren, afgeleid van de
 * extensie en nooit van `file.type`: dat laatste kiest de browser, en dus ook
 * wie een `text/html` meestuurt met een bestand dat `cv.pdf` heet. Een
 * onbekende extensie wordt `application/octet-stream`.
 */
export function uploadContentType(fileName: string | null | undefined): string {
  const name = (fileName ?? "").toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return UPLOAD_TYPES[name.slice(dot)] ?? "application/octet-stream";
}
