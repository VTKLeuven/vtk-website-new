import "server-only";

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Een URL ophalen die een beheerder opgaf, zonder dat de server zo zijn eigen
 * netwerk binnenkijkt (SSRF): `http://postgres:5432`, `http://127.0.0.1:2283`
 * van Immich, of het metadata-adres van de host.
 *
 * Enkel https op poort 443, enkel een host die naar een publiek adres
 * resolvet, en elke redirect wordt opnieuw gekeurd in plaats van blind
 * gevolgd. DNS-rebinding tussen de keuring en de fetch blijft theoretisch
 * mogelijk; dat is aanvaardbaar voor een route die al een beheerrecht vraagt.
 */

const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED.addSubnet(net, prefix, "ipv6");
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !BLOCKED.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** Is dit een https-URL naar een publieke host? Resolvet de naam. */
export async function isPublicHttpsUrl(raw: string | URL): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPublicAddress(host);
  // Een naam zonder punt is een containernaam of een lokale host.
  if (!host.includes(".") || host.endsWith(".localhost") || host.endsWith(".internal")) return false;

  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((entry) => isPublicAddress(entry.address));
  } catch {
    return false;
  }
}

const MAX_REDIRECTS = 3;

/** `fetch` naar een publieke https-URL, met elke redirect opnieuw gekeurd. Null bij twijfel. */
export async function fetchPublicUrl(raw: string, init: RequestInit = {}): Promise<Response | null> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!(await isPublicHttpsUrl(current))) return null;
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) return null;
    current = new URL(location, current).toString();
  }
  return null;
}
