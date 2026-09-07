const CACHE = "jarvis-shell-v4";
const SHELL_URL = "./";
const SHELL = [
  SHELL_URL,
  "./manifest.webmanifest",
  "./favicon.svg",
  "./logo.svg",
  "./apple-touch-icon.png",
  "./pwa-192.png",
  "./pwa-512.png",
  "./offline-boot.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

function isPrivateRuntimeRequest(url) {
  return url.pathname.includes("/api/")
    || url.pathname.includes("/__clerk")
    || url.pathname.includes("/clerk/")
    || url.pathname.startsWith("/sign-in")
    || url.pathname.startsWith("/sign-up");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || isPrivateRuntimeRequest(url)) return;

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: "no-store" });
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(SHELL_URL, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(SHELL_URL)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const network = fetch(event.request).then(async (response) => {
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
    });
    if (cached) {
      event.waitUntil(network.catch(() => undefined));
      return cached;
    }
    return network;
  })());
});
