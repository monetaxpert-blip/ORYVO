/* ORYVO B v2: cache application files only, NEVER map tiles or private APIs. */
const VERSION = "oryvo-v2-repair-1";
const STATIC = `${VERSION}-static`;
const RUNTIME = `${VERSION}-runtime`;
const PAGES = ["/", "/record", "/activities", "/activity", "/profile"];
const FILES = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/images/logo.png", "/images/hero-topo.png"];
let warming = null;

async function prepareOffline() {
  if (warming) return warming;
  warming = (async () => {
    const cache = await caches.open(STATIC);
    const response = await fetch("/api/offline-assets", { cache: "no-store" });
    if (!response.ok) throw new Error("Offline build manifest unavailable");
    const { assets } = await response.json();
    const allowed = assets.filter((url) => typeof url === "string" && url.startsWith("/_next/static/") && !url.includes(".."));
    const queue = [...new Set([...allowed, ...FILES])];
    // Fetch only our app bundle. No geographical tiles, panning, or region prefetch.
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const url = queue.shift();
        if (await cache.match(url)) continue;
        const result = await fetch(url);
        if (!result.ok) throw new Error(`Offline asset unavailable: ${url}`);
        await cache.put(url, result);
      }
    }));
    // Publish documents only after their JavaScript/CSS/fonts are available.
    const documents = await Promise.all(PAGES.map(async (url) => {
      const result = await fetch(url, { cache: "reload", headers: { Accept: "text/html" } });
      if (!result.ok || !result.headers.get("content-type")?.includes("text/html")) throw new Error("Offline page unavailable");
      return [url, result];
    }));
    for (const [url, result] of documents) await cache.put(url, result);
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((client) => client.postMessage({ type: "OFFLINE_READY" }));
  })().finally(() => { warming = null; });
  return warming;
}
// Install must never fail because of a single missing asset: the app stays usable online.
self.addEventListener("install", (event) => {
  event.waitUntil(prepareOffline().catch(async (error) => {
    console.warn("ORYVO offline preparation failed, serving online-only shell", error);
    const cache = await caches.open(STATIC);
    for (const url of [...PAGES, ...FILES]) {
      try {
        const result = await fetch(url, { cache: "reload", headers: { Accept: "text/html,image/png,application/manifest+json" } });
        if (result.ok) await cache.put(url, result.clone());
      } catch { /* best effort */ }
    }
    for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage({ type: "OFFLINE_ERROR" });
  }).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("oryvo-") && !name.startsWith(VERSION)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "PREPARE_OFFLINE") event.waitUntil(prepareOffline().catch(() => {
    event.source?.postMessage({ type: "OFFLINE_ERROR" });
  }));
});

async function navigation(request) {
  const url = new URL(request.url);
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(5000) });
    if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
      const cache = await caches.open(RUNTIME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Older links still work offline via the static local-data viewer.
    const legacy = /^\/activities\/([^/]+)\/?$/.exec(url.pathname);
    if (legacy) return Response.redirect(new URL(`/activity?id=${encodeURIComponent(legacy[1])}`, url.origin), 302);
    const runtime = await caches.open(RUNTIME);
    const exact = await runtime.match(request);
    if (exact) return exact;
    const cache = await caches.open(STATIC);
    const shell = PAGES.includes(url.pathname) ? await cache.match(url.pathname) : null;
    if (shell) return shell;
    return new Response('<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width"><title>ORYVO · Hors connexion</title><body style="background:#080808;color:white;font:16px system-ui;padding:32px"><h1>ORYVO</h1><p>Cette page n’est pas disponible hors connexion. Vos activités restent sur cet appareil.</p><a style="color:#ff8a00" href="/activities">Mes activités</a> · <a style="color:#ff8a00" href="/record">Enregistrer</a></body></html>', { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
async function asset(request) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.type !== "opaque") await cache.put(request, response.clone());
    return response;
  } catch { return new Response("Ressource indisponible hors connexion", { status: 503 }); }
}
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
  // RSC responses vary with router state. They are not HTML and must never share its cache.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;
  if (request.mode === "navigate") { event.respondWith(navigation(request)); return; }
  if (url.pathname.startsWith("/_next/static/") || FILES.includes(url.pathname) || url.pathname.endsWith("/icon.png")) event.respondWith(asset(request));
});
