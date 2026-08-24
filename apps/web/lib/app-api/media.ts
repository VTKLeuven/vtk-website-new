import "server-only";

import { publicUrl } from "@/lib/storage";

/**
 * Absolute URL's voor de app.
 *
 * `publicUrl()` geeft een pad terug (`/api/media/<key>`). Een browser vult daar
 * vanzelf de host bij, een `<Image source={{ uri }}>` in React Native niet: die
 * krijgt een string en gaat er niets aan toevoegen. Elk beeld dat de app-API
 * teruggeeft, gaat dus eerst langs hier.
 *
 * De host komt uit de aanvraag zelf en niet uit `VTK_MAIN_URL`, en dat is met
 * opzet: lokaal testen gebeurt tegen een cloudflared-tunnel (de weblogin heeft
 * HTTPS nodig), en dan is de omgevingsvariabele nog altijd localhost terwijl de
 * telefoon daar niet bij kan.
 */

/**
 * De origin waarmee deze aanvraag binnenkwam. Achter de reverse proxy staat de
 * echte host in `x-forwarded-host`/`x-forwarded-proto`; `request.url` draagt daar
 * de interne waarde.
 */
export function requestOrigin(request: Request): string {
  const headers = request.headers;
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headers.get("host")?.trim();
  if (!host) return new URL(request.url).origin;

  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${proto}://${host}`;
}

/** Een storage-key naar een absolute URL, of `null` wanneer er geen key is. */
export function absoluteMediaUrl(request: Request, key: string | null | undefined): string | null {
  const path = publicUrl(key);
  return path ? `${requestOrigin(request)}${path}` : null;
}

/**
 * Een pad of een al volledige URL naar een absolute URL. Voor velden die soms
 * intern (`/praesidium`) en soms extern (`https://cudi.vtk.be`) zijn; dat
 * onderscheid maakt `isExternalUrl` in `lib/href.ts` en het is bewust toegelaten.
 */
export function absoluteUrl(request: Request, value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${requestOrigin(request)}${value.startsWith("/") ? value : `/${value}`}`;
}
