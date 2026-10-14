/* Speakit service worker — app-shell caching for faster loads + installability.
   Never caches API/socket/auth traffic; only static GET assets. Safe to update. */
const VERSION = "speakit-v1";
const CORE = ["/", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(VERSION);
        await cache.addAll(CORE);
      } catch {
        /* offline-first best effort */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/auth/")) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.svg" ||
    url.pathname.match(/\.(?:js|css|png|svg|ico|woff2?)$/)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  // Never intercept API, auth, or socket traffic.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io")) return;

  // Navigations: network-first, fall back to cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          return fresh;
        } catch {
          const cache = await caches.open(VERSION);
          const cached = await cache.match("/");
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  if (!isStaticAsset(url)) return;

  // Static assets: stale-while-revalidate for instant second loads.
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok) void cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});
