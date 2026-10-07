/*
 * Service worker: precache the whole shell + seed (cache-first), so every load after the first is instant and
 * works offline. Cross-origin requests (the daily raw.githubusercontent.com check) are never intercepted.
 * Injected at build time: __PRECACHE__ (relative urls), __VERSION__ (content hash of the build).
 */
declare const __PRECACHE__: string[];
declare const __VERSION__: string;

const sw = globalThis as unknown as {
  registration: { scope: string };
  location: Location;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: string, fn: (e: any) => void): void;
};

const CACHE = "fh-" + __VERSION__;
const scope = sw.registration.scope;
const INDEX = new URL("index.html", scope).href;

sw.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(__PRECACHE__.map((u) => new URL(u, scope).href)))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("fh-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (e) => {
  const req: Request = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== sw.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(caches.match(INDEX).then((hit) => hit ?? fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          // lazily fetched, content-hashed files (e.g. the NSFW list) are cached on first use
          if (res.ok) { const copy = res.clone(); void caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        }),
    ),
  );
});
