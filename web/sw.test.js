import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// sw.js runs in a ServiceWorkerGlobalScope, which node:test does not have. So
// it is loaded into a vm context with just enough of that scope faked to drive
// the fetch handler and see what it decides. The point of these tests is the
// OSMF tile policy: a future edit that widens the origin check has to fail
// here rather than in a ban email.
const SRC = fs.readFileSync(new URL("./sw.js", import.meta.url), "utf8");
const ORIGIN = "https://papamap.de";

function loadSW({ cached = {}, network = {} } = {}) {
  const handlers = {};
  const put = [], opened = [], fetched = [], added = [];
  const cache = {
    match: async (req, opts) => {
      const url = typeof req === "string" ? req : req.url;
      if (cached[url]) return cached[url];
      if (!opts?.ignoreSearch) return undefined;
      const bare = (u) => u.split("?")[0];
      const k = Object.keys(cached).find((u) => bare(u) === bare(url));
      return k ? cached[k] : undefined;
    },
    put: async (req, res) => { put.push(typeof req === "string" ? req : req.url); },
    addAll: async (list) => { added.push(...list); },
  };
  const ctx = {
    self: {
      addEventListener: (type, fn) => { handlers[type] = fn; },
      location: { origin: ORIGIN },
      skipWaiting: () => {},
      clients: { claim: () => {} },
      PAPAMAP_DATA_TIMEOUT_MS: 30,   // the 8 s of the real worker, shrunk for the tests
    },
    setTimeout, clearTimeout,
    caches: { open: async (name) => { opened.push(name); return cache; }, keys: async () => [], delete: async () => {} },
    fetch: async (req, init) => {
      fetched.push({ url: req.url, cache: init?.cache });
      if (!(req.url in network)) throw new TypeError("offline");
      return network[req.url];
    },
    // Node's Request refuses the relative "./" the worker resolves against its
    // own location, so the install sees a stand-in that keeps what it was given.
    Request: class { constructor(url, init) { this.url = url; this.cache = init?.cache; } },
    Response, Headers, URL, AbortSignal, console,
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { handlers, put, opened, fetched, added };
}

const res = (body, { ok = true, type = "basic" } = {}) =>
  ({ ok, type, body, clone() { return this; } });

// Fire a fetch event and report whether the worker took it over at all.
function fire(handlers, url, method = "GET", mode = "no-cors") {
  const e = { request: { url, method, mode }, responded: undefined,
              respondWith(p) { this.responded = p; }, waitUntil() {} };
  handlers.fetch(e);
  return e;
}

test("map tiles are never intercepted, let alone cached", () => {
  const { handlers } = loadSW();
  // The live basemap, and two other shapes of third-party request.
  for (const url of ["https://tile.openstreetmap.org/12/2200/1343.png",
                     "https://a.tile.openstreetmap.org/5/16/10.png",
                     "https://tiles.openfreemap.org/styles/liberty"]) {
    const e = fire(handlers, url);
    assert.equal(e.responded, undefined,
      `${url} was intercepted — the OSMF tile policy forbids storing tiles`);
  }
});

test("a hostname that merely starts with the site's origin is still foreign", () => {
  const { handlers } = loadSW();
  // papamap.de.evil.example is not papamap.de. A `startsWith` origin check
  // would wave this through; comparing full origins does not.
  assert.equal(fire(handlers, "https://papamap.de.evil.example/data/x.json").responded,
               undefined);
});

test("offline, the dataset is served from the store and says so", async () => {
  const url = `${ORIGIN}/data/changing_tables.geojson`;
  const { handlers } = loadSW({ cached: { [url]: res("stored") } });
  const e = fire(handlers, url);
  assert.notEqual(e.responded, undefined, "same-origin request was not handled");
  const answer = await e.responded;
  assert.equal(await answer.text(), "stored");
  // The page's "showing stored data" toast hangs on this header alone —
  // navigator.onLine is true on a Wi-Fi with no internet.
  assert.equal(answer.headers.get("X-PapaMap-Source"), "cache");
});

test("the dataset is network-first: online, tonight's build beats last visit's copy", async () => {
  // The edit confirmation promises "the map updates tonight". A cache-first
  // answer here would show a reader who came back for exactly that the pins
  // from before their edit, with the network sitting idle.
  const url = `${ORIGIN}/data/changing_tables.geojson`;
  const { handlers, put } = loadSW({ cached: { [url]: res("yesterday") },
                                     network: { [url]: res("tonight") } });
  const answer = await fire(handlers, url).responded;
  assert.equal(answer.body, "tonight");
  assert.equal(answer.headers, undefined, "a fresh answer is passed through untouched");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(put, [url], "the fresh copy is stored for the next offline visit");
});

const later = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));

test("a slow dataset download is not cut off: the stored copy answers, the download still lands", async () => {
  // Headers at 2 s, body by 12 s on a weak cell: an AbortSignal would have
  // killed the body at 8 s and served nothing. The timer only decides who
  // answers now; the fetch runs on and is stored for the next visit.
  const url = `${ORIGIN}/data/changing_tables.geojson`;
  const { handlers, put } = loadSW({ cached: { [url]: res("yesterday") },
                                     network: { [url]: later(80, res("tonight")) } });
  const answer = await fire(handlers, url).responded;
  assert.equal(await answer.text(), "yesterday");
  assert.equal(answer.headers.get("X-PapaMap-Source"), "cache");
  await later(120);
  assert.deepEqual(put, [url], "the slow download was stored once it arrived");
});

test("with nothing stored, a slow download is waited for rather than replaced by an error", async () => {
  const url = `${ORIGIN}/data/stats.json`;
  const { handlers } = loadSW({ network: { [url]: later(80, res("late but whole")) } });
  assert.equal((await fire(handlers, url).responded).body, "late but whole");
});

test("the area pages are nightly output too: network-first like the data", async () => {
  const url = `${ORIGIN}/wickeltische/berlin.html`;
  const { handlers } = loadSW({ cached: { [url]: res("august") }, network: { [url]: res("tonight") } });
  assert.equal((await fire(handlers, url, "GET", "navigate").responded).body, "tonight");
});

test("a failed dataset fetch falls back to the stored copy, a 404 does not hide behind one", async () => {
  const url = `${ORIGIN}/data/stats.json`;
  // Network answers with an error page and nothing is stored: the page must
  // see that error, not a synthetic network failure.
  let sw = loadSW({ network: { [url]: res("missing", { ok: false }) } });
  assert.equal((await fire(sw.handlers, url).responded).body, "missing");
  // Same error page, but a stored copy exists: the stored copy wins.
  sw = loadSW({ cached: { [url]: res("stored") },
                network: { [url]: res("missing", { ok: false }) } });
  assert.equal(await (await fire(sw.handlers, url).responded).text(), "stored");
});

test("the cache is named after the shell pin, so a bumped deploy evicts the old shell whole", async () => {
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const pin = /app\.js\?v=([\w-]+)/.exec(html)?.[1];
  const { handlers, opened } = loadSW({ network: { [`${ORIGIN}/x.css`]: res("x") } });
  await fire(handlers, `${ORIGIN}/x.css`).responded;
  assert.deepEqual(opened, [`papamap-${pin}`]);
});

test("the shell precache pins the same ?v= as index.html", () => {
  // The worker precaches app.js?v=<pin>; index.html asks for app.js?v=<pin>.
  // If the two ever differ, a deploy precaches a URL nobody requests and the
  // page's own assets are only stored on a second visit — or, worse, the
  // install 404s and the previous worker keeps serving the previous deploy.
  const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const pin = /app\.js\?v=([\w-]+)/.exec(html)?.[1];
  assert.ok(pin, "index.html carries no app.js?v= pin");
  const list = SRC.slice(SRC.indexOf("const SHELL"), SRC.indexOf("const NEVER_CACHE"));
  for (const f of ["style.css", "app.js", "datasource.js", "i18n.js", "osm.js"])
    assert.ok(list.includes(`"${f}?v=${pin}"`), `sw.js SHELL must carry ${f}?v=${pin}`);
  assert.ok(list.includes('"index.html"') && list.includes('"index-en.html"'),
    "both index files must be stored, or /index.html?lang=x has nothing to fall back to");
  // app.js's own imports carry the pin too (its header says "bump all four
  // together"): a bump that misses them keeps every reader on the old
  // i18n.js/datasource.js/osm.js URLs, which the edge holds for hours, and
  // precaches URLs nobody requests. PR #105 nearly shipped exactly that.
  const app = fs.readFileSync(new URL("./app.js", import.meta.url), "utf8");
  for (const f of ["datasource.js", "i18n.js", "osm.js"])
    assert.ok(app.includes(`"./${f}?v=${pin}"`), `app.js must import ${f}?v=${pin}`);
});

test("the shell is cache-first with a background refresh", async () => {
  // Unlike the dataset: the ?v= pin makes a changed file a changed URL, so a
  // cached shell asset is by construction the right bytes for its URL.
  const url = `${ORIGIN}/app.js?v=off1`;
  const { handlers, put } = loadSW({ cached: { [url]: res("cached code") },
                                     network: { [url]: res("same code") } });
  assert.equal((await fire(handlers, url).responded).body, "cached code");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(put, [url]);
});

test("the worker's own fetches ask the server, not the browser's HTTP cache", async () => {
  // The site sends max-age=3600. A plain fetch() in that hour was answered
  // from the HTTP cache, so the background refresh stored the old page again
  // and a returning reader ran the previous deploy for up to an hour (app13).
  const page = `${ORIGIN}/`, code = `${ORIGIN}/app.js?v=off1`, data = `${ORIGIN}/data/stats.json`;
  const { handlers, fetched } = loadSW({
    cached: { [page]: res("old page"), [code]: res("code") },
    network: { [page]: res("new page"), [code]: res("code"), [data]: res("{}") },
  });
  await fire(handlers, page, "GET", "navigate").responded;
  await fire(handlers, code).responded;
  await fire(handlers, data).responded;
  assert.deepEqual(fetched, [page, code, data].map((url) => ({ url, cache: "no-cache" })));
});

test("the install precaches fresh copies, not the HTTP cache's", async () => {
  // A new pin's cache filled from the HTTP cache can hold the previous
  // deploy's index.html under the new name.
  const { handlers, added } = loadSW();
  let done;
  handlers.install({ waitUntil(p) { done = p; } });
  await done;
  assert.ok(added.some((r) => r.url === "index.html"), "the shell was not precached");
  for (const r of added) assert.equal(r.cache, "reload", r.url);
});

test("offline with nothing stored rejects rather than resolving to undefined", async () => {
  const url = `${ORIGIN}/data/stats.json`;
  const { handlers } = loadSW();                 // empty cache, empty network
  const answer = await fire(handlers, url).responded;
  // Response.error() is a network error the page sees as a failed fetch, which
  // is what app.js's loadJSON already degrades on.
  assert.equal(answer.type, "error");
});

test("only successful, non-opaque responses are stored", async () => {
  const ok = `${ORIGIN}/app.js?v=off1`;
  const notFound = `${ORIGIN}/gone.js`;
  const { handlers, put } = loadSW({
    network: { [ok]: res("code"), [notFound]: res("404", { ok: false }) },
  });
  await fire(handlers, ok).responded;
  await fire(handlers, notFound).responded;
  await new Promise((r) => setImmediate(r));     // let the background put settle
  assert.deepEqual(put, [ok]);
});

test("the status pages are never stored — a stale one is worse than none", () => {
  const { handlers } = loadSW();
  for (const p of ["/ops.html", "/private/", "/private/ops.html"])
    assert.equal(fire(handlers, ORIGIN + p).responded, undefined, p);
  // ...but a normal page still is.
  assert.notEqual(fire(handlers, `${ORIGIN}/methods.html`).responded, undefined);
});

test("non-GET requests are left alone", () => {
  const { handlers } = loadSW();
  assert.equal(fire(handlers, `${ORIGIN}/data/stats.json`, "POST").responded, undefined);
});

test("the shell precache does not include the dataset", () => {
  // Precaching the GeoJSON would spend 1.3 MB of someone's mobile data before
  // they asked for it; the runtime handler picks it up from the page's own
  // fetch instead. Guard the intent, since the list is easy to "helpfully" grow.
  const list = SRC.slice(SRC.indexOf("const SHELL"), SRC.indexOf("const NEVER_CACHE"));
  assert.ok(!/geojson|stats\.json/.test(list), "dataset must not be precached");
  assert.ok(list.includes("vendor/maplibre-gl.js"), "shell must carry the map library");
});

test("a ?lang= page still resolves offline — every language is a query string", async () => {
  // "/index.html" is what got stored; "/index.html?lang=ja" is what a reader
  // who bookmarked Japanese asks for. Without the navigation fallback this
  // returned a network error and the whole site was offline-broken for
  // everyone but the German default.
  const stored = `${ORIGIN}/index.html`;
  const { handlers } = loadSW({ cached: { [stored]: res("the page") } });
  const e = fire(handlers, `${ORIGIN}/index.html?lang=ja`, "GET", "navigate");
  assert.equal((await e.responded).body, "the page");
});

test("a navigation is stored under its bare URL, never with its query string", async () => {
  // The OAuth return lands on /?code=…&state=…; ?lang=, ?mode= and ?bbox=
  // links are the same page too. One stored copy, found by the
  // search-insensitive match — not one per query string ever followed.
  const url = `${ORIGIN}/?code=one-time&state=x`;
  const { handlers, put } = loadSW({ network: { [url]: res("the page") } });
  await fire(handlers, url, "GET", "navigate").responded;
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(put, [`${ORIGIN}/`]);
  // ?lang= stays in the key: on the live host /?lang=en is index-en.html,
  // a different document with its own og: block. One copy per language.
  const en = `${ORIGIN}/?lang=en&mode=mama`;
  const sw = loadSW({ network: { [en]: res("english") } });
  await fire(sw.handlers, en, "GET", "navigate").responded;
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(sw.put, [`${ORIGIN}/?lang=en`]);
});

test("the search-insensitive match is for navigations only", async () => {
  // app.js?v=off1 must never be answered with app.js?v=near1: the ?v= pin is
  // the whole cache-busting mechanism, and ignoring it would pin a visitor to
  // the previous deploy's JavaScript indefinitely.
  const old = `${ORIGIN}/app.js?v=near1`;
  const { handlers } = loadSW({ cached: { [old]: res("stale code") } });
  const answer = await fire(handlers, `${ORIGIN}/app.js?v=off1`).responded;
  assert.equal(answer.type, "error", "a pinned asset matched a different pin");
});
