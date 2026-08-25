/**
 * Welke adressen op de site een eigen scherm in de app hebben.
 *
 * Dit bestaat om één reden: het CMS kent de app niet. In de navigatie van de
 * website staat "Piano reserveren" als menu-item met `/piano` als bestemming, en
 * "Praesidium" met `/praesidium`. Zonder deze tabel zou de app die in een browser
 * openen terwijl er twee tikken verderop een echt scherm staat, en zou hetzelfde
 * ding twee keer in de app zitten.
 *
 * De tabel is de vertaling, niet de waarheid: de structuur blijft van het CMS
 * komen. Publiceert iemand een nieuwe pagina, dan verschijnt ze vanzelf; komt er
 * ooit een native scherm bij, dan komt er hier één regel bij.
 */

/** Pad op de site -> route in de app. */
const NATIVE_ROUTES: Record<string, string> = {
  '/kalender': '/kalender',
  '/theokot': '/broodjes',
  '/shop': '/broodjes',
  '/shift': '/shiften',
  '/piano': '/piano',
  '/praesidium': '/praesidium',
  '/werkgroepen': '/werkgroepen',
  '/pocs': '/pocs',
  '/tickets': '/tickets',
  '/media': '/media',
  // `/fotos` is op de site een omleiding naar `/media`; hier komt ze op hetzelfde
  // scherm uit, zodat een oud menu-item niet in een browser eindigt.
  '/fotos': '/media',
  // De webscanner. Wie de app heeft, hoort niet in een browser te belanden voor
  // iets waar hier een scherm voor bestaat.
  '/scan': '/scannen',
};

/**
 * De app-route voor een pad op de site, of `null` wanneer er geen eigen scherm
 * is. Een volledige URL naar een andere site geeft altijd `null`: die hoort in
 * een browser, hoe het pad er ook uitziet.
 */
export function nativeRouteFor(href: string): string | null {
  if (/^https?:\/\//i.test(href)) return null;
  const path = href.split('?')[0].split('#')[0].replace(/\/+$/, '');
  return NATIVE_ROUTES[path] ?? null;
}

/**
 * Of een pad een contentpagina onder een categorie is (`/info/faq` onder `info`),
 * en zo ja welke slug. Die krijgen het native pagina-scherm.
 *
 * Een pad dat niet aan die vorm voldoet (`/piano`, `/kalender`) is een menu-item
 * naar iets anders; dat loopt langs `nativeRouteFor` of anders langs de browser.
 */
export function pageSlugFor(href: string, tabSlug: string): string | null {
  const prefix = `/${tabSlug}/`;
  if (!href.startsWith(prefix)) return null;
  const slug = href.slice(prefix.length).split('?')[0];
  return slug && !slug.includes('/') ? slug : null;
}
