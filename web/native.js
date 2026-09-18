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
// Every wait between launch and the first pin is one of the two network calls
// below, and neither iOS nor WebKit bounds one usefully. A request into a
// black hole — airplane mode, a Wi-Fi with no route out, a captive portal —
// does not fail: it sits on a connect timeout. Measured against an address
// that drops packets (iPhone 17 simulator, iOS 27, 18 Sep 2026): the native
// downloader took 75.2 s per file, and the page's own fetch, which WebKit
// serialises per host, took 975 s, 1050 s, 1125 s and 1200 s for the four
// files. boot() waits for all of them, so the map drew — a saved city is read
// off the phone and owes the network nothing — and the pins came 1283 s
// later. That is what build 18 and build 19 did in airplane mode, and why a
// port that answers RST (a stopped local mirror) never reproduced it: refused
// is not unreachable.
//
// So the page keeps its own clock, NET_MS, and does not ask the OS for
// permission to stop waiting. How long that clock runs depends on what the
// waiting is worth, which is to say on whether there is anything to fall back
// to — a `stat` answers that before a byte is parsed:
//
//   COPY_MS  a copy is on the phone. It is read in under a tenth of a second,
//            so the network is racing something that has already won:
//            yesterday's tables now beat today's tables in twenty minutes, and
//            the toast says which of the two is on screen. Eight seconds is
//            the website's own number for exactly this trade (`sw.js`,
//            DATA_TIMEOUT_MS) — one rule for both, already explained in
//            FEATURES.md, rather than a second magic number beside it.
//   NET_MS   nothing is stored. There is nothing to cut to, an empty map helps
//            nobody, and this is somebody's first launch — so the download
//            gets the long rope and the old failure path.
//
// And a reader the OS already knows is offline waits for nothing at all: the
// copy is read at once (see below).
//
// Letting go is not cancelling — the native download runs on, into the `.new`
// file the loader reads, so a first launch too slow for the clock draws an
// empty map once and the launch after it has the data. The iOS timeouts below
// are idle timeouts, not total ones, so they never cut a download that is
// still arriving.
const NET_MS = 20000, COPY_MS = 8000;

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

// ---- Is there a network at all? ----
// Asked once a launch, before the four loads, because the answer decides
// whether any of them talks to the network.
//
// `navigator.onLine` is not an answer on iOS. Build 20 came up in airplane
// mode on the owner's iPhone reporting **online=true** in the app's WKWebView,
// so the shortcut it guards never fired and the reader waited out the whole
// eight seconds while four files that were already on the phone sat there.
// The Network plugin asks the OS instead: SCNetworkReachability on iOS (at
// 8.0.1 — a reachability check on the zero address, not NWPathMonitor),
// ConnectivityManager on Android, where "connected" means a VALIDATED network
// and can therefore be false for a launch on a network still being checked.
//
// Bounded like everything else here: a plugin call that never comes back must
// not become the new unbounded wait. No answer in time is not treated as
// offline, because a wrong "offline" costs the reader a refresh they could
// have had, while a wrong "online" only costs them the clock they used to wait
// anyway. And "connected" is not "reachable": a Wi-Fi with no way out still
// reports connected, which is exactly what the eight seconds are still there
// for.
const STATUS_MS = 400;
export async function connectivity(net = plugin("Network"), ms = STATUS_MS) {
  if (net?.getStatus) {
    try {
      const { connected } = await budget(ms)(net.getStatus());
      if (typeof connected === "boolean") return { online: connected, from: "native" };
    } catch { /* no answer inside the bound, or a plugin that would not say */ }
  }
  return { online: globalThis.navigator?.onLine !== false, from: "navigator" };
}

// A download the clock let go of, finished on its own time.
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

function nativeIO(fs = plugin("Filesystem")) {
  return {
    // The same bound said again where the OS can act on it: the page stops
    // waiting either way, and these keep the abandoned task from holding the
    // connection — a fetch left queued is one the next launch waits behind.
    download: (url, path) => fs.downloadFile({ url, path, directory: DIR, recursive: true,
                                               connectTimeout: NET_MS, readTimeout: NET_MS }),
    read: async (path) => {
      const { uri } = await fs.getUri({ path, directory: DIR });
      const r = await fetch(cap().convertFileSrc(uri));
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    },
    // rename() does not promise to overwrite on both platforms, so where it
    // refuses, the old copy goes first. Between those two calls the only copy
    // is the .new one — which is why the loader reads that too.
    replace: async (from, to) => {
      const move = () => fs.rename({ from, to, directory: DIR, toDirectory: DIR });
      try { await move(); }
      catch { await fs.deleteFile({ path: to, directory: DIR }).catch(() => {}); await move(); }
    },
    remove: (path) => fs.deleteFile({ path, directory: DIR }).catch(() => {}),
    // Is there a copy, and how big — asked of the file system, not of a parse
    // of 18 MB. Null means "not there", which is the only distinction the
    // loader needs before it decides how long to wait.
    size: async (path) => {
      try { return (await fs.stat({ path, directory: DIR })).size ?? null; }
      catch { return null; }
    },
    get: async (url) => {
      const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(NET_MS) });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
  };
}

// The site's loadJSON, done the app's way: papamap.de first, the stored copy
// when the network fails. Same contract as the service worker's
// X-PapaMap-Source header — { json, fromStore }.
//
// One read path, online and off: a launch with a network reads the very file
// a launch without one will, so a copy that cannot be read shows on the first
// day and not in the basement. The download lands beside the good copy and
// replaces it only once it has parsed. Should the downloader itself fail with
// a network there, the page's own fetch still draws the map — without a copy.
//
// Neither network call is waited on for longer than one budget between them:
// the pins are the point, and a copy on the phone that is read in 90 ms must
// not queue behind a request that is never going to be answered.
//
// `note` is filled in on the way through: which path answered, how long it
// took, what was said about the network, how big the stored copy is. The
// tests read it; the page does not (the TestFlight block that printed it, in
// builds 20 and 21, is gone). It is an out-parameter rather than a return
// value so that the { json, fromStore } contract app.js reads — and the `null`
// that means "nothing anywhere" — are exactly what they were.
export async function loadJSONNative(url, io = nativeIO(), {
  note = {}, copyMs = COPY_MS, netMs = NET_MS,
  online = globalThis.navigator?.onLine !== false, onlineFrom = "navigator",
} = {}) {
  const name = url.split("/").pop().split("?")[0];
  const path = `${DATA_PATH}/${name}`;
  const fresh = `${path}.new`;
  const began = Date.now();
  // Filled in before the first await, so a note the caller is holding is a
  // whole row from the moment the load starts: the dialog can be opened while
  // the four are still in flight and still print four lines.
  Object.assign(note, { file: name, step: "none", ms: 0, online, onlineFrom, bytes: null });
  const step = (s) => { note.step = s; note.ms = Date.now() - began; };

  // One stat, before anything is read or fetched: it decides both how long the
  // network gets and whether it is asked at all.
  const bytes = (await io.size(path)) ?? (await io.size(fresh));
  note.bytes = bytes;

  const stored = async () => {
    for (const [copy, s] of [[path, "stored"], [fresh, "stored-new"]]) {
      try {
        const json = await io.read(copy);
        step(s);
        return { json, fromStore: true };
      } catch { /* the other one */ }
    }
    return null;
  };

  // A reader the OS already says is offline is not made to wait for a network
  // to prove it. navigator.onLine lies in one direction only — a Wi-Fi with no
  // internet still reports "online" — so a false is worth acting on and a true
  // is worth nothing, which is the way round this needs it. With no copy there
  // is nothing to shortcut to, so that case goes the long way regardless.
  if (!online && bytes != null) {
    const hit = await stored();
    if (hit) return hit;
  }

  const net = budget(bytes == null ? netMs : copyMs);
  // Always a promise, never a throw. A missing Filesystem plugin makes
  // `fs.downloadFile` a synchronous TypeError, and thrown from out here — it
  // has to be started before the try, so that the clock can let go of it and
  // still leave something to hold — it would reject the whole load, and
  // boot()'s Promise.all with it, rather than fall through to the page's own
  // fetch the way the comment above this function promises. (`io.size` hides
  // the same missing plugin behind a null, so nothing upstream would notice.)
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
    return { json, fromStore: false };
  }
  // With the budget gone there is no time left to hear a second request, and
  // issuing one anyway is not free: the race below would reject on the next
  // tick while the fetch went on transferring a second copy of the dataset
  // nobody would read, over the metered link the download is still using.
  if (!net.spent()) {
    try {
      const fetched = await net(io.get(SITE + url));
      step("fetch");
      return { json: fetched, fromStore: false };
    } catch { /* no network, or none that answers */ }
  }
  const hit = await stored();
  // Only now, and not in the catch above. Promoting moves the very two files
  // the read has just been working through, and on iOS a rename over an
  // existing destination is refused, so the ordinary promotion is delete
  // `path` then rename `.new` onto it. Attached any earlier, a download that
  // landed while an 18 MB read was in flight — seconds, on a phone — would
  // unlink one file and consume the other underneath it, and a reader on a
  // link that finishes just after the clock would get no pins at all: the
  // exact failure this whole change exists to remove.
  if (late) promoteLate(io, late, fresh, path);
  if (hit) return hit;
  step("none");
  return null;
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
// This is still what the Route button's href says on every platform, and on
// the web and on Android it is still what a tap follows. In the iOS app the
// tap is caught and routePlan() below decides instead; the href is what is
// left when that cannot run at all.
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
  nativeIO().remove(`${DATA_PATH}/tiles-index.json`);
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
