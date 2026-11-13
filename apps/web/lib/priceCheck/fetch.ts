import 'server-only';

import {
  isShopPage,
  parseBrowserAnswer,
  parseShopResponse,
  shopOfUrl,
  type BrowserAnswer,
  type ShopProduct,
  type ShopRef,
} from './shops';

/*
 * Een productpagina van een webshop ophalen. Rustig: wat de site vroeg,
 * onthoudt ze vier uur, en twee aanvragen voor dezelfde pagina op hetzelfde
 * moment worden er één. Honderd mensen die samen een budget openen, zijn voor
 * de winkel dus één bezoek per product per vier uur. Met een eerlijke user-agent: een winkel die
 * geen automatische aanvragen wil, mag dat zeggen, en dan bevestigt een mens
 * de prijs in de editor.
 *
 * Een winkel die enkel browsers toelaat (`via: 'browser'`: bol.com,
 * Partywinkel, Action) gaat langs de prijsbrowser, een echte Chromium in een
 * eigen container (`infra/price-browser`, `PRICE_BROWSER_URL` en
 * `PRICE_BROWSER_SECRET`). Zonder die dienst krijgt zo'n regel "geen
 * antwoord" met de reden.
 */

export type ShopLookup =
  { status: 'found'; product: ShopProduct } | { status: 'notfound' } | { status: 'failed'; reason: string };

const USER_AGENT = 'Mozilla/5.0 (compatible; VTK-budgetten/1.0; +https://vtk.be)';
const TTL_MS = 4 * 60 * 60 * 1000;
// Een winkel die niet antwoordde, krijgt tien minuten rust voor de volgende poging.
const FAILED_TTL_MS = 10 * 60 * 1000;
const MAX_BYTES = 4_000_000;
const cache = new Map<string, { at: number; lookup: ShopLookup }>();
const pending = new Map<string, Promise<ShopLookup>>();

export type LookupOptions = { fresh?: boolean; colruytPostcode?: string };

function priceBrowserConfigured(): boolean {
  return !!process.env.PRICE_BROWSER_URL?.trim() && !!process.env.PRICE_BROWSER_SECRET?.trim();
}

/**
 * Langs waar de site deze winkel echt opvraagt. Collect&Go antwoordt een gewone
 * aanvraag, maar weigert het IP van de server (HTTP 456); staat de prijsbrowser
 * aan, dan gaat Collect&Go daarlangs, en zo ook langs zijn `PRICE_BROWSER_PROXY`.
 */
export function routeOf(ref: ShopRef): ShopRef['via'] {
  if (ref.shop === 'collectgo' && priceBrowserConfigured()) return 'browser';
  return ref.via;
}

async function lookupInBrowser(ref: ShopRef, options: LookupOptions): Promise<ShopLookup> {
  const base = process.env.PRICE_BROWSER_URL?.trim();
  const secret = process.env.PRICE_BROWSER_SECRET?.trim();
  if (!base || !secret)
    return { status: 'failed', reason: 'deze winkel laat enkel browsers toe en de prijsbrowser staat niet aan' };
  const res = await fetch(`${base.replace(/\/$/, '')}/lookup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-price-browser-secret': secret },
    body: JSON.stringify({ url: ref.page, postcode: ref.shop === 'colruyt' ? (options.colruytPostcode ?? '') : '' }),
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) return { status: 'failed', reason: `de prijsbrowser antwoordde met HTTP ${res.status}` };
  const answer = (await res.json()) as ({ ok: true } & BrowserAnswer) | { ok: false; error: string };
  if (!answer.ok)
    return {
      status: 'failed',
      reason:
        answer.error === 'TIMEOUT'
          ? 'de winkel antwoordde niet binnen 25 seconden'
          : 'de prijsbrowser kon de pagina niet openen',
    };
  if (shopOfUrl(answer.finalUrl) !== ref.shop) return { status: 'failed', reason: 'doorverwezen naar een andere site' };
  const product = parseBrowserAnswer(ref, answer);
  if (product) return { status: 'found', product };
  if (ref.shop === 'colruyt' && answer.status === 200)
    return {
      status: 'failed',
      reason: !options.colruytPostcode
        ? 'Colruyt geeft een prijs per winkel en bij de instellingen staat nog geen postcode'
        : answer.store
          ? `${answer.store} gaf geen prijs voor dit product`
          : `bij postcode ${options.colruytPostcode} vond de site geen Colruyt-winkel`,
    };
  if (answer.status === 404 || answer.status === 410) return { status: 'notfound' };
  if (
    answer.status === 403 ||
    answer.status === 429 ||
    /even geduld|just a moment|antibot|access denied/i.test(answer.title)
  )
    return { status: 'failed', reason: `de winkel hield ook de prijsbrowser tegen (HTTP ${answer.status})` };
  return answer.status >= 200 && answer.status < 300
    ? { status: 'notfound' }
    : { status: 'failed', reason: `HTTP ${answer.status}` };
}

/**
 * Staat de prijsbrowser aan, en antwoordt hij? Voor de test bij de instellingen:
 * zo zie je het verschil tussen "niet ingesteld", "draait niet" en "de winkel
 * weigert".
 */
export async function priceBrowserStatus(): Promise<'off' | 'down' | 'up'> {
  const base = process.env.PRICE_BROWSER_URL?.trim();
  if (!base || !process.env.PRICE_BROWSER_SECRET?.trim()) return 'off';
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    return res.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

/** `fresh` slaat het geheugen van vier uur over: een test wil de winkel zelf horen. */
export async function lookupShopProduct(ref: ShopRef, options: LookupOptions = {}): Promise<ShopLookup> {
  const key = ref.shop === 'colruyt' ? `${ref.page}#${options.colruytPostcode ?? ''}` : ref.page;
  const hit = cache.get(key);
  if (!options.fresh && hit && Date.now() - hit.at < (hit.lookup.status === 'failed' ? FAILED_TTL_MS : TTL_MS))
    return hit.lookup;
  const running = pending.get(key);
  if (running) return running;
  const job = fetchShopProduct(ref, options)
    .then((lookup) => {
      cache.set(key, { at: Date.now(), lookup });
      if (cache.size > 5000) cache.delete(cache.keys().next().value!);
      return lookup;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

async function fetchShopProduct(ref: ShopRef, options: LookupOptions): Promise<ShopLookup> {
  let lookup: ShopLookup;
  try {
    if (routeOf(ref) === 'browser') return await lookupInBrowser(ref, options);
    const res = await fetch(ref.page, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html',
        'Accept-Language': 'nl-BE,nl;q=0.9',
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    // Een doorverwijzing mag binnen de winkel blijven, niet ergens anders uitkomen.
    if (shopOfUrl(res.url) !== ref.shop) {
      lookup = { status: 'failed', reason: 'doorverwezen naar een andere site' };
    } else {
      const body = (await res.text()).slice(0, MAX_BYTES);
      const product = res.ok ? parseShopResponse(ref, body) : null;
      if (product) lookup = { status: 'found', product };
      else if (res.status === 404 || res.status === 410) lookup = { status: 'notfound' };
      else if (res.status === 403 || res.status === 429 || res.status === 456 || !isShopPage(ref, body))
        lookup = { status: 'failed', reason: `de winkel weert automatische aanvragen (HTTP ${res.status})` };
      else if (res.ok || res.status === 400) lookup = { status: 'notfound' };
      else lookup = { status: 'failed', reason: `HTTP ${res.status}` };
    }
  } catch (err) {
    const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    lookup = { status: 'failed', reason: timeout ? 'geen antwoord op tijd' : 'geen verbinding' };
  }
  return lookup;
}
