// The seam between the map and the phone. On the website every export here is
// inert: isNative() is false and app.js takes the branch it always took. In
// the store app (app/, a Capacitor shell around this same web/ tree) the
// Capacitor runtime injects window.Capacitor before app.js runs, and these
// functions reach the plugins through it — no bundler, no import of the
// npm packages, because the site ships plain ES modules and so does the app.
//
// What the app does that the page cannot:
//   - keep the dataset on the phone itself (no service worker runs under the
//     app's own scheme, so the last good copy lives in the app's data dir);
//   - keep a whole city's basemap on the phone (a PMTiles extract downloaded
//     from papamap.de/tiles/, rendered with the Protomaps style over the
//     usual raster tiles — offline, or simply always, once it is there);
//   - log in to OSM through the in-app browser and come back by URL;
//   - hand the tables to the iOS widget and the Siri shortcut (PapaMapShare,
//     a plugin of the app's own, app/ios/App/App/PapaMapSharePlugin.swift).
// Nothing here talks to any server but papamap.de and openstreetmap.org, and
// nothing is sent that the website does not send: a download is a GET.

export const SITE = "https://papamap.de/";
export const AUTH_REDIRECT = "papamap://auth";

const cap = () => globalThis.Capacitor;
export const isNative = () => !!cap()?.isNativePlatform?.();
export const platform = () => (isNative() ? cap().getPlatform() : "web");
const plugin = (name) => cap()?.Plugins?.[name];

// ---- Files: the dataset's last good copy, the downloaded cities ----
const DIR = "DATA";              // Directory.Data: the app's own, backed up, no user access
const DATA_PATH = "papamap/data";
const TILES_PATH = "papamap/tiles";

// The dataset's copy on the phone, written and read the way the city files
// are, because that way is known to work on a phone: the native downloader
// puts the file there and the page reads it back as a local URL. The first
// version handed 18 MB of GeoJSON across the bridge as one string, to write it
// and again to read it, and swallowed whatever went wrong: build 18 came up in
// airplane mode with the saved city and no pins (iPhone, 2026-09-18).
//
// Every wait for the network is one of two calls, and neither iOS nor WebKit
// bounds one usefully: a request into a black hole — airplane mode, a Wi-Fi
// with no route out, a captive portal — does not fail, it sits on a connect
// timeout. Measured against an address that drops packets (iPhone 17
// simulator, iOS 27, 18 Sep 2026): the native downloader took 75.2 s per
// file, and the page's own fetch, which WebKit serialises per host, took
// 975 s, 1050 s, 1125 s and 1200 s for the four files. So the page keeps its
// own clock, NET_MS, rather than trust either of those calls to give up on
// their own; the timeouts it hands the native downloader below are idle
// timeouts, not total ones, so they never cut a download that is still
// arriving.
//
// A copy already on the phone answers at once, on every launch — no clock in
// front of the pins, and no question asked of the network first. Build 21
// (TestFlight, the owner's iPhone) still spent the old eight-second wait in
// airplane mode: the loader's own note read `online=true (native)`, because
// an auto-connect VPN profile made iOS report the network reachable even
// with no route out (SCNetworkReachability answers the on-demand flags the
// profile sets, and the plugin the old code asked read those as connected).
// Turning the VPN off made the wait disappear. So no answer iOS can give to
// "is there a network" is trustworthy — not on that phone, and not on anyone
// else's with the same kind of profile — and the only question worth asking
// at all is "is there a copy", which reading it either answers or doesn't,
// with nothing asked of the network. The copy draws, and a download for
// whatever is newer runs behind it (see `loadJSONNative` and
// `backgroundRefresh` below).
//
// With nothing stored — a first launch — there is nothing to draw and
// nothing to shortcut to, so that case keeps the old long rope: NET_MS for
// the download, then the page's own fetch, then nothing.
const NET_MS = 20000;

// One clock per load, shared by both attempts rather than granted to each —
// the fallback must not start a fresh budget after the download has spent one.
// The deadline is fixed when the load begins; the timer is per call, so that
// it is always cleared and never outlives the answer.
// `now` is a parameter for the test that holds the wall clock back.
export function budget(ms, now = Date.now) {
  const until = now() + ms;
  // The clock's own timer going off IS the budget being spent, whatever the
  // wall clock reads at that moment. A timer can fire a millisecond before
  // Date.now() reaches the deadline it was set for, and asked then, a clock
  // that only compared the two would say there was time left: the download it
  // had just let go of would not be kept for promotion, and a fallback fetch
  // would be issued with nothing left to hear it in. (Seen as a test failing
  // once in a while on CI, 18 Sep 2026; on a phone it is a refresh skipped.)
  let fired = false;
  const race = (p) => {
    let timer;
    const over = new Promise((_, fail) => {
      timer = setTimeout(() => { fired = true; fail(new Error("timed out")); },
                         Math.max(0, until - now()));
    });
    return Promise.race([p, over]).finally(() => clearTimeout(timer));
  };
  // Asked rather than starting a race there is no time left to hear the end of.
  race.spent = () => fired || now() >= until;
  return race;
}

// A download the clock let go of, finished on its own time — only reachable
// from the no-copy path below, where the download itself is the only thing
// that will ever become tomorrow's stored copy.
//
// Without this, a link too slow to make the budget would refresh the copy on
// no launch at all: every launch would abandon the download, read the same
// `path` it read last time, and the map would freeze on it indefinitely. The
// service worker the eight seconds come from does the opposite — its
// timed-out request still stores the response it eventually gets (sw.js) —
// and so does this.
//
// Validated before it is promoted, because `.new` is itself a file the loader
// reads: one that does not parse must never stand in for a good copy. Nothing
// here is awaited; the pins were drawn from the phone seconds ago.
function promoteLate(io, running, fresh, path) {
  running.then(
    async () => {
      try { await io.read(fresh); }
      catch { await io.remove(fresh); return; }   // this launch wrote it, and it is not JSON
      await io.replace(fresh, path);
    },
    () => {},   // the download failed: whatever was already on the phone is left alone
  ).catch(() => {});
}

// The background refresh a stored copy starts once it has already drawn (see
// loadJSONNative below): runs on its own time and settles into exactly one of
// three answers, and never rejects — whatever the network did is a fact for
// the caller to read, not a reason to fail its own await.
//
//   { ok: true,  json }        a fresh file landed and reads differently from
//                               what the copy just drew.
//   { ok: true,  json: null }  it landed and reads the same — the ordinary
//                               night: the dataset is rebuilt once a day, so
//                               most launches see no change at all.
//   { ok: false, json: null }  nothing fresh could be had: the download
//                               failed, or what it fetched would not parse.
//
// Bounded by the same clock the rest of this file trusts: io.download() (see
// nativeIO below) hands the native downloader connectTimeout/readTimeout of
// NET_MS each — an idle timeout, not a total one — so a host that never
// answers at all, the black hole this whole file is written against, still
// fails within NET_MS of going quiet and this settles within it. A host that
// answers slowly but keeps answering can run longer; nothing here cuts a
// download that is still arriving.
//
// Compared as raw text, not parsed objects: these files run to several
// megabytes, and parsing — or worse, JSON.stringifying — that much just to
// learn "nothing changed" is exactly the cost a nightly-rebuilt dataset
// should not pay on a phone on every single launch. `oldText` is read by the
// caller before this is ever invoked, in the course of the read that already
// has to happen to draw the copy.
//
// `drawnFrom` is which file that read came from — `path` ordinarily, but
// `.new` when that was the only copy there was (`path` missing or would not
// parse). The download below writes into `fresh` (== `.new`), so when the
// copy just drawn lives there too, it has to become `path` FIRST, before
// anything else touches `fresh`: every check past this point — "garbage,
// remove `fresh`", "unchanged, remove `fresh`" — would otherwise delete the
// reader's only copy instead of a spare one, on a 200 that turns out to be a
// captive portal's login page, or simply because tonight's build is byte for
// byte what a stale `.new` already held. A promotion that itself fails is
// treated as a reason not to risk the download at all this launch and to
// report the refresh failed instead: a good copy already on the phone,
// wherever it is filed, is worth more than a chance at a fresher one.
//
// `gate`, when given, is data/stats.json's own verdict on whether tonight's
// build differs at all — see loadDatasetNative below, which is the only
// caller that ever passes one. It is awaited AFTER the `drawnFrom === fresh`
// self-heal above (that one is filesystem housekeeping, nothing to do with
// the network, and must happen whatever the canary says) but BEFORE the
// download: `"changed"` proceeds exactly as an ungated file would, and
// `"unchanged"` / `"failed"` settle without ever calling `io.download` at
// all — which is the whole saving, since these are the files that cost
// megabytes. `hold`, when true, is stats.json refusing to promote itself:
// it downloads and compares exactly as usual, but leaves a changed answer
// sitting at `fresh` rather than replacing `path` with it, because
// loadDatasetNative has to hear from the three gated files first — see the
// invariant in its own comment.
function backgroundRefresh(io, url, oldText, path, fresh, drawnFrom, { gate = null, hold = false } = {}) {
  return (async () => {
    if (drawnFrom === fresh) {
      try { await io.replace(fresh, path); }
      catch { return { ok: false, json: null }; }
    }
    if (gate) {
      const g = await gate;
      if (g !== "changed") {
        // A `.new` left over from an earlier, interrupted launch — the copy
        // just drawn came from `path`, so it is not that file's own — used
        // to be overwritten or removed by the download this gate just
        // skipped; gated shut, nothing else will ever touch it. Only when
        // the drawn copy came from `path`: drawn from `.new` itself, the
        // self-heal above has already moved it to `path`, and there is
        // nothing stray left at `fresh` to clean up. Best effort, and never
        // asked when the gate says "failed" — a stale `.new` is nobody's
        // priority on a launch that could not even reach the network.
        if (g === "unchanged" && drawnFrom === path) await io.remove(fresh).catch(() => {});
        return { ok: g === "unchanged", json: null };
      }
    }
    try { await io.download(url, fresh); }
    catch { return { ok: false, json: null }; }
    let text;
    try { text = await io.text(fresh); }
    catch { await io.remove(fresh); return { ok: false, json: null }; }
    let json;
    try { json = JSON.parse(text); }
    catch { await io.remove(fresh); return { ok: false, json: null }; }   // this launch wrote it, and it is not JSON
    if (text === oldText) {
      await io.remove(fresh);
      return { ok: true, json: null };
    }
    if (!hold) await io.replace(fresh, path).catch(() => {});
    return { ok: true, json };
  })().catch(() => ({ ok: false, json: null }));   // belt and braces: see loadJSONNative's own note on a throw from io.download
}

function nativeIO(fs = plugin("Filesystem")) {
  const local = async (path, as) => {
    const { uri } = await fs.getUri({ path, directory: DIR });
    const r = await fetch(cap().convertFileSrc(uri));
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return as === "text" ? r.text() : r.json();
  };
  return {
    // The same bound said again where the OS can act on it: the page stops
    // waiting either way, and these keep the abandoned task from holding the
    // connection — a fetch left queued is one the next launch waits behind.
    download: (url, path) => fs.downloadFile({ url, path, directory: DIR, recursive: true,
                                               connectTimeout: NET_MS, readTimeout: NET_MS }),
    // Parsed, for the paths that need the object itself.
    read: (path) => local(path, "json"),
    // Raw, for the one path that only needs to know whether two files say the
    // same thing (backgroundRefresh) — a string compare, not a parse of
    // several megabytes of JSON on every launch.
    text: (path) => local(path, "text"),
    // rename() does not promise to overwrite on both platforms, so where it
    // refuses, the old copy goes first. Between those two calls the only copy
    // is the .new one — which is why the loader reads that too.
    replace: async (from, to) => {
      const move = () => fs.rename({ from, to, directory: DIR, toDirectory: DIR });
      try { await move(); }
      catch { await fs.deleteFile({ path: to, directory: DIR }).catch(() => {}); await move(); }
    },
    remove: (path) => fs.deleteFile({ path, directory: DIR }).catch(() => {}),
    get: async (url) => {
      const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(NET_MS) });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
  };
}

// The site's loadJSON, done the app's way: the stored copy first if one is on
// the phone — drawn at once, no network question, no clock — refreshed
// behind it; papamap.de itself if there is no copy to draw. The synchronous
// half keeps the service worker's contract, `{ json, fromStore }`
// (X-PapaMap-Source); `refreshed` is new, a promise of what the background
// download found — see `backgroundRefresh` above for its three shapes. It is
// present on every answer but `null` itself: a load that already drew fresh
// data (`fromStore: false`, no copy to refresh) has nothing left to ask the
// network for, so it carries the trivial "nothing changed" answer rather than
// nothing at all, which keeps app.js from having to ask which shape it got.
//
// A copy, when there is one, answers before the download that will refresh it
// even starts: `.new` is itself a file this can read (the only copy there is,
// the launch after one too slow for the old clock), and starting the download
// before that read finishes would let it overwrite the very file being read.
// `backgroundRefresh` carries that same care one step further for exactly
// this case — see its own comment for why the drawn copy is promoted out of
// `.new` before the download is even started, not only read out of the way
// of it.
//
// With nothing stored there is nothing to draw and nothing to shortcut to: the
// download gets NET_MS, then the page's own fetch shares what is left of that
// budget, and only then does the load answer null — a first launch that slow
// draws an empty map once, and the download, let go of but not cancelled,
// still lands and becomes tomorrow's copy (`promoteLate`).
//
// `note` is filled in on the way through: which path answered, how long it
// took, how big the stored copy was. The tests read it; the page does not
// (the TestFlight block that printed it, in builds 20 and 21, is gone). It is
// an out-parameter rather than a return value so that the { json, fromStore }
// contract app.js reads — and the `null` that means "nothing anywhere" —
// are exactly what they were.
export async function loadJSONNative(url, io = nativeIO(), { note = {}, netMs = NET_MS, gate = null, hold = false } = {}) {
  const name = url.split("/").pop().split("?")[0];
  const path = `${DATA_PATH}/${name}`;
  const fresh = `${path}.new`;
  const began = Date.now();
  // Filled in before the first await, so a note the caller is holding is a
  // whole row from the moment the load starts.
  Object.assign(note, { file: name, step: "none", ms: 0, bytes: null });
  const step = (s) => { note.step = s; note.ms = Date.now() - began; };

  // `path` first, `.new` only when `path` is missing or will not parse — the
  // same order a late promotion has to respect, and for the same reason: a
  // corrupt `path` must not shadow a good `.new` sitting beside it.
  const stored = async () => {
    for (const [copy, s] of [[path, "stored"], [fresh, "stored-new"]]) {
      try {
        const text = await io.text(copy);
        const json = JSON.parse(text);
        step(s);
        return { json, text, copy };
      } catch { /* the other one */ }
    }
    return null;
  };

  const hit = await stored();
  if (hit) {
    note.bytes = hit.text.length;
    return {
      json: hit.json,
      fromStore: true,
      refreshed: backgroundRefresh(io, SITE + url, hit.text, path, fresh, hit.copy, { gate, hold }),
    };
  }

  // No copy anywhere: today's long path, unchanged in every particular but
  // the network question this file no longer asks first.
  const net = budget(netMs);
  // Always a promise, never a throw. A missing Filesystem plugin makes
  // `fs.downloadFile` a synchronous TypeError, and thrown from out here — it
  // has to be started before the try, so that the clock can let go of it and
  // still leave something to hold — it would reject the whole load, and
  // boot()'s Promise.all with it, rather than fall through to the page's own
  // fetch the way the comment above this function promises. (`io.text` above
  // hides the same missing plugin behind a throw that `stored()` already
  // reads as "no copy".)
  const running = (async () => io.download(SITE + url, fresh))();
  // A download the clock let go of, held until the read below is done with the
  // two files a promotion would move. See the wait at the end.
  let late = null;
  let json;
  try {
    await net(running);
    // Only a file this launch downloaded is thrown away for not parsing: with
    // no network, a .new from an earlier launch may be the one copy there is.
    try { json = await io.read(fresh); }
    catch { await io.remove(fresh); }
  } catch {
    // Two ways to get here, and only one of them leaves work behind: the
    // download may have failed, or the clock may have let go of one that is
    // still running. The second is worth coming back to, or a slow link would
    // never refresh the copy at all.
    if (net.spent()) late = running;
  }
  if (json !== undefined) {
    // A swap that fails costs nothing today and nothing offline: the data is
    // in hand, and the .new file it sits in is read below when `path` is not.
    await io.replace(fresh, path).catch(() => {});
    step("download");
    return { json, fromStore: false, refreshed: Promise.resolve({ ok: true, json: null }) };
  }
  // With the budget gone there is no time left to hear a second request, and
  // issuing one anyway is not free: the race below would reject on the next
  // tick while the fetch went on transferring a second copy of the dataset
  // nobody would read, over the metered link the download is still using.
  if (!net.spent()) {
    try {
      const fetched = await net(io.get(SITE + url));
      step("fetch");
      return { json: fetched, fromStore: false, refreshed: Promise.resolve({ ok: true, json: null }) };
    } catch { /* no network, or none that answers */ }
  }
  // Only now, and not in the catch above. `late`, if there is one, is left to
  // promoteLate rather than awaited: the pins already drew from the copy or
  // not at all, and this call is done either way.
  if (late) promoteLate(io, late, fresh, path);
  step("none");
  return null;
}

// A stored copy exists (`path`, or `.new` alone), or it doesn't — the same
// question `loadJSONNative`'s own `stored()` asks, asked here on its own so
// loadDatasetNative can answer it WITHOUT paying for a copy's whole no-copy
// path (which can run for the full netMs budget) just to learn there was
// nothing to gate on. A local file read, never the network.
async function hasStoredCopy(io, path, fresh) {
  for (const copy of [path, fresh]) {
    try { JSON.parse(await io.text(copy)); return true; }
    catch { /* try the other one */ }
  }
  return false;
}

// data/stats.json is a kilobyte and change; changing_tables.geojson and
// play_places.geojson are megabytes; all four are written by the same
// nightly build in the same second. So a launch that already has a stored
// copy of everything refreshes stats.json FIRST, and downloads the other
// three only when stats.json's own raw text turns out to differ — the one
// signal any of them is worth asking about at all. A launch that finds
// nothing new pays for one small request instead of four large ones.
//
// The invariant this keeps, and nowhere else does: the stored stats.json is
// never newer than any stored copy of the other three. Each of the three
// promotes itself exactly as it always has, the moment its own download
// differs — nothing here changes that, and one succeeding does not wait on
// another. Only stats.json's OWN promotion is held back (`hold`, above) until
// all three have settled ok — changed or unchanged, either counts — and only
// then is its `.new` swapped in; if any of the three failed, that `.new` is
// thrown away instead, so the next launch reads last night's stats.json
// again, finds it still differs from tonight's, and tries the whole thing
// over. Without this, a single failed big download on an otherwise fine
// night would leave the phone a day behind with nothing to notice: every
// later launch would read the already-promoted stats.json, find it
// unchanged, and never ask for the big files again.
//
// Accepted edge: a phone that happens to refresh in the exact second the
// nightly build is still being written can draw a new stats.json against
// still-old big files. It is indistinguishable from an ordinary missed
// refresh and catches up the same way, the following night.
//
// A second, rarer way to the same edge: the app killed while stats.json's
// own `.new` is held (downloaded, not yet promoted — the three gated files
// hadn't all settled ok yet) AND its `path` copy has since gone unreadable.
// The next launch self-heals `path` straight out of that `.new` before its
// own download even starts (the `drawnFrom === fresh` step above), so the
// download it then runs compares against a stats.json that already reads as
// last night's build — finds no difference, and never asks the three at
// all. Same consequence as the edge above: at most one night behind, and it
// self-heals the following night, when a genuinely new build makes the
// comparison differ again.
//
// A URL among `urls` that isn't named stats.json — or no stored stats.json
// at all, so there is no canary yet to compare against (first launch, or a
// copy that went missing) — means nothing here applies: every file, stats
// included, loads exactly as loadJSONNative alone always has, none of them
// waiting on any of the others.
export async function loadDatasetNative(urls, io = nativeIO(), opts = {}) {
  const statsAt = urls.findIndex((u) => u.split("/").pop().split("?")[0] === "stats.json");
  if (statsAt === -1) return Promise.all(urls.map((u) => loadJSONNative(u, io, opts)));

  const name = urls[statsAt].split("/").pop().split("?")[0];
  const path = `${DATA_PATH}/${name}`;
  const fresh = `${path}.new`;

  if (!(await hasStoredCopy(io, path, fresh)))
    return Promise.all(urls.map((u) => loadJSONNative(u, io, opts)));

  const stats = await loadJSONNative(urls[statsAt], io, { ...opts, hold: true });
  // `held` is stats.json's own download+compare, already running; reassigning
  // `stats.refreshed` below must not lose the handle to it.
  const held = stats.refreshed;
  const gate = held.then((r) => (r.ok === false ? "failed" : r.json != null ? "changed" : "unchanged"));

  // `loadJSONNative` itself resolves fast — a stored copy answers before its
  // own download even starts — so `otherLoaded` (unlike `.refreshed` below)
  // says nothing about whether any of the three actually finished.
  const otherUrls = urls.filter((_, i) => i !== statsAt);
  const otherLoaded = await Promise.all(otherUrls.map((u) => loadJSONNative(u, io, { ...opts, gate })));

  stats.refreshed = (async () => {
    const r = await held;
    if (r.json == null) return r;   // unchanged, or the canary's own download failed: nothing held to promote
    // A gated file with no stored copy at all, whose own no-copy path found
    // nothing at all, answers `null` — not an object carrying a `.refreshed`
    // of its own — and counts as failed here exactly as an outright download
    // failure would. `x?.refreshed` alone is not enough: that would leave
    // `undefined` in `results` for that file, and the `.ok` read below would
    // throw on it just the same as `null.refreshed` does.
    const results = await Promise.all(
      otherLoaded.map((x) => (x ? x.refreshed : Promise.resolve({ ok: false, json: null }))));
    if (results.every((x) => x.ok !== false)) {
      await io.replace(fresh, path).catch(() => {});
      return r;
    }
    // One of the three failed: the copy on the phone must not learn tonight's
    // stats.json without tonight's big files to back it up.
    await io.remove(fresh);
    return { ok: false, json: null };
  })().catch(() => ({ ok: false, json: null }));   // never rejects — see backgroundRefresh's own note

  let k = 0;
  return urls.map((u, i) => (i === statsAt ? stats : otherLoaded[k++]));
}

// ---- Location ----
// The plugin asks the OS permission itself and answers with the same shape
// as the browser's coords. app.js keeps one locate() for both worlds.
//
// Not getCurrentPosition: on iOS that is Core Location's requestLocation(),
// which holds the answer back until it is satisfied with the accuracy —
// several seconds on a phone that has not used GPS lately (build 13 on an
// iPhone 12 mini, 2026-09-18). A watch hands fixes over as they come, the
// Wi-Fi one first: the first fix good to GOOD_M wins, after SOFT_MS the best
// one seen (or the next to arrive), and at HARD_MS it is over either way.
const GOOD_M = 100, SOFT_MS = 3000, HARD_MS = 10000;
export async function locateNative(geo = plugin("Geolocation"),
                                   { good = GOOD_M, soft = SOFT_MS, hard = HARD_MS } = {}) {
  const perm = await geo.checkPermissions();   // rejects when location services are off
  if (perm.location !== "granted" && (await geo.requestPermissions()).location !== "granted") {
    throw new Error("denied");
  }
  return new Promise((ok, fail) => {
    let best = null, late = false, done = false, watch = null;
    const finish = (coords, err) => {
      if (done) return;
      done = true;
      clearTimeout(softTimer);
      clearTimeout(hardTimer);
      Promise.resolve(watch).then((id) => id != null && geo.clearWatch({ id })).catch(() => {});
      if (coords) ok(coords); else fail(err ?? new Error("timeout"));
    };
    const softTimer = setTimeout(() => { late = true; if (best) finish(best); }, soft);
    const hardTimer = setTimeout(() => finish(best), hard);
    watch = geo.watchPosition({ enableHighAccuracy: true, timeout: hard }, (p, err) => {
      if (!p?.coords) { if (err && !best) finish(null, err); return; }
      if (!best || p.coords.accuracy < best.accuracy) best = p.coords;
      if (late || best.accuracy <= good) finish(best);
    });
    Promise.resolve(watch).catch((e) => finish(null, e));
  });
}

// Whether the OS has already granted location — read-only, never a prompt.
// Every other permission read in this file (locateNative, above) may
// escalate to requestPermissions() because it runs from a tap the reader
// just made; this one backs the boot fix (web/app.js, openAtLocationFix),
// which runs unprompted and must never put up the OS dialog on its own.
// Returns null on anything that stops it from answering at all — no plugin,
// location services off — which the caller reads exactly like "not granted".
export async function checkLocationPermissionNative(geo = plugin("Geolocation")) {
  try {
    const perm = await geo?.checkPermissions();
    return perm?.location ?? null;
  } catch { return null; }
}

// ---- Boot-only: a coarse fix, never a fresh GPS lock ----
// locateNative() above tunes for the locate button's own tap: several
// seconds are worth spending on the best fix a reader who is actively
// waiting will get. The boot fix is the opposite — first tester feedback was
// "too much happens when the app opens" — so this asks for whatever fix the
// OS already has sitting in its cache, never a fresh lock, and gives up
// quickly rather than making an unprompted reader wait. Same permission gate
// as locateNative, but checkPermissions() only: requestPermissions() stays
// that function's alone.
//
// `maximumAge` only means anything on Android. Checked against
// @capacitor/geolocation 8.2.2's own iOS source
// (node_modules/@capacitor/geolocation/ios/Sources/GeolocationPlugin
// /GeolocationPlugin.swift): getCurrentPosition there reads only
// `enableHighAccuracy` off the call (`getCurrentPosition`, line 57-61) and
// hands it to `requestSingleLocation`, which maps straight to Core
// Location's `CLLocationManager.requestLocation()` — one fresh fix, no
// cache, no `maximumAge` anywhere in the call (confirmed in the
// ion-ios-geolocation dependency the plugin pulls in,
// IONGLOCManagerWrapper.swift line 88-100: `requestSingleLocation` short-
// circuits to the cached `currentLocation` only when a *watch* is already
// running — never on its own — otherwise it is `locationManager
// .requestLocation()` outright). That's locateNative's own existing comment
// above, several seconds no matter what this function asks for.
// `watchPosition`, though, maps to `startMonitoringLocation` ->
// `CLLocationManager.startUpdatingLocation()` (same file, line 64-70), whose
// delegate callback (`didUpdateLocations`, line 139-156) fires with
// whatever Core Location already has cached the moment monitoring starts —
// the ordinary, documented behaviour of that API. So on iOS the coarse fix
// is the FIRST watch callback, taken and the watch cleared at once — never
// the "best fix seen" tuning locateNative does for the button the reader is
// actively waiting on. Android's plugin does read `maximumAge`
// (`getCurrentPosition`'s own options), so it keeps the simpler call.
export async function locateNativeCoarse(geo = plugin("Geolocation"),
                                         { timeout = 5000, maximumAge = 5 * 60 * 1000 } = {},
                                         plat = platform()) {
  if (!geo) throw new Error("nogeo");
  const perm = await geo.checkPermissions();
  if (perm.location !== "granted") throw new Error("denied");
  if (plat !== "ios") {
    const pos = await geo.getCurrentPosition({ enableHighAccuracy: false, timeout, maximumAge });
    return pos.coords;
  }
  return new Promise((ok, fail) => {
    let done = false, watch = null;
    const clearTheWatch = () =>
      Promise.resolve(watch).then((id) => id != null && geo.clearWatch({ id })).catch(() => {});
    const finish = (coords, err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTheWatch();
      if (coords) ok(coords); else fail(err ?? new Error("timeout"));
    };
    const timer = setTimeout(() => finish(null), timeout);
    watch = geo.watchPosition({ enableHighAccuracy: false, timeout }, (p, err) => {
      if (p?.coords) finish(p.coords); else if (err) finish(null, err);
    });
    Promise.resolve(watch).catch((e) => finish(null, e));
  });
}

// ---- Links ----
// A WKWebView opens target=_blank nowhere and a relative link to methods.html
// would 404 inside the bundle: every link that leaves the map goes to the
// in-app browser (SFSafariViewController, a Custom Tab), the website's pages
// included.
//
// Which is still inside the app, so a page of ours opened here is told so:
// ?app=1, and web/in-app.js hides the Ko-fi link the app may not show (issue
// #124; the bundled page has it cut out, app/shell.mjs). Our own origin only
// — osm.org, MapComplete and the rest get the URL the reader clicked, and an
// unknown flag on a foreign URL is nobody's business. Query and fragment
// survive: the country links carry ?bbox=, the methods link a #section.
export function externalUrl(url, site = SITE) {
  const u = new URL(url, site);
  if (u.origin === new URL(site).origin) u.searchParams.set("app", "1");
  return u.href;
}

export function openExternal(url) {
  const abs = externalUrl(url);
  const b = plugin("Browser");
  if (b) b.open({ url: abs }); else window.open(abs, "_blank", "noopener");
}

export function interceptLinks(doc = document) {
  doc.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    if (/^(geo|maps|mailto|tel):/.test(href)) return;   // the OS handles these
    const external = /^https?:/.test(href) && !href.startsWith(location.origin);
    const sitePage = !/^[a-z]+:/.test(href);           // relative: a page of the website
    if (!external && !sitePage) return;
    e.preventDefault();
    openExternal(href);
  });
}

// Directions: iOS has no geo: handler, Apple Maps answers maps://; Android
// hands geo: to whichever maps app the reader chose.
//
// This is what the Route button's href says in the two apps (the website
// chooses its own, by device: webRouteHref in datasource.js), and in the
// Android app it is what a tap follows. In the iOS app the tap is caught and
// routePlan() below decides instead; the href is what is left when that
// cannot run at all.
const coords = (lat, lon) => `${lat.toFixed(6)},${lon.toFixed(6)}`;
const appleMapsUri = (at, label) =>
  `maps://?q=${encodeURIComponent(label || "")}&ll=${at}&daddr=${at}`;

export function directionsUri(lat, lon, label, geo) {
  if (platform() !== "ios") return geo;
  return appleMapsUri(coords(lat, lon), label);
}

// ---- Directions on iOS: the cascade ----
// The map does not choose a maps app for the reader. On Android and on the
// web that costs nothing — geo: is a question for the OS. iOS has no geo:
// handler, so the choice has to be made here, and it is made in this order:
//
//   1. `geo-navigation:` — the reader's OWN default navigation app. iOS 18.4
//      in the EU and 26.2 in Japan let them pick one, and Apple's instruction
//      to the app that wants to BE that default is to answer
//      `geo-navigation:///directions?source=&destination=&waypoint=`, where a
//      value is an address, a place name or a comma-separated lat,lon pair
//      (developer.apple.com/documentation/mapkit/preparing-your-app-to-be-the-
//      default-navigation-app). Apple documents the receiving end only. That a
//      CALLING app reaches the chosen app by opening that URL is read off
//      MapKit itself — MKMapItem builds a `geo-navigation://` URL for default
//      navigation — and off the apps already calling it that way. Where no app
//      claims the scheme, canOpenUrl says no and this step costs nothing.
//   2. `maps:` — Apple Maps, exactly the URL every build up to 19 sent.
//   3. Whatever navigation app is in fact installed, by its own documented
//      scheme. Exactly one: open it. More than one: ask, once, and remember
//      nothing — the app is allowed to find out what is installed, not to
//      acquire an opinion about it.
//   4. Nothing at all: the Google Maps directions URL on the open web, handed
//      to the OS rather than to the in-app browser, so a universal link can
//      still be caught by an app and only otherwise opens a browser.
//
// Why at all: `maps://` is Apple Maps' own scheme, and setting another app as
// the default navigation app does not change that. On a phone whose owner had
// deleted Apple Maps, build 19's Route button produced iOS's "No Navigation
// App Installed" alert and nothing else (an iPhone in Germany, Sep 2026).
//
// No travel mode is forced anywhere in here. The reader may be pushing a pram
// or driving to the next town, and guessing which would be the same mistake in
// smaller print as picking their maps app for them.

// Only schemes whose owners document them. Every one of these has to be listed
// in LSApplicationQueriesSchemes in app/ios/App/App/Info.plist as well: iOS
// answers canOpenURL for nothing else, and it answers silently — an unlisted
// scheme comes back as "cannot open", which here reads as "the reader does not
// have that app".
export const NAV_APPS = [
  { scheme: "comgooglemaps", name: "Google Maps",
    url: (at) => `comgooglemaps://?daddr=${at}` },
  { scheme: "waze", name: "Waze",
    url: (at) => `waze://?ll=${at}&navigate=yes` },
  // om://route wants a source AND a `type=`, which is a travel mode. The map
  // URL puts the pin on Organic Maps' screen and leaves both to the reader.
  { scheme: "om", name: "Organic Maps",
    url: (at, label) => `om://map?v=1&ll=${at}${label ? `&n=${encodeURIComponent(label)}` : ""}` },
];

export const ROUTE_SCHEMES = ["geo-navigation", "maps", ...NAV_APPS.map((a) => a.scheme)];

// The whole decision, as a function of what the OS says it can open: either
// one URL to open, or the choices to put in front of the reader. No I/O, no
// DOM, no Capacitor — which is what makes steps 1, 3 and 4 testable off a
// phone, where only step 2 can ever be seen.
export function routePlan(lat, lon, label, canOpen) {
  const at = coords(lat, lon);
  if (canOpen("geo-navigation"))
    return { open: `geo-navigation:///directions?destination=${at}` };
  if (canOpen("maps")) return { open: appleMapsUri(at, label) };
  const installed = NAV_APPS.filter((a) => canOpen(a.scheme));
  if (installed.length === 1) return { open: installed[0].url(at, label) };
  if (installed.length > 1)
    return { choose: installed.map((a) => ({ name: a.name, url: a.url(at, label) })) };
  return { open: routeWebUrl(lat, lon) };
}

// Step 4's URL, and what app.js falls back on when the OS declines a URL from
// any other step: it needs no app at all, so it cannot fail the same way.
export function routeWebUrl(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${coords(lat, lon)}`;
}

// The questions iOS will answer, asked at once, and the plan they make. A
// scheme it refuses to answer for counts as absent — which is also what it
// answers for an app that is genuinely not there.
export async function planRoute(lat, lon, label, launcher = plugin("AppLauncher")) {
  if (!launcher) throw new Error("no AppLauncher");
  const yes = new Set();
  await Promise.all(ROUTE_SCHEMES.map(async (s) => {
    try { if ((await launcher.canOpenUrl({ url: `${s}://` })).value) yes.add(s); }
    catch { /* not askable: treat as not installed */ }
  }));
  return routePlan(lat, lon, label, (s) => yes.has(s));
}

// To the OS, not to the in-app browser: an https URL here is meant to reach an
// app through its universal link if the phone has one.
//
// AppLauncher does not reject when iOS declines a URL, it resolves
// `{ completed: false }` — which has to count as a failure here, or the tap
// does nothing at all and nobody hears of it.
export async function openRouteUrl(url, launcher = plugin("AppLauncher")) {
  if (!launcher) throw new Error("no AppLauncher");
  const r = await launcher.openUrl({ url });
  if (r?.completed === false) throw new Error(`not opened: ${url}`);
}

// Open it, and if the OS will not, show the same route on the web in the
// in-app browser — not the anchor's href, which on iOS is maps:// and fails
// on exactly the phone this cascade exists for.
export async function followRoute(url, web, launcher = plugin("AppLauncher"), external = openExternal) {
  try { await openRouteUrl(url, launcher); }
  // Also when `url` is the web URL itself: the in-app browser is another
  // mechanism than openUrl and can show what the OS would not hand over.
  catch { external(web); }
}

// ---- OSM login through the in-app browser ----
// The page's flow (osm.js) is unchanged: PKCE in sessionStorage, the intent
// too, and the consent screen is a URL. The two differences are where the
// URL opens (the in-app browser: a browser view of the OS's own, which the
// app cannot read into, so the password never passes through a WebView of
// ours) and how the code comes back (the papamap://auth URL, which the OS
// routes to the app; App's appUrlOpen delivers it here).
export function nativeNavigate(url) {
  plugin("Browser").open({ url });
}

// One listener for every URL the OS hands the app: the OAuth return and the
// widget's deep link. Returns nothing; the callbacks decide.
export function onAppUrl({ auth, table }) {
  const app = plugin("App");
  if (!app) return;
  app.addListener("appUrlOpen", ({ url }) => {
    if (!url) return;
    if (url.startsWith(AUTH_REDIRECT)) {
      plugin("Browser")?.close?.().catch?.(() => {});
      auth(url);
    } else if (url.startsWith("papamap://table")) {
      table(new URL(url).searchParams.get("osm"));
    }
  });
  // Cold start from a deep link: the listener above is attached too late for
  // the URL the app was launched with, so ask once.
  app.getLaunchUrl?.().then((r) => {
    if (r?.url?.startsWith("papamap://table")) table(new URL(r.url).searchParams.get("osm"));
  }).catch(() => {});
}

// ---- The widget and the Siri shortcut (iOS) ----
// A compact copy of the dataset for the Swift side: one row per table, five
// decimals (about a metre), status, name, OSM URL. Written on every load;
// the widget re-reads it from the App Group container and recomputes the
// nearest table with the phone's own location, which never comes here.
export function shareDataset(features) {
  const p = plugin("PapaMapShare");
  if (!p) return;
  const rows = features.map((f) => [
    +f.lat.toFixed(5), +f.lon.toFixed(5), f.status, f.name || "", f.osm_url || "",
  ]);
  p.writeDataset({ json: JSON.stringify(rows) }).catch(() => {});
}
export function shareSettings({ mode, lang }) {
  plugin("PapaMapShare")?.setSettings({ mode, lang }).catch(() => {});
}

// ---- Offline cities ----
// The catalogue is built weekly on the server (pipeline/tiles.py) and lists
// each city's slug, name, bbox and size; the file itself is a PMTiles
// extract of the Protomaps daily build, downloaded whole with the native
// downloader (no CORS, no range requests) into the app's data dir.
const SAVED_KEY = "papamap-offline-cities";

// Kept like the dataset (as papamap/data/index.json), so the list of cities
// opens without a network too — to delete one, if nothing else.
export async function cityCatalogue() {
  // Build 18 kept it under another name; that copy is nobody's any more.
  // Never awaited — a slow delete must not hold the catalogue back — and
  // guarded twice over: `remove()` already swallows a rejected delete, but a
  // missing Filesystem plugin makes `fs.deleteFile` throw synchronously,
  // before there is even a promise to swallow, and that must not reject
  // this whole load.
  try { nativeIO().remove(`${DATA_PATH}/tiles-index.json`).catch(() => {}); }
  catch { /* no Filesystem plugin */ }
  return (await loadJSONNative("tiles/index.json"))?.json ?? null;
}

export async function savedCities() {
  try {
    const r = await plugin("Preferences").get({ key: SAVED_KEY });
    return JSON.parse(r.value || "[]");
  } catch { return []; }
}
async function setSaved(list) {
  await plugin("Preferences").set({ key: SAVED_KEY, value: JSON.stringify(list) });
}

export async function downloadCity(city, onProgress = () => {}) {
  const fs = plugin("Filesystem");
  const path = `${TILES_PATH}/${city.slug}.pmtiles`;
  const handle = await fs.addListener("progress", (p) => {
    if (p.url?.endsWith(`${city.slug}.pmtiles`) && p.contentLength)
      onProgress(Math.min(1, p.bytes / p.contentLength));
  });
  try {
    await fs.downloadFile({ url: `${SITE}tiles/${city.slug}.pmtiles`, path, directory: DIR,
                            recursive: true, progress: true });
  } finally {
    handle.remove();
  }
  const list = (await savedCities()).filter((c) => c.slug !== city.slug);
  list.push({ slug: city.slug, name: city.name, bbox: city.bbox, bytes: city.bytes, saved: new Date().toISOString() });
  await setSaved(list);
  return list;
}

export async function deleteCity(slug) {
  try { await plugin("Filesystem").deleteFile({ path: `${TILES_PATH}/${slug}.pmtiles`, directory: DIR }); }
  catch { /* already gone */ }
  const list = (await savedCities()).filter((c) => c.slug !== slug);
  await setSaved(list);
  return list;
}

// A pmtiles Source over the file read into memory once. Reading the whole
// archive (20–100 MB) is what makes this work the same on both platforms:
// the app's asset server answers a local file URL in one piece, and a
// vector tile is then a slice of an ArrayBuffer — no I/O per tile at all.
export async function citySource(slug) {
  const fs = plugin("Filesystem");
  const { uri } = await fs.getUri({ path: `${TILES_PATH}/${slug}.pmtiles`, directory: DIR });
  const r = await fetch(cap().convertFileSrc(uri));
  if (!r.ok) throw new Error(`city file ${slug}: ${r.status}`);
  const buf = await r.arrayBuffer();
  return {
    getKey: () => slug,
    getBytes: async (offset, length) => ({ data: buf.slice(offset, offset + length) }),
  };
}

// The Protomaps layers for one city source, minus the background: outside
// the extract nothing is drawn and the raster basemap shows through, inside
// it the earth and water fills cover it. The ids are prefixed per city so
// two saved cities never collide.
export function cityLayers(slug, lang) {
  const bm = globalThis.basemaps;
  if (!bm) return [];
  const flavor = bm.namedFlavor("light");
  return bm.layers(`city-${slug}`, flavor, { lang })
    .filter((l) => l.type !== "background")
    .map((l) => ({ ...l, id: `city-${slug}-${l.id}` }));
}

// Great-circle distance in km, for sorting the catalogue by the map's centre.
export function kmBetween(lat1, lon1, lat2, lon2) {
  const R = 6371, d = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * d / 2) ** 2
    + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin((lon2 - lon1) * d / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export const bboxCentre = ([w, s, e, n]) => ({ lat: (s + n) / 2, lon: (w + e) / 2 });

// Which saved cities to hold in memory for a view: the ones whose extract the
// view touches, nearest to its centre first, MAX_MOUNTED at most — each is a
// whole archive in an ArrayBuffer. Below MOUNT_ZOOM the answer is null, "no
// opinion": a continent-wide view touches every city, and unmounting on the
// way out only to re-read 80 MB on the way back in would be worse.
const MOUNT_ZOOM = 9, MAX_MOUNTED = 2;
export function citiesToMount(saved, [w, s, e, n], centre, zoom) {
  if (zoom < MOUNT_ZOOM) return null;
  return saved
    .filter(({ bbox: [cw, cs, ce, cn] }) => cw <= e && ce >= w && cs <= n && cn >= s)
    .map((c) => ({ c, km: kmBetween(centre.lat, centre.lon, bboxCentre(c.bbox).lat, bboxCentre(c.bbox).lon) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_MOUNTED)
    .map(({ c }) => c);
}
export const formatMB = (bytes, locale) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(bytes / 1e6);
