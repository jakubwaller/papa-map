import test from "node:test";
import assert from "node:assert/strict";
import { locateNative, loadJSONNative, budget } from "./native.js";

// A Geolocation plugin that plays back fixes: [ms, accuracy in metres].
function fakeGeo(fixes, { permission = "granted" } = {}) {
  const geo = {
    cleared: [],
    checkPermissions: async () => ({ location: permission }),
    requestPermissions: async () => ({ location: permission === "prompt" ? "granted" : permission }),
    watchPosition: async (_opts, cb) => {
      for (const [ms, accuracy] of fixes) {
        setTimeout(() => cb({ coords: { latitude: 53.55, longitude: 9.99, accuracy } }), ms);
      }
      return "watch-1";
    },
    clearWatch: async ({ id }) => { geo.cleared.push(id); },
  };
  return geo;
}
const FAST = { good: 100, soft: 60, hard: 200 };

test("the first fix good to 100 m wins without waiting for a better one", async () => {
  const geo = fakeGeo([[5, 1500], [15, 65], [40, 5]]);
  const c = await locateNative(geo, FAST);
  assert.equal(c.accuracy, 65);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(geo.cleared, ["watch-1"]);
});

test("after the soft limit the best coarse fix is taken", async () => {
  const c = await locateNative(fakeGeo([[5, 1500], [20, 400], [150, 10]]), FAST);
  assert.equal(c.accuracy, 400);
});

test("no fix before the soft limit: the next one to arrive, however coarse", async () => {
  const c = await locateNative(fakeGeo([[90, 800]]), FAST);
  assert.equal(c.accuracy, 800);
});

test("nothing at all fails at the hard limit, and the watch is cleared", async () => {
  const geo = fakeGeo([]);
  await assert.rejects(locateNative(geo, FAST), /timeout/);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(geo.cleared, ["watch-1"]);
});

test("a first-run prompt is asked, a refusal fails without starting a watch", async () => {
  const c = await locateNative(fakeGeo([[5, 20]], { permission: "prompt" }), FAST);
  assert.equal(c.accuracy, 20);
  const denied = fakeGeo([[5, 20]], { permission: "denied" });
  denied.watchPosition = () => { throw new Error("must not watch"); };
  await assert.rejects(locateNative(denied, FAST), /denied/);
});

// ---- citiesToMount ----
import { citiesToMount } from "./native.js";
const HH = { slug: "hamburg", bbox: [9.7, 53.4, 10.3, 53.75] };
const HB = { slug: "bremen", bbox: [8.5, 53.0, 9.0, 53.2] };
const KI = { slug: "kiel", bbox: [10.0, 54.25, 10.25, 54.45] };
const MUC = { slug: "muenchen", bbox: [11.35, 48.05, 11.75, 48.25] };

test("only the cities the view touches are mounted", () => {
  const view = [9.9, 53.5, 10.1, 53.6];
  assert.deepEqual(citiesToMount([HH, HB, MUC], view, { lat: 53.55, lon: 10.0 }, 13).map((c) => c.slug), ["hamburg"]);
  assert.deepEqual(citiesToMount([HB, MUC], view, { lat: 53.55, lon: 10.0 }, 13), []);
});

test("a view over several cities keeps the two nearest its centre", () => {
  const view = [8.0, 52.8, 10.5, 54.6];
  assert.deepEqual(citiesToMount([HB, KI, HH, MUC], view, { lat: 53.6, lon: 10.0 }, 9).map((c) => c.slug),
                   ["hamburg", "kiel"]);
});

test("zoomed out there is no opinion, so nothing is unmounted or read", () => {
  assert.equal(citiesToMount([HH, MUC], [-10, 35, 30, 60], { lat: 50, lon: 10 }, 5), null);
});

// The phone's files and the network, played back: `net` is whether papamap.de
// answers, `files` what is on the phone. Every call is logged.
//
// `hangs` names the calls that neither answer nor refuse, which is what a
// phone with no route out actually gives: the request sits on a connect
// timeout. Every other case here settles, and that is precisely why the
// loader's unbounded waits went unnoticed until a phone met them.
function fakeIO({ net = true, downloader = true, files = {}, body = { n: 1 }, replaceFails = false,
                  hangs = [] } = {}) {
  const forever = () => new Promise(() => {});
  // Raw text, the way a real file on the phone is: an object round-trips
  // through JSON.stringify, and the "garbage" sentinel is left exactly as it
  // is — a bare word, not valid JSON — so JSON.parse rejects it the way a
  // truncated download would be.
  const asText = (v) => (typeof v === "string" ? v : JSON.stringify(v));
  const io = {
    log: [], files,
    download: async (url, path) => {
      io.log.push(`download ${path}`);
      if (hangs.includes("download")) return forever();
      if (!net || !downloader) throw new Error("download failed");
      files[path] = body;
    },
    read: async (path) => {
      io.log.push(`read ${path}`);
      if (!(path in files)) throw new Error("no such file");
      if (files[path] === "garbage") throw new SyntaxError("not JSON");
      return files[path];
    },
    text: async (path) => {
      io.log.push(`text ${path}`);
      if (!(path in files)) throw new Error("no such file");
      return asText(files[path]);
    },
    replace: async (from, to) => {
      io.log.push(`replace ${to}`);
      if (replaceFails) throw new Error("rename failed");
      files[to] = files[from]; delete files[from];
    },
    remove: async (path) => { io.log.push(`remove ${path}`); delete files[path]; },
    get: async () => {
      io.log.push("get");
      if (hangs.includes("get")) return forever();
      if (!net) throw new Error("offline");
      return body;
    },
  };
  return io;
}
const COPY = "papamap/data/changing_tables.geojson";
// The no-copy path's own clock, wound down to test length.
const BRIEF = { netMs: 30 };

test("no copy, online: the download becomes the copy, and the map is drawn from that very file", async () => {
  const io = fakeIO();
  const r = await loadJSONNative("data/changing_tables.geojson?v=1", io);
  assert.deepEqual({ json: r.json, fromStore: r.fromStore }, { json: { n: 1 }, fromStore: false });
  assert.deepEqual(await r.refreshed, { ok: true, json: null }, "already fresh: nothing left to refresh");
  assert.deepEqual(io.files, { [COPY]: { n: 1 } });
  assert.deepEqual(io.log, [`text ${COPY}`, `text ${COPY}.new`, `download ${COPY}.new`,
                            `read ${COPY}.new`, `replace ${COPY}`]);
});

test("no copy, offline: null, not a throw", async () => {
  assert.equal(await loadJSONNative("data/stats.json", fakeIO({ net: false })), null);
});

test("no copy, offline, still tries: there is nothing to shortcut to", async () => {
  const io = fakeIO({ net: false });
  assert.equal(await loadJSONNative("data/stats.json", io, BRIEF), null);
  assert.ok(io.log.includes("download papamap/data/stats.json.new"),
            "the shortcut needs a copy to cut to; without one the long way is the only way");
});

test("no copy: a swap that fails loses nothing today, and offline the .new file is the copy", async () => {
  const files = {};
  const r = await loadJSONNative("data/changing_tables.geojson", fakeIO({ files, replaceFails: true }));
  assert.deepEqual({ json: r.json, fromStore: r.fromStore }, { json: { n: 1 }, fromStore: false });
  // The next launch, in airplane mode: `path` was never written, `.new` was.
  const off = await loadJSONNative("data/changing_tables.geojson", fakeIO({ net: false, files }));
  assert.deepEqual({ json: off.json, fromStore: off.fromStore }, { json: { n: 1 }, fromStore: true });
});

// The bug behind build 18 and build 19: in airplane mode neither call comes
// back. Without the loader's own clock, the no-copy path never finishes at all.
test("no copy, a network that never answers is null, not an unbounded wait", async () => {
  const started = Date.now();
  assert.equal(await loadJSONNative("data/stats.json", fakeIO({ hangs: ["download", "get"] }), BRIEF), null);
  assert.ok(Date.now() - started < 2000, "the loader stopped waiting");
});

test("no copy: a page fetch that never answers is let go too, and shares the one budget", async () => {
  // The downloader refuses at once; the fallback is the call that hangs, and
  // it must not be granted a fresh clock of its own.
  const io = fakeIO({ downloader: false, hangs: ["get"] });
  assert.equal(await loadJSONNative("data/stats.json", io, BRIEF), null);
  assert.ok(!io.log.includes(`replace papamap/data/stats.json`));
});

test("no copy: with the clock already spent the fallback fetch is never issued", async () => {
  const io = fakeIO({ hangs: ["download"] });
  await loadJSONNative("data/changing_tables.geojson", io, BRIEF);
  assert.ok(!io.log.includes("get"),
            "a second copy of the dataset, over a metered link, that nobody would wait for");
});

// Not a rejection but a throw, which is what a missing Filesystem plugin gives:
// `fs.downloadFile` is then undefined and calling it raises on the spot. The
// download has to be started outside the try that guards it — the clock must
// be able to let go of it and still leave something to come back to — so it
// is that start which must not be allowed to throw past the loader and take
// boot()'s Promise.all down with it.
test("no copy, no downloader at all: the page's own fetch still draws the map", async () => {
  const io = fakeIO();
  io.download = () => { throw new TypeError("fs.downloadFile is not a function"); };
  const r = await loadJSONNative("data/changing_tables.geojson", io, BRIEF);
  assert.deepEqual({ json: r.json, fromStore: r.fromStore }, { json: { n: 1 }, fromStore: false });
});

// ---- A copy on the phone draws first, on every launch ----
// The core of "copy first": no clock, no network question, in front of the
// pins — build 21 spent the old eight-second wait in airplane mode because
// `navigator.onLine`-by-way-of-the-Network-plugin read `online=true (native)`
// there, an auto-connect VPN profile making iOS say the network was reachable
// with no route out. There is no longer any such question to get wrong.
test("a copy on the phone draws at once, however long the background refresh takes", async () => {
  const io = fakeIO({ hangs: ["download"], files: { [COPY]: { n: 0 } } });
  const started = Date.now();
  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual({ json: r.json, fromStore: r.fromStore }, { json: { n: 0 }, fromStore: true });
  assert.ok(Date.now() - started < 200, "the copy did not wait on the network at all");
  assert.equal(typeof r.refreshed.then, "function", "a promise, not awaited here — it may never settle");
});

test("only .new on the phone: it is read, promoted out of .new before anything downloads, and the refresh does not start until that read is done", async () => {
  const files = { [`${COPY}.new`]: { n: 0 } };
  const io = fakeIO({ files, body: { n: 9 } });
  const order = [];
  const text = io.text, download = io.download, replace = io.replace;
  io.text = async (p) => { const v = await text(p); order.push(`text ${p}`); return v; };
  io.replace = async (from, to) => { const v = await replace(from, to); order.push(`replace ${to}`); return v; };
  io.download = async (u, p) => { order.push(`download ${p}`); return download(u, p); };

  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual({ json: r.json, fromStore: r.fromStore }, { json: { n: 0 }, fromStore: true });
  const refreshed = await r.refreshed;   // waited on before reading `order`: the promotion and the
                                          // download it guards both run unawaited by loadJSONNative
                                          // itself, so `order` is only complete once this settles.
  // The read of the only copy there is finishes, that copy is promoted to
  // `path` (so the download about to write into `.new` cannot land on it),
  // and only then does the download itself begin. What follows (a second
  // text read and a second promotion) is the download's own landing, covered
  // by the background-refresh tests below.
  assert.deepEqual(order.slice(0, 3), [`text ${COPY}.new`, `replace ${COPY}`, `download ${COPY}.new`]);
  assert.deepEqual(refreshed, { ok: true, json: { n: 9 } });
  assert.deepEqual(files[COPY], { n: 9 });
  assert.ok(!(`${COPY}.new` in files));
});

test("a copy beats a .new beside it, the same order a promotion respects", async () => {
  const io = fakeIO({ net: false, files: { [COPY]: { n: 0 }, [`${COPY}.new`]: "garbage" } });
  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual({ json: r.json, fromStore: r.fromStore }, { json: { n: 0 }, fromStore: true });
  assert.deepEqual(await r.refreshed, { ok: false, json: null });
});

// ---- The one copy on the phone is `.new`, and the refresh must not lose it ----
// The download the refresh starts writes into `fresh` (== `.new`), which in
// this situation is also the file the copy was just read from. Promoting it
// to `path` before the download runs is what keeps every rule below —
// "unchanged, remove `fresh`", "garbage, remove `fresh`" — from deleting the
// reader's only copy instead of a spare one.
test(".new-only, the download turns out identical: promoted to path first, then thrown away, not the copy", async () => {
  const files = { [`${COPY}.new`]: { n: 0 } };
  const io = fakeIO({ files, body: { n: 0 } });   // the same content, word for word
  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual({ json: r.json, fromStore: r.fromStore }, { json: { n: 0 }, fromStore: true });
  assert.deepEqual(await r.refreshed, { ok: true, json: null });
  assert.deepEqual(files, { [COPY]: { n: 0 } }, "the copy now lives at `path`, and nothing is left at `.new`");
});

test(".new-only, the download is a 200 that is not JSON: the copy survives at path, reported failed", async () => {
  const files = { [`${COPY}.new`]: { n: 0 } };
  const io = fakeIO({ files, body: "garbage" });   // a captive portal's login page, say
  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual({ json: r.json, fromStore: r.fromStore }, { json: { n: 0 }, fromStore: true });
  assert.deepEqual(await r.refreshed, { ok: false, json: null });
  assert.deepEqual(files, { [COPY]: { n: 0 } },
                   "promoted to `path` before the garbage response could delete the only copy there was");
});

test(".new-only, the promotion itself fails: no download is risked, and the copy is left exactly where it was", async () => {
  const files = { [`${COPY}.new`]: { n: 0 } };
  const io = fakeIO({ files, replaceFails: true });
  const calls = [];
  const download = io.download;
  io.download = async (u, p) => { calls.push(p); return download(u, p); };
  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual({ json: r.json, fromStore: r.fromStore }, { json: { n: 0 }, fromStore: true });
  assert.deepEqual(await r.refreshed, { ok: false, json: null });
  assert.deepEqual(calls, [], "a good copy is worth more than a chance at a fresher one: no download is even tried");
  assert.deepEqual(files, { [`${COPY}.new`]: { n: 0 } }, "still readable, right where it was");
});

// ---- The background refresh a stored copy starts ----
test("a background refresh that finds something new promotes it and hands it back", async () => {
  const files = { [COPY]: { n: 0 } };
  const io = fakeIO({ files, body: { n: 9 } });
  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual(r.json, { n: 0 }, "the copy drew first");
  assert.deepEqual(await r.refreshed, { ok: true, json: { n: 9 } });
  assert.deepEqual(files[COPY], { n: 9 }, "and is now the copy on the phone");
  assert.ok(!(`${COPY}.new` in files));
});

test("a background refresh that finds the same thing again reports unchanged, and nothing redraws", async () => {
  const files = { [COPY]: { n: 0 } };
  const io = fakeIO({ files, body: { n: 0 } });
  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual(await r.refreshed, { ok: true, json: null });
  assert.deepEqual(files[COPY], { n: 0 }, "the copy is untouched");
  assert.ok(!(`${COPY}.new` in files), "and nothing is left beside it");
});

test("a background refresh the network refuses reports failed and leaves the copy alone", async () => {
  const files = { [COPY]: { n: 0 } };
  const io = fakeIO({ files, net: false });
  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual(await r.refreshed, { ok: false, json: null });
  assert.deepEqual(files, { [COPY]: { n: 0 } });
});

test("a background refresh that downloads garbage is dropped, never promoted", async () => {
  const files = { [COPY]: { n: 0 } };
  const io = fakeIO({ files, body: "garbage" });
  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual(await r.refreshed, { ok: false, json: null });
  assert.deepEqual(files, { [COPY]: { n: 0 } },
                   "the file that did not parse never replaces a good copy");
});

test("a background refresh never rejects, even when the downloader throws synchronously", async () => {
  const io = fakeIO({ files: { [COPY]: { n: 0 } } });
  io.download = () => { throw new TypeError("fs.downloadFile is not a function"); };
  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual(r.json, { n: 0 });
  await assert.doesNotReject(r.refreshed);
  assert.deepEqual(await r.refreshed, { ok: false, json: null });
});

// ---- The note: which of the loader's paths answered ----
test("the note names the path that answered, with the size of what was on the phone", async () => {
  const fresh = {};
  await loadJSONNative("data/stats.json", fakeIO(), { note: fresh });
  assert.deepEqual({ ...fresh, ms: 0 }, { file: "stats.json", step: "download", ms: 0, bytes: null });

  const fell = {};
  await loadJSONNative("data/stats.json", fakeIO({ downloader: false }), { note: fell });
  assert.equal(fell.step, "fetch");

  const kept = {};
  const copy = { "papamap/data/stats.json": { n: 0 } };
  await loadJSONNative("data/stats.json", fakeIO({ files: copy }), { note: kept });
  assert.equal(kept.step, "stored");
  assert.equal(kept.bytes, JSON.stringify({ n: 0 }).length);

  const half = {};
  await loadJSONNative("data/stats.json",
                       fakeIO({ files: { "papamap/data/stats.json.new": { n: 2 } } }),
                       { note: half });
  assert.equal(half.step, "stored-new", "the half-swapped file names itself as one");

  const nothing = {};
  await loadJSONNative("data/stats.json", fakeIO({ net: false }), { note: nothing, ...BRIEF });
  assert.deepEqual({ ...nothing, ms: 0 }, { file: "stats.json", step: "none", ms: 0, bytes: null });
});

// A timer can go off a millisecond before Date.now() reaches the deadline it
// was set for. The clock that let go must still say it is spent, or the
// download it let go of is forgotten and a fetch nobody can hear is issued.
test("a clock whose timer has fired is spent, whatever the wall clock reads", async () => {
  const net = budget(10, () => 0);                          // a wall clock that never moves
  assert.equal(net.spent(), false, "not before the timer");
  await assert.rejects(net(new Promise(() => {})), /timed out/);
  assert.equal(net.spent(), true, "the timer going off is the budget being spent");
});

// ---- externalUrl: which links are told they are opened inside the app ----
import { externalUrl, SITE } from "./native.js";

test("a page of the site is flagged, wherever the link came from", () => {
  assert.equal(externalUrl("methods.html"), `${SITE}methods.html?app=1`);
  assert.equal(externalUrl("wickeltische/hamburg.html"),
               `${SITE}wickeltische/hamburg.html?app=1`);
  assert.equal(externalUrl("https://papamap.de/wickeltische/"),
               `${SITE}wickeltische/?app=1`);
});

test("the query and the fragment the link carried survive", () => {
  assert.equal(externalUrl("?bbox=9.7,53.4,10.3,53.8"),
               `${SITE}?bbox=9.7%2C53.4%2C10.3%2C53.8&app=1`);
  assert.equal(externalUrl("methods.html#contribute"),
               `${SITE}methods.html?app=1#contribute`);
  assert.equal(externalUrl("wickeltische/rangliste.html?sort=share#top"),
               `${SITE}wickeltische/rangliste.html?sort=share&app=1#top`);
});

test("nobody else's URL is touched", () => {
  for (const url of ["https://www.openstreetmap.org/node/1?x=2#map=19/53/9",
                     "https://mapcomplete.org/papamap.html?lat=53#welcome",
                     "https://ko-fi.com/jakubwaller"]) {
    assert.equal(externalUrl(url), url);
  }
});

test("a flag already there is not doubled", () => {
  assert.equal(externalUrl("methods.html?app=1"), `${SITE}methods.html?app=1`);
});

// ---- Directions on iOS: the cascade ----
// Only step 2 (Apple Maps) can be seen in a simulator and only steps 1, 3 and 4
// matter on the phone this was written for, so the decision is a pure function
// and this is where it is actually checked. `has` is what the OS answered.
import fs from "node:fs";
import { routePlan, planRoute, openRouteUrl, followRoute, routeWebUrl, NAV_APPS, ROUTE_SCHEMES } from "./native.js";

const has = (...schemes) => (s) => schemes.includes(s);
const RATHAUS = [53.550341, 9.992196];
const AT = "53.550341,9.992196";

test("the reader's own default navigation app comes first", () => {
  // Every other app in the world installed: the chosen one still wins.
  assert.deepEqual(routePlan(...RATHAUS, "Rathaus", has(...ROUTE_SCHEMES)),
                   { open: `geo-navigation:///directions?destination=${AT}` });
});

test("no default: Apple Maps, exactly the URL build 19 sent", () => {
  assert.deepEqual(routePlan(...RATHAUS, "Rathaus", has("maps", "comgooglemaps", "waze")),
                   { open: `maps://?q=Rathaus&ll=${AT}&daddr=${AT}` });
});

test("Apple Maps deleted and one navigation app installed: open it, don't ask", () => {
  assert.deepEqual(routePlan(...RATHAUS, "Rathaus", has("comgooglemaps")),
                   { open: `comgooglemaps://?daddr=${AT}` });
  assert.deepEqual(routePlan(...RATHAUS, "Rathaus", has("waze")),
                   { open: `waze://?ll=${AT}&navigate=yes` });
  assert.deepEqual(routePlan(...RATHAUS, "Rathaus", has("om")),
                   { open: `om://map?v=1&ll=${AT}&n=Rathaus` });
});

test("several installed and no default: the reader is asked, in NAV_APPS order", () => {
  const plan = routePlan(...RATHAUS, "", has("om", "waze", "comgooglemaps"));
  assert.equal(plan.open, undefined);
  assert.deepEqual(plan.choose.map((c) => c.name), ["Google Maps", "Waze", "Organic Maps"]);
  assert.equal(plan.choose[2].url, `om://map?v=1&ll=${AT}`);   // no name, no &n=
});

test("nothing installed at all: the open web, and the destination only", () => {
  const plan = routePlan(...RATHAUS, "Rathaus", () => false);
  assert.equal(plan.open, `https://www.google.com/maps/dir/?api=1&destination=${AT}`);
});

test("no travel mode is forced by any of them", () => {
  const seen = [];
  for (const s of ROUTE_SCHEMES) seen.push(routePlan(...RATHAUS, "Rathaus", has(s)).open);
  seen.push(routePlan(...RATHAUS, "Rathaus", () => false).open);
  for (const url of seen)
    assert.doesNotMatch(url, /directionsmode|travelmode|dirflg|[?&]type=/, url);
});

test("a name with an ampersand or a space cannot break the URL", () => {
  const plan = routePlan(...RATHAUS, "Kai & Co", has("om"));
  assert.equal(plan.open, `om://map?v=1&ll=${AT}&n=Kai%20%26%20Co`);
  assert.equal(routePlan(...RATHAUS, "Kai & Co", has("maps")).open,
               `maps://?q=Kai%20%26%20Co&ll=${AT}&daddr=${AT}`);
});

test("planRoute asks the OS about every scheme, once, and nothing else", async () => {
  const asked = [];
  const launcher = {
    canOpenUrl: async ({ url }) => { asked.push(url); return { value: url === "waze://" }; },
    openUrl: async () => ({ completed: true }),
  };
  const plan = await planRoute(...RATHAUS, "Rathaus", launcher);
  assert.deepEqual(asked.sort(), ROUTE_SCHEMES.map((s) => `${s}://`).sort());
  assert.deepEqual(plan, { open: `waze://?ll=${AT}&navigate=yes` });
});

test("a scheme the OS refuses to answer for counts as absent, not as an error", async () => {
  const launcher = {
    canOpenUrl: async ({ url }) => {
      if (url === "maps://") throw new Error("not in LSApplicationQueriesSchemes");
      return { value: url === "comgooglemaps://" };
    },
  };
  assert.deepEqual(await planRoute(...RATHAUS, "", launcher), { open: `comgooglemaps://?daddr=${AT}` });
});

test("with no AppLauncher at all planRoute fails, so the caller can follow the href", async () => {
  await assert.rejects(planRoute(...RATHAUS, "", undefined), /AppLauncher/);
});

test("every scheme the cascade can ask about is declared to iOS", () => {
  const plist = fs.readFileSync(new URL("../app/ios/App/App/Info.plist", import.meta.url), "utf8");
  const block = /<key>LSApplicationQueriesSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist);
  assert.ok(block, "Info.plist declares no LSApplicationQueriesSchemes");
  const declared = [...block[1].matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]);
  // canOpenURL answers "no" for anything unlisted, which would read here as
  // "the reader does not have that app" — silently, and wrongly.
  assert.deepEqual([...ROUTE_SCHEMES].sort(), [...declared].sort());
  assert.deepEqual(NAV_APPS.map((a) => a.scheme).filter((s) => !declared.includes(s)), []);
});

test("an open the OS declines counts as a failure, not as done", async () => {
  // AppLauncher resolves { completed: false } rather than rejecting.
  const declined = { openUrl: async () => ({ completed: false }) };
  await assert.rejects(openRouteUrl("maps://?daddr=1,2", declined), /not opened/);
  await openRouteUrl("maps://?daddr=1,2", { openUrl: async () => ({ completed: true }) });
});

test("a declined route falls back to the same route on the web, never to nothing", async () => {
  const web = routeWebUrl(...RATHAUS);
  assert.equal(web, `https://www.google.com/maps/dir/?api=1&destination=${AT}`);
  assert.equal(routePlan(...RATHAUS, "", () => false).open, web);
  const shown = [];
  const declined = { openUrl: async () => ({ completed: false }) };
  await followRoute(`comgooglemaps://?daddr=${AT}`, web, declined, (u) => shown.push(u));
  assert.deepEqual(shown, [web]);
  // An open that works shows nothing else.
  const opened = [];
  await followRoute(`comgooglemaps://?daddr=${AT}`, web,
    { openUrl: async ({ url }) => { opened.push(url); return { completed: true }; } }, (u) => shown.push(u));
  assert.deepEqual([opened, shown], [[`comgooglemaps://?daddr=${AT}`], [web]]);
  // The web URL itself declined (a phone with no navigation app at all): the
  // in-app browser still shows it — a tap is never answered with nothing.
  const last = [];
  await followRoute(web, web, declined, (u) => last.push(u));
  assert.deepEqual(last, [web]);
});

// ---- The deep link, whoever hands it over ----
import { onAppUrl, AUTH_REDIRECT } from "./native.js";

// A fake App plugin: it keeps the listeners and plays URLs back through them.
function fakeApp(launchUrl) {
  const listeners = {};
  return {
    plugin: {
      addListener: (event, fn) => { (listeners[event] ||= []).push(fn); },
      getLaunchUrl: async () => (launchUrl ? { url: launchUrl } : null),
    },
    open: (url) => { for (const fn of listeners.appUrlOpen ?? []) fn({ url }); },
  };
}
function withApp(app, run) {
  const before = globalThis.Capacitor;
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { App: app } };
  try { return run(); } finally { globalThis.Capacitor = before; }
}

// The page's end of the hand-over. The widget's tap, a cold start and — since
// the Siri answer's tap lost its URL somewhere in OpenURLIntent (build 20) —
// PapaMapSharePlugin posting the deep link itself all arrive down this one
// path, so what it accepts is what the Swift side has to send.
test("a papamap://table URL opens that table, whoever posted it", async () => {
  const app = fakeApp();
  const opened = [];
  withApp(app.plugin, () => onAppUrl({ auth: () => {}, table: (osm) => opened.push(osm) }));
  app.open("papamap://table?osm=https://www.openstreetmap.org/node/68609710");
  assert.deepEqual(opened, ["https://www.openstreetmap.org/node/68609710"]);
  // Twice is two opens: nothing here dedupes, so the Swift side hands a
  // tapped answer over exactly once (PendingTable.consume).
  app.open("papamap://table?osm=https://www.openstreetmap.org/node/1");
  assert.equal(opened.length, 2);
});

test("a cold start asks for the launch URL, and only a table opens a pin", async () => {
  const opened = [];
  const app = fakeApp("papamap://table?osm=https://www.openstreetmap.org/way/7");
  withApp(app.plugin, () => onAppUrl({ auth: () => {}, table: (osm) => opened.push(osm) }));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(opened, ["https://www.openstreetmap.org/way/7"]);
  // papamap://open is the answer that has no table to show: the app comes up,
  // the map stays where it was.
  app.open("papamap://open");
  assert.equal(opened.length, 1);
});

test("the OSM login's return leg is not mistaken for a table", () => {
  const app = fakeApp();
  const back = [], opened = [];
  withApp(app.plugin, () => onAppUrl({ auth: (u) => back.push(u), table: (osm) => opened.push(osm) }));
  app.open(`${AUTH_REDIRECT}?code=abc&state=xyz`);
  assert.deepEqual([back.length, opened.length], [1, 0]);
});
