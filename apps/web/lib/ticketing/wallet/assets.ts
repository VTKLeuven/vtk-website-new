import "server-only";

import { publicUrl } from "@/lib/storage";
import { ticketingBaseUrl } from "../config";
import type { TicketDesignSnapshot } from "../design";

function isPubliclyReachableHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname !== "localhost" && hostname !== "127.0.0.1" && !hostname.endsWith(".local");
  } catch {
    return false;
  }
}

/** Google Wallet and the walletwallet.dev API need a publicly reachable HTTPS
 * image URL, unlike Apple's own pipeline which bundles the image bytes
 * directly into the signed .pkpass. walletwallet.dev actually tries to fetch
 * the URL synchronously and rejects the whole pass if it can't (confirmed
 * against the live API), so `null` here must mean "omit the field" for every
 * caller, not "send a dead URL and let it fail". Returns `null` in plain
 * local dev (TICKETING_PUBLIC_URL/VTK_MAIN_URL pointing at localhost); with a
 * public tunnel configured for that same variable, it resolves and is used
 * as normal, the same way Mollie's webhook needs that tunnel to test for
 * real. A tunnel that has since died still produces a URL here (there's no
 * cheap way to tell a stale public hostname from a live one without an extra
 * network round trip) and will surface as a clear fetch error from whichever
 * provider tried to load it. */
export function absoluteLogoUrl(design: TicketDesignSnapshot): string | null {
  const base = ticketingBaseUrl();
  const path = design.eventLogoKey ? publicUrl(design.eventLogoKey) : "/vtk-shield-favicon.png";
  const url = path ? `${base}${path}` : null;
  return url && isPubliclyReachableHost(url) ? url : null;
}
