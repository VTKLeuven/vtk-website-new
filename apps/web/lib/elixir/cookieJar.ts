/**
 * Minimale cookiejar voor de Munisense-login. `fetch` bewaart zelf geen cookies,
 * en de login hangt aan `__Secure-PHPSESSID` plus `MuniToken` die over meerdere
 * requests en een 302 heen meemoeten.
 *
 * Bewust geen volledige RFC 6265: login.munisense.net en de portal delen het
 * registreerbare domein munisense.net, dus één jar volstaat en we negeren
 * Domain/Path. Blijkt MuniToken toch host-scoped, dan is dit de plek om te
 * splitsen.
 */

export type CookieJar = Map<string, string>;

export function createCookieJar(): CookieJar {
  return new Map();
}

/** Alle `Set-Cookie`-regels van een response, ook wanneer het er meerdere zijn. */
export function readSetCookies(headers: Headers): string[] {
  // getSetCookie() bestaat in undici (Node 20+). De fallback splitst niet op
  // komma's: dat gaat stuk op `Expires=Wed, 09 Jun 2027`.
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie === "function") return withGetter.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

/** Verwijdert de server de cookie (lege waarde of Max-Age=0), dan gaat ze eruit. */
function isDeletion(value: string, attributes: string[]): boolean {
  if (value === "") return true;
  return attributes.some((attr) => /^max-age\s*=\s*(0|-\d+)$/i.test(attr.trim()));
}

/** Neemt de `Set-Cookie`-regels van één response op in de jar. */
export function absorbSetCookies(jar: CookieJar, setCookies: readonly string[]): void {
  for (const raw of setCookies) {
    const [pair, ...attributes] = raw.split(";");
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    if (isDeletion(value, attributes)) {
      jar.delete(name);
      continue;
    }
    // Set overschrijft: bij een tweede login vervangt de nieuwe PHPSESSID de oude
    // in plaats van er een tweede naast te zetten.
    jar.set(name, value);
  }
}

/** De jar als `Cookie`-header, of "" wanneer ze leeg is. */
export function cookieHeader(jar: CookieJar): string {
  return Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
}
