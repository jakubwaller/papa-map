import test from "node:test";
import assert from "node:assert/strict";
import { locateNative, loadJSONNative, formatDiagnostics, MAX_COLS } from "./native.js";

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
    replace: async (from, to) => {
      io.log.push(`replace ${to}`);
      if (replaceFails) throw new Error("rename failed");
      files[to] = files[from]; delete files[from];
    },
    remove: async (path) => { io.log.push(`remove ${path}`); delete files[path]; },
    // The stat the loader asks before it decides how long to wait. Not logged:
    // it is bookkeeping, and the log assertions above are about the I/O.
    size: async (path) => (path in files ? JSON.stringify(files[path]).length : null),
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
// Both of the loader's clocks, wound down to test length.
const BRIEF = { copyMs: 30, netMs: 30 };

test("online: the download becomes the copy, and the map is drawn from that very file", async () => {
  const io = fakeIO();
  const r = await loadJSONNative("data/changing_tables.geojson?v=1", io);
  assert.deepEqual(r, { json: { n: 1 }, fromStore: false });
  assert.deepEqual(io.files, { [COPY]: { n: 1 } });
  assert.deepEqual(io.log, [`download ${COPY}.new`, `read ${COPY}.new`, `replace ${COPY}`]);
});

test("offline: the stored copy, and it says so", async () => {
  const io = fakeIO({ net: false, files: { [COPY]: { n: 0 } } });
  assert.deepEqual(await loadJSONNative("data/changing_tables.geojson", io), { json: { n: 0 }, fromStore: true });
});

test("offline with nothing stored is null, not a throw", async () => {
  assert.equal(await loadJSONNative("data/stats.json", fakeIO({ net: false })), null);
});

test("a download that does not parse never replaces the good copy", async () => {
  const io = fakeIO({ body: "garbage", files: { [COPY]: { n: 0 } } });
  io.get = async () => { throw new Error("same garbage"); };
  const r = await loadJSONNative("data/changing_tables.geojson", io);
  assert.deepEqual(r, { json: { n: 0 }, fromStore: true });
  assert.deepEqual(io.files[COPY], { n: 0 });
  assert.ok(!io.log.includes(`replace ${COPY}`));
  assert.ok(!(`${COPY}.new` in io.files), "the 18 MB that did not parse are not left in the backup");
});

test("a swap that fails loses nothing: today's map is drawn, and offline the .new file is the copy", async () => {
  const files = {};
  const r = await loadJSONNative("data/changing_tables.geojson", fakeIO({ files, replaceFails: true }));
  assert.deepEqual(r, { json: { n: 1 }, fromStore: false });
  // The next launch, in airplane mode: `path` was never written, `.new` was.
  const off = await loadJSONNative("data/changing_tables.geojson", fakeIO({ net: false, files }));
  assert.deepEqual(off, { json: { n: 1 }, fromStore: true });
});

test("offline, the good copy is preferred to a .new beside it", async () => {
  const io = fakeIO({ net: false, files: { [COPY]: { n: 0 }, [`${COPY}.new`]: "garbage" } });
  assert.deepEqual(await loadJSONNative("data/changing_tables.geojson", io), { json: { n: 0 }, fromStore: true });
});

// The bug behind build 18 and build 19: in airplane mode neither call comes
// back, and boot() waited on both of them — 1283 s on the bench — while the
// copy on the phone sat there readable in under a tenth of a second. Without
// the loader's own clock these two never finish at all.
test("a network that never answers does not hold the stored copy back", async () => {
  const io = fakeIO({ hangs: ["download", "get"], files: { [COPY]: { n: 0 } } });
  const started = Date.now();
  assert.deepEqual(await loadJSONNative("data/changing_tables.geojson", io, BRIEF),
                   { json: { n: 0 }, fromStore: true });
  assert.ok(Date.now() - started < 2000, "the loader stopped waiting, the phone answered");
});

test("a page fetch that never answers is let go too, and shares the one budget", async () => {
  // The downloader refuses at once; the fallback is the call that hangs, and
  // it must not be granted a fresh clock of its own.
  const io = fakeIO({ downloader: false, hangs: ["get"], files: { [COPY]: { n: 0 } } });
  assert.deepEqual(await loadJSONNative("data/changing_tables.geojson", io, BRIEF),
                   { json: { n: 0 }, fromStore: true });
  assert.deepEqual(io.log, [`download ${COPY}.new`, "get", `read ${COPY}`]);
});

test("a network that never answers and nothing stored is null, not a wait", async () => {
  assert.equal(await loadJSONNative("data/stats.json", fakeIO({ hangs: ["download", "get"] }), BRIEF),
               null);
});

// A phone the OS already calls offline is asked nothing: waiting for a request
// to fail is waiting, and the copy is right there. (The reverse is not true —
// a Wi-Fi with no internet still reports onLine, so only `false` is acted on.)
test("offline by the OS's own account: the copy answers and the network is not asked", async () => {
  const note = {};
  // The network would answer here; onLine says there is none, and that settles it.
  const io = fakeIO({ files: { [COPY]: { n: 0 } } });
  assert.deepEqual(await loadJSONNative("data/changing_tables.geojson", io, { online: false, note }),
                   { json: { n: 0 }, fromStore: true });
  assert.deepEqual(io.log, [`read ${COPY}`], "no download, no fetch, no wait");
  assert.equal(note.step, "stored");
  assert.equal(note.online, false);
});

test("offline with nothing stored still tries: there is nothing to shortcut to", async () => {
  const io = fakeIO({ net: false });
  assert.equal(await loadJSONNative("data/stats.json", io, { online: false, ...BRIEF }), null);
  assert.ok(io.log.includes("download papamap/data/stats.json.new"),
            "the shortcut needs a copy to cut to; without one the long way is the only way");
});

test("the clock is short when a copy can answer and long when nothing can", async () => {
  const clocks = { copyMs: 20, netMs: 600 };
  let began = Date.now();
  await loadJSONNative("data/changing_tables.geojson",
                       fakeIO({ hangs: ["download", "get"], files: { [COPY]: { n: 0 } } }), clocks);
  const withCopy = Date.now() - began;

  began = Date.now();
  assert.equal(await loadJSONNative("data/changing_tables.geojson",
                                    fakeIO({ hangs: ["download", "get"] }), clocks), null);
  const withNothing = Date.now() - began;

  assert.ok(withCopy < 300, `a copy on the phone is not made to wait (${withCopy} ms)`);
  assert.ok(withNothing >= 550,
            `with nothing stored the download keeps its long rope (${withNothing} ms)`);
});

// A download the page stopped waiting for is not a download that stopped. On a
// link too slow to make the clock, every launch would otherwise abandon it,
// read the same `path` again and never refresh — the copy would freeze for
// good — so the one that was let go is promoted when it lands.
function slowIO(files, lands) {
  const io = fakeIO({ files });
  io.download = async (_url, p) => {
    io.log.push(`download ${p}`);
    files[p] = await new Promise((settle) => { lands.settle = settle; });
  };
  return io;
}

test("a download the clock let go of becomes the copy when it finally lands", async () => {
  const files = { [COPY]: { n: 0 } }, lands = {};
  const io = slowIO(files, lands);
  assert.deepEqual(await loadJSONNative("data/changing_tables.geojson", io, BRIEF),
                   { json: { n: 0 }, fromStore: true }, "the phone answered while it ran");
  lands.settle({ n: 9 });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(files[COPY], { n: 9 }, "and the next launch has today's data");
  assert.ok(!(`${COPY}.new` in files), "nothing left beside it");
});

test("a late download that does not parse is dropped and the good copy stands", async () => {
  const files = { [COPY]: { n: 0 } }, lands = {};
  const io = slowIO(files, lands);
  await loadJSONNative("data/changing_tables.geojson", io, BRIEF);
  lands.settle("garbage");
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(files[COPY], { n: 0 }, "a file that does not parse replaces nothing");
  assert.ok(!(`${COPY}.new` in files), "and does not stay to be read as a fallback");
});

// The promotion moves the very two files the stored read is working through,
// and on iOS a rename over an existing destination is refused, so the ordinary
// promotion is: delete `path`, then rename `.new` onto it. Run while an 18 MB
// read is in flight — seconds, on a phone — that unlinks one file and consumes
// the other underneath the reader, and a link finishing just after the clock
// would leave the map with no pins at all: the very failure being fixed here.
test("a download landing mid-read is promoted only once the read has finished", async () => {
  const files = { [COPY]: { n: 0 } }, lands = {};
  const io = slowIO(files, lands);
  const order = [];
  const read = io.read, replace = io.replace;
  io.read = async (p) => {
    if (p === COPY) {
      lands.settle({ n: 9 });                               // it lands mid-read
      await new Promise((r) => setTimeout(r, 20));
      order.push("the copy was read whole");
    }
    return read(p);
  };
  io.replace = async (from, to) => { order.push("and only then replaced"); return replace(from, to); };

  assert.deepEqual(await loadJSONNative("data/changing_tables.geojson", io, BRIEF),
                   { json: { n: 0 }, fromStore: true }, "the reader still got their pins");
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(order, ["the copy was read whole", "and only then replaced"]);
  assert.deepEqual(files[COPY], { n: 9 }, "and the promotion still happened");
});

test("with the clock already spent the fallback fetch is never issued", async () => {
  const io = fakeIO({ hangs: ["download"], files: { [COPY]: { n: 0 } } });
  await loadJSONNative("data/changing_tables.geojson", io, BRIEF);
  assert.ok(!io.log.includes("get"),
            "a second copy of the dataset, over a metered link, that nobody would wait for");
});

// ---- The note, and the block the offline dialog prints from it ----
test("the note names the path that answered, with the size of what was on the phone", async () => {
  const fresh = {};
  await loadJSONNative("data/stats.json", fakeIO(), { note: fresh });
  assert.deepEqual({ ...fresh, ms: 0 },
                   { file: "stats.json", step: "download", ms: 0, online: true, bytes: null });

  const fell = {};
  await loadJSONNative("data/stats.json", fakeIO({ downloader: false }), { note: fell });
  assert.equal(fell.step, "fetch");

  const kept = {};
  const copy = { "papamap/data/stats.json": { n: 0 } };
  await loadJSONNative("data/stats.json", fakeIO({ net: false, files: copy }),
                       { note: kept, ...BRIEF });
  assert.equal(kept.step, "stored");
  assert.equal(kept.bytes, JSON.stringify({ n: 0 }).length);

  const half = {};
  await loadJSONNative("data/stats.json",
                       fakeIO({ net: false, files: { "papamap/data/stats.json.new": { n: 2 } } }),
                       { note: half, ...BRIEF });
  assert.equal(half.step, "stored-new", "the half-swapped file names itself as one");

  const nothing = {};
  await loadJSONNative("data/stats.json", fakeIO({ net: false }), { note: nothing, ...BRIEF });
  assert.deepEqual({ ...nothing, ms: 0 },
                   { file: "stats.json", step: "none", ms: 0, online: true, bytes: null });
});

test("the diagnostics block lines the four files up under the pin", () => {
  const notes = [
    { file: "changing_tables.geojson", step: "stored", ms: 118, online: false, bytes: 18489463 },
    { file: "stats.json", step: "none", ms: 20014, online: false, bytes: null },
  ];
  assert.equal(formatDiagnostics(notes, "appN"), [
    "appN · online=false",
    "changing_tables stored 118ms   18489463 B",
    "stats           none   20014ms no copy",
  ].join("\n"));
  assert.equal(formatDiagnostics([], "appN"), "", "nothing loaded, nothing to say");
});

// Nothing wider than a phone: the byte count is the number the block exists to
// show, and a line that wraps is one that hides it. The case to hold is not a
// typical launch but the widest row the loader can produce — the longest file
// name, the longest step, six digits of milliseconds and eight of bytes.
test("even the widest row the loader can write fits the block", () => {
  const worst = [{
    file: "changing_tables.geojson",   // the longest of the four
    step: "stored-new",               // the longest of the five steps
    ms: 120014,                        // six digits
    online: false,
    bytes: 18489463,                   // eight digits
  }];
  const lines = formatDiagnostics(worst, "app23").split("\n");
  assert.equal(lines[1], "changing_tables stored-new 120014ms 18489463 B");
  for (const line of lines) {
    assert.ok(line.length <= MAX_COLS, `"${line}" is ${line.length} of ${MAX_COLS} columns`);
  }
});

test("a failing downloader with a network there still draws the live map", async () => {
  const io = fakeIO({ downloader: false, files: { [COPY]: { n: 0 } } });
  assert.deepEqual(await loadJSONNative("data/changing_tables.geojson", io), { json: { n: 1 }, fromStore: false });
});

// Not a rejection but a throw, which is what a missing Filesystem plugin gives:
// `fs.downloadFile` is then undefined and calling it raises on the spot. The
// download has to be started outside the try that guards it — the clock must be
// able to let go of it and still leave something to come back to — so it is
// that start which must not be allowed to throw past the loader and take
// boot()'s Promise.all down with it. The test above passes either way; this one
// does not, because its fake is not an async function.
test("a downloader that is not there at all still lets the page's own fetch draw the map", async () => {
  const io = fakeIO({ files: { [COPY]: { n: 0 } } });
  io.download = () => { throw new TypeError("fs.downloadFile is not a function"); };
  assert.deepEqual(await loadJSONNative("data/changing_tables.geojson", io, BRIEF),
                   { json: { n: 1 }, fromStore: false });
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
