/**
 * Service worker voor de ticketscanner.
 *
 * Twee redenen waarom die er is, en de tweede is de belangrijkste:
 *
 * 1. **Zonder service worker met fetch-handler installeert Chrome niets.** De
 *    knop "Zet op beginscherm" in de scanner hangt aan `beforeinstallprompt`, en
 *    dat event vuurt enkel wanneer er naast een manifest ook een service worker
 *    is die de pagina bedient.
 * 2. **Anders start de scanner offline niet.** De scanner beslist offline zelf op
 *    basis van het manifest in localStorage, maar dat helpt niet als de pagina
 *    zelf niet laadt. Wie het icoon aantikt in een kelder zonder bereik, krijgt
 *    zonder dit bestand een dinosaurus.
 *
 * Bewust smal: enkel `/scan` en de gehashte build-assets gaan door de cache.
 * Voor alles anders (API, admin, de publieke site) roepen we `respondWith` niet
 * aan, en doet de browser gewoon zijn normale werk. Scan-API's cachen zou
 * ronduit gevaarlijk zijn: een oud antwoord opnieuw serveren laat een ticket een
 * tweede keer binnen.
 */
const CACHE = "vtk-scanner-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add("/scan"))
      // Mislukt die ene fetch (offline bij het installeren), dan mag de worker
      // toch actief worden; de pagina komt bij het eerste online bezoek alsnog
      // in de cache.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Gehashte build-assets veranderen nooit van inhoud: uit de cache mag.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // De scannerpagina's zelf: netwerk eerst, cache als vangnet.
  if (url.pathname === "/scan" || url.pathname.startsWith("/scan/")) {
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // Een redirect naar /inloggen is geen scannerpagina; die in de cache zetten
    // zou betekenen dat je offline steeds op het loginscherm belandt.
    if (response.ok && !response.redirected) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const hit = await caches.match(request);
    if (hit) return hit;
    throw error;
  }
}
