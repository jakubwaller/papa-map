// Reusable recipe for PapaMap's App Store screenshots: ten composed shots
// per language (map, nearest, room, route, search, filters, offline, me,
// widget, control) — the first eight from Playwright, the last two from
// Jakub's own iPhone — sized to Apple's iPhone 6.9" and iPad 13" screenshot
// specs (iPad gets the first eight only). Design: DESIGN.md next to this
// file (canvas sizes, colours, margins, the ten headlines/sublines in DE/EN).
//
// Two phases, both run by this one script:
//
//   1. raw shots — Playwright drives the app and screenshots the bare app
//      screen for each of the first eight shots, per device and language,
//      to <out-dir>/raw/<device>-<lang>-<NN>-<stem>.png.
//   2. compose — for every raw PNG (plus phone/widget.png and
//      phone/control.png, when present), renders the HTML template
//      described in DESIGN.md at the exact canvas size and screenshots it
//      to <out-dir>/final/<device>-<lang>-<NN>-<stem>.png — the headline,
//      subline and framed app screen in one image, ready to upload. Texts
//      live in texts.json next to this script, keyed by language and shot
//      number, with the headline's one accent word marked *like this*.
//
// Run from this directory after `npm i playwright` here (Chrome via the
// `chrome` channel, no separate browser download needed):
//
//   node shoot-store-screenshots.mjs <out-dir> [base-url] [--web] [--compose-only]
//
// <base-url> defaults to http://localhost:8080 — the app's own bundled
// shell (`cd app && npm ci && npm run build`, then serve app/www with
// `python3 -m http.server 8080`). Pass https://papamap.de to shoot the live
// website instead (the donate span, absent from the bundled shell, is
// hidden with injected CSS in that mode). --compose-only skips the raw-shot
// phase entirely and composes from whatever is already under
// <out-dir>/raw/ and <out-dir>/phone/ — use it to re-run the compose step
// alone after editing texts.json or the template, without re-driving a
// browser through the whole app.
//
// By default every shot runs under a stubbed `window.Capacitor`, so the page
// takes the exact branch it takes inside the real iOS app (bootNative() in
// web/app.js): the App-Store screenshots are the app's own first screen —
// brand, mode/status chips, map — not the website's four-link header and
// stats strip. Pass --web to shoot the plain website chrome instead (e.g.
// for og-card-style marketing shots, not store submission).
//
// Examples:
//   node shoot-store-screenshots.mjs ./out                    # raw + compose
//   node shoot-store-screenshots.mjs ./out --compose-only      # compose only
//   node shoot-store-screenshots.mjs ./out https://papamap.de  # app shell, live source
//   node shoot-store-screenshots.mjs ./out http://localhost:8080 --web  # website chrome
//
// A raw shot that cannot be produced (element not found, timeout) is
// skipped with a logged reason; the run does not abort for that. A failed
// *native-mode verification* (see verifyNativeShell below) is different:
// that throws and stops the whole run, because a screenshot that silently
// shows the website instead of the app is worse than no screenshot. A
// composed PNG whose pixel size does not match its canvas exactly also
// throws, at the very end, after every other shot has had its chance.
//
// Trap this dodges (same one shoot-og-cards.mjs documents): the site
// registers a service worker, and a stale one serves an old shell to a
// browser that already has one. Each device×language pair below runs in
// its own freshly launched browser + brand-new context, so there is no
// prior SW registration to inherit. The bundled shell (app/www) never
// registers a SW response that matters here — it 404s on sw.js and swallows
// the failure — but the live-site fallback still needs this.
//
// ---- The dataset, in native mode, with no Filesystem plugin ----
// app.js's boot() calls loadDataset(["data/changing_tables.geojson", ...]).
// isNative() true routes that through native.js's loadDatasetNative, which
// tries the Filesystem plugin's own downloader first (a stored copy on the
// phone, refreshed in the background). This script's Capacitor stub has no
// Filesystem plugin, by design — a real first-run app has no stored copy
// either. Every Filesystem access in native.js is null-guarded (verified by
// reading the source, and by web/native.test.js stubbing Capacitor the same
// bare way), so a missing plugin makes fs.downloadFile throw synchronously,
// caught, and loadJSONNative falls through to its own documented last
// resort: the page's own fetch of the absolute https://papamap.de/<path>
// URL (native.js's `io.get`, SITE + url) — exactly what native.js's own
// comments say a first-run phone with no stored copy does.
//
// Geolocation is the one plugin the stub carries (installNativeStub,
// below) — without it the nearest-table button's fix fails outright, see
// that function's own comment for why. The stub also seeds localStorage's
// intro key before any page script runs, so the welcome screen never sits
// over a shot.
//
// That absolute fetch hits the *same* /data/* path the bundled shell's
// relative fetch does, just against papamap.de directly instead of this
// page's own origin — so the one route handler below (installDataProxy)
// already catches both: it matches on path, not on host. Confirmed by
// logging every /data/* request while shooting the bundled shell under the
// native stub: four 200s, one per dataset file, all served through the
// proxy. No second proxy or code path was needed. The offline-cities shot
// (07-offline) needs one more of the same shape: native.js's cityCatalogue()
// reads tiles/index.json the same way, proxied by installTilesProxy below.
//
// The two vendored scripts bootNative() loads (vendor/pmtiles.js,
// vendor/protomaps/basemaps.js) are plain relative script tags, and
// build-www.js already copies the whole vendor/ tree into app/www — no
// extra wiring needed there either.
import { chromium } from "playwright";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const rawArgs = process.argv.slice(2);
const SHOOT_WEB = rawArgs.includes("--web");
const COMPOSE_ONLY = rawArgs.includes("--compose-only");
const canvasFlagIndex = rawArgs.indexOf("--canvas");
const CANVAS_FILTER = canvasFlagIndex === -1 ? null : rawArgs[canvasFlagIndex + 1];
const positional = rawArgs.filter((a, i) => {
  if (a === "--web" || a === "--compose-only") return false;
  if (a === "--canvas" || (canvasFlagIndex !== -1 && i === canvasFlagIndex + 1)) return false;
  return true;
});
const OUT_DIR = positional[0];
const BASE_URL = positional[1] || "http://localhost:8080";

if (!OUT_DIR) {
  console.error("usage: node shoot-store-screenshots.mjs <out-dir> [base-url] [--web] [--compose-only] [--canvas <name>]");
  process.exit(1);
}
if (canvasFlagIndex !== -1 && !CANVAS_FILTER) {
  console.error("--canvas needs a value, e.g. --canvas iphone65");
  process.exit(1);
}
mkdirSync(`${OUT_DIR}/raw`, { recursive: true });
mkdirSync(`${OUT_DIR}/final`, { recursive: true });

const IS_LIVE = /(^|\.)papamap\.de$/.test(new URL(BASE_URL).hostname);
const NATIVE_STUB = !SHOOT_WEB;

// Hamburg Rathaus — a real address inside the sweep, so the nearest-table
// button and the auto-centred "you are here" dot both land somewhere the
// map actually has pins for.
const HAMBURG_RATHAUS = { latitude: 53.5503, longitude: 9.9937 };

// Apple's screenshot spec (App Store Connect, read 2026-09): CSS viewport ×
// deviceScaleFactor must equal the exact pixel size Apple asks for, or the
// upload is rejected outright. Used for the raw-shot phase.
const DEVICES = {
  iphone69: {
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,        // -> 1320x2868
    isMobile: true,
    hasTouch: true,
  },
  ipad13: {
    viewport: { width: 1032, height: 1376 },
    deviceScaleFactor: 2,        // -> 2064x2752
    isMobile: false,
    hasTouch: true,
  },
  // Google Play's phone screenshots. Shorter than a modern phone so that
  // most of the screen still fits in the 9:16 `play` canvas's frame.
  android: {
    viewport: { width: 412, height: 800 },
    deviceScaleFactor: 3,        // -> 1236x2400
    isMobile: true,
    hasTouch: true,
    platform: "android",
  },
};

// The composed canvas, per DESIGN.md's table: exact final pixel size, the
// framed screenshot's width, the side margin shared by the headline/subline
// and the frame, headline/subline font sizes, the frame's corner radius,
// and `gap` — the headline-to-subline spacing, the one distance DESIGN.md
// leaves to the template rather than naming a px value for (it does fix the
// headline's own top offset at 150px and the subline-to-frame gap at 80px;
// `gap` is chosen to sit comfortably between those two, roughly
// proportional to the headline size).
// iphone65 is not a separate raw shot — App Store Connect's iPhone slot for
// this app is the 6.5" Display size (1284x2778 or 1242x2688), not the 6.9"
// one the raw shots are taken at. `rawDevice` tells composeAll to source its
// frame image from the iphone69 raw shots instead of shooting its own: the
// frame scales the image to frameWidth and lets it bleed off the canvas
// bottom, so the raw image's own aspect ratio never has to match the canvas.
const DEVICE_CANVAS = {
  iphone69: { width: 1320, height: 2868, frameWidth: 1140, margin: 90, headlineSize: 88, sublineSize: 44, radius: 72, gap: 26 },
  iphone65: { width: 1284, height: 2778, frameWidth: 1110, margin: 87, headlineSize: 86, sublineSize: 43, radius: 70, gap: 26, rawDevice: "iphone69" },
  ipad13: { width: 2064, height: 2752, frameWidth: 1560, margin: 252, headlineSize: 96, sublineSize: 48, radius: 60, gap: 30 },
  // Google Play phone: 9:16, or Play's asset library marks the image
  // "needs cropping" (seen 2026-10-02 on a 1:2 set). `texts: "android"` swaps
  // in the sublines that name Android features instead of Siri, Control
  // Center and Apple Maps.
  play: { width: 1440, height: 2560, frameWidth: 1152, margin: 144, headlineSize: 92, sublineSize: 46, radius: 72, gap: 28, rawDevice: "android", texts: "android" },
};

const LANGS = {
  de: { locale: "de-DE", query: "hamburg rathaus" },
  en: { locale: "en-US", query: "hamburg rathaus" },
};

// The eight Playwright shots, in store order (DESIGN.md's "Shots, in store
// order" table). `nn` doubles as the key into texts.json.
const STEMS = [
  { nn: "01", name: "map" },
  { nn: "02", name: "nearest" },
  { nn: "03", name: "room" },
  { nn: "04", name: "route" },
  { nn: "05", name: "search" },
  { nn: "06", name: "filters" },
  { nn: "07", name: "offline" },
  { nn: "08", name: "me" },
];

// Shots 9 and 10: Jakub's own iPhone screenshots, composed straight from
// <out-dir>/phone/<name>.png when present. iPhone only, both languages
// reuse the same source image (DESIGN.md: "the phone is in German, so the
// English set reuses them").
const PHONE_STEMS = [
  { nn: "09", name: "widget" },
  { nn: "10", name: "control" },
];

// One proxy per browser context: forwards any /data/*.geojson|json request —
// whether the bundled shell's own relative fetch or native.js's absolute
// fetch to papamap.de (see the file header) — through to the live dataset.
async function installDataProxy(page) {
  await page.route("**/data/*", async (route) => {
    const u = new URL(route.request().url());
    const target = `https://papamap.de${u.pathname}${u.search}`;
    try {
      const r = await fetch(target);
      const body = Buffer.from(await r.arrayBuffer());
      await route.fulfill({
        status: r.status,
        headers: { "content-type": r.headers.get("content-type") || "application/json" },
        body,
      });
    } catch {
      await route.abort();
    }
  });
}

// Same shape as installDataProxy, for the one other absolute fetch native.js
// makes with no Filesystem plugin backing it: cityCatalogue()'s
// tiles/index.json, needed to fill the offline dialog's city list
// (07-offline).
async function installTilesProxy(page) {
  await page.route("**/tiles/index.json", async (route) => {
    try {
      const r = await fetch("https://papamap.de/tiles/index.json");
      const body = Buffer.from(await r.arrayBuffer());
      await route.fulfill({
        status: r.status,
        headers: { "content-type": r.headers.get("content-type") || "application/json" },
        body,
      });
    } catch {
      await route.abort();
    }
  });
}

// Installed before any page script runs (Playwright's addInitScript runs on
// every document the context ever navigates to, ahead of the page's own
// scripts) — the same shape web/native.test.js:833 stubs it with, minus the
// App plugin this script never needs.
//
// Plugins is deliberately near-empty, not entirely — same principle as the
// test stub, which only carries what that test exercises. Filesystem is
// left out on purpose (native.js's loader falls through to its own
// documented last resort, the page's own fetch of papamap.de — see the file
// header), which is what a real first-run phone with no stored copy does
// too. Geolocation is one of two plugins added back in: without it,
// locateNative() (web/native.js, called from app.js's locate() whenever
// isNative() is true) is NOT null-guarded the way every other plugin access
// in that file is — `plugin("Geolocation")` comes back undefined and
// `geo.checkPermissions()` throws, so the nearest-table button's fix fails
// outright and its popup never opens (confirmed: every "nearest" shot timed
// out until this was added). The real app always ships @capacitor/geolocation
// (app/package.json), so a screenshot session with none is not actually
// representative of a real phone — this stub delegates the plugin's own
// checkPermissions/requestPermissions/watchPosition/clearWatch calls
// straight to the browser's own navigator.geolocation, which Playwright's
// context.geolocation + permissions:["geolocation"] already feed with
// Hamburg Rathaus, so the fix behaves exactly as the website's own
// non-native locate() path already did.
//
// The stub's addInitScript also pre-seeds localStorage's papamap-intro key
// with a pin far ahead of the shell's ("app99999"), before any page script
// runs, so maybeShowIntro() finds neither an intro nor notes to show over a
// shot's own popup or dialog.
//
// No AppLauncher plugin: native.js's planRoute (the Route button's iOS
// cascade) throws "no AppLauncher" with none present, and app.js's own
// .catch just leaves the anchor as a plain link — no dialog opens, which is
// exactly what 04-route wants to show (see that shot's own comment for why
// the chooser dialog was dropped).
async function installNativeStub(context, platform) {
  await context.addInitScript((platform) => {
    // A pin far ahead of the shell's, so introKind shows neither the intro nor notes.
    try { localStorage.setItem("papamap-intro", "app99999"); } catch { /* storage blocked: the intro would show over the shots */ }
    const geolocationPlugin = {
      checkPermissions: () => Promise.resolve({ location: "granted", coarseLocation: "granted" }),
      requestPermissions: () => Promise.resolve({ location: "granted", coarseLocation: "granted" }),
      getCurrentPosition: (options) => new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ coords: pos.coords, timestamp: pos.timestamp }),
          (err) => reject(err),
          options,
        );
      }),
      watchPosition: (options, callback) => {
        const id = navigator.geolocation.watchPosition(
          (pos) => callback({ coords: pos.coords, timestamp: pos.timestamp }, null),
          (err) => callback(null, err),
          options,
        );
        return Promise.resolve(id);
      },
      clearWatch: ({ id }) => { navigator.geolocation.clearWatch(id); return Promise.resolve(); },
    };
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: { Geolocation: geolocationPlugin },
    };
  }, platform);
}

// Hard gate: if the page did not actually take the native branch — wrong
// classes, the App button still showing, the stats strip still sitting in
// the header (moved out, or hidden by .native CSS) — every later shot would quietly screenshot the website
// instead of the app, which is worse than the script simply refusing to
// run. Throws, rather than returning a bool, so a failure here stops the
// whole run instead of producing 20 mislabelled PNGs.
async function verifyNativeShell(page, label) {
  const state = await page.evaluate(() => {
    const html = document.documentElement;
    const appLink = document.getElementById("app-link");
    return {
      platform: window.Capacitor?.getPlatform?.(),
      classes: [...html.classList],
      appLinkHidden: !!appLink?.hidden,
      statsInTopbar: [...document.querySelectorAll("#topbar .stats-wrap")].some((el) => el.offsetParent !== null),
      headerActionsInTopbar: [...document.querySelectorAll("#topbar .header-actions")].some((el) => el.offsetParent !== null),
    };
  });
  const problems = [];
  if (!state.classes.includes("native")) problems.push("html is missing the 'native' class");
  // The arrow-shaped locate button: on the iPhone app only, never on Android.
  if (state.platform === "ios" && !state.classes.includes("ios")) problems.push("html is missing the 'ios' class");
  if (state.platform !== "ios" && state.classes.includes("ios")) problems.push(`html has the 'ios' class on ${state.platform}`);
  if (!state.appLinkHidden) problems.push("#app-link is not hidden (App button still visible)");
  if (state.statsInTopbar) problems.push(".stats-wrap is still showing in #topbar");
  if (state.headerActionsInTopbar) problems.push(".header-actions is still showing in #topbar");
  if (problems.length) {
    throw new Error(
      `[${label}] native-mode verification failed — this would be a website screenshot, not an app one:\n` +
      problems.map((p) => `  - ${p}`).join("\n") +
      `\n  html classes seen: ${state.classes.join(" ") || "(none)"}`,
    );
  }
  console.log(`[${label}] native-mode verified: html.class="${state.classes.join(" ")}", app-link hidden, stats/nav out of header`);
}

async function waitForMapReady(page) {
  await page.waitForFunction(() => window._papamap && typeof window._papamap.jumpTo === "function", { timeout: 30000 });
  await page.waitForFunction(() => window._papamap.loaded(), { timeout: 30000 });
  // The stats strip must carry real counts, not a "data/stats.json is
  // missing" placeholder baked in by a transient fetch miss. In native mode
  // #stats has been moved into #me-about (still in the DOM, just hidden
  // behind the closed dialog) — querySelector finds it either way.
  await page.waitForFunction(
    () => document.querySelectorAll("#stats .stat").length >= 2
      && !/stats\.json/.test(document.querySelector("#stats")?.textContent || ""),
    { timeout: 30000 },
  );
}

async function settleMap(page) {
  await page.waitForTimeout(2500);
  await page.waitForFunction(
    () => !window._papamap.isMoving() && !window._papamap.isZooming(),
    { timeout: 15000 },
  ).catch(() => {});
  await page.waitForTimeout(500);
}

// Full state reset between shots: reload the same page rather than
// undoing each shot's own UI changes by hand. A reload keeps the context's
// addInitScript (the Capacitor stub, including the intro key) and the
// page's own route handlers (installDataProxy, installTilesProxy) — both
// survive navigation on the same page/context — while wiping every bit of
// pure in-page JS state a previous shot touched: the chip filters (`visible`,
// `playOnly`, `placesOn` — none of them persisted, confirmed by reading
// every localStorage call in web/app.js), the chip bar's scroll position,
// the search field, and any open popup or dialog. Mode is not pure in-page
// state, though: applyMode() and the boot-time read both persist/restore it
// via localStorage's papamap-mode (web/app.js's own line numbers move, but
// grep for "papamap-mode" finds both the read at boot and the write on every
// toggle), so a reload on its own would bring 06's Mama choice right back —
// confirmed: 07-offline and 08-me still showed Mama and the Mama chips after
// a plain reload. The one other persisted filter-like key is
// papamap-wheelchair (datasource.js's WHEELCHAIR_KEY); nothing in this
// script sets it any more (04's old wheelchair-chip click was dropped), but
// it is cleared here too in case an earlier run's browser profile carried
// it over. papamap-lang is deliberately left alone — that is the language
// this whole device/lang run is shooting, and changing it would undo the
// context's own `?lang=` navigation. Re-centres on the same wide Hamburg
// view every shot starts from, and re-runs verifyNativeShell since
// bootNative() runs again on the fresh document.
async function reloadFresh(page, prefix) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("papamap-mode", "papa");
      localStorage.removeItem("papamap-wheelchair");
    } catch { /* storage blocked: nothing to reset, and nothing was persisted either */ }
  });
  await page.reload({ waitUntil: "networkidle", timeout: 45000 });
  if (IS_LIVE) {
    // Lost on reload like any other injected style tag — same donate-span
    // hide the first page.goto applied, re-applied here.
    await page.addStyleTag({ content: ".donate{display:none!important}" });
  }
  await waitForMapReady(page);
  if (NATIVE_STUB) await verifyNativeShell(page, prefix);
  // Belt and braces on top of the localStorage reset above: fail loudly,
  // right here, if Papa mode did not actually come back — rather than
  // producing a Mama-mode "Papa" shot three steps later with no obvious
  // cause.
  await page.waitForFunction(
    () => document.getElementById("mode-papa")?.classList.contains("on")
      && document.getElementById("mode-papa")?.getAttribute("aria-pressed") === "true",
    { timeout: 10000 },
  );
  await page.evaluate(() => window._papamap.jumpTo({ center: [9.9937, 53.5503], zoom: 13 }));
  await settleMap(page);
}

async function closeAnyPopup(page) {
  const closeBtn = page.locator(".maplibregl-popup-close-button").first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click().catch(() => {});
    await page.waitForSelector(".maplibregl-popup", { state: "detached", timeout: 5000 }).catch(() => {});
  }
}

// Walks the rendered table pins, in DOM/paint order, filtered to a status
// (when given) and to ones that actually resolve (via elementFromPoint) to
// the map canvas rather than overlay chrome sitting on top of it — the
// topbar or, in native mode, the search field can cover the first rendered
// pins, confirmed on iPad 13". Falls back to any clickable pin when
// preferStatus finds none, unless onlyPreferred is set.
async function clickablePins(page, preferStatus, onlyPreferred = false) {
  return page.evaluate(({ preferStatus, onlyPreferred }) => {
    const map = window._papamap;
    const feats = map.queryRenderedFeatures(undefined, { layers: ["tables"] });
    const clickable = (f) => {
      const p = map.project(f.geometry.coordinates);
      const el = document.elementFromPoint(p.x, p.y);
      return el && el.tagName === "CANVAS" ? { x: p.x, y: p.y } : null;
    };
    const out = [];
    for (const f of feats) {
      if (f.properties?.status !== preferStatus) continue;
      const pt = clickable(f);
      if (pt) out.push({ ...pt, status: preferStatus });
    }
    if (!onlyPreferred) {
      for (const f of feats) {
        if (f.properties?.status === preferStatus) continue;
        const pt = clickable(f);
        if (pt) out.push({ ...pt, status: f.properties?.status ?? "unknown" });
      }
    }
    return out;
  }, { preferStatus, onlyPreferred });
}

async function shootDevice(deviceName, device, langName, lang, outDir) {
  const results = [];
  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  try {
    const { platform = "ios", ...contextOptions } = device;
    const context = await browser.newContext({
      ...contextOptions,
      geolocation: HAMBURG_RATHAUS,
      permissions: ["geolocation"],
      locale: lang.locale,
    });
    if (NATIVE_STUB) await installNativeStub(context, platform);
    const page = await context.newPage();
    if (!IS_LIVE) {
      await installDataProxy(page);
      await installTilesProxy(page);
    }

    await page.goto(`${BASE_URL}/?lang=${langName}`, { waitUntil: "networkidle", timeout: 45000 });

    if (IS_LIVE) {
      // The website's donate span (absent from the bundled shell already —
      // app/build-www.js cuts it out via shell.mjs). Native mode moves the
      // rest of the header out of sight on its own; this is the one bit
      // native mode does not touch.
      await page.addStyleTag({ content: ".donate{display:none!important}" });
    }

    await waitForMapReady(page);

    const prefix = `${deviceName}-${langName}`;
    if (NATIVE_STUB) await verifyNativeShell(page, prefix);

    const shotPath = (nn, name) => `${outDir}/raw/${prefix}-${nn}-${name}.png`;

    // ---- 01: map — Hamburg city centre, several pins on screen ----
    await page.evaluate(() => window._papamap.jumpTo({ center: [9.9937, 53.5503], zoom: 13 }));
    await settleMap(page);
    let path = shotPath("01", "map");
    await page.screenshot({ path });
    results.push({ shot: "map", path, ok: true });
    console.log(`[${prefix}] wrote ${path}`);

    // ---- 02: nearest — tap the "nearest table" pill, wait for its popup ----
    try {
      await page.click("#nearest");
      await page.waitForSelector(".maplibregl-popup .popup", { timeout: 10000 });
      await settleMap(page);
      path = shotPath("02", "nearest");
      await page.screenshot({ path });
      results.push({ shot: "nearest", path, ok: true });
      console.log(`[${prefix}] wrote ${path}`);
    } catch (err) {
      console.error(`[${prefix}] SKIP nearest: ${err.message}`);
      results.push({ shot: "nearest", ok: false, reason: err.message });
    }

    // ---- 03: room — a grey (status "unknown") pin's popup, room question open ----
    // Every shot from here on starts with reloadFresh: #nearest (02) just
    // flew the map to zoom>=16 around one specific table (app.js's
    // nearestBtn handler) — a view far too tight to reliably still have a
    // grey pin in it — and, more generally, nothing before this point
    // should be able to leak into this shot or any later one (mode, chip
    // filters, chip-bar scroll, search field, an open popup/dialog).
    await reloadFresh(page, prefix);
    try {
      const candidates = await clickablePins(page, "unknown", true);
      if (!candidates.length) throw new Error("no clickable grey (unknown-status) pin in view");
      let opened = false;
      for (const pt of candidates) {
        await page.mouse.click(pt.x, pt.y);
        const popup = await page.waitForSelector(".maplibregl-popup .popup", { timeout: 4000 }).catch(() => null);
        if (popup && await page.locator(".maplibregl-popup .ask .ask-btn[data-room]").count() > 0) {
          opened = true;
          break;
        }
        await closeAnyPopup(page);
      }
      if (!opened) throw new Error("every grey pin in view already has its room answered (no open room question to show)");
      await page.waitForTimeout(400);
      path = shotPath("03", "room");
      await page.screenshot({ path });
      results.push({ shot: "room", path, ok: true });
      console.log(`[${prefix}] wrote ${path}`);
    } catch (err) {
      console.error(`[${prefix}] SKIP room: ${err.message}`);
      results.push({ shot: "room", ok: false, reason: err.message });
    }

    // ---- 04: route — a green pin's popup, its Route button visible, no dialog ----
    // Not clicking Route on purpose: native.js's routePlan opens Apple Maps
    // directly whenever `maps:` can be opened (step 2 of the cascade,
    // web/native.js's own comment), and the #route-dialog chooser only ever
    // appears on a phone with no Apple Maps installed and two or more other
    // navigation apps present — an edge case, not what most readers see.
    // Screenshotting that dialog would misrepresent the feature. The popup
    // with its Route button standing there is what every reader actually
    // gets. (No AppLauncher plugin in the stub any more, accordingly — see
    // installNativeStub.)
    await reloadFresh(page, prefix);
    try {
      const candidates = await clickablePins(page, "accessible");
      if (!candidates.length) throw new Error("no clickable table pin found (all rendered pins sit under overlay chrome)");
      const target = candidates[0];
      if (target.status !== "accessible") console.log(`[${prefix}] route: no clickable green pin in view, used a "${target.status}" one instead`);
      await page.mouse.click(target.x, target.y);
      await page.waitForSelector(".maplibregl-popup .popup", { timeout: 8000 });
      const routeBtn = page.locator(".maplibregl-popup a[data-route]").first();
      if (!(await routeBtn.isVisible().catch(() => false))) throw new Error("popup has no visible Route button");
      await page.waitForTimeout(400);
      path = shotPath("04", "route");
      await page.screenshot({ path });
      results.push({ shot: "route", path, ok: true });
      console.log(`[${prefix}] wrote ${path}`);
    } catch (err) {
      console.error(`[${prefix}] SKIP route: ${err.message}`);
      results.push({ shot: "route", ok: false, reason: err.message });
    }

    // ---- 05: search — type a query, wait for result rows ----
    await reloadFresh(page, prefix);
    try {
      await page.click("#search-input");
      await page.type("#search-input", lang.query, { delay: 40 });
      await page.waitForSelector("#search-results li.search-opt", { timeout: 8000 });
      await page.waitForTimeout(500);
      path = shotPath("05", "search");
      await page.screenshot({ path });
      results.push({ shot: "search", path, ok: true });
      console.log(`[${prefix}] wrote ${path}`);
    } catch (err) {
      console.error(`[${prefix}] SKIP search: ${err.message}`);
      results.push({ shot: "search", ok: false, reason: err.message });
    }

    // ---- 06: filters — Mama view, no chip filter active, chip bar at
    // scroll 0, Papa/Mama toggle visible and Mama highlighted ----
    // No chip click at all, on purpose: an active play chip narrows the map
    // down to just the play-corner pins, and on iPhone that chip sits off
    // screen at scroll 0 too — the shot read as "few pins, no reason". Mode
    // alone gives a map full of Mama-view pins with the toggle itself
    // carrying the "filters" idea.
    await reloadFresh(page, prefix);
    try {
      await page.click("#mode-mama");
      await page.waitForFunction(
        () => document.getElementById("mode-mama")?.classList.contains("on")
          && document.getElementById("mode-mama")?.getAttribute("aria-pressed") === "true",
        { timeout: 5000 },
      );
      await page.waitForTimeout(300);
      path = shotPath("06", "filters");
      await page.screenshot({ path });
      results.push({ shot: "filters", path, ok: true });
      console.log(`[${prefix}] wrote ${path}`);
    } catch (err) {
      console.error(`[${prefix}] SKIP filters: ${err.message}`);
      results.push({ shot: "filters", ok: false, reason: err.message });
    }

    // ---- 07: offline — the city download dialog, list filled ----
    await reloadFresh(page, prefix);
    try {
      await page.click("#offline");
      await page.waitForSelector("#offline-dialog[open]", { timeout: 8000 });
      await page.waitForFunction(() => document.querySelectorAll("#offline-list li").length > 0, { timeout: 15000 });
      await page.waitForTimeout(400);
      path = shotPath("07", "offline");
      await page.screenshot({ path });
      results.push({ shot: "offline", path, ok: true });
      console.log(`[${prefix}] wrote ${path}`);
    } catch (err) {
      console.error(`[${prefix}] SKIP offline: ${err.message}`);
      results.push({ shot: "offline", ok: false, reason: err.message });
    }

    // ---- 08: me — "Mein PapaMap", stats rendered ----
    await reloadFresh(page, prefix);
    try {
      await page.click("#me");
      await page.waitForSelector("#me-dialog[open]", { timeout: 8000 });
      await page.waitForFunction(() => (document.getElementById("me-stats")?.children.length || 0) > 0, { timeout: 8000 });
      await page.waitForTimeout(400);
      path = shotPath("08", "me");
      await page.screenshot({ path });
      results.push({ shot: "me", path, ok: true });
      console.log(`[${prefix}] wrote ${path}`);
    } catch (err) {
      console.error(`[${prefix}] SKIP me: ${err.message}`);
      results.push({ shot: "me", ok: false, reason: err.message });
    }
    await page.evaluate(() => document.getElementById("me-dialog")?.close()).catch(() => {});
  } finally {
    await browser.close();
  }
  return results;
}

// ---- Compose: headline + subline + framed app screen, per DESIGN.md ----

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// One accent word at most, marked `*like this*` in texts.json — everything
// else is plain ink-coloured text (DESIGN.md: "One accent per headline at
// most").
function headlineToHtml(raw) {
  const m = raw.match(/^(.*?)\*(.+?)\*(.*)$/s);
  if (!m) return escapeHtml(raw);
  const [, before, accent, after] = m;
  return `${escapeHtml(before)}<span class="accent">${escapeHtml(accent)}</span>${escapeHtml(after)}`;
}

// The HTML template DESIGN.md describes: background #eef1ef, headline 150px
// from the top at the side margin (max two lines, one accent word in
// #009e73), subline under it (max two lines, muted), the frame starting
// 80px under the subline and running past the canvas's bottom edge rather
// than shrinking to fit — achieved by giving the canvas a fixed height with
// overflow hidden and letting Playwright's default (viewport-only, not
// full-page) screenshot do the rest. The inline script measures the
// rendered headline/subline after fonts and layout settle (no server
// round-trip needed: everything here is inline or a data URL) and
// positions the subline and frame from those measurements, then shrinks
// either block's font size if it still wraps past two lines before marking
// the page ready.
function buildComposeHtml({ canvas, headlineHTML, sublineText, imageDataUrl }) {
  const { width, height, frameWidth, margin, headlineSize, sublineSize, radius, gap } = canvas;
  const contentWidth = width - margin * 2;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: #eef1ef; overflow: hidden; }
  * { box-sizing: border-box; font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; }
  #canvas { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: #eef1ef; }
  #headline {
    position: absolute; top: 150px; left: ${margin}px; width: ${contentWidth}px;
    font-size: ${headlineSize}px; font-weight: 700; line-height: 1.15; color: #1c2b26;
  }
  #headline .accent { color: #009e73; }
  #subline {
    position: absolute; left: ${margin}px; width: ${contentWidth}px;
    font-size: ${sublineSize}px; font-weight: 400; line-height: 1.35; color: #64716b;
  }
  #frame {
    position: absolute; left: 50%; transform: translateX(-50%); width: ${frameWidth}px;
    border-radius: ${radius}px; overflow: hidden; border: 1px solid #d8ded9;
    box-shadow: 0 24px 60px rgba(28, 43, 38, .18); background: #fff;
  }
  #frame img { display: block; width: 100%; height: auto; }
</style></head>
<body>
  <div id="canvas">
    <div id="headline">${headlineHTML}</div>
    <div id="subline">${escapeHtml(sublineText)}</div>
    <div id="frame"><img src="${imageDataUrl}"></div>
  </div>
  <script>
  (function () {
    var GAP = ${gap};
    function fit(el, maxLines, minSize) {
      var size = parseFloat(getComputedStyle(el).fontSize);
      function lineCount() {
        var lh = parseFloat(getComputedStyle(el).lineHeight);
        return Math.round(el.scrollHeight / lh);
      }
      var guard = 0;
      while (lineCount() > maxLines && size > minSize && guard < 60) {
        size -= 1;
        el.style.fontSize = size + "px";
        guard++;
      }
    }
    function ready() {
      var headline = document.getElementById("headline");
      var subline = document.getElementById("subline");
      var frame = document.getElementById("frame");
      var canvas = document.getElementById("canvas");
      fit(headline, 2, 40);
      var canvasTop = canvas.getBoundingClientRect().top;
      var headlineBottom = headline.getBoundingClientRect().bottom;
      subline.style.top = (headlineBottom - canvasTop + GAP) + "px";
      fit(subline, 2, 24);
      var sublineBottom = subline.getBoundingClientRect().bottom;
      frame.style.top = (sublineBottom - canvasTop + 80) + "px";
      document.body.setAttribute("data-ready", "1");
    }
    if (document.readyState === "complete") ready();
    else window.addEventListener("load", ready);
  })();
  </script>
</body></html>`;
}

async function composeOne(browser, { canvas, srcPath, outPath, headline, subline }) {
  const b64 = readFileSync(srcPath).toString("base64");
  const imageDataUrl = `data:image/png;base64,${b64}`;
  const html = buildComposeHtml({ canvas, headlineHTML: headlineToHtml(headline), sublineText: subline, imageDataUrl });
  const context = await browser.newContext({ viewport: { width: canvas.width, height: canvas.height }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
    await page.waitForTimeout(50);
    await page.screenshot({ path: outPath });
  } finally {
    await context.close();
  }
}

async function composeAll(outDir) {
  const texts = JSON.parse(readFileSync(new URL("./texts.json", import.meta.url), "utf8"));
  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const results = [];
  const canvasEntries = CANVAS_FILTER
    ? Object.entries(DEVICE_CANVAS).filter(([deviceName]) => deviceName === CANVAS_FILTER)
    : Object.entries(DEVICE_CANVAS);
  if (CANVAS_FILTER && canvasEntries.length === 0) {
    throw new Error(`--canvas ${CANVAS_FILTER}: no such canvas preset (known: ${Object.keys(DEVICE_CANVAS).join(", ")})`);
  }
  try {
    for (const [deviceName, canvas] of canvasEntries) {
      for (const langName of Object.keys(LANGS)) {
        for (const { nn, name } of STEMS) {
          const rawDeviceName = canvas.rawDevice || deviceName;
          const rawPath = `${outDir}/raw/${rawDeviceName}-${langName}-${nn}-${name}.png`;
          const finalPath = `${outDir}/final/${deviceName}-${langName}-${nn}-${name}.png`;
          if (!existsSync(rawPath)) {
            console.log(`[compose] SKIP ${finalPath}: no raw shot at ${rawPath}`);
            results.push({ ok: false, path: finalPath, reason: `missing raw shot ${rawPath}` });
            continue;
          }
          const t = (canvas.texts && texts[canvas.texts]?.[langName]?.[nn]) || texts[langName]?.[nn];
          if (!t) {
            console.log(`[compose] SKIP ${finalPath}: no texts.json entry for ${langName}/${nn}`);
            results.push({ ok: false, path: finalPath, reason: `no texts.json entry for ${langName}/${nn}` });
            continue;
          }
          await composeOne(browser, { canvas, srcPath: rawPath, outPath: finalPath, headline: t.headline, subline: t.subline });
          results.push({ ok: true, path: finalPath, expectedWidth: canvas.width, expectedHeight: canvas.height });
          console.log(`[compose] wrote ${finalPath}`);
        }
      }
    }

    // Phone shots (09-widget, 10-control): iPhone 6.9" only, composed only
    // when the source screenshots have been dropped in <out-dir>/phone/.
    // Their output path is hardcoded to iphone69-*, so skip this block
    // entirely when --canvas names a different preset.
    for (const langName of CANVAS_FILTER && CANVAS_FILTER !== "iphone69" ? [] : Object.keys(LANGS)) {
      for (const { nn, name } of PHONE_STEMS) {
        const finalPath = `${outDir}/final/iphone69-${langName}-${nn}-${name}.png`;
        const phonePath = `${outDir}/phone/${name}.png`;
        if (!existsSync(phonePath)) {
          console.log(`[compose] SKIP ${finalPath}: no phone/${name}.png (drop it there to include this shot)`);
          continue;
        }
        const t = texts[langName]?.[nn];
        if (!t) {
          console.log(`[compose] SKIP ${finalPath}: no texts.json entry for ${langName}/${nn}`);
          continue;
        }
        await composeOne(browser, {
          canvas: DEVICE_CANVAS.iphone69, srcPath: phonePath, outPath: finalPath,
          headline: t.headline, subline: t.subline,
        });
        results.push({ ok: true, path: finalPath, expectedWidth: DEVICE_CANVAS.iphone69.width, expectedHeight: DEVICE_CANVAS.iphone69.height });
        console.log(`[compose] wrote ${finalPath}`);
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

function pixelSize(path) {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path]).toString();
  const w = /pixelWidth: (\d+)/.exec(out)?.[1];
  const h = /pixelHeight: (\d+)/.exec(out)?.[1];
  return `${w}x${h}`;
}

async function main() {
  if (!COMPOSE_ONLY) {
    const summary = [];
    // With --canvas, only the raw device that canvas is composed from.
    const rawWanted = CANVAS_FILTER && (DEVICE_CANVAS[CANVAS_FILTER]?.rawDevice || CANVAS_FILTER);
    for (const [deviceName, device] of Object.entries(DEVICES)) {
      if (rawWanted && deviceName !== rawWanted) continue;
      for (const [langName, lang] of Object.entries(LANGS)) {
        const results = await shootDevice(deviceName, device, langName, lang, OUT_DIR);
        summary.push(...results.map((r) => ({ device: deviceName, lang: langName, ...r })));
      }
    }
    console.log("\n---- raw shots ----");
    for (const r of summary) {
      if (r.ok) console.log(`OK   ${r.device}-${r.lang}-${r.shot}: ${pixelSize(r.path)}  (${r.path})`);
      else console.log(`SKIP ${r.device}-${r.lang}-${r.shot}: ${r.reason}`);
    }
  } else {
    console.log(`--compose-only: skipping raw shots, composing from ${OUT_DIR}/raw and ${OUT_DIR}/phone`);
  }

  const composeResults = await composeAll(OUT_DIR);
  console.log("\n---- composed (final) ----");
  const mismatches = [];
  for (const r of composeResults) {
    if (!r.ok) { console.log(`SKIP ${r.path}: ${r.reason}`); continue; }
    const actual = pixelSize(r.path);
    const expected = `${r.expectedWidth}x${r.expectedHeight}`;
    if (actual !== expected) mismatches.push(`${r.path}: expected ${expected}, got ${actual}`);
    console.log(`${actual === expected ? "OK  " : "BAD "} ${r.path}: ${actual}`);
  }
  if (mismatches.length) {
    throw new Error(`final PNG size mismatch — the stores reject anything off-spec:\n${mismatches.map((m) => `  - ${m}`).join("\n")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
