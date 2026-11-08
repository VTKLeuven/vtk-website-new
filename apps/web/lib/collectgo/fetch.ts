import 'server-only';

import { isCollectGoPage, parseProductPage, productPageUrl, type CollectGoRef, type ProductInfo } from './product';

/*
 * Een productpagina van collectandgo.be ophalen. Rustig: één pagina tegelijk,
 * met een korte pauze, en wat de site net vroeg, onthoudt ze een halfuur. Zo
 * vraagt een post die drie keer op "Prijzen nakijken" klikt, niet drie keer
 * dezelfde twintig pagina's op.
 *
 * Colruyt weert bots en blokkeert datacenter-IP's. Lukt het niet, dan zegt dit
 * `failed` met de reden, en bevestigt een mens de prijs in de editor.
 */

export type ProductLookup =
  { status: 'found'; product: ProductInfo } | { status: 'notfound' } | { status: 'failed'; reason: string };

const USER_AGENT = 'Mozilla/5.0 (compatible; VTK-budgetten/1.0; +https://vtk.be)';
const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; lookup: ProductLookup }>();

export async function lookupCollectGoProduct(ref: CollectGoRef): Promise<ProductLookup> {
  const url = productPageUrl(ref);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.lookup;

  let lookup: ProductLookup;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html', 'Accept-Language': 'nl-BE,nl;q=0.9' },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    const html = await res.text();
    const product = res.ok ? parseProductPage(html) : null;
    if (product) lookup = { status: 'found', product };
    else if ((res.status === 400 || res.status === 404 || res.ok) && isCollectGoPage(html))
      lookup = { status: 'notfound' };
    else lookup = { status: 'failed', reason: res.ok ? 'onbekend antwoord' : `HTTP ${res.status}` };
  } catch (err) {
    const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    lookup = { status: 'failed', reason: timeout ? 'geen antwoord binnen 12 seconden' : 'geen verbinding' };
  }
  // Een mislukte poging onthouden we niet: de volgende klik probeert opnieuw.
  if (lookup.status !== 'failed') cache.set(url, { at: Date.now(), lookup });
  return lookup;
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
