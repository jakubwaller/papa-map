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
  const put = [];
  const cache = {
    match: async (req, opts) => {
      if (cached[req.url]) return cached[req.url];
      if (!opts?.ignoreSearch) return undefined;
      const bare = (u) => u.split("?")[0];
      const k = Object.keys(cached).find((u) => bare(u) === bare(req.url));
      return k ? cached[k] : undefined;
    },
    put: async (req, res) => { put.push(req.url); },
    addAll: async () => {},
  };
  const ctx = {
    self: {
      addEventListener: (type, fn) => { handlers[type] = fn; },
      location: { origin: ORIGIN },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: { open: async () => cache, keys: async () => [], delete: async () => {} },
    fetch: async (req) => {
      if (!(req.url in network)) throw new TypeError("offline");
      return network[req.url];
    },
    Response, URL, console,
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { handlers, put };
}

const res = (body, { ok = true, type = "basic" } = {}) =>
  ({ ok, type, body, clone() { return this; } });

// Fire a fetch event and report whether the worker took it over at all.
function fire(handlers, url, method = "GET", mode = "no-cors") {
  const e = { request: { url, method, mode }, responded: undefined,
              respondWith(p) { this.responded = p; } };
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

test("same-origin assets are served from the cache when there is a hit", async () => {
  const url = `${ORIGIN}/data/changing_tables.geojson`;
  const { handlers } = loadSW({ cached: { [url]: res("stored") } });
  const e = fire(handlers, url);
  assert.notEqual(e.responded, undefined, "same-origin request was not handled");
  assert.equal((await e.responded).body, "stored");
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

test("the search-insensitive match is for navigations only", async () => {
  // app.js?v=off1 must never be answered with app.js?v=near1: the ?v= pin is
  // the whole cache-busting mechanism, and ignoring it would pin a visitor to
  // the previous deploy's JavaScript indefinitely.
  const old = `${ORIGIN}/app.js?v=near1`;
  const { handlers } = loadSW({ cached: { [old]: res("stale code") } });
  const answer = await fire(handlers, `${ORIGIN}/app.js?v=off1`).responded;
  assert.equal(answer.type, "error", "a pinned asset matched a different pin");
});
