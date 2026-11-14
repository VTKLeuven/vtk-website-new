/*
 * De prijsbrowser: een echte Chromium die een productpagina opent en teruggeeft
 * wat er aan gestructureerde data (JSON-LD, og:price) op staat.
 *
 * Bestaat omdat bol.com, Action en Partywinkel alles weigeren wat geen browser
 * is: een gewone `fetch` vanop de server krijgt HTTP 403 of 429, wat de
 * user-agent ook zegt. Een browser die de pagina echt laadt, krijgt ze wel.
 * Getest in november 2026: bol.com en Partywinkel lukken ook headless, Action
 * (Cloudflare) enkel met een venster, dus de container draait Chromium met een
 * venster op een virtueel scherm (xvfb).
 *
 * Wat dit bewust NIET is: een open proxy. De dienst
 * - luistert enkel op het interne Docker-netwerk en vraagt een gedeeld geheim;
 * - opent enkel https-pagina's van de hosts in ALLOWED (dezelfde lijst als
 *   `apps/web/lib/priceCheck/shops.ts`, die de link al herkende en het adres
 *   zelf opbouwde), en breekt een navigatie naar elders af;
 * - geeft geen HTML terug, enkel de JSON-LD-blokken en de prijs-metatags;
 * - laadt geen afbeeldingen, video of lettertypes, en opent hoogstens twee
 *   pagina's tegelijk. Colruyt en Collect&Go krijgen geen pagina per product
 *   maar één open pagina met lichte aanvragen erin (zie verderop). De site
 *   vraagt een product hoogstens eens per vier uur (`lib/priceCheck/fetch.ts`).
 *
 * CommonJS, zodat NODE_PATH werkt: `playwright` staat naast het script
 * geïnstalleerd, niet in de repo (zie de service in infra/docker-compose.yml).
 */

const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const { chromium } = require('playwright');

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.PRICE_BROWSER_SECRET || '';
const PROXY = process.env.PRICE_BROWSER_PROXY || '';
const ALLOWED = (process.env.PRICE_BROWSER_HOSTS || 'bol.com,partywinkel.be,action.com,colruyt.be,collectandgo.be')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const MAX_PARALLEL = 2;
// Lichte aanvragen vanuit een open pagina (Colruyt, Collect&Go): geen nieuw tabblad, dus meer tegelijk.
const MAX_LIGHT = 4;
const NAV_TIMEOUT = 25_000;
const CHALLENGE = /even geduld|just a moment|un instant|checking your browser|antibot/i;

function allowedHost(hostname) {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return ALLOWED.some((h) => host === h || host.endsWith(`.${h}`));
}

function sameSecret(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(SECRET);
  return SECRET.length >= 16 && a.length === b.length && timingSafeEqual(a, b);
}

let contextPromise = null;
async function context() {
  if (!contextPromise) {
    contextPromise = (async () => {
      const browser = await chromium.launch({
        headless: process.env.PRICE_BROWSER_HEADLESS === '1',
        ...(PROXY ? { proxy: { server: PROXY } } : {}),
      });
      browser.on('disconnected', () => {
        contextPromise = null;
      });
      const ctx = await browser.newContext({ locale: 'nl-BE', timezoneId: 'Europe/Brussels' });
      await ctx.route('**/*', (route) => {
        const request = route.request();
        if (['image', 'media', 'font'].includes(request.resourceType())) return route.abort();
        // De pagina zelf mag enkel bij de winkel blijven; wat ze inlaadt (scripts, API's) mag verder.
        if (request.isNavigationRequest() && request.frame().parentFrame() === null) {
          let host = '';
          try {
            host = new URL(request.url()).hostname;
          } catch {
            return route.abort();
          }
          if (!allowedHost(host)) return route.abort();
        }
        return route.continue();
      });
      return ctx;
    })().catch((err) => {
      contextPromise = null;
      throw err;
    });
  }
  return contextPromise;
}

function limiter(max) {
  const queue = [];
  const state = { running: 0 };
  state.run = async (job) => {
    if (state.running >= max) await new Promise((resolve) => queue.push(resolve));
    state.running += 1;
    try {
      return await job();
    } finally {
      state.running -= 1;
      queue.shift()?.();
    }
  };
  return state;
}
const pages = limiter(MAX_PARALLEL);
const light = limiter(MAX_LIGHT);

/*
 * Colruyt toont een prijs pas voor een gekozen winkel, en haalt ze dan op bij
 * haar eigen API, met de sleutel die de pagina zelf meestuurt. Dat doet dit na
 * vanuit één Colruyt-pagina die open blijft: de winkel bij de postcode opzoeken
 * en het product op zijn nummer (het getal in de link) met de prijs van die
 * winkel. Eén lichte aanvraag per product, geen pagina per product: wie twintig
 * productpagina's na elkaar opent, houdt de botbeveiliging van Colruyt tegen.
 * Het antwoord gaat terug als JSON-LD, zodat de site het leest zoals bij elke
 * andere winkel.
 */
const COLRUYT_HOME = 'https://www.colruyt.be/nl/producten';
const COLRUYT_SESSION_MS = 20 * 60 * 1000;
let colruytSession = null;

let colruytOpening = null;

/** Eén Colruyt-pagina tegelijk openen, ook wanneer twee vragen samen binnenkomen. */
function openColruyt() {
  colruytOpening ??= openColruytNow().finally(() => {
    colruytOpening = null;
  });
  return colruytOpening;
}

async function openColruytNow() {
  const now = Date.now();
  if (colruytSession && now - colruytSession.at < COLRUYT_SESSION_MS && !colruytSession.page.isClosed())
    return colruytSession;
  if (colruytSession) await colruytSession.context.close().catch(() => {});
  colruytSession = null;
  const browser = (await context()).browser();
  // Een eigen context die alles laadt: zonder afbeeldingen en lettertypes ziet Colruyt geen gewone bezoeker.
  const ctx = await browser.newContext({ locale: 'nl-BE', timezoneId: 'Europe/Brussels' });
  const page = await ctx.newPage();
  let apiKey = null;
  page.on('request', (request) => {
    if (/^https:\/\/api[px]\.colruyt\.be\//.test(request.url())) apiKey = request.headers()['x-cg-apikey'] || apiKey;
  });
  const response = await page.goto(COLRUYT_HOME, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  for (let i = 0; i < 60 && !apiKey; i += 1) await page.waitForTimeout(250);
  const status = response ? response.status() : 0;
  if (!apiKey) {
    const title = await page.title().catch(() => '');
    await ctx.close().catch(() => {});
    return { failed: true, status, title };
  }
  colruytSession = { context: ctx, page, apiKey, at: now, places: new Map() };
  return colruytSession;
}

async function lookupColruyt(url, postcode) {
  const number = /\/producten\/(?:[^/]*-)?(\d{2,9})\/?$/.exec(new URL(url).pathname)?.[1];
  const zip = /^\d{4}$/.test(String(postcode || '')) ? String(postcode) : '';
  const base = { ok: true, status: 200, finalUrl: url, title: 'Colruyt', ld: [], price: null, store: null };
  if (!number) return { ...base, status: 404 };
  const session = await openColruyt();
  if (session.failed) return { ...base, status: session.status || 403, title: session.title || 'AntiBot' };
  if (!zip) return base;
  try {
    const found = await session.page.evaluate(
      async ({ key, zip, number, knownPlace }) => {
        const headers = { 'x-cg-apikey': key };
        let place = knownPlace;
        if (!place) {
          const list = await fetch(
            `https://apix.colruyt.be/gateway/ictmgmt.emarkecom.cgplacesretrsvcv4/v4/nl/places/searchPlaces?searchTerm=${zip}&ensignId=8`,
            { headers }
          ).then((r) => (r.ok ? r.json() : null));
          const near = (list?.placeSearchDetails ?? []).filter((p) => String(p.address?.postalcode) === zip);
          // De winkel zelf, niet het afhaalpunt: enkel de winkel heeft de winkelprijs.
          const store = near.find((p) => /winkel/i.test(p.placeType?.longName ?? ''));
          place = store ? { id: store.placeId, name: store.commercialName } : null;
        }
        if (!place) return { place: null };
        const res = await fetch(
          `https://apip.colruyt.be/gateway/emec.colruyt.protected.bffsvc/cg/nl/api/product-search-prs?placeId=${place.id}&searchTerm=${number}&size=5`,
          { headers }
        );
        if (!res.ok) return { place, error: res.status };
        const products = (await res.json()).products ?? [];
        // Zoeken op een getal geeft ook producten met dat getal in de naam: enkel het product met dit nummer telt.
        const product = products.find((p) => String(p.commercialArticleNumber) === number);
        const price = product?.price?.basicPrice;
        return typeof price === 'number'
          ? { place, name: product.LongName || product.name || '', price, available: product.isAvailable !== false }
          : { place, missing: true };
      },
      { key: session.apiKey, zip, number, knownPlace: session.places.get(zip) ?? null }
    );
    if (found.place) session.places.set(zip, found.place);
    if (found.error) {
      // De sleutel of de sessie is verlopen: de volgende vraag opent een nieuwe pagina.
      session.at = 0;
      return { ...base, status: found.error === 404 ? 404 : 403, store: found.place?.name ?? null };
    }
    if (typeof found.price !== 'number')
      return { ...base, status: found.missing ? 404 : 200, store: found.place?.name ?? null };
    const ld = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: found.name,
      offers: {
        '@type': 'Offer',
        price: found.price,
        priceCurrency: 'EUR',
        availability: found.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      },
    });
    return { ...base, ld: [ld], store: found.place.name };
  } catch (err) {
    session.at = 0;
    throw err;
  }
}

/*
 * Collect&Go weigert het IP van de server voor een gewone aanvraag (HTTP 456),
 * en een pagina per product openen duurde vijf tot vijftien seconden per
 * product, twee tegelijk: een budget met twintig dranken stond minuten te
 * wachten. Zoals bij Colruyt blijft er dus één Collect&Go-pagina open, en
 * vraagt die pagina de productpagina's zelf op (`fetch` vanuit de pagina, met
 * haar cookies), zonder ze te tekenen of hun scripts te draaien. Wat terugkomt,
 * is enkel de JSON-LD, zoals bij elke andere winkel. Gemeten op een gewone
 * verbinding: een kwart tot driekwart seconde per product, tegen twee tot
 * vijftien seconden voor een volledige pagina.
 *
 * De botbeveiliging van Colruyt ("Colruyt | AntiBot") stuurt af en toe een
 * wachtpagina met een script in plaats van het product. Een `fetch` voert dat
 * script niet uit; dan opent de prijsbrowser dat ene product als gewone pagina,
 * die de wachtpagina uitzit zoals een bezoeker (`lookupPage`). De cookie die
 * daarbij komt, geldt voor de hele context, dus de volgende producten gaan weer
 * langs de snelle weg.
 */
const COLLECTGO_HOME = 'https://www.collectandgo.be/';
const ANTIBOT = /antibot/i;
let collectGoSession = null;
let collectGoOpening = null;

function openCollectGo() {
  collectGoOpening ??= openCollectGoNow().finally(() => {
    collectGoOpening = null;
  });
  return collectGoOpening;
}

async function openCollectGoNow() {
  const now = Date.now();
  if (collectGoSession?.failed && now - collectGoSession.at < 60_000) return collectGoSession;
  if (
    collectGoSession &&
    !collectGoSession.failed &&
    now - collectGoSession.at < COLRUYT_SESSION_MS &&
    !collectGoSession.page.isClosed()
  )
    return collectGoSession;
  if (collectGoSession?.page) await collectGoSession.page.close().catch(() => {});
  collectGoSession = null;
  const page = await (await context()).newPage();
  const response = await page
    .goto(COLLECTGO_HOME, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
    .catch(() => null);
  if (ANTIBOT.test(await page.title().catch(() => '')))
    await page.waitForFunction(() => !/antibot/i.test(document.title), null, { timeout: 20_000 }).catch(() => {});
  const ready = !ANTIBOT.test(await page.title().catch(() => '')) && allowedHost(new URL(page.url()).hostname);
  if (!ready || !response || response.status() >= 500) {
    await page.close().catch(() => {});
    // Een minuut niet opnieuw proberen: anders opent elk product de startpagina opnieuw.
    collectGoSession = { failed: true, at: now };
    return collectGoSession;
  }
  collectGoSession = { page, at: now };
  return collectGoSession;
}

async function fetchInSession(session, url) {
  try {
    return await session.page.evaluate(async (target) => {
      const res = await fetch(target, { credentials: 'include', headers: { accept: 'text/html' } });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      return {
        status: res.status,
        finalUrl: res.url,
        title: doc.title || '',
        ld: [...doc.querySelectorAll('script[type="application/ld+json"]')]
          .map((s) => s.textContent || '')
          .filter((t) => t.length < 200_000)
          .slice(0, 12),
      };
    }, url);
  } catch (err) {
    session.at = 0;
    throw err;
  }
}

const blocked = (found) =>
  ANTIBOT.test(found.title || '') || [403, 405, 429, 456].includes(found.status) || found.ok === false;
const BLOCKED_ANSWER = (url) => ({ ok: true, status: 456, finalUrl: url, title: 'Colruyt | AntiBot', ld: [], price: null });
// Eén product tegelijk zit de wachtpagina uit; de andere wachten daarop en proberen dan opnieuw.
let collectGoPassing = null;
// Kwam ook de volledige pagina niet door, dan tien minuten niet opnieuw proberen:
// elk product zou anders een halve minuut op dezelfde wachtpagina zitten.
let collectGoBlockedUntil = 0;
const COLLECTGO_PAUSE_MS = 10 * 60 * 1000;

async function lookupCollectGo(url) {
  if (Date.now() < collectGoBlockedUntil) return BLOCKED_ANSWER(url);
  const session = await openCollectGo();
  if (!session.failed) {
    const found = await fetchInSession(session, url);
    if (!blocked(found)) return { ok: true, price: null, ...found };
  }
  // Tegengehouden, of geen open pagina: één product als volledige pagina, zoals een bezoeker.
  if (!collectGoPassing) {
    collectGoPassing = pages.run(() => lookupPage(url)).finally(() => {
      collectGoPassing = null;
    });
    const own = await collectGoPassing.catch(() => ({ ok: false, error: 'TIMEOUT' }));
    if (blocked(own)) {
      collectGoBlockedUntil = Date.now() + COLLECTGO_PAUSE_MS;
      return own.ok === false ? own : BLOCKED_ANSWER(url);
    }
    // Die pagina kwam door, dus de context heeft nu de cookie: de volgende opent de startpagina opnieuw.
    if (collectGoSession?.failed) collectGoSession = null;
    return own;
  }
  await collectGoPassing.catch(() => {});
  if (Date.now() < collectGoBlockedUntil) return BLOCKED_ANSWER(url);
  const retry = await openCollectGo();
  const again = retry.failed ? null : await fetchInSession(retry, url);
  // Nog altijd tegengehouden: geen tweede pagina; de site zegt "geen antwoord" en probeert later opnieuw.
  if (!again || blocked(again)) return BLOCKED_ANSWER(url);
  return { ok: true, price: null, ...again };
}

async function lookup(url, options) {
  if (/(^|\.)colruyt\.be$/i.test(new URL(url).hostname)) return light.run(() => lookupColruyt(url, options.postcode));
  if (/(^|\.)collectandgo\.be$/i.test(new URL(url).hostname)) return light.run(() => lookupCollectGo(url));
  return pages.run(() => lookupPage(url));
}

async function lookupPage(url) {
  const ctx = await context();
  const page = await ctx.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    let status = response ? response.status() : 0;
    // Een wachtpagina ("Even geduld...") laat een echte browser na enkele seconden door en
    // laadt dan het product. Dat uitzitten, zoals een bezoeker; lukt het niet, dan meldt de
    // site "geen antwoord". Geen captcha's oplossen, geen vingerafdruk vervalsen.
    if (CHALLENGE.test(await page.title().catch(() => ''))) {
      const passed = await page
        .waitForFunction((source) => !new RegExp(source, 'i').test(document.title), CHALLENGE.source, {
          timeout: 20_000,
        })
        .then(
          () => true,
          () => false
        );
      if (passed) {
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        status = 200;
      }
    }
    // De prijs staat soms pas in de pagina nadat een script liep; even wachten, niet eeuwig.
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('script[type="application/ld+json"]')].some((s) =>
            /"price"/.test(s.textContent || '')
          ),
        null,
        { timeout: 12_000 }
      )
      .catch(() => {});
    const found = await page.evaluate(() => ({
      title: document.title,
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((s) => s.textContent || '')
        .filter((t) => t.length < 200_000)
        .slice(0, 12),
      price:
        document
          .querySelector('meta[property="og:price:amount"], meta[property="product:price:amount"]')
          ?.getAttribute('content') || null,
    }));
    return { ok: true, status, finalUrl: page.url(), ...found };
  } finally {
    await page.close().catch(() => {});
  }
}

function send(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

http
  .createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health')
      return send(res, 200, { ok: true, running: pages.running + light.running });
    if (req.method !== 'POST' || req.url !== '/lookup') return send(res, 404, { ok: false, error: 'NOT_FOUND' });
    if (!sameSecret(req.headers['x-price-browser-secret'])) return send(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 8192) req.destroy();
    });
    req.on('end', () => {
      let url;
      let options = {};
      try {
        const body = JSON.parse(raw);
        url = new URL(String(body.url));
        options = { postcode: typeof body.postcode === 'string' ? body.postcode.slice(0, 4) : '' };
      } catch {
        return send(res, 400, { ok: false, error: 'BAD_REQUEST' });
      }
      if (url.protocol !== 'https:' || !allowedHost(url.hostname))
        return send(res, 400, { ok: false, error: 'HOST_NOT_ALLOWED' });
      lookup(url.toString(), options)
        .then((result) => send(res, 200, result))
        .catch((err) => {
          const timeout = /Timeout/i.test(String(err && err.name)) || /Timeout/i.test(String(err && err.message));
          send(res, 200, { ok: false, error: timeout ? 'TIMEOUT' : 'BROWSER_ERROR' });
          if (!timeout) console.error('lookup failed:', String(err && err.message).slice(0, 300));
        });
    });
  })
  .listen(PORT, () => console.log(`prijsbrowser luistert op ${PORT}, winkels: ${ALLOWED.join(', ')}`));
