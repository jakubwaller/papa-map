// The ?v= pin matches index.html's — bump all three together, or a cached
// half-pair (new app.js, stale datasource.js) serves for up to an hour.
import { loadFeatures, filterByStatus, countsByStatus, toFeatureCollection,
         mapCompleteAddUrl, osmEditUrl } from "./datasource.js?v=de2";

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
  { value: "accessible", label: "Dads can reach it" },
  { value: "female_only", label: "Women's room only" },
  { value: "unknown", label: "Room unknown" },
];

const STATUS_META = {
  accessible: { cls: "ok", text: "A dad can reach this changing table." },
  female_only: { cls: "bad", text: "The table is in the women's room only." },
  unknown: { cls: "ask", text: "Nobody has tagged which room the table is in — can you answer?" },
};

const OSM_STYLE = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                    tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// Germany, fit to the viewport — portrait phones and wide desktops both get
// the whole country. maxBounds leaves margin so edge cities aren't pinned to
// the screen border. Rotate/pitch gestures are locked: on a phone an off-axis
// pinch rotates the map instead of zooming, which reads as jank.
const DE_BOUNDS = [[5.5, 47.1], [15.4, 55.2]];

const map = new maplibregl.Map({
  container: "map", style: OSM_STYLE,
  bounds: DE_BOUNDS, fitBoundsOptions: { padding: 12 },
  maxBounds: [[-4, 42.5], [24, 59]],
  minZoom: 4.5, maxZoom: 18, attributionControl: false,
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
    ? `${shown.length} of ${allFeatures.length} tables`
    : "No table data yet — run the pipeline";
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
    `<div class="status ${s.cls}">${esc(s.text)}</div>`,
    `<div class="row">Changing table: <b>${esc(f.changing_table)}</b>` +
      (f.location_raw ? ` · room: ${esc(f.location_raw)}` : "") + `</div>`,
  ];
  if (f.fee) rows.push(`<div class="row">Fee: ${esc(f.fee)}</div>`);
  if (f.opening_hours) rows.push(`<div class="row">Hours: ${esc(f.opening_hours)}</div>`);
  const links = [];
  const mcUrl = safeUrl(f.mapcomplete_url), osmUrl = safeUrl(f.osm_url);
  if (mcUrl)
    links.push(`<a class="btn primary" href="${esc(mcUrl)}" target="_blank" rel="noopener">Answer on MapComplete</a>`);
  if (osmUrl)
    links.push(`<a class="btn" href="${esc(osmUrl)}" target="_blank" rel="noopener">View on OSM</a>`);
  if (links.length) rows.push(`<div class="links">${links.join("")}</div>`);
  const title = f.name || (f.amenity === "toilets" ? "Public toilets" : "Unnamed place");
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
      `${esc(d.label)} <span class="cnt">${counts[d.value]}</span>`;
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
const num = (n) => Number(n ?? 0).toLocaleString("en-US");

function renderStats(stats) {
  if (!stats || !stats.local) {
    statsEl.innerHTML =
      `<span class="stat">Stats unavailable — <code>data/stats.json</code> is missing. ` +
      `<a href="methods.html">Methods</a></span>`;
    return;
  }
  // `global` may be null: the pipeline's cold-start degrade when taginfo is
  // down and no previous stats.json exists. Local stats still render.
  const l = stats.local, g = stats.global;
  const tables = (l.ct_yes ?? 0) + (l.ct_limited ?? 0);
  const updated = stats.generated_at
    ? ` · updated ${esc(String(stats.generated_at).slice(0, 10))}` : "";
  let globalPart;
  if (g) {
    const ratio = g.location_male_only > 0
      ? (g.location_female_only / g.location_male_only).toFixed(1) + "×" : "—";
    globalPart =
      `<span class="stat">Worldwide, where the room is tagged (${num(g.location_total)}): ` +
        `<b>${num(g.location_female_only)}</b> women's-room-only vs ` +
        `<b>${num(g.location_male_only)}</b> men's-room-only — ${ratio}.</span>`;
  } else {
    globalPart = `<span class="stat">Worldwide room-tag stats unavailable right now.</span>`;
  }
  statsEl.innerHTML =
    `<span class="stat"><b>${num(tables)}</b> changing tables in ${esc(stats.area_name || "this area")} — ` +
      `<b>${num(l.unknown)}</b> in an unknown room. ` +
      `<span class="cta-grey">Tap the grey pins to fix that.</span></span>` +
    globalPart +
    `<span class="stat honesty">${num(l.toilets_total)} toilets mapped here, capacity tags on ` +
      `${num(l.capacity_tagged_toilets)} — provision itself is unmeasurable. ` +
      `<a href="methods.html">Methods</a>${updated}</span>`;
}

// ---- Zoom controls ----
document.getElementById("zoom-in").addEventListener("click", () => map.zoomIn());
document.getElementById("zoom-out").addEventListener("click", () => map.zoomOut());

function positionZoomCtrl() {
  zoomCtrl.style.top = topbar.offsetHeight + 10 + "px";
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
  if (!navigator.geolocation) { toast("Geolocation is not available in this browser."); return; }
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
    () => toast("Couldn't get your location — check the browser's permission."),
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
  const [fc, stats] = await Promise.all([
    loadJSON("data/changing_tables.geojson"),
    loadJSON("data/stats.json"),
  ]);
  allFeatures = loadFeatures(fc);
  renderStats(stats);
  renderChips();
  positionZoomCtrl();  // topbar height depends on the rendered strip
  dataReady = true;
  refreshPins();
}

boot();
window.addEventListener("resize", positionZoomCtrl);
