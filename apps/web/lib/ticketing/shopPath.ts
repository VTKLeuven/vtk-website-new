/**
 * Waar het ticketbeheer naartoe linkt wanneer het "de ticketshop" bedoelt.
 *
 * Puur en zonder `server-only`, zodat de knoppen in het beheer en de tests
 * dezelfde regel lezen. Bestaat door de privéverkoop: daar geeft
 * `/tickets/<slug>` een 404 aan wie de privélink niet volgde, dus een knop die
 * er rechtstreeks naartoe wees, leek voor de organisator zelf kapot.
 */

/** Het pad van de privélink, zonder taalprefix. */
export function privateLinkPath(slug: string, token: string): string {
  return `/tickets/${slug}/prive/${token}`;
}

type ShopEvent = {
  slug: string;
  status: string;
  isPrivate: boolean;
  privateToken: string | null;
};

/**
 * De ticketpagina zoals het beheer ze opent, zonder taalprefix. `live` zegt of
 * dat de echte pagina is of het voorbeeld, voor het label van de knop.
 *
 * Een privé-event opent via de privélink, maar enkel voor wie het event beheert:
 * die link is de toegang zelf, en een scanner of een lezer van de statistieken
 * hoeft hem niet in zijn pagina te krijgen. Die ziet het voorbeeld.
 */
export function adminShopLink(
  event: ShopEvent,
  canManageEvent: boolean,
): { path: string; live: boolean } {
  const page = `/tickets/${event.slug}`;
  const preview = { path: `${page}?preview=1`, live: false };
  if (event.status !== "PUBLISHED") return preview;
  if (!event.isPrivate) return { path: page, live: true };
  if (canManageEvent && event.privateToken) {
    return { path: privateLinkPath(event.slug, event.privateToken), live: true };
  }
  return preview;
}
