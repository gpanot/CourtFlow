// Minimal service worker — enables PWA installability and offline shell caching.
const CACHE = "courtflow-v1";
// Only precache same-origin pages that do NOT redirect cross-origin.
// /book redirects to courtpass.thecourtflow.com (308) which is blocked by CORS.
const PRECACHE = ["/"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // Only handle same-origin GET requests; skip API calls and cross-origin requests.
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  // Skip /book — middleware issues a 308 cross-origin redirect to CourtPass.
  if (url.pathname.startsWith("/book")) return;

  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
