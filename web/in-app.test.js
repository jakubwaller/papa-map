import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// in-app.js is a classic script — it has to be, because it runs from <head>
// before the first paint and a module would be deferred past it — so there is
// nothing to import. It is loaded into a vm context instead, the way sw.test.js
// loads the service worker: run it over a fake page, and see whether the class
// that hides the donate line landed on <html>.
const SRC = fs.readFileSync(new URL("./in-app.js", import.meta.url), "utf8");

// sessionStorage as the in-app browser has it: one object for a whole browsing
// session, thrown away when the reader dismisses it. `blocked` is the other
// case that happens on a real phone — private mode, site data switched off —
// where every access throws.
function fakeStorage({ blocked = false } = {}) {
  const data = new Map();
  return {
    getItem: (k) => { if (blocked) throw new Error("denied"); return data.has(k) ? data.get(k) : null; },
    setItem: (k, v) => { if (blocked) throw new Error("denied"); data.set(k, String(v)); },
    data,
  };
}

// One page load in that session: `search` is the URL's query. `seen` collects
// the address the script left behind.
function load(search, storage, { noStorage = false, seen = {} } = {}) {
  const classes = new Set();
  const win = {
    location: { search, href: "https://papamap.de/wickeltische/bremen.html" + search + "#top" },
    history: { state: null, replaceState: (_s, _t, href) => { seen.href = href; } },
    get sessionStorage() {
      if (noStorage) throw new Error("no storage in this context");
      return storage;
    },
  };
  const ctx = {
    window: win,
    URL,
    URLSearchParams,
    document: { documentElement: { classList: { add: (c) => classes.add(c) } } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return classes.has("in-app");
}

test("the flag leaves the address once the session remembers it", () => {
  const seen = {};
  assert.equal(load("?bbox=9,53,10,54&app=1", fakeStorage(), { seen }), true);
  assert.equal(seen.href, "https://papamap.de/wickeltische/bremen.html?bbox=9%2C53%2C10%2C54#top");
  // Nothing to remember it with: the flag stays, or a reload shows the line.
  const blocked = {};
  assert.equal(load("?app=1", fakeStorage({ blocked: true }), { seen: blocked }), true);
  assert.equal(blocked.href, undefined);
  // An ordinary visit is never rewritten.
  const plain = {};
  assert.equal(load("?bbox=9,53,10,54", fakeStorage(), { seen: plain }), false);
  assert.equal(plain.href, undefined);
});

test("the flagged load is marked, an ordinary visit is not", () => {
  assert.equal(load("?app=1", fakeStorage()), true);
  assert.equal(load("", fakeStorage()), false);
  assert.equal(load("?bbox=9,53,10,54", fakeStorage()), false);
  // Only the flag this app sets. A stray ?app= is not a yes.
  assert.equal(load("?app=", fakeStorage()), false);
  assert.equal(load("?app=0", fakeStorage()), false);
});

test("the flag rides along beside the params the page already had", () => {
  assert.equal(load("?bbox=9,53,10,54&app=1", fakeStorage()), true);
});

test("the rest of the in-app browser's session stays marked without the flag", () => {
  const session = fakeStorage();
  assert.equal(load("?app=1", session), true);          // the app opened a country page
  assert.equal(load("", session), true);                // "back to the map", no flag
  assert.equal(load("?lang=en", session), true);        // and on to the next page
  // A different session — the reader's own browser — never saw the flag.
  assert.equal(load("", fakeStorage()), false);
});

test("storage that throws costs the memory, not the flagged load", () => {
  assert.equal(load("?app=1", fakeStorage({ blocked: true })), true);
  assert.equal(load("", fakeStorage({ blocked: true })), false);
  // Some contexts refuse the property itself rather than the access.
  assert.equal(load("?app=1", null, { noStorage: true }), true);
  assert.equal(load("", null, { noStorage: true }), false);
});
