/*
 * De prijs van één product op collectandgo.be, uit de productpagina.
 *
 * Elke productpagina bevat het product als gestructureerde data (JSON-LD,
 * `"@type": "Product"`) met naam, prijs en product-id (`sku`). Dat id is het
 * nummer achter `#pdp_` in de zoeklinks die posten in hun budgetbladen
 * plakten (`.../zoek?searchTerm=cola#pdp_3074457345616677861`), dus ook zo'n
 * zoeklink wijst naar één product.
 *
 * Er is geen openbare prijs-API: de productsearch van colruyt.be vraagt een
 * sleutel, en de site weert bots. Dit leest de gewone pagina, zoals een
 * browser, met een eerlijke user-agent. Puur, zodat het getest kan worden;
 * het ophalen zelf staat in `fetch.ts`.
 */

export const COLLECTGO_ORIGIN = 'https://www.collectandgo.be';

export type CollectGoRef = { productId: string } | { path: string };

/** Herkent een link naar één product op collectandgo.be. Null voor alles wat geen product is. */
export function parseCollectGoUrl(input: string): CollectGoRef | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)collectandgo\.be$/i.test(url.hostname)) return null;
  const pdp = /pdp_(\d{8,})/.exec(url.hash);
  if (pdp) return { productId: pdp[1] };
  const id = url.searchParams.get('productId');
  if (id && /^\d{8,}$/.test(id)) return { productId: id };
  const path = /^\/(?:colruyt\/)?(nl|fr)\/assortiment\/([a-z0-9][a-z0-9-]*)\/?$/i.exec(url.pathname);
  if (path && !url.search) return { path: `/${path[1].toLowerCase()}/assortiment/${path[2].toLowerCase()}` };
  return null;
}

/** De pagina die de site opvraagt. Een product-id gaat langs de vaste productpagina van de winkel. */
export function productPageUrl(ref: CollectGoRef): string {
  if ('productId' in ref) {
    return `${COLLECTGO_ORIGIN}/webapp/wcs/stores/servlet/ProductDisplay?productId=${ref.productId}&storeId=90004&catalogId=10429&langId=-1001`;
  }
  return `${COLLECTGO_ORIGIN}${ref.path}`;
}

export type ProductInfo = {
  name: string;
  /** Winkelprijs incl. BTW. */
  price: number;
  sku: string | null;
  available: boolean;
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };

function decode(text: string): string {
  return text
    .replace(/&(#\d+|[a-z]+);/gi, (all, code: string) => {
      if (code.startsWith('#')) return String.fromCharCode(Number(code.slice(1)));
      return ENTITIES[code.toLowerCase()] ?? all;
    })
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\(["\\/])/g, '$1')
    .trim();
}

/**
 * Het product uit de HTML van een productpagina, of null als er geen staat.
 * Met reguliere expressies en niet met `JSON.parse`: de beschrijving bevat
 * soms een echte regeleinde binnen een tekst, en dan is de JSON ongeldig.
 */
export function parseProductPage(html: string): ProductInfo | null {
  const blocks = html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, block] of blocks) {
    if (!/"@type"\s*:\s*"Product"/.test(block)) continue;
    const name = /"name"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(block)?.[1];
    const price = /"price"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/.exec(block)?.[1];
    if (!name || !price) continue;
    const value = Number(price.replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    const sku = /"sku"\s*:\s*"([^"]+)"/.exec(block)?.[1] ?? null;
    const availability = /"availability"\s*:\s*"([^"]+)"/.exec(block)?.[1] ?? '';
    return { name: decode(name), price: value, sku, available: !/OutOfStock|Discontinued/i.test(availability) };
  }
  return null;
}

/** Een pagina van Collect&Go zonder product: "Pagina niet gevonden", of een categorie. */
export function isCollectGoPage(html: string): boolean {
  return /ProductDisplay\.jsp|Pagina niet gevonden|Page non trouv|collectandgo/i.test(html);
}
