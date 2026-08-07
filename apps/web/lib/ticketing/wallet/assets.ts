import "server-only";

import { publicUrl } from "@/lib/storage";
import { ticketingBaseUrl } from "../config";
import type { TicketDesignSnapshot } from "../design";

/** Google Wallet and the walletwallet.dev API need a publicly reachable HTTPS
 * image URL, unlike Apple's own pipeline which bundles the image bytes
 * directly into the signed .pkpass. In local dev this resolves to a
 * localhost URL that those services cannot fetch; that's expected, the same
 * way Mollie's webhook needs a public tunnel to test for real. */
export function absoluteLogoUrl(design: TicketDesignSnapshot): string {
  const base = ticketingBaseUrl();
  if (design.eventLogoKey) {
    const relative = publicUrl(design.eventLogoKey);
    if (relative) return `${base}${relative}`;
  }
  return `${base}/vtk-shield-favicon.png`;
}
