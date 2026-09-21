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

// Only the shell is precached, and it is small. The GeoJSON is deliberately
// NOT in this list: the page fetches it on its own during the first visit and
// the runtime handler below stores that response, so offline costs the visitor
// no extra bytes rather than a surprise 1.3 MB on someone's mobile data.
const SHELL = [
  "./",
  "index.html",
  "index-en.html",
  "vendor/maplibre-gl.css",
  "vendor/maplibre-gl.js",
  "style.css?v=app37",
  "app.js?v=app37",
  "datasource.js?v=app37",
  "i18n.js?v=app37",
  "osm.js?v=app37",
  "me.js?v=app37",
  "native.js?v=app37",
  // index.html loads this one from the head, blocking. Left out of the
  // precache, a shell served from this cache would sit on a network request
  // for it before painting anything — offline, until that request fails.
  "in-app.js?v=app37",
];

// One cache per shell pin (the ?v= above). A deploy that bumps the pin
// starts a fresh cache and activate throws the previous one away whole —
// in a fixed-name cache the entries keyed by an old pin would sit forever,
// one dead shell per deploy. The data comes along again on the first load,
// which is network-first anyway.
const SHELL_PIN = /\?v=([\w-]+)/.exec(SHELL.join(" "))?.[1] ?? "0";
const CACHE = `papamap-${SHELL_PIN}`;

// The status pages exist to tell you what is true right now. A stale one is
// worse than none, so they are never stored.
const NEVER_CACHE = /(^|\/)(ops\.html|private\/)/;

// The dataset is network-first. The nightly build is the only path from OSM
// into the map and the edit confirmation promises "the map updates tonight",
// so a reader who is online must see tonight's build, not the copy from their
// last visit. The stored copy answers only when the network fails or is too
// slow to deliver 1.3 MB — the basement café this worker exists for.
// The nightly output: the JSON under /data/ and the area pages (and the
// leaderboard) under /wickeltische/, which carry the night's numbers in
// their prose and are one build behind if served cache-first.
const DATA = /^\/(data|wickeltische)\//;
const DATA_TIMEOUT_MS = self.PAPAMAP_DATA_TIMEOUT_MS ?? 8000;
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });

// A navigation's cache key: the path plus ?lang=, nothing else. ?lang=en is
// a different document on the live host (the Caddyfile rewrites it to
// index-en.html, with its own og: block), so each language keeps its own
// copy; ?mode=, ?bbox= and the OAuth return's ?code= do not change the page
// and would otherwise each keep one, one-time codes included.
const navKey = (url) => {
  const lang = url.searchParams.get("lang");
  return url.origin + url.pathname + (lang ? `?lang=${encodeURIComponent(lang)}` : "");
};

// A put can fail (quota, a Vary: * header) and nothing about the answer the
// page already has depends on it, so the rejection is swallowed rather than
// left to surface as an unhandled one in the worker.
const store = (cache, req, res) => cache.put(req, res.clone()).catch(() => {});

// A stored dataset answer carries a header the page reads to say "this is the
// copy from an earlier visit". Nothing else can tell it: navigator.onLine
// reports the machine's interface, and a Wi-Fi with no internet says "online".
function fromStore(res) {
  const headers = new Headers(res.headers);
  headers.set("X-PapaMap-Source", "cache");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// A page the worker refreshes asks the server, not the browser's HTTP cache.
// The site goes out with max-age=3600 (deploy/papamap.Caddyfile), and a plain
// fetch() inside that hour is answered from the HTTP cache with the copy the
// worker already holds: the background refresh stored the old page again, and
// a returning reader stayed on the previous deploy for up to an hour plus a
// load instead of one load (the app13 deploy, 2026-09-15).
//
// Navigations only. The HTML is the one file whose URL stays put across a
// deploy; everything it loads carries a ?v= pin, so a new deploy is a new URL
// and the HTTP cache cannot answer it with old bytes. And "no-cache" is not
// cheap everywhere: Chromium sends it as a conditional request (a 304), but
// WebKit sent no validators and downloaded the whole file again (PR #114
// review). On the dataset that would be 1.7 MB of an iPhone's data on every
// load, for a build that changes once a night.
const refresh = (req) =>
  req.mode === "navigate" ? fetch(req, { cache: "no-cache" }) : fetch(req);

self.addEventListener("install", (e) => {
  // addAll() is atomic — one 404 in the list aborts the install and leaves the
  // previous worker serving, which is the failure mode we want. "reload" for
  // the same reason as refresh() above: a new pin's cache filled from the HTTP
  // cache can hold the previous deploy's index.html under the new name.
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The shell is stale-while-revalidate: answer from the cache the instant there
// is something to answer with, and refresh it in the background for next time.
// A visitor is therefore at most one visit behind on a deploy of the page
// itself; the data under it is network-first (above), so what they see is
// tonight's build whenever the network can deliver it.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // tiles: never touched
  if (NEVER_CACHE.test(url.pathname)) return;

  e.respondWith(caches.open(CACHE).then(async (cache) => {
    if (DATA.test(url.pathname)) {
      // Network first, and the wait is a timer, not an AbortSignal: aborting
      // a fetch after its headers arrived kills the body mid-transfer, and
      // 1.3 MB on a weak cell can need longer than the timeout yet is still
      // worth having. When the timer wins, the stored copy answers and the
      // download carries on in the background into the store for the next
      // visit; waitUntil keeps the worker alive for it.
      const network = refresh(req).then((res) => {
        if (res.ok && res.type === "basic") store(cache, req, res);
        return res;
      }).catch(() => null);
      e.waitUntil(network);
      const fresh = await Promise.race([network, sleep(DATA_TIMEOUT_MS)]);
      if (fresh?.ok && fresh.type === "basic") return fresh;
      const hit = await cache.match(req);
      // A stored copy beats an error page and beats waiting; with nothing
      // stored, the slow download is still the best answer there is.
      return hit ? fromStore(hit) : (fresh ?? (await network) ?? Response.error());
    }
    // Every language on this site is a query string — "/?lang=ja",
    // "/index.html?lang=de" — and each is a distinct cache key, so a reader who
    // bookmarked their own language would get nothing offline while the German
    // default worked. Navigations therefore fall back to a search-insensitive
    // match. ONLY navigations: the ?v= pins on app.js and friends exist
    // precisely so a changed file is a changed URL, and ignoring the search on
    // those would serve the previous deploy's JavaScript forever.
    const hit = await cache.match(req)
      ?? (req.mode === "navigate"
            ? (await cache.match(navKey(url)) ?? await cache.match(req, { ignoreSearch: true }))
            : undefined);
    const fresh = refresh(req).then((res) => {
      // Only full, successful, same-origin answers are stored. An opaque or
      // partial response cached here would serve a broken file forever.
      // A navigation is stored under navKey (path + language), see above.
      if (res.ok && res.type === "basic")
        store(cache, req.mode === "navigate" ? navKey(url) : req, res);
      return res;
    }).catch(() => null);
    // The refresh must outlive the answer: once the stored copy has been
    // handed over the browser may stop the worker, and the page a returning
    // visitor gets on the next load is only new if this landed.
    e.waitUntil(fresh);
    // Offline with nothing stored still has to reject rather than resolve to
    // undefined, or the page would see a TypeError instead of a failed fetch.
    return hit ?? (await fresh) ?? Response.error();
  }));
});
