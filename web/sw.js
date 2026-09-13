// PapaMap's service worker: the map keeps working in the basement café with no
// signal, which is where a parent actually needs it.
//
// ---------------------------------------------------------------------------
// THE ONE RULE THAT IS NOT NEGOTIABLE: this must never cache map tiles.
//
// The OSMF tile policy says "Offline use is not permitted on
// tile.openstreetmap.org", and defines bulk downloading as *any* pre-emptive
// fetching of tiles beyond those a user is actively viewing — prefetch and
// offline patterns "will be blocked without notice"
// (https://operations.osmfoundation.org/policies/tiles/, read 2026-09-09).
// papamap.de also carries a Ko-fi link, which puts it inside that policy's
// explicit warning to services that seek donations.
//
// So the fetch handler below returns early for every cross-origin request and
// never calls respondWith() for one. Tiles therefore go straight to the
// network, exactly as if no service worker were installed, and nothing about
// them is stored. If a future change makes the basemap cacheable, that is the
// OpenFreeMap move — a different tile source with a different licence — and it
// belongs in its own commit, not in a widened condition here.
// ---------------------------------------------------------------------------

// Bump to evict the previous cache wholesale. The per-asset `?v=` pins in
// index.html already make a changed file a changed URL; this is the coarser
// lever for when the caching strategy itself changes.
const CACHE = "papamap-v1";

// Only the shell is precached, and it is small. The GeoJSON is deliberately
// NOT in this list: the page fetches it on its own during the first visit and
// the runtime handler below stores that response, so offline costs the visitor
// no extra bytes rather than a surprise 1.3 MB on someone's mobile data.
const SHELL = [
  "./",
  "vendor/maplibre-gl.css",
  "vendor/maplibre-gl.js",
  "style.css?v=app3",
  "app.js?v=app3",
  "datasource.js?v=app3",
  "i18n.js?v=app3",
];

// The status pages exist to tell you what is true right now. A stale one is
// worse than none, so they are never stored.
const NEVER_CACHE = /(^|\/)(ops\.html|private\/)/;

self.addEventListener("install", (e) => {
  // addAll() is atomic — one 404 in the list aborts the install and leaves the
  // previous worker serving, which is the failure mode we want.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Stale-while-revalidate, one rule for everything same-origin: answer from the
// cache the instant there is something to answer with, and refresh it in the
// background for next time. A visitor is therefore at most one visit behind on
// a deploy — and the map says which build it is showing, because the dataset
// date in the stats line comes out of the same cached stats.json.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // tiles: never touched
  if (NEVER_CACHE.test(url.pathname)) return;

  e.respondWith(caches.open(CACHE).then(async (cache) => {
    // Every language on this site is a query string — "/?lang=ja",
    // "/index.html?lang=de" — and each is a distinct cache key, so a reader who
    // bookmarked their own language would get nothing offline while the German
    // default worked. Navigations therefore fall back to a search-insensitive
    // match. ONLY navigations: the ?v= pins on app.js and friends exist
    // precisely so a changed file is a changed URL, and ignoring the search on
    // those would serve the previous deploy's JavaScript forever.
    const hit = await cache.match(req)
      ?? (req.mode === "navigate"
            ? await cache.match(req, { ignoreSearch: true }) : undefined);
    const fresh = fetch(req).then((res) => {
      // Only full, successful, same-origin answers are stored. An opaque or
      // partial response cached here would serve a broken file forever.
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    // Offline with nothing stored still has to reject rather than resolve to
    // undefined, or the page would see a TypeError instead of a failed fetch.
    return hit ?? (await fresh) ?? Response.error();
  }));
});
