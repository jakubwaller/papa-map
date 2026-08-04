// The ?v= pin matches index.html's — bump all four together, or a cached
// half-pair (new app.js, stale datasource.js) serves for up to an hour.
import { loadFeatures, filterByStatus, countsByStatus, toFeatureCollection,
         mapCompleteAddUrl, osmEditUrl } from "./datasource.js?v=seo2";
import { STRINGS, NUMBER_LOCALE, pickLang, nextLang, fmt,
         langUrl } from "./i18n.js?v=seo2";

// ---- Language: German default, DE → EN → DA cycle. A shared ?lang= link wins
// over the stored choice, which wins over a Danish browser; toggling stores the
// choice and strips the param so it doesn't override the next visit.
let lang = pickLang(new URLSearchParams(location.search).get("lang"),
                    localStorage.getItem("papamap-lang"),
                    navigator.language);
const t = (key, vars) => fmt((STRINGS[lang] ?? STRINGS.de)[key] ?? key, vars);

// index.html ships German head tags; the ?lang= views have to carry their own,
// or the hreflang alternates it advertises would all describe themselves as the
// German page and fold back into it. Head tags only — the og:* block is left
// alone on purpose, since link unfurlers never run this.
function applyHeadTags() {
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.content = t("metaDescription");
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.href = langUrl(lang);
}

// Swap every static string in index.html: data-i18n = textContent,
// data-i18n-html = trusted markup from i18n.js (never user input),
// data-i18n-aria = aria-label. Idempotent — called on boot and on toggle.
function applyI18n() {
  document.documentElement.lang = lang;
  document.title = t("title");
  applyHeadTags();
  for (const el of document.querySelectorAll("[data-i18n]"))
    el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-html]"))
    el.innerHTML = t(el.dataset.i18nHtml, { href: t("methodsHref") });
  for (const el of document.querySelectorAll("[data-i18n-aria]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
    if (el.title) el.title = t(el.dataset.i18nAria);
  }
  document.getElementById("methods-link").href = t("methodsHref");
}

// Names, hours and tag values in the popups originate from OpenStreetMap
// (publicly editable), so every interpolated value MUST be HTML-escaped
// before going into markup.
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Okabe-Ito bluish green + vermillion — distinguishable under the common kinds
// of color-vision deficiency. Grey is deliberately the darkest pin and one size
// up on the map: an untagged room is the call to action, not a footnote.
const STATUS_COLOR = { accessible: "#009e73", female_only: "#d55e00", unknown: "#3d4247" };

const STATUS_DEFS = [
  { value: "accessible", labelKey: "stAccessible" },
  { value: "female_only", labelKey: "stFemaleOnly" },
  { value: "unknown", labelKey: "stUnknown" },
];

const STATUS_META = {
  accessible: { cls: "ok", textKey: "metaAccessible" },
  female_only: { cls: "bad", textKey: "metaFemaleOnly" },
  unknown: { cls: "ask", textKey: "metaUnknown" },
};

const OSM_STYLE = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                    tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// Germany, opened a little wider so Denmark shows at the top rather than
// filling half the screen: Germany stays the subject, and the north edge at
// 56.6°N reaches past Copenhagen and Aarhus so Danish pins are visible from
// the start. Aalborg and Skagen sit above it — maxBounds leaves them a pan
// away, and the locate button lands a Dane on their own city directly.
// maxBounds leaves margin so edge cities aren't pinned to the screen border —
// and has to be roomy enough not to bind on either axis. A landscape window
// can only zoom out until maxBounds' WIDTH fills it (the old 28°-wide box hit
// that stop with Denmark still off-screen), and its NORTH edge caps how far
// fitHome() can push the map down under the topbar — on a portrait phone that
// header is ~4.6° of latitude at home zoom, so the box clears the home view by
// more than that, and far enough that Skagen stays reachable by panning.
// Rotate/pitch gestures are locked: on a phone an off-axis pinch rotates the
// map instead of zooming, which reads as jank.
const HOME_BOUNDS = [[5.5, 47.1], [15.4, 56.6]];

const map = new maplibregl.Map({
  container: "map", style: OSM_STYLE,
  bounds: HOME_BOUNDS, fitBoundsOptions: { padding: 12 },
  maxBounds: [[-12, 41], [32, 65]],
  // 3.5, not the old 4.5: fitHome() re-fits under a topbar that eats a third
  // of a portrait phone (half of a landscape one), and the old floor clamped
  // that fit while Denmark — or, in landscape, Bavaria — was still off-screen.
  // Only narrow viewports ever reach it; on a desktop maxBounds' width stops
  // the zoom-out long before.
  minZoom: 3.5, maxZoom: 18, attributionControl: false,
  pitchWithRotate: false, touchPitch: false,
});
map.dragRotate.disable();
map.touchZoomRotate.disableRotation();
// Debug/testing handle — MapLibre offers no global registry, and headless
// verification (Playwright) needs to drive the view.
window._papamap = map;

// ---- State ----
let allFeatures = [];                                     // flattened GeoJSON
let visible = new Set(STATUS_DEFS.map((d) => d.value));   // toggled-on statuses

const statsEl = document.getElementById("stats");
const filterBar = document.getElementById("filter-bar");
const countEl = document.getElementById("count");
const topbar = document.getElementById("topbar");
const zoomCtrl = document.getElementById("zoom-ctrl");
const scopeEl = document.getElementById("scope");

// ---- Pins: one WebGL circle layer, colored by status ----
// ~5k features Germany-wide — still one WebGL layer, no clustering, no DOM
// markers. At country zoom the pins shrink to a density dot-map; the source
// carries only {idx, status} per feature and a click looks the full object up
// in allFeatures.
const SRC = "tables";
const IS_UNKNOWN = ["==", ["get", "status"], "unknown"];

function addTableLayer() {
  map.addSource(SRC, { type: "geojson", data: toFeatureCollection([]) });
  map.addLayer({
    id: SRC, type: "circle", source: SRC,
    paint: {
      // Grey (unknown) pins run one size up — they are the call to action.
      "circle-radius": ["interpolate", ["linear"], ["zoom"],
        5, ["case", IS_UNKNOWN, 2.5, 2],
        10, ["case", IS_UNKNOWN, 5, 4],
        14, ["case", IS_UNKNOWN, 9, 7],
        17, ["case", IS_UNKNOWN, 13, 10]],
      "circle-color": ["match", ["get", "status"],
        "accessible", STATUS_COLOR.accessible,
        "female_only", STATUS_COLOR.female_only,
        /* unknown */ STATUS_COLOR.unknown],
      // Full strokes on 2-px country-zoom dots would read as all-white mush.
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"],
        5, 0.5, 10, 2],
      "circle-stroke-color": "#ffffff",
    },
  });
  map.on("click", SRC, (e) => {
    const f = allFeatures[e.features[0].properties.idx];
    if (f) openPopup(f);
  });
  map.on("mouseenter", SRC, () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", SRC, () => { map.getCanvas().style.cursor = ""; });
}

function refreshPins() {
  if (!dataReady) return;
  const shown = filterByStatus(allFeatures, visible);
  countEl.textContent = allFeatures.length
    ? t("countShown", { shown: shown.length, total: allFeatures.length })
    : t("countNoData");
  if (styleReady) map.getSource(SRC).setData(toFeatureCollection(shown));
}

// ---- Popup ----
let popup = null;

// The URL fields are built by our own pipeline, but belt-and-braces: esc()
// stops HTML injection, not a javascript: href — so only https links render.
const safeUrl = (u) => (typeof u === "string" && u.startsWith("https://") ? u : null);

function popupHTML(f) {
  const s = STATUS_META[f.status];
  const rows = [
    `<div class="status ${s.cls}">${esc(t(s.textKey))}</div>`,
    `<div class="row">${esc(t("popupTable"))}: <b>${esc(f.changing_table)}</b>` +
      (f.location_raw ? ` · ${esc(t("popupRoom"))}: ${esc(f.location_raw)}` : "") + `</div>`,
  ];
  if (f.fee) rows.push(`<div class="row">${esc(t("popupFee"))}: ${esc(f.fee)}</div>`);
  if (f.opening_hours) rows.push(`<div class="row">${esc(t("popupHours"))}: ${esc(f.opening_hours)}</div>`);
  const links = [];
  const mcUrl = safeUrl(f.mapcomplete_url), osmUrl = safeUrl(f.osm_url);
  if (mcUrl)
    links.push(`<a class="btn primary" href="${esc(mcUrl)}" target="_blank" rel="noopener">${esc(t("popupAnswerMC"))}</a>`);
  if (osmUrl)
    links.push(`<a class="btn" href="${esc(osmUrl)}" target="_blank" rel="noopener">${esc(t("popupViewOSM"))}</a>`);
  if (links.length) rows.push(`<div class="links">${links.join("")}</div>`);
  const title = f.name || t(f.amenity === "toilets" ? "popupToilets" : "popupUnnamed");
  const sub = f.amenity ? `<div class="sub">${esc(f.amenity.replace(/_/g, " "))}</div>` : "";
  return `<div class="popup"><h3>${esc(title)}</h3>${sub}${rows.join("")}</div>`;
}

function openPopup(f) {
  if (popup) popup.remove();
  popup = new maplibregl.Popup({ offset: 14, maxWidth: "300px" })
    .setLngLat([f.lon, f.lat]).setHTML(popupHTML(f)).addTo(map);
}

// ---- Status chips: legend, count badges and filter toggles in one ----
function renderChips() {
  const counts = countsByStatus(allFeatures);
  filterBar.querySelectorAll(".chip").forEach((el) => el.remove());
  const frag = document.createDocumentFragment();
  for (const d of STATUS_DEFS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (visible.has(d.value) ? "" : " off");
    b.setAttribute("aria-pressed", String(visible.has(d.value)));
    b.innerHTML = `<span class="dot" style="background:${STATUS_COLOR[d.value]}"></span>` +
      `${esc(t(d.labelKey))} <span class="cnt">${counts[d.value]}</span>`;
    b.addEventListener("click", () => {
      if (visible.has(d.value)) visible.delete(d.value); else visible.add(d.value);
      b.classList.toggle("off", !visible.has(d.value));
      b.setAttribute("aria-pressed", String(visible.has(d.value)));
      refreshPins();
    });
    frag.appendChild(b);
  }
  filterBar.insertBefore(frag, filterBar.firstChild);
}

// ---- Stats strip (from stats.json, shape per CONTRACT.md) ----
// Templates come from i18n.js (trusted constants); every value interpolated
// into them is num()'d or esc()'d here first. lastStats feeds the re-render
// when the language toggles.
const num = (n) => Number(n ?? 0).toLocaleString(NUMBER_LOCALE[lang] ?? "en-US");
let lastStats = null;

// The pipeline names the swept area twice: area_key for the sets it knows
// (translated here, so a Dane reads "Tyskland & Danmark"), area_name as the
// literal fallback for a hand-named build like PAPAMAP_AREA_NAME=Hamburg.
const AREA_KEYS = { de: "areaDe", dk: "areaDk", de_dk: "areaDeDk" };

function areaLabel(stats) {
  const key = AREA_KEYS[stats?.area_key];
  return key ? t(key) : (stats?.area_name || "");  // "" = nothing to say
}

function renderStats(stats) {
  lastStats = stats;
  // A missing stats.json leaves the wordmark on its translated markup default
  // rather than blanking the header.
  const area = areaLabel(stats);
  if (area) scopeEl.textContent = area;
  if (!stats || !stats.local) {
    statsEl.innerHTML =
      `<span class="stat">${t("statsMissing", { href: t("methodsHref") })}</span>`;
    return;
  }
  // `global` may be null: the pipeline's cold-start degrade when taginfo is
  // down and no previous stats.json exists. Local stats still render.
  const l = stats.local, g = stats.global;
  const tables = (l.ct_yes ?? 0) + (l.ct_limited ?? 0);
  const updated = stats.generated_at
    ? t("statsUpdated", { date: esc(String(stats.generated_at).slice(0, 10)) }) : "";
  let globalPart;
  if (g) {
    const ratio = g.location_male_only > 0
      ? (g.location_female_only / g.location_male_only).toFixed(1) + "×" : "—";
    globalPart = `<span class="stat">${t("statsGlobal", {
      total: num(g.location_total), f: num(g.location_female_only),
      m: num(g.location_male_only), ratio })}</span>`;
  } else {
    globalPart = `<span class="stat">${t("statsGlobalMissing")}</span>`;
  }
  statsEl.innerHTML =
    `<span class="stat">${t("statsLocal", {
      tables: num(tables), area: esc(area || "—"),
      unknown: num(l.unknown) })}</span>` +
    globalPart +
    `<span class="stat honesty">${t("statsHonesty", {
      toilets: num(l.toilets_total), cap: num(l.capacity_tagged_toilets),
      href: t("methodsHref"), updated })}</span>`;
}

// ---- Zoom controls ----
document.getElementById("zoom-in").addEventListener("click", () => map.zoomIn());
document.getElementById("zoom-out").addEventListener("click", () => map.zoomOut());

function positionZoomCtrl() {
  zoomCtrl.style.top = topbar.offsetHeight + 10 + "px";
}

// ---- Stats strip collapse (mobile only) ----
// CSS owns which lines are hidden and at what width; this only flips the flag
// and keeps the label honest. The class lives on the wrapper, not on #stats,
// so it survives renderStats() rebuilding the strip on a language toggle.
const statsWrap = document.querySelector(".stats-wrap");
const statsToggle = document.getElementById("stats-toggle");

function setStatsOpen(open) {
  statsWrap.classList.toggle("open", open);
  statsToggle.setAttribute("aria-expanded", String(open));
  // Swap the key rather than the label: applyI18n() re-reads it on a language
  // toggle and would otherwise reset an expanded strip's label to "show more".
  statsToggle.dataset.i18nAria = open ? "ariaStatsLess" : "ariaStatsMore";
  statsToggle.setAttribute("aria-label", t(statsToggle.dataset.i18nAria));
  positionZoomCtrl();   // the topbar just changed height
}

statsToggle.addEventListener("click", () =>
  setStatsOpen(!statsWrap.classList.contains("open")));

// The chevron alone is a 32px target on a phone. Expanding from anywhere in the
// collapsed strip gives that a three-line hit area; collapsing stays on the
// button, so tapping the text you just opened doesn't snap it shut again.
statsEl.addEventListener("click", (e) => {
  if (statsWrap.classList.contains("open") || e.target.closest("a")) return;
  setStatsOpen(true);
});

// The topbar floats over the map and eats a third of a portrait phone — and
// Denmark sits at the top of the home view, so an unpadded fit hides the whole
// country behind the header. Re-fit once the strip has rendered and its real
// height is known. Not called on resize: by then the user has panned somewhere
// and yanking the view back would be worse than a slightly off fit.
function fitHome() {
  // Never pad past half the canvas: on a short landscape phone the strip can
  // approach the full height, and a padding taller than its container makes
  // fitBounds produce a NaN camera.
  const top = Math.min(topbar.offsetHeight + 10, map.getCanvas().clientHeight / 2);
  map.fitBounds(HOME_BOUNDS, {
    padding: { top, bottom: 12, left: 12, right: 12 },
    animate: false,
  });
}

// ---- Locate: fly to the user, drop a you-are-here dot ----
// One reusable DOM marker (a single marker is no perf concern); errors show a
// transient toast instead of a blocking alert.
let youMarker = null, toastTimer = null;

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
}

document.getElementById("locate").addEventListener("click", () => {
  if (!navigator.geolocation) { toast(t("toastNoGeo")); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const at = [pos.coords.longitude, pos.coords.latitude];
      if (!youMarker) {
        const dot = document.createElement("div");
        dot.className = "you-dot";
        youMarker = new maplibregl.Marker({ element: dot });
      }
      youMarker.setLngLat(at).addTo(map);
      map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 14) });
    },
    () => toast(t("toastGeoFail")),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

// ---- Add a place: deep links out to the editors, at the current view ----
// The links are (re)built on every open so they always carry the map position
// the user is actually looking at.
const addDialog = document.getElementById("add-dialog");

document.getElementById("add-place").addEventListener("click", () => {
  const c = map.getCenter(), z = map.getZoom();
  document.getElementById("add-toilet-link").href = mapCompleteAddUrl(c.lng, c.lat, z);
  document.getElementById("add-venue-link").href = osmEditUrl(c.lng, c.lat, z);
  addDialog.showModal();
});
document.getElementById("add-close").addEventListener("click", () => addDialog.close());

// ---- Language toggle: re-render everything that carries text ----
document.getElementById("lang-toggle").addEventListener("click", () => {
  lang = nextLang(lang);
  localStorage.setItem("papamap-lang", lang);
  // A ?lang= param would override the stored choice on reload — drop it.
  if (new URLSearchParams(location.search).has("lang")) {
    const url = new URL(location.href);
    url.searchParams.delete("lang");
    history.replaceState(null, "", url);
  }
  if (popup) { popup.remove(); popup = null; }
  applyI18n();
  renderStats(lastStats);
  renderChips();
  refreshPins();
  positionZoomCtrl();  // strip height can change with string lengths
});
// Click on the backdrop (the dialog element itself, not its children) closes.
addDialog.addEventListener("click", (e) => { if (e.target === addDialog) addDialog.close(); });

// ---- Boot ----
// The chrome (stats strip, chips, count) is decoupled from the map's WebGL
// "load" event: the UI stays usable even while the map is still warming up.
// Pins are plotted once BOTH the data and the map style are ready. Either data
// file may be missing (pipeline not run yet) — the page degrades to a message.
let dataReady = false, styleReady = false;

map.on("load", () => { styleReady = true; addTableLayer(); refreshPins(); });

async function loadJSON(url) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function boot() {
  applyI18n();  // markup default is German — swap before first paint if EN
  const [fc, stats] = await Promise.all([
    loadJSON("data/changing_tables.geojson"),
    loadJSON("data/stats.json"),
  ]);
  allFeatures = loadFeatures(fc);
  renderStats(stats);
  renderChips();
  positionZoomCtrl();  // topbar height depends on the rendered strip
  fitHome();           // ...and so does the home view's top padding
  dataReady = true;
  refreshPins();
}

boot();
window.addEventListener("resize", positionZoomCtrl);
