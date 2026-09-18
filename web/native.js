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
//   - log in to OSM through the system browser and come back by URL;
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

async function writeText(path, text) {
  await plugin("Filesystem").writeFile({ path, data: text, directory: DIR, encoding: "utf8", recursive: true });
}
async function readText(path) {
  const r = await plugin("Filesystem").readFile({ path, directory: DIR, encoding: "utf8" });
  return r.data;
}

// The site's loadJSON, done the app's way: papamap.de first, the stored copy
// when the network fails. Same contract as the service worker's
// X-PapaMap-Source header — { json, fromStore }.
export async function loadJSONNative(url) {
  const name = url.split("/").pop().split("?")[0];
  const path = `${DATA_PATH}/${name}`;
  try {
    const r = await fetch(SITE + url, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const text = await r.text();
    const json = JSON.parse(text);
    writeText(path, text).catch(() => {});   // a full disk must not cost the live map
    return { json, fromStore: false };
  } catch {
    try { return { json: JSON.parse(await readText(path)), fromStore: true }; }
    catch { return null; }
  }
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
// system browser, the website's pages included.
export function openExternal(url) {
  const abs = /^https?:/.test(url) ? url : new URL(url, SITE).href;
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
export function directionsUri(lat, lon, label, geo) {
  if (platform() !== "ios") return geo;
  const at = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  return `maps://?q=${encodeURIComponent(label || "")}&ll=${at}&daddr=${at}`;
}

// ---- OSM login through the system browser ----
// The page's flow (osm.js) is unchanged: PKCE in sessionStorage, the intent
// too, and the consent screen is a URL. The two differences are where the
// URL opens (the system browser, so the reader's OSM session is theirs, not
// a WebView's) and how the code comes back (the papamap://auth URL, which
// the OS routes to the app; App's appUrlOpen delivers it here).
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

export async function cityCatalogue() {
  try {
    const r = await fetch(SITE + "tiles/index.json", { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const text = await r.text();
    writeText(`${DATA_PATH}/tiles-index.json`, text).catch(() => {});
    return JSON.parse(text);
  } catch {
    try { return JSON.parse(await readText(`${DATA_PATH}/tiles-index.json`)); }
    catch { return null; }
  }
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
