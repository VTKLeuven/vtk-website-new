import { parseCollectGoUrl, parseProductPage, productPageUrl, isCollectGoPage } from '@/lib/collectgo/product';

/*
 * De webshops waarvan de site een prijs kan nakijken. In de 209 bladen van
 * 26-27 kwamen deze het vaakst voor (aantal bestanden met een link):
 * collectandgo.be 90, bol.com 35, partywinkel.be 30, helloprint.com 14 (en
 * drukzo.be, hetzelfde platform, 4), colruyt.be 9 en action.com 7.
 *
 * Een link wordt eerst herkend en nooit zomaar gevolgd: de server haalt enkel
 * pagina's op van de hosts in deze lijst, en bouwt het adres zelf op uit het
 * herkende product. Zo kan een regel met een vreemde link de server nergens
 * naartoe sturen.
 *
 * Hoe de prijs opgehaald wordt (`via`), getest in november 2026:
 * - `fetch`: Collect&Go, Helloprint en Drukzo geven de prijs in de JSON-LD van
 *   de pagina aan een gewone aanvraag met een eerlijke user-agent;
 * - `browser`: bol.com (HTTP 403), Partywinkel (429) en Action (een
 *   Cloudflare-controle) weigeren alles wat geen browser is, wat de user-agent
 *   ook zegt. Die pagina's opent de prijsbrowser (`infra/price-browser`): een
 *   echte Chromium in een eigen container. Staat die niet aan
 *   (`PRICE_BROWSER_URL` leeg), dan zegt de regel "geen antwoord" en bevestigt
 *   een mens de prijs;
 * - colruyt.be toont een prijs pas voor een gekozen winkel. De prijsbrowser
 *   zoekt de winkel bij de postcode die Groep 5 instelde
 *   (`BudgetSettings.colruytPostcode`) en vraagt de prijs voor die winkel;
 *   zonder postcode is er geen prijs.
 *
 * Puur, zodat het getest kan worden; het ophalen staat in `fetch.ts`.
 */

export const SHOPS = {
  collectgo: { name: 'Collect&Go', hosts: ['collectandgo.be'], live: true },
  bol: { name: 'bol.com', hosts: ['bol.com'], live: true },
  partywinkel: { name: 'Partywinkel', hosts: ['partywinkel.be'], live: true },
  helloprint: { name: 'Helloprint', hosts: ['helloprint.com', 'helloprint.be'], live: true },
  drukzo: { name: 'Drukzo', hosts: ['drukzo.be', 'drukzo.nl'], live: true },
  action: { name: 'Action', hosts: ['action.com'], live: true },
  colruyt: { name: 'Colruyt', hosts: ['colruyt.be'], live: true },
} as const;

export type ShopId = keyof typeof SHOPS;

export type ShopRef = {
  shop: ShopId;
  /** De pagina die de server opvraagt, opgebouwd uit het herkende product. */
  page: string;
  /** Een gewone aanvraag, of langs de prijsbrowser voor een winkel die enkel browsers toelaat. */
  via: 'fetch' | 'browser';
  /** Is de prijs van deze winkel incl. of excl. BTW? Een drukker toont excl. */
  basis: 'incl' | 'excl';
};

export type ShopProduct = { name: string; price: number; available: boolean };

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

function matches(host: string, hosts: readonly string[]): boolean {
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/** De winkel van een link, ook als de site er geen prijs kan nakijken. */
export function shopOfUrl(input: string | null | undefined): ShopId | null {
  let url: URL;
  try {
    url = new URL(String(input ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = hostOf(url);
  for (const id of Object.keys(SHOPS) as ShopId[]) if (matches(host, SHOPS[id].hosts)) return id;
  return null;
}

const SLUG = /^[a-z0-9][a-z0-9%._~-]*$/i;

/** Herkent een link naar één product bij een van de winkels. Null voor al de rest. */
export function parseShopUrl(input: string | null | undefined): ShopRef | null {
  const shop = shopOfUrl(input);
  if (!shop) return null;
  const url = new URL(String(input).trim());
  const parts = url.pathname.split('/').filter(Boolean);
  switch (shop) {
    case 'collectgo': {
      const ref = parseCollectGoUrl(url.toString());
      return ref ? { shop, page: productPageUrl(ref), via: 'fetch', basis: 'incl' } : null;
    }
    case 'bol': {
      // /be/nl/p/<naam>/<nummer>/
      const i = parts.indexOf('p');
      const id = parts[i + 2];
      if (i < 0 || !SLUG.test(parts[i + 1] ?? '') || !/^\d{6,20}$/.test(id ?? '')) return null;
      return { shop, page: `https://www.bol.com/be/nl/p/${parts[i + 1]}/${id}/`, via: 'browser', basis: 'incl' };
    }
    case 'partywinkel': {
      const i = parts.indexOf('products');
      const handle = parts[i + 1];
      if (i < 0 || !handle || !/^[a-z0-9][a-z0-9-]*$/i.test(handle)) return null;
      // De gekozen variant blijft in het adres: de pagina toont dan de prijs van die variant.
      const variant = url.searchParams.get('variant');
      const query = variant && /^\d{6,20}$/.test(variant) ? `?variant=${variant}` : '';
      return {
        shop,
        page: `https://www.partywinkel.be/products/${handle.toLowerCase()}${query}`,
        via: 'browser',
        basis: 'incl',
      };
    }
    case 'helloprint':
    case 'drukzo': {
      // Een geconfigureerd product is één lang stuk pad: "stickers-...-1000-days4". Een
      // categorie ("/nl-be/posters") heeft een vanaf-prijs en zegt niets over het budget.
      const slug = parts.at(-1) ?? '';
      const prefix = parts.slice(0, -1);
      if (!SLUG.test(slug) || !/-(\d+)-?(days?\d+|\d+dagen.*)$/i.test(decodeURIComponent(slug))) return null;
      if (prefix.length > 1 || (prefix[0] && !/^[a-z]{2}-[a-z]{2}$/i.test(prefix[0]))) return null;
      const origin = shop === 'drukzo' ? 'https://www.drukzo.be' : 'https://www.helloprint.com';
      return { shop, page: `${origin}/${[...prefix, slug].join('/')}`, via: 'fetch', basis: 'excl' };
    }
    case 'action': {
      // /nl-be/p/<nummer>/<naam>/
      const i = parts.indexOf('p');
      const id = parts[i + 1];
      if (i < 0 || !/^\d{4,12}$/.test(id ?? '')) return null;
      const slug = SLUG.test(parts[i + 2] ?? '') ? `${parts[i + 2]}/` : '';
      return { shop, page: `https://www.action.com/nl-be/p/${id}/${slug}`, via: 'browser', basis: 'incl' };
    }
    case 'colruyt': {
      // /nl/producten/38672, of met de naam ervoor: /nl/producten/everyday-doekjes-38672
      const i = parts.indexOf('producten');
      const id = /(\d{2,9})$/.exec(parts[i + 1] ?? '')?.[1];
      if (i < 0 || !id || parts.length > i + 2) return null;
      return { shop, page: `https://www.colruyt.be/nl/producten/${id}`, via: 'browser', basis: 'incl' };
    }
  }
}

/** Het product uit de HTML van een productpagina (de JSON-LD), of null als er geen staat. */
export function parseShopResponse(_ref: ShopRef, body: string): ShopProduct | null {
  const product = parseProductPage(body);
  return product ? { name: product.name, price: product.price, available: product.available } : null;
}

/** Wat de prijsbrowser teruggaf: de JSON-LD-blokken van de pagina en de prijs uit de metatags. */
export type BrowserAnswer = {
  status: number;
  finalUrl: string;
  title: string;
  ld: string[];
  price: string | null;
  /** Colruyt: de winkel waarvoor de prijs geldt, of null als er bij de postcode geen is. */
  store?: string | null;
};

/** "€4,30", "4.30" of "1.215,50" als getal. */
function metaPrice(text: string | null): number | null {
  if (!text) return null;
  let t = text.replace(/[^0-9.,]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return t && Number.isFinite(n) ? n : null;
}

/**
 * Het product uit het antwoord van de prijsbrowser. De metatag wint van de
 * JSON-LD: bij een winkel met varianten (Partywinkel) staat daar de prijs van
 * de gekozen variant, terwijl de JSON-LD ze allemaal opsomt.
 */
export function parseBrowserAnswer(ref: ShopRef, answer: BrowserAnswer): ShopProduct | null {
  const html = answer.ld.map((block) => `<script type="application/ld+json">${block}</script>`).join('\n');
  const product = parseShopResponse(ref, html);
  if (!product) return null;
  return { ...product, price: metaPrice(answer.price) ?? product.price };
}

/** Een gewone pagina van de winkel zonder product ("niet gevonden"), geen botcontrole. */
export function isShopPage(ref: ShopRef, body: string): boolean {
  if (ref.shop === 'collectgo') return isCollectGoPage(body);
  return !/Just a moment|cf-chl|captcha|Access Denied|local_rate_limited/i.test(body);
}
