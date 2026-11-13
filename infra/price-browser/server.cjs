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
 * - laadt geen afbeeldingen, video of lettertypes, en doet hoogstens twee
 *   pagina's tegelijk. De site vraagt een pagina hoogstens eens per halfuur
 *   (`lib/priceCheck/fetch.ts`), en enkel wanneer iemand op "Prijzen nakijken"
 *   klikt.
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
const ALLOWED = (process.env.PRICE_BROWSER_HOSTS || 'bol.com,partywinkel.be,action.com')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const MAX_PARALLEL = 2;
const NAV_TIMEOUT = 25_000;
const CHALLENGE = /even geduld|just a moment|un instant|checking your browser/i;

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

let running = 0;
const waiting = [];
async function withSlot(job) {
  if (running >= MAX_PARALLEL) await new Promise((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await job();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

async function lookup(url) {
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
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, running });
    if (req.method !== 'POST' || req.url !== '/lookup') return send(res, 404, { ok: false, error: 'NOT_FOUND' });
    if (!sameSecret(req.headers['x-price-browser-secret'])) return send(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 8192) req.destroy();
    });
    req.on('end', () => {
      let url;
      try {
        url = new URL(String(JSON.parse(raw).url));
      } catch {
        return send(res, 400, { ok: false, error: 'BAD_REQUEST' });
      }
      if (url.protocol !== 'https:' || !allowedHost(url.hostname))
        return send(res, 400, { ok: false, error: 'HOST_NOT_ALLOWED' });
      withSlot(() => lookup(url.toString()))
        .then((result) => send(res, 200, result))
        .catch((err) => {
          const timeout = /Timeout/i.test(String(err && err.name)) || /Timeout/i.test(String(err && err.message));
          send(res, 200, { ok: false, error: timeout ? 'TIMEOUT' : 'BROWSER_ERROR' });
          if (!timeout) console.error('lookup failed:', String(err && err.message).slice(0, 300));
        });
    });
  })
  .listen(PORT, () => console.log(`prijsbrowser luistert op ${PORT}, winkels: ${ALLOWED.join(', ')}`));
