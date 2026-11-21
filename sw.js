/**
 * Service worker InkFlow — mode hors-ligne de la version navigateur.
 *
 * Stratégie « réseau d'abord, cache en secours » :
 * - en ligne, chaque fichier de l'application est chargé depuis le serveur, donc
 *   toujours à jour, et sa copie en cache est rafraîchie au passage ;
 * - hors-ligne, la dernière copie en cache est servie (paramètres d'URL ignorés).
 *
 * Enregistré uniquement par la version navigateur (voir
 * `registerOfflineServiceWorker` dans `app.js`) : ni Tauri ni Electron.
 */

const CACHE_PREFIX = 'inkflow-';
const CACHE_NAME = `${CACHE_PREFIX}offline-v4`;
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './assets/inkflow-logo.png',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './vendor/pdf-lib.min.js'
];

// Une seule entrée par fichier : les paramètres d'URL (?v=…) ne multiplient pas le cache.
function cacheKey(url) {
  const parsed = new URL(url, self.location.href);
  parsed.search = '';
  parsed.hash = '';
  return parsed.href;
}

// Ni réponse partielle (206), ni opaque, ni redirigée : un navigateur refuse de
// servir une réponse redirigée à une navigation (ex. `serve` redirige /index.html vers /).
function isCacheableResponse(response) {
  return Boolean(response) && response.status === 200 && response.type === 'basic' && !response.redirected;
}

async function precache(cache, url) {
  const response = await fetch(new Request(url, { cache: 'reload' }));
  if (isCacheableResponse(response)) await cache.put(cacheKey(url), response);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Chaque fichier est mis en cache séparément : un fichier absent ne bloque pas l'installation.
      Promise.allSettled(APP_SHELL.map((url) => precache(cache, url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function matchOffline(request) {
  const key = cacheKey(request.url);
  const cached = await caches.match(key);
  if (cached) return cached;
  // `/index.html` et `/` désignent la même page (certains serveurs redirigent l'un vers l'autre).
  if (key.endsWith('/index.html')) return caches.match(key.slice(0, -'index.html'.length));
  return undefined;
}

async function networkFirst(event) {
  const request = event.request;
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      const copy = response.clone();
      event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey(request.url), copy)).catch(() => {})
      );
    }
    return response;
  } catch (networkError) {
    const cached = await matchOffline(request);
    if (cached) return cached;
    throw networkError;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(event));
});
