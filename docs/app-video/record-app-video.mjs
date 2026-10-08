// Records short videos of the app's bundled shell with Playwright — the raw
// material for the App Store preview, a social clip and the install page's
// loop. Same driving pattern as ../store-screenshots/shoot-store-screenshots.mjs
// (Capacitor stub, data proxy, pin walking); read that file's comments for the
// why behind the stub and the proxies. This file only adds what a moving
// picture needs: a caption band above the app, a tap ripple, a faked OSM
// write so the two-tap answer can be shown end to end, and a timeline.
//
//   node record-app-video.mjs <out-dir> --profile store|social|loop --lang de|en [base-url]
//
// Output: <out-dir>/<profile>-<lang>.webm (Playwright's raw recording),
// <out-dir>/<profile>-<lang>.json (segment timeline, seconds from video
// start). encode.sh turns them into the deliverables.

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1]; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const OUT_DIR = positional[0];
const BASE_URL = positional[1] || "http://127.0.0.1:8099";
const PROFILE = flag("--profile", "store");
const LANG = flag("--lang", "de");
if (!OUT_DIR) {
  console.error("usage: node record-app-video.mjs <out-dir> --profile store|social|loop --lang de|en [base-url]");
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

// Apple's app-preview size for the large iPhones is 886×1920 (App Store
// Connect, app preview specifications, read 2026-10-08): the app at 443×960
// CSS px, shown at scale 2. Social is 1080×1920 (Reels, Bluesky, Mastodon all
// take 9:16): 432×768 at scale 2.5. The loop for app.html is the bare app,
// no caption band, same canvas as the store take and downscaled on encode.
//
// Why the scale is done in CSS and not with deviceScaleFactor: Chrome's
// screencast, which Playwright's video recorder uses, delivers frames in CSS
// pixels. A 443×960 viewport at deviceScaleFactor 2 therefore records as a
// 443×960 picture in the top-left corner of an 886×1920 grey canvas. So the
// browser viewport is the full video size at factor 1, and the composer page
// scales a 443×960 stage up by `scale` with a CSS transform (text and vectors
// are re-rasterised crisp); the app frame reports devicePixelRatio = scale,
// so the map's canvas gets the full backing store as well.
const PROFILES = {
  store:  { viewport: { width: 443, height: 960 }, scale: 2,   band: 150, tour: "full" },
  social: { viewport: { width: 432, height: 768 }, scale: 2.5, band: 140, tour: "full" },
  loop:   { viewport: { width: 443, height: 960 }, scale: 2,   band: 0,   tour: "room" },
};
const profile = PROFILES[PROFILE];
if (!profile) { console.error(`unknown profile ${PROFILE}`); process.exit(1); }
const LOCALE = { de: "de-DE", en: "en-US" }[LANG] || "de-DE";
const HAMBURG_RATHAUS = { latitude: 53.5503, longitude: 9.9937 };
const CENTER = [9.9937, 53.5503];
const VIDEO_SIZE = { width: Math.round(profile.viewport.width * profile.scale), height: Math.round(profile.viewport.height * profile.scale) };

// Captions: the store screenshots' own headlines (texts.json next to the
// screenshot recipe), so listing and preview say the same thing. *accent*
// marks the one green word, as there.
const TEXTS = JSON.parse(readFileSync(join(HERE, "..", "store-screenshots", "texts.json"), "utf8"))[LANG];
const CAPTION = {
  map: TEXTS["01"], nearest: TEXTS["02"], room: TEXTS["03"],
  add: TEXTS["05"], offline: TEXTS["07"], me: TEXTS["08"],
};

// ---- the composer: a same-origin page with a caption band and the app in an iframe ----
// Written into the served folder at run time (app/www is a build output and
// gitignored), removed afterwards. Same origin as the app, so the Capacitor
// stub's addInitScript, the geolocation grant and the route handlers all
// apply inside the frame.
const COMPOSER_NAME = "_video-composer.html";
function composerHtml(appUrl, band) {
  return `<!doctype html>
<html lang="${LANG}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --bg: #eef1ef; --ink: #1c2b26; --muted: #64716b; --line: #d8ded9; --green: #009e73; }
  html, body { margin: 0; width: ${VIDEO_SIZE.width}px; height: ${VIDEO_SIZE.height}px; background: var(--bg); overflow: hidden;
    font: 17px/1.3 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; color: var(--ink); }
  #stage { position: absolute; left: 0; top: 0; width: ${profile.viewport.width}px; height: ${profile.viewport.height}px;
    transform: scale(${profile.scale}); transform-origin: 0 0; overflow: hidden; }
  #band { position: absolute; left: 0; right: 0; top: 0; height: ${band}px; padding: 26px 22px 0;
    display: flex; flex-direction: column; justify-content: flex-start; gap: 6px; }
  #band[hidden] { display: none; }
  #band h1 { margin: 0; font-size: 27px; line-height: 1.12; font-weight: 800; letter-spacing: -0.01em; text-wrap: balance; }
  #band h1 .accent { color: var(--green); }
  #band p { margin: 0; font-size: 14.5px; line-height: 1.3; color: var(--muted); }
  #band .fade { transition: opacity .22s ease; }
  #band.swap .fade { opacity: 0; }
  #app { position: absolute; left: 0; right: 0; top: ${band}px; bottom: 0; width: 100%; height: calc(100% - ${band}px);
    border: 0; box-shadow: 0 -1px 0 var(--line); background: #fff; }
  .ripple { position: absolute; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%;
    background: rgba(0,158,115,.35); border: 2px solid rgba(0,158,115,.9); pointer-events: none;
    animation: ripple .55s ease-out forwards; z-index: 10; }
  @keyframes ripple { from { transform: scale(.35); opacity: 1 } to { transform: scale(1.25); opacity: 0 } }
</style></head>
<body>
  <div id="stage">
    <div id="band" ${band ? "" : "hidden"}><h1 class="fade"></h1><p class="fade"></p></div>
    <iframe id="app" name="app" src="${appUrl}" allow="geolocation"></iframe>
  </div>
</body></html>`;
}

function accentHtml(raw) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const m = raw.match(/^(.*?)\*(.+?)\*(.*)$/s);
  return m ? `${esc(m[1])}<span class="accent">${esc(m[2])}</span>${esc(m[3])}` : esc(raw);
}

// ---- stubs and proxies, as in the screenshot recipe ----
async function installNativeStub(context, platform, dpr) {
  await context.addInitScript(({ platform, dpr }) => {
    // The app frame renders at `dpr` times its CSS size (the composer scales
    // it up), so tell it: MapLibre sizes its canvas by devicePixelRatio.
    if (window.top !== window) {
      try { Object.defineProperty(window, "devicePixelRatio", { get: () => dpr, configurable: true }); } catch { /* keep 1 */ }
    }
    try {
      localStorage.setItem("papamap-intro", "app99999");
      localStorage.setItem("papamap-mode", "papa");
      localStorage.removeItem("papamap-wheelchair");
      // A logged-in reader, so the two-tap answer goes straight to the
      // (faked) API instead of opening the OSM login.
      localStorage.setItem("papamap-osm-token", "demo-token");
      localStorage.setItem("papamap-osm-user", "Papa");
      localStorage.setItem("papamap-osm-user-id", "424242");
    } catch { /* storage blocked */ }
    const geolocationPlugin = {
      checkPermissions: () => Promise.resolve({ location: "granted", coarseLocation: "granted" }),
      requestPermissions: () => Promise.resolve({ location: "granted", coarseLocation: "granted" }),
      getCurrentPosition: (options) => new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ coords: pos.coords, timestamp: pos.timestamp }), (err) => reject(err), options);
      }),
      watchPosition: (options, callback) => {
        const id = navigator.geolocation.watchPosition(
          (pos) => callback({ coords: pos.coords, timestamp: pos.timestamp }, null), (err) => callback(null, err), options);
        return Promise.resolve(id);
      },
      clearWatch: ({ id }) => { navigator.geolocation.clearWatch(id); return Promise.resolve(); },
    };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, Plugins: { Geolocation: geolocationPlugin } };
  }, { platform, dpr });
}

async function proxyTo(route, target) {
  try {
    const r = await fetch(target);
    const body = Buffer.from(await r.arrayBuffer());
    await route.fulfill({ status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json" }, body });
  } catch { await route.abort(); }
}
async function installProxies(page) {
  await page.route("**/data/*", (route) => { const u = new URL(route.request().url()); return proxyTo(route, `https://papamap.de${u.pathname}${u.search}`); });
  await page.route("**/tiles/index.json", (route) => proxyTo(route, "https://papamap.de/tiles/index.json"));
}

// The OSM API, answered
// locally: nothing is written anywhere, and the answer "succeeds" in the
// time a real one takes. The element read carries no room tag, so the
// write's conflict guard passes.
async function installOsmMock(page) {
  // The bundled shell carries papamap.de's own origin into the native app, so
  // it talks to the live API there; off papamap.de it talks to the sandbox.
  // Both are answered here.
  await page.route(/https:\/\/(api|master\.apis\.dev)\.openstreetmap\.org\//, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname;
    const json = (obj, status = 200) => route.fulfill({ status, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) });
    const text = (s, status = 200) => route.fulfill({ status, headers: { "content-type": "text/plain" }, body: s });
    await new Promise((r) => setTimeout(r, 350));
    let m;
    if (p.endsWith("/user/details.json")) {
      return json({ version: "0.6", user: { id: 424242, display_name: "Papa", account_created: "2026-01-01T00:00:00Z", changesets: { count: 3 }, traces: { count: 0 } } });
    }
    if (p.endsWith("/changesets.json")) return json({ version: "0.6", changesets: [] });
    if ((m = p.match(/\/(node|way|relation)\/(\d+)\.json$/))) {
      return json({ version: "0.6", elements: [{ type: m[1], id: Number(m[2]), version: 1, lat: 53.55, lon: 9.99,
        tags: { amenity: "toilets", changing_table: "yes" }, nodes: m[1] === "way" ? [1, 2, 3, 1] : undefined }] });
    }
    if (p.endsWith("/changeset/create") && req.method() === "PUT") return text("99999999");
    if (/\/changeset\/\d+\/close$/.test(p) && req.method() === "PUT") return text("");
    if (/\/(node|way|relation)\/\d+$/.test(p) && req.method() === "PUT") return text("2");
    return json({ error: "not mocked" }, 404);
  });
}

// ---- helpers inside the app frame ----
const appFrame = (page) => page.frame({ name: "app" }) ?? page.mainFrame();
async function waitForMapReady(frame) {
  await frame.waitForFunction(() => window._papamap && typeof window._papamap.jumpTo === "function", null, { timeout: 60000 });
  await frame.waitForFunction(() => window._papamap.loaded(), null, { timeout: 60000 });
  await frame.waitForFunction(() => document.querySelectorAll("#stats .stat").length >= 2
    && !/stats\.json/.test(document.querySelector("#stats")?.textContent || ""), null, { timeout: 60000 });
}
async function verifyNativeShell(frame) {
  const ok = await frame.evaluate(() => document.documentElement.classList.contains("native") && !!document.getElementById("app-link")?.hidden);
  if (!ok) throw new Error("the frame did not take the native branch — this would record the website, not the app");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(frame, ms = 400) {
  await frame.waitForFunction(() => !window._papamap.isMoving() && !window._papamap.isZooming(), null, { timeout: 15000 }).catch(() => {});
  await sleep(ms);
}
async function clickablePins(frame, status) {
  return frame.evaluate((status) => {
    const map = window._papamap;
    const feats = map.queryRenderedFeatures(undefined, { layers: ["tables"] });
    const out = [];
    for (const f of feats) {
      if (f.properties?.status !== status) continue;
      const p = map.project(f.geometry.coordinates);
      const el = document.elementFromPoint(p.x, p.y);
      // Keep the pin inside the middle of the screen, away from the chips
      // and the bottom buttons, so the popup has room to open.
      if (el && el.tagName === "CANVAS" && p.y > innerHeight * 0.22 && p.y < innerHeight * 0.78) out.push({ x: p.x, y: p.y, lngLat: f.geometry.coordinates });
    }
    return out;
  }, status);
}

// ---- the recording ----
async function main() {
  const servedDir = flag("--served-dir", join(HERE, "..", "..", "app", "www"));
  const composerPath = join(servedDir, COMPOSER_NAME);
  const appUrl = `${BASE_URL}/?lang=${LANG}`;
  writeFileSync(composerPath, composerHtml(appUrl, profile.band));

  const browser = await chromium.launch({ channel: "chrome", args: ["--no-sandbox"] });
  const timeline = [];
  let t0 = 0;
  const mark = (name) => { timeline.push({ name, t: (Date.now() - t0) / 1000 }); console.log(`  ${((Date.now() - t0) / 1000).toFixed(2)}s  ${name}`); };
  let videoPath = null;
  try {
    const context = await browser.newContext({
      viewport: VIDEO_SIZE, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
      geolocation: HAMBURG_RATHAUS, permissions: ["geolocation"], locale: LOCALE, colorScheme: "light",
      recordVideo: { dir: OUT_DIR, size: VIDEO_SIZE },
    });
    await installNativeStub(context, "ios", profile.scale);
    const page = await context.newPage();
    t0 = Date.now();
    if (args.includes("--debug")) {
      page.on("console", (m) => console.log(`  [console.${m.type()}] ${m.text()}`));
      page.on("request", (r) => { if (!r.url().startsWith(BASE_URL)) console.log(`  [req] ${r.method()} ${r.url()}`); });
      page.on("requestfailed", (r) => console.log(`  [failed] ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
    }
    await installProxies(page);
    await installOsmMock(page);
    await page.goto(`${BASE_URL}/${COMPOSER_NAME}`, { waitUntil: "load", timeout: 60000 });
    const frame = appFrame(page);
    await waitForMapReady(frame);
    await verifyNativeShell(frame);
    // Taps are given in the app's own CSS pixels; the composer's stage is
    // scaled by profile.scale and the app starts below the caption band.
    const S = profile.scale;
    const tap = async (x, y) => {
      const sx = x, sy = profile.band + y;   // stage coordinates, where the ripple lives
      await page.evaluate(({ sx, sy }) => {
        const r = document.createElement("div"); r.className = "ripple"; r.style.left = `${sx}px`; r.style.top = `${sy}px`;
        document.getElementById("stage").appendChild(r); setTimeout(() => r.remove(), 700);
      }, { sx, sy });
      await sleep(180);
      await page.mouse.click(sx * S, sy * S);
    };
    // The element's centre in the app's CSS pixels, read inside the frame
    // (page-level boxes would come back in the scaled coordinate space).
    const centreOf = async (locator) => {
      const c = await locator.first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; });
      if (!c.w) throw new Error("element has no box");
      return c;
    };
    const tapEl = async (selector) => {
      const c = await centreOf(frame.locator(selector));
      await tap(c.x, c.y);
    };
    const caption = async (key) => {
      if (!profile.band) return;
      const c = CAPTION[key];
      await page.evaluate(({ h, p }) => {
        const band = document.getElementById("band");
        band.classList.add("swap");
        setTimeout(() => { band.querySelector("h1").innerHTML = h; band.querySelector("p").textContent = p; band.classList.remove("swap"); }, 230);
      }, { h: accentHtml(c.headline), p: c.subline });
    };
    const closePopup = async () => {
      const btn = frame.locator(".maplibregl-popup-close-button").first();
      if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await frame.waitForSelector(".maplibregl-popup", { state: "detached", timeout: 5000 }).catch(() => {}); }
    };
    const closeDialog = async (id) => { await frame.evaluate((id) => document.getElementById(id)?.close(), id); await sleep(250); };

    await frame.evaluate((c) => window._papamap.jumpTo({ center: c, zoom: 13 }), CENTER);
    await settle(frame, 800);

    // -- the room answer, shared by both tours --
    const roomStep = async () => {
      await caption("room");
      // Pick a grey pin, ease in on it so it stands alone on the screen (at
      // zoom 13 pins overlap and a tap lands on a neighbour), then tap it.
      // Three tries with different pins; a pin answered since the dataset
      // was built opens without the question and is skipped.
      let opened = false;
      const tried = new Set();
      for (let attempt = 0; attempt < 3 && !opened; attempt++) {
        let cands = (await clickablePins(frame, "unknown")).filter((c) => !tried.has(c.lngLat.join()));
        if (!cands.length) {
          await frame.evaluate((c) => window._papamap.easeTo({ center: c, zoom: 13 + attempt * 0.5, duration: 900 }), CENTER);
          await settle(frame, 250);
          cands = (await clickablePins(frame, "unknown")).filter((c) => !tried.has(c.lngLat.join()));
          if (!cands.length) continue;
        }
        const target = cands[Math.floor(cands.length / 2)];
        tried.add(target.lngLat.join());
        await frame.evaluate((ll) => window._papamap.easeTo({ center: ll, zoom: 15.5, duration: 1200 }), target.lngLat);
        await settle(frame, 250);
        const here = await clickablePins(frame, "unknown");
        here.sort((a, b) => Math.hypot(a.x - profile.viewport.width / 2, a.y - profile.viewport.height / 2) - Math.hypot(b.x - profile.viewport.width / 2, b.y - profile.viewport.height / 2));
        for (const pt of here.slice(0, 3)) {
          await tap(pt.x, pt.y);
          const popup = await frame.waitForSelector(".maplibregl-popup .popup", { timeout: 4000 }).catch(() => null);
          if (popup && await frame.locator(".maplibregl-popup .ask .ask-btn[data-room]").count() > 0) { opened = true; break; }
          await closePopup();
        }
      }
      if (!opened) throw new Error("no open room question found in three tries");
      mark("room-question");
      await sleep(1500);
      // "Both" is the first choice and the one that turns the pin green.
      const c = await centreOf(frame.locator('.maplibregl-popup .ask .ask-btn[data-room="both"]'));
      await tap(c.x, c.y);
      mark("room-answered");
      await frame.waitForFunction(() => !document.querySelector(".maplibregl-popup .ask .ask-btn[data-room]"), null, { timeout: 10000 }).catch(() => {});
      if (args.includes("--debug")) console.log("  [popup] " + (await frame.locator(".maplibregl-popup .popup").innerText().catch(() => "(gone)")).replace(/\s+/g, " ").slice(0, 400));
      await sleep(2000);
      mark("room-end");
    };

    if (profile.tour === "room") {
      mark("start");
      await sleep(900);
      await roomStep();
    } else {
      // 1 map
      await caption("map");
      await sleep(600);   // the band's fade-in, so the trim at "start" sees the headline
      mark("start");
      await frame.evaluate((c) => window._papamap.easeTo({ center: c, zoom: 13.5, duration: 2600, easing: (t) => t }), CENTER);
      await sleep(3000);
      // 2 nearest
      await caption("nearest");
      mark("nearest");
      await tapEl("#nearest");
      await frame.waitForSelector(".maplibregl-popup .popup", { timeout: 10000 });
      await settle(frame, 2200);
      // 3 room
      await closePopup();
      await frame.evaluate((c) => window._papamap.flyTo({ center: c, zoom: 13.5, duration: 1500 }), CENTER);
      await settle(frame, 200);
      mark("room");
      await roomStep();
      // 4 add a place
      await closePopup();
      await caption("add");
      mark("add");
      await frame.evaluate((c) => window._papamap.easeTo({ center: c, zoom: 16, duration: 1400 }), CENTER);
      await settle(frame, 300);
      await tapEl("#add-place");
      await frame.waitForSelector("#add-dialog[open]", { timeout: 8000 });
      await frame.waitForFunction(() => document.querySelectorAll("#venue-list .venue-row").length >= 3, null, { timeout: 30000 });
      await sleep(2000);
      await closeDialog("add-dialog");
      // 5 offline
      await caption("offline");
      mark("offline");
      await tapEl("#offline");
      await frame.waitForSelector("#offline-dialog[open]", { timeout: 8000 });
      await frame.waitForFunction(() => document.querySelectorAll("#offline-list li").length > 0, null, { timeout: 15000 });
      await sleep(2400);
      await closeDialog("offline-dialog");
      // 6 me
      await caption("me");
      mark("me");
      await tapEl("#me");
      await frame.waitForSelector("#me-dialog[open]", { timeout: 8000 });
      await frame.waitForFunction(() => (document.getElementById("me-stats")?.children.length || 0) > 0, null, { timeout: 8000 });
      await sleep(2300);
    }
    mark("end");
    await sleep(400);
    videoPath = await page.video().path();
    await context.close();
  } finally {
    await browser.close();
    if (existsSync(composerPath)) unlinkSync(composerPath);
  }
  const stem = join(OUT_DIR, `${PROFILE}-${LANG}`);
  renameSync(videoPath, `${stem}.webm`);
  writeFileSync(`${stem}.json`, JSON.stringify({ profile: PROFILE, lang: LANG, size: VIDEO_SIZE, timeline }, null, 2));
  console.log(`wrote ${stem}.webm and ${stem}.json`);
}

main().catch((err) => { console.error(err); process.exit(1); });
