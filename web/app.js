// The ?v= pin matches index.html's — bump all four together, or a cached
// half-pair (new app.js, stale datasource.js) serves for up to an hour.
import { loadFeatures, loadPlaces, placeFeatures, filterFeatures, countsByStatus, countPlay,
         chipKeys, chipKey, chipView, MEN_ONLY_CHIP,
         countWheelchair, pinFeatures,
         toFeatureCollection, placesToFeatureCollection,
         mapCompleteAddUrl, mapCompleteVenueUrl, withMapCompleteLanguage,
         parseBbox, pickArea, areaLink, areaForLabel, visibleMapView, MODES, DEFAULT_MODE, pickMode, pickWheelchair, WHEELCHAIR_KEY, BUCKET_COLOR,
         pinColorExpression, viewOf, momCounts, nearestUsable, formatDistance, localAnswered,
         geoUri, webRouteHref, webRouteChoices, osmRef, osmApiUrl, osmElementFromApi, editOutcome,
         TABLE_TAGS, PLAY_TAGS, printableTableValue, printableEditTagLines,
         EDIT_CHECK_DELAYS, haversineKm, shareUrl, parseShareOsm, withoutOsmParam, nearestUnknownRoom,
         isFixFresh, popupPan, isAppleTouch, shouldOpenAtLocation,
         mergeFeatureCollection, isDeltaFresh, applyAnswerOverrides,
         pruneAnswerOverrides, resolveDataUrl, selectAddedPlace } from "./datasource.js?v=app51";
import { STRINGS, LANGS, DEFAULT_LANG, NUMBER_LOCALE, pickLang, fmt,
         langUrl } from "./i18n.js?v=app51";
import { LIVE, endpoints, startLogin, finishLogin, userName, revoke, getToken, getUser,
         setLogin, clearLogin, takeIntent, roomChoices, roomChoicesMore, roomPatch, tablePatch,
         ROOM_LABEL, roomLabelKeys,
         PLAY_CHOICES, isPlayChoice, playPatch, writeTags } from "./osm.js?v=app51";
// "Mein PapaMap" (CONTRACT.md v39): pure logic only, the same split
// datasource.js keeps — the dialog's DOM and the changesets fetch are below,
// next to the offline dialog's own wiring.
import { answeredPercent, areaPercent, sentenceParts, greyNearby, circleBounds,
         isSaved, addSaved, removeSaved,
         extractAnswers, mergeAnswers, newestClosedAt, buildFeatureGrid, answersInArea, totalAnswers,
         changesetsUrl, pageBoundary, advanceBackfillCursor, reopenGap, refreshApplies,
         appTips, TIP_SEEN_KEY } from "./me.js?v=app51";
// The store app's seam (app/). On the website isNative() is false and every
// branch below that asks it takes the path the page always took.
import { isNative, platform, AUTH_REDIRECT, loadDatasetNative, locateNative, interceptLinks,
         directionsUri, planRoute, followRoute, routeWebUrl,
         nativeNavigate, onAppUrl, shareDataset, shareSettings, cityCatalogue, savedCities,
         downloadCity, deleteCity, citySource, cityLayers, kmBetween, bboxCentre,
         formatMB, citiesToMount, checkLocationPermissionNative, locateNativeCoarse,
         onBrowserFinished, SITE } from "./native.js?v=app51";
// The selected-place marker's own drawing module (CONTRACT.md v44): pure
// string builders, no DOM of their own — the one maplibregl.Marker that
// shows the result is this file's, next to the popup it belongs beside.
import { signPinKind, signPinInk, signPinSvg, SIGN_PIN_ASPECT } from "./sign-pin.js?v=app51";
// The search field's own pure half (CONTRACT.md v46): what matches, what URL
// the geocoder is asked and how its answer becomes a row. The field, the
// dropdown and the keyboard are below, next to the map they move.
import { matchLocal, photonUrl, photonResults, LOCAL_MIN_CHARS, PHOTON_MIN_CHARS,
         PHOTON_DEBOUNCE_MS } from "./search.js?v=app51";
// opening_hours -> open-right-now, evaluated against the viewer's own clock
// (the places are local to whoever is looking, and there is no per-place
// timezone in the data to check against instead). Pure and deliberately
// narrow: anything it can't parse confidently comes back "unknown" and the
// popup shows nothing extra rather than a claim that might be wrong.
import { isOpenNow } from "./opening-hours.js?v=app51";

// ---- Language: German default, thirty-two languages, picked not cycled. A shared
// ?lang= link wins over the stored choice, which wins over the browser's own
// preference list; choosing stores it and strips the param so it doesn't
// override the next visit.
// navigator.languages, not navigator.language: it is the full ordered
// preference list, so a reader whose first choice we don't speak still gets
// their second rather than falling straight to German.
let lang = pickLang(new URLSearchParams(location.search).get("lang"),
                    localStorage.getItem("papamap-lang"),
                    navigator.languages ?? navigator.language);
const t = (key, vars) => fmt((STRINGS[lang] ?? STRINGS.de)[key] ?? key, vars);

// Which OSM this page writes to: the live API on papamap.de, the sandbox
// anywhere else — a dev server cannot put a test answer on the real map
// (osm.js says what it can do to the sandbox).
// The app runs under its own origin, so the hostname test says sandbox;
// it is the live client, coming back by the papamap://auth URL the OS
// routes to it (native.js) — the same client id, a second redirect URI on
// the registration.
// host: the changeset's `host` tag stays the site's address — the redirect is
// only the OAuth return leg, and papamap://auth is no provenance for an edit.
const osm = isNative() ? { ...LIVE, redirect: AUTH_REDIRECT, host: LIVE.redirect } : endpoints(location);
const CHANGESET_COMMENT = {
  table: "Changing table: which room (answered on papamap.de)",
  place: "Changing table: added, with its room (answered on papamap.de)",
  place_none: "Changing table: none (answered on papamap.de)",
  // Keyed by the choice itself, because a play answer says which it was in
  // the comment the way the room answers say it in the tag.
  play_yes: "Play area: indoors (answered on papamap.de)",
  play_outdoor: "Play area: outdoors only (answered on papamap.de)",
  play_no: "Play area: none (answered on papamap.de)",
};

// ---- Reading mode: the same three answers, read as a father or as a mother.
// Same precedence as the language, and the same storage: a shared ?mode= link
// wins over the remembered choice, which wins over the default. The default
// stays "papa" — it is the rendering the site has always had, the one every
// screenshot and every piece of og: copy describes, so a mother's map is a
// deliberate opt-in rather than a silent redefinition for everyone.
let mode = pickMode(new URLSearchParams(location.search).get("mode"),
                    localStorage.getItem("papamap-mode"));

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
  // The search field's own prompt. Its own attribute rather than data-i18n:
  // an <input> has no text content to swap.
  for (const el of document.querySelectorAll("[data-i18n-placeholder]"))
    el.placeholder = t(el.dataset.i18nPlaceholder);
  document.getElementById("methods-link").href = t("methodsHref");
  document.getElementById("board-link").href = t("boardHref");
  // The area link follows the map view, and its label is the target page's
  // own title; the language's regionsHref is only the fallback (see
  // updateRegionsLink). Re-pointed here because the data-i18n swap above
  // just reset the label to the language's generic one.
  updateRegionsLink();
  // German reads its own app page, every other language the English one.
  document.getElementById("app-link").href = t("appHref");
  // Boot may have resolved a language the markup does not show (a stored
  // choice, or a Czech browser): the control has to agree with the page.
  const sel = document.getElementById("lang-select");
  if (sel && sel.value !== lang) sel.value = lang;
  // A card left standing through a language change would otherwise go stale
  // in the old one (CONTRACT.md v38); a no-op when none is up.
  renderRoomCardText();
  // Same for a dropdown left open: its two group headings and its one note
  // line are translated. A no-op when the field is empty, which it is at boot.
  renderSearch();
}

// ---- Footer area link: follows the map view, not the UI language ----
// Until 2026-09-17 the link went where the language pointed (regionsHref in
// i18n.js): an English UI in Hamburg got the United Kingdom. Now it names the
// area on screen — Hamburg when zoomed into Hamburg, Deutschland at country
// zoom, Danmark after a pan north — in the reader's language where that page
// exists and in English otherwise (data/areas.json, CONTRACT.md v32; the
// choice is pickArea/areaLink in datasource.js: the pins nearest the centre
// say which sweep area is on screen, the area's box whether the reader is
// looking at a Land or at the country). The language-routed target
// stays as the fallback for a view with no area under it (open sea, an
// unswept country) and for a server whose pipeline has not written
// areas.json yet, so the link never 404s.
// Until 2026-09-18 "on screen" meant the map canvas, which extends under the
// (translucent) top bar — on a phone the canvas centre sits a third of a
// screen further into the map than anything the reader can see, and named
// Denmark for a screen full of northern Germany. visibleMapView (datasource.js)
// works out the centre and bounds of the part of the canvas the top bar
// doesn't cover; the ±180° wrap dance below is unchanged, just fed from that
// visible centre instead of map.getCenter()/getBounds().
let areaIndex = null;
// The exact area row pickArea chose for the footer link — "Mein PapaMap"'s
// own game sentence (renderMeSentence, below) reuses it rather than picking
// a second time with different inputs, so the dialog can never name a
// different place than the header link on screen (CONTRACT.md v39; the
// label and the count it is scored over are then decided together by
// areaForLabel, CONTRACT.md v40, not by re-deriving a link here). Kept in
// sync by every updateRegionsLink call: a pan, a language change, a mode
// change, the first draw.
let currentArea = null;
function updateRegionsLink() {
  const el = document.getElementById("regions-link");
  let link = null;
  try {
    const canvas = map.getContainer();
    const { center: rawCenter, bounds: rawBounds } = visibleMapView(
      { width: canvas.clientWidth, height: canvas.clientHeight },
      topbar.offsetHeight,
      (p) => map.unproject(p));
    // Wrap the centre and shift the view by the same amount: past a
    // continuous pan over ±180° unproject() runs on past 180 the same way
    // getCenter() used to, while the area boxes never do, and the two must
    // share a frame for the overlap.
    const raw = new maplibregl.LngLat(rawCenter[0], rawCenter[1]);
    const c = raw.wrap(), dx = c.lng - raw.lng;
    const view = rawBounds.map(([x, y]) => [x + dx, y]);
    currentArea = pickArea(areaIndex, allFeatures, [c.lng, c.lat], view);
    link = areaLink(currentArea, lang);
  } catch { currentArea = null; }
  const label = link ? link.label : t("regions");
  el.href = link ? link.href : t("regionsHref");
  if (el.textContent === label) return;
  el.textContent = label;
  // "Bundesländer" → "Wickeltische in Schleswig-Holstein" can wrap the nav
  // row at phone width, and the zoom control sits under the topbar's
  // measured height (positionZoomCtrl) — re-seat it whenever the label
  // changes, the same hazard the stats strip already handles.
  positionZoomCtrl();
}

// Names, hours and tag values in the popups originate from OpenStreetMap
// (publicly editable), so every interpolated value MUST be HTML-escaped
// before going into markup.
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// The pin colours now live in datasource.js as BUCKET_COLOR, keyed by the
// reading's bucket rather than by status directly, so the map, the chips and
// the popup all paint from one table that a unit test can pin down. Okabe-Ito
// throughout — distinguishable under the common kinds of colour-vision
// deficiency. Grey is deliberately the darkest pin and one size up on the map:
// for a father an untagged room is the call to action, not a footnote.

// Okabe-Ito blue for the play-corner halo — the fourth palette entry, far
// enough from all three status colors to stay readable under color-vision
// deficiency. A ring around the pin rather than a fourth fill on purpose:
// color still means "can a dad reach the table", and the halo annotates.
const PLAY_COLOR = "#0072b2";

// The International Symbol of Access (Material Design's "accessible" glyph,
// Apache 2.0) and a key, both as bare paths. Drawn in ink on the chip and in
// the popup, never as a fifth pin colour: wheelchair access is a badge on a
// pin that already has its status colour, exactly like the play halo.
const ISA_PATH = "M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm7 11v-2c-1.54.02-3.09-.75-4.07-1.83l-1.29-1.43c-.17-.19-.38-.34-.61-.45-.01 0-.01-.01-.02-.01H13c-.35-.2-.75-.3-1.19-.26C10.76 7.11 10 8.04 10 9.09V15c0 1.1.9 2 2 2h5v5h2v-5.5c0-1.1-.9-2-2-2h-3v-3.45c1.29 1.07 3.25 1.94 5 1.95zm-6.17 5c-.41 1.16-1.52 2-2.83 2-1.66 0-3-1.34-3-3 0-1.31.84-2.41 2-2.83V12.1c-2.28.46-4 2.48-4 4.9 0 2.76 2.24 5 5 5 2.42 0 4.44-1.72 4.9-4h-2.07z";
const KEY_PATH = "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z";
const svgIcon = (path, cls) =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;

// The saved-places star (v39): one path, outline when unsaved (stroke only)
// and filled when saved — a colour change, not a shape change, the same way
// the wheelchair chip's ring stays one glyph.
const STAR_PATH = "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

// The legend order is chipKeys(mode) in datasource.js, and each chip's label
// and colour come from chipView(key, mode) rather than a constant here: there
// are two readings, and mama has one more chip (the men's room alone, v51).

const OSM_STYLE = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                    tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

// Germany, opened a little wider so Denmark shows at the top rather than
// filling half the screen: Germany stays the subject, and the north edge at
// 56.6°N reaches past Copenhagen and Aarhus so Danish pins are visible from
// the start. Aalborg and Skagen sit above it, a pan away, and the locate
// button lands a Dane on their own city directly. HOME_BOUNDS is the box the
// map fits, not the extent it shows: on any real viewport the fit spills well
// past it, and fitHome() re-fits it under the topbar once that has a height.
// There is no maxBounds any more. The box was Europe's ([[-32, 27], [41,
// 74.5]] — Azores, Canaries, Ukraine's east, Nordkapp plus ~3° so the topbar
// does not hide Tromsø at full zoom-out), and every expansion moved an edge;
// the fourth, Australia and New Zealand (2026-09-04), is on the other side of
// the planet, and a box holding both hemispheres constrains nothing. Without
// it a desktop can zoom out to minZoom over the whole dataset — one WebGL
// circle layer, which is fine at 20k pins — and the data decides where a pin
// can be, not this file. A country page's "open on the map" link carries its
// own ?bbox=, and the locate button lands a visitor on their own country, so
// the home view can stay Germany.
// Rotate/pitch gestures are locked: on a phone an off-axis pinch rotates the
// map instead of zooming, which reads as jank.
const HOME_BOUNDS = [[5.5, 47.1], [15.4, 56.6]];

// A Bundesland page links in with ?bbox=… so its "auf der Karte öffnen" button
// lands on that Land; everything else opens on the home view. The canonical
// stays https://papamap.de/ (applyHeadTags), so these 16 deep links fold back
// into the homepage rather than becoming 16 near-duplicate indexed URLs.
const VIEW_BOUNDS =
  parseBbox(new URLSearchParams(location.search).get("bbox")) ?? HOME_BOUNDS;

const map = new maplibregl.Map({
  container: "map", style: OSM_STYLE,
  bounds: VIEW_BOUNDS, fitBoundsOptions: { padding: 12 },
  // With no maxBounds this floor is the only stop on the way out, and 1 puts
  // one whole world in 1024 px: a desktop sees every pin from Alaska to New
  // Zealand on one screen, the way Google Maps does. The old 3.5 (itself down
  // from 4.5 so fitHome() could fit Denmark under the topbar on a phone)
  // framed ~90° of longitude — Europe's width — and once the sweep crossed the
  // Pacific (2026-09-04) it hid most of the dataset from anyone who did not
  // already know where to pan. Not 0: MapLibre refuses to zoom out past the
  // point where the ±85° world stops filling the viewport HEIGHT (~0.8 on a
  // desktop window), so 0 buys nothing there and on a phone only shrinks
  // Europe into a smaller blob. Below zoom 5 the pins hold their 2 px size —
  // pinRadius clamps to its first stop — which is what makes the world view
  // read as a density map rather than empty ocean.
  minZoom: 1, maxZoom: 18, attributionControl: false,
  pitchWithRotate: false, touchPitch: false,
});
map.dragRotate.disable();
map.touchZoomRotate.disableRotation();
// Debug/testing handle — MapLibre offers no global registry, and headless
// verification (Playwright) needs to drive the view.
window._papamap = map;

// Whether the reader has done anything with the map before the boot fix's
// own fix lands (openAtLocationFix, near locate() below) — a drag, a zoom, a
// tap that opened a popup, a press on any button. One global, capture-phase
// listener rather than a MapLibre one: it has to catch a button press too,
// and `once` means it costs nothing once it has fired. `wheel` covers a
// mouse's scroll-zoom, which fires no `pointerdown` of its own.
let touchedBeforeFix = false;
const markTouchedBeforeFix = () => { touchedBeforeFix = true; };
document.addEventListener("pointerdown", markTouchedBeforeFix, { capture: true, once: true });
document.addEventListener("wheel", markTouchedBeforeFix, { capture: true, once: true, passive: true });
// A focused map canvas takes arrow-key pans and +/- zooms with no pointer
// event of its own — MapLibre's own keyboard handler, not this page's.
document.addEventListener("keydown", markTouchedBeforeFix, { capture: true, once: true });

// The other half of that guard: boot() itself opened a pin before the fix
// landed — a `?osm=` share link, or a papamap://table deep link (Siri, the
// widget, Control Center) that arrived late. Not a reader gesture, so
// touchedBeforeFix above never sees it; set by openPin (below) the moment it
// actually opens one, never for its own "not found" toast. boot() does not
// wait for the fix (it can land seconds after boot has already moved on), so
// this has to survive independently of whatever `popup` holds by then —
// checked alongside `popup?.isOpen()` at the point the fix is applied, not
// instead of it.
let pinOpenedBeforeFix = false;

// ---- State ----
let allFeatures = [];                                     // flattened GeoJSON
let allPlaces = [];                                       // play-area prospects

// ---- Live updates (CONTRACT.md's live-updates amendment) ----
// The nightly build's own two FeatureCollections, kept aside from
// allFeatures/allPlaces (which are always the merged, on-screen view) so a
// delta or a fresh answer override can be re-merged on top without ever
// re-fetching the base. Reset only by applyDataset itself — a new nightly
// build or a background refresh.
let baseFC = null;
let basePlacesFC = null;
// The delta most recently merged in, or null before the first successful
// poll (or once a fresher applyDataset has superseded it — see applyDataset).
let currentDelta = null;
// A reader's own confirmed answers, instant-recoloured ahead of tonight's
// build: {osm_url: {status, changing_table, location_raw, t}}, persisted so
// a reload keeps the colour. Try/catch everywhere storage might be blocked
// (private mode, quota) — an override that cannot be remembered just waits
// for the delta/nightly build like it always did.
const ANSWER_OVERRIDES_KEY = "papamap-answer-overrides";
function loadAnswerOverrides() {
  try { return JSON.parse(localStorage.getItem(ANSWER_OVERRIDES_KEY) || "{}") || {}; }
  catch { return {}; }
}
function saveAnswerOverrides(overrides) {
  try { localStorage.setItem(ANSWER_OVERRIDES_KEY, JSON.stringify(overrides)); }
  catch { /* blocked storage: the override still works this session */ }
}
let answerOverrides = loadAnswerOverrides();
let myFeatureGrid = null;   // buildFeatureGrid(allFeatures) — "Mein PapaMap"'s own nearest lookup
// osm_url -> object, one Map each rather than an allFeatures.find/allPlaces.find
// per lookup: the saved-places list alone can be up to 200 rows, each wanting
// a colour and a fly-to target, which was 200 O(n) scans of ~26k features
// apiece. Rebuilt alongside myFeatureGrid, wherever else allFeatures/allPlaces
// themselves are rebuilt.
let featuresByOsmUrl = new Map();
let placesByOsmUrl = new Map();
let visible = new Set(chipKeys("mama"));   // toggled-on chips, a superset of either reading
let playOnly = false;                                     // narrow to play corners
// narrow to wheelchair=yes (v26), remembered on the device
let wheelchairOnly = (() => {
  try { return pickWheelchair(localStorage.getItem(WHEELCHAIR_KEY)); } catch { return false; }
})();
let placesOn = true;                                      // add the prospects (on by default since 2026-09-10)

const statsEl = document.getElementById("stats");
const filterBar = document.getElementById("filter-bar");
const countEl = document.getElementById("count");
const topbar = document.getElementById("topbar");
const zoomCtrl = document.getElementById("zoom-ctrl");
const scopeEl = document.getElementById("scope");
// Up here with the topbar and the column, not down beside the search section
// itself: positionZoomCtrl seats all three in the same band and runs long
// before that section's own code would have been evaluated.
const searchBox = document.getElementById("search");
const searchInput = document.getElementById("search-input");
const searchClear = document.getElementById("search-clear");
const searchList = document.getElementById("search-results");

// ---- Pins: one WebGL circle layer, colored by status ----
// ~5k features Germany-wide — still one WebGL layer, no clustering, no DOM
// markers. At country zoom the pins shrink to a density dot-map; the source
// carries only {idx, status, play} per feature and a click looks the full
// object up in allFeatures.
const SRC = "tables";
const PLAY_LAYER = "tables-play";
const KEY_LAYER = "tables-key";
const PLACES = "play-places";
const PLACES_NO = "play-places-no";   // the dashed rings: answered, no table (v27)
const IS_UNKNOWN = ["==", ["get", "status"], "unknown"];

// Pin radius by zoom, grey one size up. Shared so the halo can be defined as
// "this, plus a ring" and the two can never drift apart.
const pinRadius = (extra) => ["interpolate", ["linear"], ["zoom"],
  5, ["case", IS_UNKNOWN, 2.5 + extra, 2 + extra],
  10, ["case", IS_UNKNOWN, 5 + extra, 4 + extra],
  14, ["case", IS_UNKNOWN, 9 + extra, 7 + extra],
  17, ["case", IS_UNKNOWN, 13 + extra, 10 + extra]];

// The dashed-ring icon, at 2x: fill and stroke as the hollow ring's paint
// (white at 0.9, PLAY_COLOR), the dash the only difference.
function dashedRing() {
  const size = 56, c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  // MapLibre draws circle-stroke-width OUTSIDE circle-radius, so the hollow
  // ring is 2 × (10 + 2.5) = 25 css px across at zoom 17: the fill is radius
  // 20 here and the 5-wide stroke sits on radius 22.5, outer edge 25 (2x).
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 22.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = 5;
  ctx.strokeStyle = PLAY_COLOR;
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

function addTableLayer() {
  // The key glyph for KEY_LAYER, rasterised from the same path the popup
  // draws. Registered asynchronously (an Image decodes off-thread); MapLibre
  // draws the symbols the moment it lands, and until then the keyed pins
  // are ordinary circles — acceptable for the few hundred ms it takes.
  const keyImg = new Image(48, 48);
  keyImg.onload = () => { if (!map.hasImage("key")) map.addImage("key", keyImg, { pixelRatio: 2 }); };
  keyImg.src = "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48"><path fill="#fff" d="${KEY_PATH}"/></svg>`);
  // The dashed ring for the places where somebody answered "no" (v27). A
  // circle layer cannot dash its stroke, so these are symbols: one ring
  // drawn on a canvas at the zoom-17 size (the hollow ring's radius 10 +
  // stroke 2.5, at 2x) and scaled down with the circles below. Synchronous,
  // unlike the key glyph — nothing to decode — so the layer can use it at
  // once. Guarded like the key: the style can be reloaded.
  if (!map.hasImage("ring-dashed")) map.addImage("ring-dashed", dashedRing(), { pixelRatio: 2 });
  map.addSource(PLACES, { type: "geojson", data: placesToFeatureCollection([]) });
  map.addSource(SRC, { type: "geojson", data: toFeatureCollection([]) });
  // Bottom of the stack, and hollow: a filled circle would compete with the
  // status pins, and these places have no status to claim. White fill rather
  // than none, so a ring over a dark basemap tile still reads as a place and
  // the whole disc stays clickable.
  map.addLayer({
    id: PLACES, type: "circle", source: PLACES,
    filter: ["!=", ["get", "no"], true],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"],
        5, 2, 10, 4, 14, 7, 17, 10],
      "circle-color": "#ffffff",
      "circle-opacity": 0.9,
      "circle-stroke-color": PLAY_COLOR,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"],
        5, 1, 10, 2, 14, 2.5],
    },
  });
  // Same size as the hollow ring at every zoom, and only the stroke differs:
  // "someone said no" and "nobody has asked" are two facts about the same
  // kind of place, and the reader should have to look twice to tell them
  // apart, not once. The icon is 25 css px across at zoom 17, the hollow
  // ring's outer diameter; the stops are the circle's diameter, stroke
  // included, at each zoom (6, 12, 19, 25) over that.
  map.addLayer({
    id: PLACES_NO, type: "symbol", source: PLACES,
    filter: ["==", ["get", "no"], true],
    layout: {
      "icon-image": "ring-dashed",
      "icon-size": ["interpolate", ["linear"], ["zoom"],
        5, 0.24, 10, 0.48, 14, 0.76, 17, 1],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  // Drawn next, so the status circle lands on top of it and what remains
  // visible is a ring. Below zoom 8 the pins are 2-3 px dots and a halo would
  // just fatten them into blobs, so it fades in with the pins themselves.
  // The +5.5 clears the pin's own white stroke, which MapLibre draws OUTSIDE
  // the fill radius (up to 2 px): at +3.5 the stroke ate all but ~1.5 px of
  // the ring and the halo read as a smudge rather than a mark.
  map.addLayer({
    id: PLAY_LAYER, type: "circle", source: SRC,
    filter: ["==", ["get", "play"], true],
    paint: {
      "circle-radius": pinRadius(5.5),
      "circle-color": PLAY_COLOR,
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 9, 1],
    },
  });
  map.addLayer({
    id: SRC, type: "circle", source: SRC,
    paint: {
      // Grey (unknown) pins run one size up — they are the call to action.
      "circle-radius": pinRadius(0),
      "circle-color": pinColorExpression(mode),
      // Full strokes on 2-px country-zoom dots would read as all-white mush.
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"],
        5, 0.5, 10, 2],
      "circle-stroke-color": "#ffffff",
    },
  });
  // A white key over the pin for the tables behind a central key — only ever
  // on the map with the wheelchair chip on, since that chip is the one place
  // they are drawn (datasource.pinFeatures). Inside the circle rather than a
  // ring around it, so it cannot be mistaken for the play halo; from zoom 13,
  // where a pin is wide enough to hold a glyph (6 px at 14, 2-4 px below 10).
  map.addLayer({
    id: KEY_LAYER, type: "symbol", source: SRC, minzoom: 13,
    filter: ["==", ["get", "key"], true],
    layout: {
      "icon-image": "key",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.4, 17, 0.7],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  // Both circle layers, so the halo's extra 5.5 px is part of the hit target
  // rather than a dead ring around a clickable pin; the key glyph too, so the
  // tap does not fall through the middle of the pin it sits on.
  for (const layer of [PLAY_LAYER, SRC, KEY_LAYER]) {
    map.on("click", layer, (e) => {
      const f = allFeatures[e.features[0].properties.idx];
      if (f) openPopup(f);
    });
  }
  for (const layer of [PLACES, PLACES_NO]) {
    map.on("click", layer, (e) => {
      const p = allPlaces[e.features[0].properties.idx];
      if (p) openPlacePopup(p);
    });
  }
  for (const layer of [PLAY_LAYER, SRC, KEY_LAYER, PLACES, PLACES_NO]) {
    map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
  }
  // A tap on the map is the reader saying "not that, this one": the search
  // dropdown goes, and on a phone the keyboard goes with it. No layer, so a
  // tap on a pin closes it too — that pin's popup is the better answer.
  map.on("click", () => {
    if (searchList.hidden && document.activeElement !== searchInput) return;
    closeSearch();
  });
}

function refreshPins() {
  if (!dataReady) return;
  const shown = filterFeatures(allFeatures, visible, playOnly, wheelchairOnly, mode);
  // The count stays a count of changing tables even with the prospects on —
  // they are not tables, and folding them in would inflate the one number the
  // whole map is about. They get their own clause instead. The total is the
  // same universe `shown` was drawn from: the pins, or with the wheelchair
  // chip on, its tables — keyed ones included, since it draws them.
  const total = pinFeatures(allFeatures, wheelchairOnly).length;
  // The places narrow under the wheelchair chip like the tables (v28).
  const places = placesOn ? placeFeatures(allPlaces, wheelchairOnly) : [];
  countEl.textContent = total
    ? t("countShown", { shown: shown.length, total })
      + (places.length ? t("countPlaces", { n: places.length }) : "")
    : t("countNoData");
  if (!styleReady) return;
  map.getSource(SRC).setData(toFeatureCollection(shown));
  map.getSource(PLACES).setData(placesToFeatureCollection(places));
}

// ---- Popup ----
let popup = null;
let popupObj = null;   // { kind: "table" | "place", obj } behind the open popup

// The URL fields are built by our own pipeline, but belt-and-braces: esc()
// stops HTML injection, not a javascript: href — so only https links render.
const safeUrl = (u) => (typeof u === "string" && u.startsWith("https://") ? u : null);

// The three values `wheelchair` can carry, as i18n keys.
const WC_LABEL = { yes: "wcYes", limited: "wcLimited", no: "wcNo" };

// The wheelchair tags as recorded, value by value — the information half
// of the request is worth more than the filter half. `wheelchair` on a
// shop or café is the entrance, on a toilet block the toilet; the second
// row is the place's accessible toilet; the free-text description is what
// a mapper wrote about the step. Nothing here is a status. The table and
// the play-place popups share it (v28).
function wheelchairRows(o) {
  const rows = [];
  if (o.wheelchair)
    rows.push(`<div class="row wc${o.wheelchair === "yes" ? " ok" : ""}">${svgIcon(ISA_PATH, "isa")}` +
      `${esc(t("popupWheelchair"))}: <b>${esc(t(WC_LABEL[o.wheelchair]))}</b></div>`);
  if (o.toilets_wheelchair)
    rows.push(`<div class="row wc">${esc(t("popupToiletsWheelchair"))}: <b>${esc(t(WC_LABEL[o.toilets_wheelchair]))}</b></div>`);
  if (o.wheelchair_description)
    rows.push(`<div class="row wc-desc">${esc(o.wheelchair_description)}</div>`);
  return rows;
}

// The raw opening_hours string, plus a same-line "Open now" / "Closed now"
// badge wherever isOpenNow() is confident enough to say one — evaluated at
// render time against the viewer's own clock. `coords` (the place's own
// lat/lon) only matters for a value that names a sunrise/sunset/dawn/dusk
// event; without it those stay unbadged, same as anything else the parser
// can't confidently resolve. A value it can't parse (or that only carries
// PH/SH rules, which we never guess at) prints the hours with no badge at
// all: no claim beats a wrong one.
function hoursRowHTML(hours, coords) {
  const state = isOpenNow(hours, new Date(), coords);
  const badge = state === "unknown" ? "" :
    ` <span class="hours-badge ${state}">${esc(t(state === "open" ? "popupOpenNow" : "popupClosedNow"))}</span>`;
  return `<div class="row">${esc(t("popupHours"))}: ${esc(hours)}${badge}</div>`;
}

// The room, in the reader's own language, for the two popups and the edit
// confirmation alike: roomLabelKeys (osm.js) does the splitting and the exact
// token matching, this only turns its parts into words — t() for a key,
// verbatim for a token the vocabulary does not know. Never escaped here: one
// call site puts it in HTML and escapes the whole line itself, the other
// feeds it to textContent, where escaping a second time would show a reader
// "&amp;" instead of "&".
const roomLabel = (raw) => roomLabelKeys(raw).map((p) => (p.key ? t(p.key) : p.raw)).join(", ");

// The changing-table line, for a popup (HTML) and for the edit toast (text).
// The value is OSM's own word and prints as it is — except "no", which every
// language already has words for (roomNone, the room question's own "there is
// none"): until app37 a German reader was told "Wickeltisch: no".
const tableRowHTML = (value) =>
  value === "no" ? `<b>${esc(t("roomNone"))}</b>` : `${esc(t("popupTable"))}: <b>${esc(value)}</b>`;
const tableRowText = (value) => (value === "no" ? t("roomNone") : `${t("popupTable")}: ${value}`);

// The Route button, the same one in both popups. On the website its href is
// chosen by the device (webRouteHref): geo: on Android, openstreetmap.org's
// directions in a new tab on a desktop, where nothing answers geo: at all,
// and on an iPhone a question — data-route-choose, answered by the dialog at
// the end of this file — because a web page cannot learn the phone's default. In the apps it is directionsUri's — geo:
// on Android, Apple Maps on iOS — and data-route carries the destination for
// the iOS cascade at the end of this file, which catches the tap instead and
// asks the phone what it can actually open — an iPhone without Apple Maps
// answers nothing to maps://, and iOS says so with an alert of its own.
function routeButton(lat, lon, name) {
  const web = isNative() ? null : webRouteHref(lat, lon, name, navigator.userAgent, navigator.maxTouchPoints);
  const href = web ? web.href : directionsUri(lat, lon, name, geoUri(lat, lon, name));
  return `<a class="btn" href="${esc(href)}"${web?.external ? ' target="_blank" rel="noopener"' : ""}` +
    `${web?.choose ? " data-route-choose" : ""}` +
    ` data-route="${esc(`${lat},${lon}`)}" data-route-label="${esc(name)}">${esc(t("popupDirections"))}</a>`;
}

// The share button, in the same row: icon only, not icon-plus-label — the
// German row (MapComplete's long "Auf MapComplete beantworten", Route, View
// on OSM) is already tight at 375 px, and one more short word would wrap it
// badly on a 12 mini. The click is delegated (the popup markup is rebuilt on
// every open); the button itself only needs to say which popup it belongs to.
const SHARE_PATH = "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.03-.47-.09-.7l7.05-4.11c.53.49 1.23.79 2.01.79 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L7.04 9.81C6.5 9.31 5.79 9 5 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z";
const shareButtonHTML = () =>
  `<button type="button" class="btn icon-btn" data-share aria-label="${esc(t("popupShare"))}" title="${esc(t("popupShare"))}">${svgIcon(SHARE_PATH, "share-icon")}</button>`;

function popupHTML(f) {
  const s = viewOf(f, mode);
  // The two-tap answer, on the pins nobody has answered for. Not on a pin that
  // already carries a room in words the classifier does not read: that is
  // somebody's tag, and replacing it belongs in MapComplete, where the reader
  // sees what is there before writing over it. While the question is open
  // the headline ("room unknown", in either reading) is marked ask-ctx so the
  // answer can take it down with the buttons.
  const asks = f.status === "unknown" && !f.location_raw;
  // While the question is open the father's headline is the short label,
  // not the sentence: the question two lines down asks the same thing, and
  // on a 12 mini the popup had to fit the map twice over. The mother keeps
  // her sentence — "usually one you can reach" is the one thing her amber
  // pin has to say, and her two rows of pills leave the room for it.
  // "Changing table: yes" goes for the same reason — every pin that asks
  // says it — and is never printed again: every pin here has a changing
  // table, so once the question is answered the line would say nothing.
  // `limited`, or whatever else OSM holds, is real information and stays,
  // alongside the room where one is on record.
  const short = asks && mode !== "mama";
  const rows = [
    `<div class="status ${s.cls}${asks ? " ask-ctx" : ""}">${esc(t(short ? s.labelKey : s.metaKey))}</div>`,
  ];
  const tableValue = printableTableValue(f.changing_table);
  if (tableValue || f.location_raw) {
    const parts = [];
    if (tableValue) parts.push(tableRowHTML(tableValue));
    if (f.location_raw) parts.push(`${esc(t("popupRoom"))}: ${esc(roomLabel(f.location_raw))}`);
    rows.push(`<div class="row">${parts.join(" · ")}</div>`);
  }
  if (f.play) rows.push(`<div class="row play">${esc(t("popupPlay"))}</div>`);
  rows.push(...wheelchairRows(f));
  // Only ever seen under the wheelchair chip: the door needs a central key.
  if (f.key)
    rows.push(`<div class="row key">${svgIcon(KEY_PATH, "key")}${esc(t("popupKey"))}</div>`);
  if (f.fee) rows.push(`<div class="row">${esc(t("popupFee"))}: ${esc(f.fee)}</div>`);
  if (f.opening_hours) rows.push(hoursRowHTML(f.opening_hours, { lat: f.lat, lon: f.lon }));
  if (asks) rows.push(askHTML("askRoom", inFlight.has(f.osm_url)));
  // The second question, on every pin where OSM says nothing about a play
  // area (play_recorded false — an answered "no" is an answer and is never
  // asked again), whatever the pin's colour: a father who notices the play
  // corner of a café whose room is long on record has the same answer in hand
  // as one standing on a grey pin (v34; v30 asked only where the room was
  // asked too). It lives outside the .ask block on purpose, so answering the
  // room takes that question down and leaves this one standing. Where the room
  // question is not above it, it says itself whose name the answer goes under.
  if (!f.play_recorded)
    rows.push(askPlayHTML(inFlight.has(f.osm_url), !asks));
  const links = [];
  const mcUrl = safeUrl(withMapCompleteLanguage(f.mapcomplete_url, lang)),
        osmUrl = safeUrl(f.osm_url);
  // MapComplete is the primary action only where the page cannot answer
  // itself; beside an in-page question, either one, it is the other way, in
  // plain dress. Not on a grey pin that does not ask (a room in words the
  // classifier does not read): there MapComplete is the only way to the room,
  // and the play line under it must not take that away.
  const mcOnly = f.status === "unknown" && !asks;
  if (mcUrl)
    links.push(`<a class="btn${!mcOnly && (asks || !f.play_recorded) ? "" : " primary"}" data-edit-check href="${esc(mcUrl)}" target="_blank" rel="noopener">${esc(t("popupAnswerMC"))}</a>`);
  links.push(routeButton(f.lat, f.lon, f.name || ""));
  links.push(shareButtonHTML());
  if (osmUrl)
    links.push(`<a class="btn" data-edit-check href="${esc(osmUrl)}" target="_blank" rel="noopener">${esc(t("popupViewOSM"))}</a>`);
  if (links.length) rows.push(`<div class="links">${links.join("")}</div>`);
  const title = f.name || t(f.amenity === "toilets" ? "popupToilets" : "popupUnnamed");
  const sub = f.amenity ? `<div class="sub">${esc(f.amenity.replace(/_/g, " "))}</div>` : "";
  return `<div class="popup"><h3>${esc(title)}${starHTML(f.osm_url, title)}</h3>${sub}${rows.join("")}</div>`;
}

// The question and its answers, in the reading's own vocabulary: a mother is
// offered the rooms she can vouch for, a father every room. Under it, who the
// answer will be filed as — or, before the first login, that it will be.
// The play-place question alone gets one more button: a room is never the
// only way to answer "is there a table here", and "none" is not a room, so
// it is appended after the rooms rather than folded into roomChoices().
// `busy`: an answer for this object is already on its way (the popup was
// closed and reopened mid-write), so the buttons render quiet.
function askHTML(question = "askRoom", busy = false) {
  const dis = busy ? " disabled" : "";
  // The label rides along explicitly: a room added to ROOMS without a label
  // then renders as "undefined" — loud — not as another answer's words.
  const pill = (c, label, extra = "") =>
    `<button type="button" class="btn ask-btn${extra}" data-room="${c}"${dis}>${esc(t(label))}</button>`;
  // Two columns of short labels: six rooms in three rows where five pills
  // took four. The rare three sit behind one link and unfold in place —
  // not a <select>, which costs a second tap and hides the choices that
  // make this a two-tap flow.
  const btns = `<div class="ask-btns">${roomChoices(mode).map((c) => pill(c, ROOM_LABEL[c])).join("")}</div>` +
    `<button type="button" class="linkish ask-more"${dis}>${esc(t("askMore"))}</button>` +
    `<div class="ask-btns ask-btns-more" hidden>${roomChoicesMore().map((c) => pill(c, ROOM_LABEL[c])).join("")}</div>` +
    (question === "askTable"
      ? `<div class="ask-btns ask-btns-none">${pill("none", "roomNone", " ask-btn-none")}</div>`
      : "");
  return `<div class="ask"><div class="ask-q">${esc(t(question))}</div>` +
         `${btns}${askWhoHTML()}</div>`;
}

// Who the answer will be filed as — or, before the first login, that it will
// be. One line for both questions; a popup shows it once.
function askWhoHTML() {
  const user = getUser();
  const who = user
    ? `${esc(t("askAs", { user }))} · <button type="button" class="linkish" data-logout>${esc(t("askLogout"))}</button>`
    : esc(t("askLoginHint"));
  return `<div class="ask-who">${who}</div>`;
}

// The play question: one line, three buttons. Under the room question it has
// no login line of its own — the block above carries it; alone on a pin whose
// room is on record (`who`) it brings the line along, so nobody taps a pill
// without having read that the answer goes to OSM under a name.
// The question asks about a play area for
// children and the answers say where it is, because that is what the tags mean:
// `kids_area=no` is "nowhere for children to play", and a two-button
// "indoor play area? yes/no" wrote it under a bakery with a garden playground
// (issue #119). The third pill is the theme's own outdoors-only mapping.
//
// Short labels, and the row wraps: the asking card measured ~470 px on a 12
// mini with six rooms (PR #101), against a map area of ~560 px, and
// panPopupIntoView() has to keep working.
//
// The buttons are `ask-btn` so the one document listener takes them, and
// their data-room carries the choice rather than a room — the same liberty
// the play place's "none" already takes.
const PLAY_LABEL = { play_yes: "askPlayIndoor", play_outdoor: "askPlayOutdoor",
                     play_no: "askPlayNone" };
function askPlayHTML(busy = false, who = false) {
  const dis = busy ? " disabled" : "";
  const pill = (choice) =>
    `<button type="button" class="btn ask-btn" data-room="${choice}"${dis}>${esc(t(PLAY_LABEL[choice]))}</button>`;
  return `<div class="ask-play"><span class="ask-q">${esc(t("askPlay"))}</span>` +
         `<span class="ask-play-btns">${PLAY_CHOICES.map(pill).join("")}</span>` +
         `${who ? askWhoHTML() : ""}</div>`;
}

// A prospect's popup says one thing the pin popups never do: nobody has
// answered the changing-table question here at all. So it leads with the one
// fact OSM does record, then asks the question itself — a room tapped here
// writes the table *and* its room, since the yes alone would only make a
// grey pin tonight. The MapComplete button still opens the same question,
// for the "no" and for everything the two taps cannot say. Once answered
// in this session the popup reads like a pin's: the tags, no question.
function placeHTML(p) {
  const rows = [];
  if (p.changing_table) {
    // "Changing table: yes" is dropped here too (v37): a place card that has
    // a room to show has already answered the question this card would
    // otherwise ask below, and "yes" beside it adds nothing beyond that.
    // But "yes" alone, with no room to stand in for it, still prints — a
    // place with a truthy changing_table always has an answered question
    // (the else-branch below is the only "OSM says nothing" line, and it is
    // keyed on changing_table being absent), so dropping "yes" unconditionally
    // would risk a headline row with nothing in it at all. Today every path
    // that sets changing_table on a place also sets a room (tablePatch), so
    // this is only ever exercised by a future path that doesn't; it is still
    // worth being honest about. `limited` (or anything else) always stays.
    const tableValue = p.location_raw ? printableTableValue(p.changing_table) : p.changing_table;
    const parts = [];
    if (tableValue) parts.push(tableRowHTML(tableValue));
    if (p.location_raw) parts.push(`${esc(t("popupRoom"))}: ${esc(roomLabel(p.location_raw))}`);
    rows.push(`<div class="row">${parts.join(" · ")}</div>`);
  } else
    // ask-ctx marks the line that is true only while the question is open —
    // "about a changing table, OSM says nothing" — so answer() can sweep it
    // with the .ask block. No styling of its own. ("Been here? Then you know"
    // used to stand between the two; the question says it, and on a 12 mini
    // the play-place card was the one that still did not fit.)
    rows.push(`<div class="status play ask-ctx">${esc(t("metaPlaces"))}</div>`);
  // Between the headline and the question, where a pin's popup has them.
  rows.push(...wheelchairRows(p));
  if (!p.changing_table) rows.push(askHTML("askTable", inFlight.has(p.osm_url)));
  if (p.opening_hours) rows.push(hoursRowHTML(p.opening_hours, { lat: p.lat, lon: p.lon }));
  const links = [];
  const mcUrl = safeUrl(withMapCompleteLanguage(p.mapcomplete_url, lang)),
        osmUrl = safeUrl(p.osm_url);
  if (mcUrl)
    links.push(`<a class="btn${p.changing_table ? " primary" : ""}" data-edit-check href="${esc(mcUrl)}" target="_blank" rel="noopener">${esc(t("popupAnswerMC"))}</a>`);
  links.push(routeButton(p.lat, p.lon, p.name || ""));
  links.push(shareButtonHTML());
  if (osmUrl)
    links.push(`<a class="btn" data-edit-check href="${esc(osmUrl)}" target="_blank" rel="noopener">${esc(t("popupViewOSM"))}</a>`);
  if (links.length) rows.push(`<div class="links">${links.join("")}</div>`);
  const title = p.name || t("popupUnnamed");
  const sub = p.kind ? `<div class="sub">${esc(p.kind.replace(/_/g, " "))}</div>` : "";
  return `<div class="popup"><h3>${esc(title)}${starHTML(p.osm_url, title)}</h3>${sub}${rows.join("")}</div>`;
}

// Every popup this page ever opens is created here or in openPlacePopup, and
// both wire its own "close" listener to the instance itself (`p`, not the
// mutable `popup` variable — a closure over `popup` would name whichever
// popup happens to be current when the event fires, not the one it belongs
// to). onPopupClosed is the one place `popup`/`popupObj` are nulled for a
// close nobody in this file asked for — clicking the map (closeOnClick),
// clicking the built-in ×, or the map itself going away — which used to go
// unnoticed here entirely (the room card's original bug, CONTRACT.md v38).
function openPopup(f) {
  hideRoomCard();   // the two never share the screen
  if (popup) popup.remove();
  popupObj = { kind: "table", obj: f };
  // Always the marker-aware offset: a "table" popup always gets the sign
  // pin (updateSignMarker below), never only sometimes.
  const p = new maplibregl.Popup({ offset: POPUP_OFFSET_WITH_MARKER, maxWidth: popupMaxWidth() })
    .setLngLat([f.lon, f.lat]).setHTML(popupHTML(f)).addTo(map);
  p.on("close", () => onPopupClosed(p));
  popup = p;
  syncNearestBtn();
  attachEditNote();
  updateSignMarker();
  panPopupIntoView();
}

function openPlacePopup(p) {
  hideRoomCard();
  if (popup) popup.remove();
  popupObj = { kind: "place", obj: p };
  // A prospect carries no status: no marker, plain offset (updateSignMarker
  // below still runs, to clear a marker left over from a table selection).
  const pop = new maplibregl.Popup({ offset: POPUP_OFFSET, maxWidth: popupMaxWidth() })
    .setLngLat([p.lon, p.lat]).setHTML(placeHTML(p)).addTo(map);
  pop.on("close", () => onPopupClosed(pop));
  popup = pop;
  syncNearestBtn();
  attachEditNote();
  updateSignMarker();
  panPopupIntoView();
}

// ---- Selected-place marker: the door-sign pictogram (CONTRACT.md v44) ----
// One reusable DOM marker, the same pattern as youMarker below: shown only
// while a "table" popup is open, at that pin's own coordinates, repainted
// (never re-created) for as long as the same popup stays open, and removed
// the moment popupObj says anything else. The ~26k circles this marker sits
// on top of, and the play halo / key glyph drawn on them, are all untouched —
// this is the one pin a reader has just tapped, nothing else.
const SIGN_PIN_W = 46;
const SIGN_PIN_H = Math.round(SIGN_PIN_W * SIGN_PIN_ASPECT);
let signMarker = null, signMarkerBody = null;

function ensureSignMarker() {
  if (signMarker) return signMarker;
  const el = document.createElement("div");
  el.className = "sign-pin-marker";
  el.style.width = `${SIGN_PIN_W}px`;
  el.style.height = `${SIGN_PIN_H}px`;
  // The scale-in lives on a child, never on `el` itself: MapLibre positions
  // a marker with its own `transform` on the element it was given, and a
  // second transform here would fight that on every pan and zoom frame.
  signMarkerBody = document.createElement("div");
  signMarkerBody.className = "sign-pin-marker-body";
  el.appendChild(signMarkerBody);
  signMarker = new maplibregl.Marker({ element: el, anchor: "bottom" });
  return signMarker;
}

// Pictogram by status, colour by bucket — sign-pin.js's own rule, not
// repeated here: accessible is the dad, female_only the woman, unknown a
// question mark that follows the reading (ask for papa; woman-ask, dark ink,
// for mama, CONTRACT.md v44). Only ever painted for a "table" object.
function paintSignMarker(f) {
  const view = viewOf(f, mode);
  signMarkerBody.innerHTML =
    signPinSvg(signPinKind(f.status, mode), BUCKET_COLOR[view.bucket], signPinInk(view.bucket));
}

// The one place that decides whether the marker belongs on the map at all,
// and where — called after every popup open, after a mode switch that keeps
// a table popup open (applyMode), after a background refresh redraws one in
// place (applyDataset), and from onPopupClosed once popupObj is nulled for
// any other reason. A "place" popup (a prospect: no status to colour or draw
// by) always reads as "hide" here, same as no popup at all.
function updateSignMarker() {
  if (popupObj?.kind !== "table") { signMarker?.remove(); return; }
  const f = popupObj.obj;
  const marker = ensureSignMarker();
  paintSignMarker(f);
  marker.setLngLat([f.lon, f.lat]);
  // Only a marker that is not on the map yet: addTo() takes the element out
  // of the page and puts it back, which replays the scale-in (style.css) —
  // right for a fresh selection, a flicker on a repaint of the same pin.
  if (!marker.getElement().isConnected) marker.addTo(map);
}

// The popup's own 14 px offset (openPopup/openPlacePopup) clears a bare
// point; the marker sits ~45 px above that same point, so a popup MapLibre
// opens on that side needs to clear the marker too. Only the anchors that
// put the popup above or beside the point are raised — "top" (opens below
// the point) has nothing to clash with and keeps the plain offset.
const POPUP_OFFSET = 14;
const SIGN_PIN_CORNER = Math.round(Math.sqrt(0.5) * POPUP_OFFSET);   // MapLibre's own diagonal split of a uniform offset
const POPUP_OFFSET_WITH_MARKER = {
  center: [0, 0],
  top: [0, POPUP_OFFSET], "top-left": [SIGN_PIN_CORNER, SIGN_PIN_CORNER], "top-right": [-SIGN_PIN_CORNER, SIGN_PIN_CORNER],
  bottom: [0, -(SIGN_PIN_H + POPUP_OFFSET)],
  "bottom-left": [SIGN_PIN_CORNER, -(SIGN_PIN_H + POPUP_OFFSET)],
  "bottom-right": [-SIGN_PIN_CORNER, -(SIGN_PIN_H + POPUP_OFFSET)],
  // Pushed clear by half the marker's own width plus the usual gap, so the
  // popup's near edge lands outside the marker's column regardless of how
  // tall the popup itself ends up (a fixed y offset could not promise that).
  left: [SIGN_PIN_W / 2 + POPUP_OFFSET, 0], right: [-(SIGN_PIN_W / 2 + POPUP_OFFSET), 0],
};

// MapLibre anchors the card to the pin and picks the side with room, but a
// card taller or wider than the free space overflows on every side — a pin
// at the bottom of a 12 mini opened it half under the footer, and one high
// up under the topbar, which floats over the canvas. So after the card is
// in the DOM, measure it against what is actually visible (canvas minus the
// topbar, minus the attribution line at the foot) and pan the map by the
// overflow. The pin moves with the map, the card with the pin. Where nothing
// overflows nothing moves, so a desktop tap stays a tap.
const EDGE = 8, POPUP_MAX_W = 300;
// The card never gets wider than the room beside the control column, or
// popupPan could only keep one of its edges clear — and the × is on the one it
// would give up. 300px everywhere that has the room (375px and up).
function popupMaxWidth() {
  const w = map.getContainer().clientWidth;
  const col = w - zoomCtrl.getBoundingClientRect().left;   // the column and its right margin
  return Math.max(200, Math.min(POPUP_MAX_W, w - col - 2 * EDGE)) + "px";
}
function panPopupIntoView() {
  const el = popup?.getElement();
  if (!el) return;
  const r = el.getBoundingClientRect(), c = map.getContainer().getBoundingClientRect();
  // What floats over the head of the canvas: the topbar, and the search field
  // hanging below it (CONTRACT.md v46). Whichever reaches further down is what
  // the card has to clear — the field is the deeper of the two everywhere.
  // Never more than half the canvas, though: on a short landscape phone the
  // strip can approach the full height (fitHome has the same clamp), and a
  // band with no room left in it would pan the card clean off.
  const covered = Math.max(topbar.offsetHeight, searchBox.getBoundingClientRect().bottom - c.top);
  const top = c.top + Math.min(covered, c.height / 2) + EDGE;
  // The attribution's own top edge, not its height from the bottom: in the
  // installed app it floats a safe-area inset above the foot.
  const attr = document.getElementById("attribution")?.getBoundingClientRect();
  const bottom = Math.min(c.bottom, attr?.top ?? c.bottom) - EDGE;
  const z = zoomCtrl.getBoundingClientRect();
  // The sign-pin comes out from behind the topbar too (popupPan), which moves
  // the pin down — and MapLibre re-picks the card's side on every move,
  // against the whole canvas, topbar included: a card that opened below its
  // pin jumps above it once the pin is further down than the card is tall,
  // and lands behind the topbar itself. That cannot happen to a card taller
  // than the strip the topbar covers, so only such a card brings its marker
  // along. Every real one is (285 px and up, the topbar 222 on a phone).
  const pin = signMarker?.getElement();
  const marker = pin?.isConnected && r.height > top - c.top ? pin.getBoundingClientRect() : null;
  const [dx, dy] = popupPan(r,
    { left: c.left + EDGE, top, right: c.right - EDGE, bottom },
    { left: z.left - EDGE, top: z.top, bottom: z.bottom }, marker);
  if (dx || dy) map.panBy([dx, dy], { duration: 250 });
}

// ---- Status chips: legend, count badges and filter toggles in one ----
// Three status chips (on by default, each one subtracts when switched off),
// then two blue ones. The first is off by default and, switched on, narrows
// to the pins with a recorded play corner; the second is on by default (since
// 10 Sep 2026) and, switched off, takes away the places that have a play
// corner and no changing-table answer at all. Neither is a status: rendering
// them as one would claim every other pin has no play area, which OSM never
// said.
function renderChips() {
  // Over the same universe the map draws: with the wheelchair chip on, the
  // keyed tables it brings back count in their badge like any other pin.
  const counts = countsByStatus(pinFeatures(allFeatures, wheelchairOnly), mode);
  // A dataset from before v50 carries no men_only at all: no fourth chip then,
  // rather than one that always reads 0.
  const hasMenOnly = allFeatures.some((f) => f.men_only === true);
  filterBar.querySelectorAll(".chip").forEach((el) => el.remove());
  const frag = document.createDocumentFragment();
  for (const key of chipKeys(mode)) {
    if (key === MEN_ONLY_CHIP && !hasMenOnly) continue;
    const v = chipView(key, mode);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (visible.has(key) ? "" : " off");
    b.setAttribute("aria-pressed", String(visible.has(key)));
    // The chips follow the pin colours of the reading (v51): a mother gets a
    // red chip for the men's room alone, and her green chips count only what
    // she can use. The women's-room chip stays her own, so she can still ask
    // for those tables alone (a room with a door, not a shared unisex one).
    b.innerHTML = `<span class="dot" style="background:${BUCKET_COLOR[v.bucket]}"></span>` +
      `${esc(t(v.labelKey))} <span class="cnt">${counts[key]}</span>`;
    b.addEventListener("click", () => {
      if (visible.has(key)) visible.delete(key); else visible.add(key);
      b.classList.toggle("off", !visible.has(key));
      b.setAttribute("aria-pressed", String(visible.has(key)));
      refreshPins();
    });
    frag.appendChild(b);
  }
  frag.appendChild(playChip(countPlay(pinFeatures(allFeatures, wheelchairOnly))));
  frag.appendChild(placesChip(placeFeatures(allPlaces, wheelchairOnly).length));
  frag.appendChild(wheelchairChip(countWheelchair(allFeatures)));
  // Not firstChild: the mode toggle is static markup and holds that slot, so
  // the generated chips go in front of the spacer instead.
  filterBar.insertBefore(frag, filterBar.querySelector(".spacer"));
}

// The two blue chips are deliberately not one. "Mit Spielecke" narrows the
// table pins; "Nur Spielecke" adds a different dataset that has no table
// answer at all. One chip doing both would have to mean two things at once.
function blueChip({ label, aria, count, on, hollow, toggle }) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip play" + (on ? " on" : "") + (hollow ? " hollow" : "");
  b.setAttribute("aria-pressed", String(on));
  b.setAttribute("aria-label", t(aria));
  b.title = t(aria);
  // A ring, not a filled dot — the same shape the map draws.
  b.innerHTML = `<span class="ring"></span>` +
    `${esc(t(label))} <span class="cnt">${count}</span>`;
  b.addEventListener("click", () => {
    const now = toggle();
    b.classList.toggle("on", now);
    b.setAttribute("aria-pressed", String(now));
    refreshPins();
  });
  return b;
}

function playChip(count) {
  return blueChip({
    label: "stPlay", aria: "ariaPlay", count, on: playOnly,
    toggle: () => (playOnly = !playOnly),
  });
}

function placesChip(count) {
  return blueChip({
    label: "stPlaces", aria: "ariaPlaces", count, on: placesOn, hollow: true,
    toggle: () => (placesOn = !placesOn),
  });
}

// The wheelchair chip (v26), last in the strip and off by default: switched
// on it narrows to the tables whose place is tagged `wheelchair=yes` — and
// brings back, marked with a key, the tables behind a Euro key that the
// default map leaves out, because the people this chip is for are exactly
// the people who hold one. Ink, not a colour: it is a badge, like play, and
// the pin keeps its status colour underneath. The count includes the keyed
// tables, which is why it is taken over every feature rather than the pins.
function wheelchairChip(count) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip wc" + (wheelchairOnly ? " on" : "");
  b.setAttribute("aria-pressed", String(wheelchairOnly));
  b.setAttribute("aria-label", t("ariaWheelchair"));
  b.title = t("ariaWheelchair");
  b.innerHTML = svgIcon(ISA_PATH, "isa") +
    `${esc(t("stWheelchair"))} <span class="cnt">${count}</span>`;
  b.addEventListener("click", () => {
    wheelchairOnly = !wheelchairOnly;
    try {
      if (wheelchairOnly) localStorage.setItem(WHEELCHAIR_KEY, "1");
      else localStorage.removeItem(WHEELCHAIR_KEY);
    } catch { /* blocked storage: this visit only */ }
    shareTables();
    // The strip is rebuilt, not toggled: the status badges count over the
    // chip's universe, so they change with it (renderChips reads the state).
    renderChips();
    // The rebuild removed the button that had the focus; a keyboard or
    // screen-reader user — this chip's audience — would otherwise land on
    // <body> and never hear the new aria-pressed state.
    filterBar.querySelector(".chip.wc")?.focus();
    refreshPins();
  });
  return b;
}

// ---- Stats strip (from stats.json, shape per CONTRACT.md) ----
// Templates come from i18n.js (trusted constants); every value interpolated
// into them is num()'d or esc()'d here first. lastStats feeds the re-render
// when the language toggles.
const num = (n) => Number(n ?? 0).toLocaleString(NUMBER_LOCALE[lang] ?? "en-GB");
let lastStats = null;

// The pipeline names the swept area twice: area_key for the sets it knows
// (translated here, so a Dane reads "Tyskland & Danmark"), area_name as the
// literal fallback for a hand-named build like PAPAMAP_AREA_NAME=Hamburg.
const AREA_KEYS = { de: "areaDe", dk: "areaDk", de_dk: "areaDeDk" };
// Past two countries the pipeline stops naming the set and counts it
// ("countries_9") — one translated string per language instead of three more
// every time a country is added.
const COUNTED_AREA_KEY = /^countries_(\d+)$/;

// inSentence picks the grammatical slot: German's wordmark reads "9 Länder"
// where statsLocal needs the dative "in 9 Ländern". English and Danish use one
// string for both.
function areaLabel(stats, inSentence = false) {
  const counted = COUNTED_AREA_KEY.exec(stats?.area_key ?? "");
  if (counted) {
    return t(inSentence ? "areaCountriesIn" : "areaCountries", { n: num(counted[1]) });
  }
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
  const { tables } = localAnswered(l);
  // The "as of" stamp, now the strip's own last item rather than a suffix on
  // the retired honesty sentence — also what dates the social-card screenshot.
  const updatedPart = stats.generated_at
    ? `<span class="stat updated">${t("statsUpdated", {
        date: esc(String(stats.generated_at).slice(0, 10)) })}</span>` : "";
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
  // Not the wordmark's `area`: a counted label declines inside the sentence.
  const areaInSentence = areaLabel(stats, true);
  const m = momCounts(l);
  const localSentence = mode === "mama"
    ? t("statsLocalMama", { good: num(m.good), maybe: num(m.maybe),
                            area: esc(areaInSentence || "—") })
    : t("statsLocal", { tables: num(tables), area: esc(areaInSentence || "—"),
                        unknown: num(l.unknown) });
  statsEl.innerHTML =
    `<span class="stat">${localSentence}</span>` +
    globalPart +
    updatedPart;
}

// ---- Zoom controls ----
document.getElementById("zoom-in").addEventListener("click", () => map.zoomIn());
document.getElementById("zoom-out").addEventListener("click", () => map.zoomOut());

// The area link's visible centre is measured from this same topbar height
// (updateRegionsLink's coveredTop), so anything that moves the zoom control
// — the stats strip collapsing, a mode or language change reflowing the
// tagline or the strip, a resize — has to refresh the area link too, not
// just the control. updateRegionsLink can itself change the topbar height
// (a long label wraps the nav row) and calls back here to re-seat the
// control, so the two would ping-pong forever without a guard: syncingLink
// caps it at one bounce, settling for whatever height the nested call finds
// rather than asking the outer call to go again.
let syncingLink = false;
function positionZoomCtrl() {
  zoomCtrl.style.top = topbar.offsetHeight + 10 + "px";
  // The search field shares that band, to the left of the column: one `top`
  // for both, so a topbar that changes height (a language with longer chips,
  // the stats strip folding open) never leaves the two at different heights.
  searchBox.style.top = zoomCtrl.style.top;
  if (!syncingLink) {
    syncingLink = true;
    try { updateRegionsLink(); } finally { syncingLink = false; }
  }
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
// and yanking the view back would be worse than a slightly off fit. Fits
// whatever the page opened on, so a ?bbox= deep link gets the same treatment.
function fitHome() {
  // Never pad past half the canvas: on a short landscape phone the strip can
  // approach the full height, and a padding taller than its container makes
  // fitBounds produce a NaN camera.
  const top = Math.min(topbar.offsetHeight + 10, map.getCanvas().clientHeight / 2);
  map.fitBounds(VIEW_BOUNDS, {
    padding: { top, bottom: 12, left: 12, right: 12 },
    animate: false,
  });
}

// ---- Locate: fly to the user, drop a you-are-here dot ----
// One reusable DOM marker (a single marker is no perf concern); errors show a
// transient toast instead of a blocking alert.
let youMarker = null, toastTimer = null;

// Shared by the locate button and the nearest-table one: both put the reader
// on the map, and a second marker class would drift from the first.
function showYou(at) {
  if (!youMarker) {
    const dot = document.createElement("div");
    dot.className = "you-dot";
    youMarker = new maplibregl.Marker({ element: dot });
  }
  youMarker.setLngLat(at).addTo(map);
}

// onTap makes the toast a button for as long as it shows — the edit
// confirmation uses it to reopen the pin it is about.
function toast(msg, { ms = 4000, onTap = null } = {}) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  el.classList.toggle("tap", !!onTap);
  const hide = () => { el.classList.remove("show", "tap"); el.onclick = null; };
  el.onclick = onTap ? () => { hide(); onTap(); } : null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, ms);
}

// One position, as a promise: the browser's API on the page, the
// Geolocation plugin in the app (it asks the OS permission itself). Either
// way the fix stays in memory and is used for one view or one search.
function locate() {
  if (isNative()) return locateNative();
  return new Promise((ok, fail) => {
    if (!navigator.geolocation) { fail(new Error("nogeo")); return; }
    navigator.geolocation.getCurrentPosition((pos) => ok(pos.coords), fail,
      { enableHighAccuracy: true, timeout: 10000 });
  });
}
const hasGeo = () => isNative() || !!navigator.geolocation;
// A fix takes a second or three and until it lands nothing on the map moves:
// the tapped button pulses (style.css, [aria-busy]) so the tap reads as heard.
function locateFrom(btn) {
  btn.setAttribute("aria-busy", "true");
  return locate().finally(() => btn.removeAttribute("aria-busy"));
}

// ---- Open at location: opens zoomed in on the reader, like Google Maps ----
// TestFlight feedback: a reader who has already granted location expects the
// map to open where they are, not on Germany. locateCoarse() is a second
// locate(), deliberately not a reuse of it — the boot fix wants a fast fix
// that never keeps an unprompted reader waiting (enableHighAccuracy: false,
// a few minutes' maximumAge, a short timeout — ignored on iOS, see
// locateNativeCoarse's own comment in web/native.js), and locate()'s own
// options, and the button it pulses, stay the locate button's alone.
//
// How the fix is applied (boot(), below) depends on how long it took past
// fitHome(): within LATE_FIX_MS the reader has barely had a frame to look at
// the home view, so jumpTo — no motion to notice, the map simply opened
// there. Past it, the home view has actually been on screen long enough to
// register, and snapping away from it would read as the view glitching
// rather than something the map meant to do; flyTo, over LATE_FIX_FLY_MS,
// makes that same repositioning read as deliberate instead.
const LATE_FIX_MS = 700;
const LATE_FIX_FLY_MS = 1200;
function locateCoarse() {
  if (isNative()) return locateNativeCoarse();
  return new Promise((ok, fail) => {
    if (!navigator.geolocation) { fail(new Error("nogeo")); return; }
    navigator.geolocation.getCurrentPosition((pos) => ok(pos.coords), fail,
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 5 * 60 * 1000 });
  });
}

// One permission read (never a prompt — checkPermissions() only, on both
// platforms) and, only where shouldOpenAtLocation (web/datasource.js) says
// the boot fix may act at all, one coarse fix. Checked once, before the fix
// starts, so a `?bbox=` or `?osm=` link already in the URL never starts one
// at all. NOT checked again once the fix lands: a deep link that arrives
// WHILE it is in flight — the app's own papamap://table (Siri, the widget,
// Control Center) resolving late — is caught at the point the fix is
// applied instead (boot(), below), by pinOpenedBeforeFix/popup?.isOpen()
// rather than by re-asking this question. Those guard the camera move only;
// the dot is drawn either way, which a second call here, discarding the
// coords outright, could not do (CONTRACT.md v45's own "dot drawn
// regardless" was not yet true of the code before this). Returns the coords
// to open on, or null for "do nothing", which is also what any failure
// reads as (no Permissions API, no plugin, a timed-out fix) — this is a
// nicety, never a reason to tell the reader anything went wrong.
async function openAtLocationFix() {
  try {
    const permission = isNative()
      ? await checkLocationPermissionNative()
      : (await navigator.permissions?.query({ name: "geolocation" }))?.state ?? null;
    if (!shouldOpenAtLocation({ search: location.search, permission, hasPendingPin: !!pendingPin }))
      return null;
    return await locateCoarse();
  } catch { return null; }
}

// A pin a chip is currently hiding is nobody's "nearest" or "the one the room
// card is about" in any useful sense — the filters that would hide it are
// switched back on, visibly, so a fly-to never lands on an empty-looking spot.
// Shared by the nearest button and the room card's own open button, which can
// name a pin the "unknown" chip has since been switched off (CONTRACT.md v38).
function ensureVisible(f) {
  let refilter = false;
  const key = chipKey(f, mode);
  if (!visible.has(key)) { visible.add(key); refilter = true; }
  if (playOnly && !f.play) { playOnly = false; refilter = true; }
  if (refilter) { renderChips(); refreshPins(); }
}

document.getElementById("locate").addEventListener("click", (e) => {
  if (!hasGeo()) { toast(t("toastNoGeo")); return; }
  locateFrom(e.currentTarget).then(
    (coords) => {
      const at = [coords.longitude, coords.latitude];
      showYou(at);
      noteFix(coords.latitude, coords.longitude);
      evaluateRoomCard();   // locate never opens a popup of its own
      map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 14) });
    },
    () => toast(t("toastGeoFail")),
  );
});

// ---- Nearest usable table: the one tap that answers "where can I change him?"
// Two things this deliberately does not do. It does not send the position
// anywhere: the fix stays in the tab, the search runs against the GeoJSON
// already in memory, and no request leaves the browser because of it — which is
// what keeps the Datenschutz page's promise true. And it does not choose a maps
// app for the reader; that is the popup's Route button, a geo: URI.
//
// "Usable" is the current reading's own verdict, so the same tap sends a father
// to the nearest open room and a mother to the nearest room of either kind.
const nearestBtn = document.getElementById("nearest");
// The popup is the button's own answer, and at the foot of a phone the two
// would stand on each other: the pill steps aside for as long as one is open.
function syncNearestBtn() {
  nearestBtn.hidden = !!popup?.isOpen();
}
nearestBtn.addEventListener("click", (e) => {
  if (!hasGeo()) { toast(t("toastNoGeo")); return; }
  if (!dataReady) { toast(t("countNoData")); return; }
  locateFrom(e.currentTarget).then(
    (coords) => {
      const { latitude: lat, longitude: lon } = coords;
      showYou([lon, lat]);
      noteFix(lat, lon);
      const hit = nearestUsable(allFeatures, lat, lon, mode, wheelchairOnly);
      if (!hit) {
        toast(t("toastNearestNone"));
        evaluateRoomCard();   // no popup is opening — this fix's own turn to ask
        return;
      }
      const f = hit.feature;
      ensureVisible(f);
      openPopup(f);
      // flyTo stops the pan openPopup just started; once the flight lands,
      // fit the card to the view it landed in.
      map.flyTo({ center: [f.lon, f.lat], zoom: Math.max(map.getZoom(), 16) });
      map.once("moveend", panPopupIntoView);
      const d = formatDistance(hit.km);
      toast(t("toastNearestFound", {
        dist: t(d.key, { n: num(d.n) }),
        name: f.name
          || t(f.amenity === "toilets" ? "popupToilets" : "popupUnnamed"),
      }));
      maybeToastTip();
      // The room card follows this popup, not this fix, the way locate's own
      // fix would if a popup were not about to cover it: openPopup above hid
      // it, and closing this one (whenever that happens — this same object,
      // another pin, or the reader taps away) re-evaluates it while the fix
      // is still fresh (evaluateRoomCard, via onPopupClosed below).
    },
    () => toast(t("toastGeoFail")),
  );
});

// ---- Search: this map's own places, and the rest of the world ----
// Tester feedback from the first TestFlight build: there was no way to look at
// anywhere you were not standing. Two sources in one dropdown, and the split
// between them matters more than it looks:
//
//   1. This map's pins and prospects, matched in memory against the GeoJSON
//      that is already loaded. No request leaves the browser, so a reader in
//      the basement café still finds the place they came for. Chosen, a row
//      behaves exactly like the nearest button's answer.
//   2. Everywhere else, from Photon (web/search.js says why that geocoder and
//      not Nominatim). This is the first feature on this site that sends
//      anything a reader typed to a third party, which is why the field waits
//      for the third character, debounces, and biases with the map's centre
//      rounded to ~10 km. The GPS fix is never sent — but the centre can BE
//      the reader's surroundings, after the locate button or a map that
//      opened at their position, so the rounding is the protection, not the
//      choice of variable. web/search.js's PHOTON_BIAS_DECIMALS carries the
//      whole reasoning, and the Datenschutz says the same thing in the same
//      words rather than a stronger one.
//
// Photon promises nothing about availability. Offline, throttled or simply
// down, the second source contributes one quiet line and the first one keeps
// working — never a toast, which would fire on every keystroke.
const SEARCH_FIT_MAX_ZOOM = 17;   // an address with a tiny extent must not land at z22

let searchRows = [];              // the options as rendered, in listbox order
let searchActive = -1;            // index into searchRows, -1 = nothing active
let searchLocal = [];             // matchLocal hits
let searchWorld = [];             // photonResults rows
let searchWorldState = "idle";    // idle | loading | ok | failed
let photonTimer = null;
let photonRequest = null;         // the AbortController of the one request in flight

// wrap(): with no maxBounds a pan past the antimeridian leaves lng at 182.
const mapCentre = () => { const c = map.getCenter().wrap(); return { lat: c.lat, lon: c.lng }; };

function searchRowEl(row) {
  const li = document.createElement("li");
  li.className = "search-opt";
  li.id = `search-opt-${searchRows.length}`;
  li.setAttribute("role", "option");
  li.setAttribute("aria-selected", "false");
  li.append(searchRowIcon(row));
  const txt = document.createElement("span");
  txt.className = "txt";
  // textContent throughout: these names come from OSM and from komoot, and
  // nothing about them has been through esc().
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = row.name;
  txt.append(name);
  if (row.context) {
    const ctx = document.createElement("span");
    ctx.className = "ctx";
    ctx.textContent = row.context;
    txt.append(ctx);
  }
  li.append(txt);
  li.addEventListener("click", () => pickSearchRow(row));
  searchRows.push(row);
  return li;
}

// The pin's own bucket colour, so the dropdown reads like the map: green is
// still "a dad can reach it" here. A prospect has no status and gets the play
// ring; a place from the geocoder is not on this map at all and gets a pin
// outline in the muted tone, which is the honest thing to draw for it.
function searchRowIcon(row) {
  if (row.kind === "world") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "globe");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = '<path d="M12 21.5s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>';
    return svg;
  }
  const dot = document.createElement("span");
  if (row.hit.kind === "place") dot.className = "dot play";
  else {
    dot.className = "dot";
    dot.style.background = BUCKET_COLOR[viewOf(row.hit.obj, mode).bucket];
  }
  return dot;
}

function searchGroupEl(label) {
  const li = document.createElement("li");
  li.className = "search-group";
  li.setAttribute("role", "presentation");
  li.textContent = label;
  return li;
}

function searchNoteEl(text) {
  const li = document.createElement("li");
  li.className = "search-note";
  li.setAttribute("role", "presentation");
  li.textContent = text;
  return li;
}

function renderSearch() {
  const q = searchInput.value.trim();
  searchRows = [];
  searchList.textContent = "";
  searchClear.hidden = !q;
  if (!q) { setSearchOpen(false); return; }

  if (searchLocal.length) {
    searchList.append(searchGroupEl(t("searchOnMap")));
    for (const hit of searchLocal) {
      const d = formatDistance(hit.km);
      searchList.append(searchRowEl({
        kind: "local", hit, name: hit.obj.name, context: t(d.key, { n: num(d.n) }),
      }));
    }
  }
  if (searchWorld.length) {
    searchList.append(searchGroupEl(t("searchWorld")));
    for (const r of searchWorld)
      searchList.append(searchRowEl({ kind: "world", ...r }));
  }
  // One line, never a toast. "Nothing found" only once the geocoder has had
  // its turn — saying it while a request is still out would flash it away
  // again a moment later on every single keystroke.
  if (searchWorldState === "failed") searchList.append(searchNoteEl(t("searchFailed")));
  else if (!searchRows.length && searchWorldState !== "loading")
    searchList.append(searchNoteEl(t("searchNone")));
  setSearchOpen(searchList.childElementCount > 0);
}

function setSearchOpen(open) {
  searchList.hidden = !open;
  searchInput.setAttribute("aria-expanded", String(open));
  setSearchActive(open ? searchActive : -1);
}

function setSearchActive(i) {
  const opts = searchList.querySelectorAll(".search-opt");
  searchActive = i < 0 || i >= opts.length ? -1 : i;
  opts.forEach((el, j) => el.setAttribute("aria-selected", String(j === searchActive)));
  const el = opts[searchActive];
  if (el) {
    el.scrollIntoView({ block: "nearest" });
    searchInput.setAttribute("aria-activedescendant", el.id);
  } else searchInput.removeAttribute("aria-activedescendant");
}

// Closing after a pick takes the phone's keyboard with it: the reader asked
// for a place, and half the screen should not still be a keyboard when they
// get there.
function closeSearch() {
  setSearchOpen(false);
  searchInput.blur();
}

function clearSearch() {
  searchInput.value = "";
  searchLocal = [];
  searchWorld = [];
  searchWorldState = "idle";
  clearTimeout(photonTimer);
  photonRequest?.abort();
  photonRequest = null;
  renderSearch();
}

// The prospects chip may be switched off, and flying to a place the reader
// then cannot see would read as a broken tap — ensureVisible's reasoning, for
// the one filter it does not cover.
function ensurePlacesVisible() {
  if (placesOn) return;
  placesOn = true;
  renderChips();
  refreshPins();
}

// Keep the fitted result clear of the chrome that floats over the canvas, the
// same two edges popupPan works from.
function searchFitPadding() {
  const c = map.getContainer().getBoundingClientRect();
  const top = Math.min(searchBox.getBoundingClientRect().bottom - c.top, c.height / 2) + EDGE;
  return { top: Math.round(top), bottom: 70, left: 20, right: 60 };
}

function pickSearchRow(row) {
  closeSearch();
  if (row.kind === "world") {
    // fitBounds where the result knows its own extent — a city then fills the
    // screen and is not guessed at from a zoom table. Capped, or a house whose
    // extent is a few metres across would land at the maximum zoom there is.
    if (row.target.bounds)
      map.fitBounds(row.target.bounds, { maxZoom: SEARCH_FIT_MAX_ZOOM, padding: searchFitPadding() });
    else map.flyTo({ center: row.target.center, zoom: row.target.zoom });
    return;
  }
  const f = row.hit.obj;
  if (row.hit.kind === "table") { ensureVisible(f); openPopup(f); }
  else { ensurePlacesVisible(); openPlacePopup(f); }
  // Exactly what the nearest button does with its own answer: fly, and fit the
  // card to the view it lands in once the flight is over.
  map.flyTo({ center: [f.lon, f.lat], zoom: Math.max(map.getZoom(), 16) });
  map.once("moveend", panPopupIntoView);
}

function queryPhoton(q) {
  clearTimeout(photonTimer);
  // One request in flight, ever: a reader typing "hamburg" would otherwise
  // leave seven behind, and the last answer to arrive need not be the last one
  // asked for.
  photonRequest?.abort();
  photonRequest = null;
  if (q.length < PHOTON_MIN_CHARS) {
    searchWorld = [];
    searchWorldState = "idle";
    return;
  }
  searchWorldState = "loading";
  photonTimer = setTimeout(() => sendPhoton(q), PHOTON_DEBOUNCE_MS);
}

async function sendPhoton(q) {
  const ctrl = new AbortController();
  photonRequest = ctrl;
  const c = map.getCenter().wrap();   // a longitude the geocoder accepts, see mapCentre
  // The map's centre, and only ever the map's centre: lastFix is not in scope
  // here, so no GPS reading is sent. Where the centre happens to be the
  // reader's own surroundings, web/search.js's rounding to one decimal is
  // what keeps that a region rather than a position.
  const url = photonUrl(q, { lang, lat: c.lat, lon: c.lng, zoom: map.getZoom() });
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`photon ${res.status}`);
    const rows = photonResults(await res.json());
    if (photonRequest !== ctrl) return;   // a later keystroke already took over
    searchWorld = rows;
    searchWorldState = "ok";
  } catch {
    // Aborted, offline, throttled, or komoot simply down: their terms promise
    // no availability at all. Nothing is retried and nothing is toasted.
    if (photonRequest !== ctrl) return;
    searchWorld = [];
    searchWorldState = "failed";
  }
  photonRequest = null;
  renderSearch();
}

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim();
  // The whole dataset, not the viewport: the same true-global search the
  // nearest button does, and for the same reason.
  searchLocal = dataReady ? matchLocal(allFeatures, allPlaces, q, mapCentre()) : [];
  queryPhoton(q);
  renderSearch();
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!searchRows.length) return;
    e.preventDefault();
    const n = searchRows.length, step = e.key === "ArrowDown" ? 1 : -1;
    setSearchActive(searchActive < 0
      ? (step > 0 ? 0 : n - 1)
      : (searchActive + step + n) % n);
    return;
  }
  if (e.key === "Enter") {
    // Nothing arrowed to: the first row, which is what a reader who typed and
    // hit Enter meant — and the local matches are always the first rows.
    if (!searchRows.length) return;
    e.preventDefault();
    pickSearchRow(searchRows[Math.max(searchActive, 0)]);
    return;
  }
  if (e.key === "Escape") {
    // First the list, then the field. Two steps, because closing a dropdown
    // and throwing away what was typed are two different intentions.
    e.preventDefault();
    if (!searchList.hidden) { setSearchOpen(false); return; }
    clearSearch();
  }
});

// The field must not lose focus before a row's own click handler runs, and a
// drag on the list's scrollbar must not close it either.
searchList.addEventListener("mousedown", (e) => e.preventDefault());
searchInput.addEventListener("focus", () => { if (searchRows.length) setSearchOpen(true); });
searchInput.addEventListener("blur", () => setSearchOpen(false));
searchClear.addEventListener("click", () => { clearSearch(); searchInput.focus(); });

// ---- The "which room?" card: ask, at the moment it might get answered ----
// Never a permission prompt of its own: it only ever follows a fix the reader
// already has for another reason, the locate button or the nearest-table one
// (the two call sites above) — the only places this page ever asks the phone
// where it is. The rule is nearestUnknownRoom (web/datasource.js), pure and
// tested; this is only the card's own bookkeeping (CONTRACT.md v38).
const CARD_DISMISSED_KEY = "papamap-card-dismissed";
const CARD_DISMISSED_MAX = 200;   // bounded: years of dismissals must not grow this file forever

function readCardDismissed() {
  try {
    const list = JSON.parse(localStorage.getItem(CARD_DISMISSED_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function rememberCardDismissed(osmUrl) {
  try {
    const list = readCardDismissed().filter((u) => u !== osmUrl);
    list.push(osmUrl);
    while (list.length > CARD_DISMISSED_MAX) list.shift();
    localStorage.setItem(CARD_DISMISSED_KEY, JSON.stringify(list));
  } catch { /* blocked storage: the card may ask again this session, no worse than never asking */ }
}

const roomCardEl = document.getElementById("room-card");
const roomCardText = document.getElementById("room-card-text");
let roomCardFeature = null;

// The most recent fix from locate() or nearest(), whether or not it ended up
// showing a card — nearest almost always opens a popup of its own first, and
// the card's turn comes only once that popup closes (below). Kept apart from
// whatever the card is doing right now, so a popup that closes minutes later
// is not mistaken for a fresh "I am here" (isFixFresh, web/datasource.js).
// "Mein PapaMap" (CONTRACT.md v39) reuses this same fix for its grey-pins-
// within-1km clause and the saved-places list's distances, rather than
// keeping a second one of its own — one reader position, one variable.
let lastFix = null;   // { lat, lon, at }

function noteFix(lat, lon) {
  lastFix = { lat, lon, at: Date.now() };
}

function hideRoomCard() {
  roomCardFeature = null;
  roomCardEl.hidden = true;
}

function renderRoomCardText() {
  if (!roomCardFeature) return;
  // The card repeats the popup's own question rather than a second
  // translation of it, so the two can never read differently. Re-run on a
  // language change (applyI18n) so a card left standing does not go stale in
  // the old language.
  roomCardText.textContent = `${t(roomCardFeature.name ? "roomCardNamed" : "roomCardUnnamed",
    { name: roomCardFeature.name })} ${t("askRoom")}`;
}

// The single source of truth for whether the card is showing, and for what —
// recomputed from lastFix every time rather than patched incrementally, so
// "should it be up right now" never has to be asked two different ways.
// Called after every fix (locate, or nearest when no popup is about to cover
// it) and, deferred, after every popup close (onPopupClosed) — which is what
// makes "the reader closed the popup without answering" bring the card back
// on its own, and "answered" not: answer() sets location_raw on the very
// object in allFeatures the moment OSM confirms it, so nearestUnknownRoom
// stops finding it without this function needing to know why.
function evaluateRoomCard() {
  if (!dataReady || popup?.isOpen() || !lastFix || !isFixFresh(lastFix.at)) {
    hideRoomCard();
    return;
  }
  const hit = nearestUnknownRoom(allFeatures, lastFix.lat, lastFix.lon);
  if (!hit || readCardDismissed().includes(hit.feature.osm_url)) { hideRoomCard(); return; }
  roomCardFeature = hit.feature;
  renderRoomCardText();
  roomCardEl.hidden = false;
}

document.getElementById("room-card-open").addEventListener("click", () => {
  if (!roomCardFeature) return;
  const f = roomCardFeature;
  ensureVisible(f);   // the "unknown" chip may since have been switched off
  map.flyTo({ center: [f.lon, f.lat], zoom: Math.max(map.getZoom(), 16) });
  openPopup(f);   // also hides the card
  map.once("moveend", panPopupIntoView);
});
document.getElementById("room-card-close").addEventListener("click", () => {
  if (roomCardFeature) rememberCardDismissed(roomCardFeature.osm_url);
  hideRoomCard();
});
// A pan far enough that the card no longer names anywhere near the reader —
// well past the 75 m the rule itself asks within, so a small pan while
// reading it does not snatch it away. Judged against the fix, not the pin:
// the card is still "about" that fix even while it is between popups.
const ROOM_CARD_FORGET_KM = 0.3;
map.on("moveend", () => {
  if (!roomCardFeature || !lastFix) return;
  const c = map.getCenter();
  if (haversineKm(lastFix.lat, lastFix.lon, c.lat, c.lng) > ROOM_CARD_FORGET_KM) hideRoomCard();
});

// Every popup's "close" (openPopup/openPlacePopup) reports itself here —
// clicking away, clicking the ×, this file's own remove()-then-replace, or
// applyDataset finding the object gone. `popup`/`popupObj` used to go stale
// on the first two of those (nobody nulled them), which is why the card could
// never appear a second time in a session before this fix.
//
// suppressCardOnClose is for the one close that must NOT bring the card back:
// a language switch (or a mode switch with a *prospect* popup open — applyMode
// redraws a table popup in place instead of closing it, below) tearing the
// popup down because its text no longer applies, not because the reader
// dismissed anything. Every other close — including this file's own "remove
// the old one, open a new one" in openPopup/openPlacePopup/reopen() —
// re-evaluates, deferred to a microtask so a same-tick reopen has already
// reassigned `popup` by the time it runs (evaluateRoomCard's popup?.isOpen()
// then correctly sees the new one and stays quiet).
let suppressCardOnClose = false;

function onPopupClosed(closedPopup) {
  if (popup === closedPopup) { popup = null; popupObj = null; updateSignMarker(); }
  syncNearestBtn();
  if (suppressCardOnClose) { suppressCardOnClose = false; return; }
  queueMicrotask(evaluateRoomCard);
}

// Used where the popup is torn down as a side effect of something else
// (applyMode, the language switch) rather than the reader's own doing.
function closePopupSilently() {
  if (!popup) return;
  suppressCardOnClose = true;
  popup.remove();
  popup = null;
  popupObj = null;
  syncNearestBtn();
}

// ---- Edit confirmation: re-read the object from OSM after a MapComplete click ----
// The nightly build is the only way an answer reaches the map, so a reader who
// has just tagged a room sees nothing for up to a day. Once the MapComplete
// button is clicked the object's current version and tags are kept as a
// baseline, and when the tab is back in front the object is re-read from the
// OSM API a few times over five minutes (EDIT_CHECK_DELAYS). What the reader
// gets is the raw tag value OSM now holds — never a colour: classification
// stays in the pipeline (CONTRACT.md v23). The record lives in sessionStorage
// rather than a variable because a phone drops a background tab freely, and
// the reader comes back to a reloaded page.
const EDIT_KEY = "papamap-edit-check";
const EDIT_TTL_MS = 15 * 60 * 1000;
const EDIT_AWAY_MS = 20 * 1000;   // time in the other tab that counts as "tried to answer"

let editTimers = [];   // the running schedule's pending reads — the last one empties it
let editFallback = null;   // the 30 s arm for a tab that never went hidden
let editGen = 0;       // bumped per schedule and per click, so a stale poll is ignored
let editNote = null;   // { osm_url, cls, key, tags } — re-attached when the popup reopens

function readEdit() {
  try {
    const rec = JSON.parse(sessionStorage.getItem(EDIT_KEY));
    if (!rec) return null;
    // Re-vet what came back from storage: the API URL is built from ref, and
    // the regex that keeps it well-formed ran on a previous page load.
    rec.ref = osmRef(rec.osm_url);
    if (!rec.ref || Date.now() - rec.t0 >= EDIT_TTL_MS) { sessionStorage.removeItem(EDIT_KEY); return null; }
    return rec;
  } catch { return null; }
}

function writeEdit(rec) {
  try {
    if (rec) sessionStorage.setItem(EDIT_KEY, JSON.stringify(rec));
    else sessionStorage.removeItem(EDIT_KEY);
  } catch { /* storage blocked: the check simply does not run */ }
}

function clearEditTimers() {
  for (const id of editTimers) clearTimeout(id);
  editTimers = [];
  clearTimeout(editFallback);
  editFallback = null;
}

// { version, tags } | { gone: true } | null while the API is unreachable.
async function fetchOsm(ref) {
  try {
    const r = await fetch(osmApiUrl(ref), { cache: "no-store" });
    if (r.status === 410) return { gone: true };
    return r.ok ? osmElementFromApi(await r.json()) : null;
  } catch { return null; }
}

function startEditCheck(kind, obj) {
  clearEditTimers();
  editGen++;
  dropEditNote();
  const ref = osmRef(obj.osm_url);
  if (!ref) { writeEdit(null); return; }
  const rec = { kind, osm_url: obj.osm_url, ref, t0: Date.now(), before: null };
  writeEdit(rec);
  fetchOsm(ref).then((el) => {
    const cur = readEdit();
    if (el && !el.gone && cur && cur.osm_url === rec.osm_url) { cur.before = el; writeEdit(cur); }
  });
  // A desktop can open the editor beside this tab without ever hiding it, so
  // "coming back" never fires there; the fallback arms the reads anyway — but
  // only in a tab that is in front. A hidden tab waits for the reader.
  editFallback = setTimeout(() => {
    editFallback = null;
    if (document.hidden) return;
    // Thirty seconds with the map still in front means the editor is open
    // beside it; for the nudge at the end of the schedule that counts as
    // time spent there, since this tab will never book any.
    const cur = readEdit();
    if (cur) { cur.away = Math.max(cur.away ?? 0, EDIT_AWAY_MS); writeEdit(cur); }
    armEditCheck();
  }, 30000);
}

function armEditCheck() {
  const rec = readEdit();
  if (!rec) return;
  clearEditTimers();
  const gen = ++editGen;
  setEditNote(rec, "looking", "editLooking");
  EDIT_CHECK_DELAYS.forEach((ms, i) =>
    editTimers.push(setTimeout(() => pollEdit(gen, i === EDIT_CHECK_DELAYS.length - 1), ms)));
}

async function pollEdit(gen, last) {
  const rec = readEdit();
  if (!rec) { clearEditTimers(); dropEditNote(); return; }
  if (!rec.before) {
    // The baseline read may still be in flight right after the click; once
    // it has clearly failed there is nothing to compare against — stay quiet.
    if (Date.now() - rec.t0 > 10000) { clearEditTimers(); writeEdit(null); dropEditNote(); }
    return;
  }
  const after = await fetchOsm(rec.ref);
  // The schedule's final read has resolved: nothing of it is pending now. Not
  // before the await — a return to the tab mid-read would restart everything.
  if (last && gen === editGen) editTimers = [];
  if (gen !== editGen) return;   // a newer schedule took over while this read was in flight
  // Unreachable is not "nothing new": the edit may well be on OSM. Say nothing.
  if (!after) { if (last) dropEditNote(); return; }
  const out = editOutcome(rec.before, after);
  if (out.changed) {
    clearEditTimers();
    writeEdit(null);
    // editFoundPlain, not editFound, whenever there is nothing printable to
    // quote — out.tags is non-null but printableEditTagLines(out.tags) can
    // still come back empty when the only change is `changing_table=yes`
    // (the theme's standalone table question, answered on a play place with
    // no room to show instead): tagsLabel would otherwise render an empty
    // line, and the toast would read "…OSM: . …".
    const printable = out.tags && printableEditTagLines(out.tags).length > 0;
    setEditNote(rec, "found", printable ? "editFound" : "editFoundPlain", out.tags);
    // The OSM API confirms the edit exists; the pin's own colour still
    // waits on the delta follower (a few minutes) or tonight's build. Watch
    // for it rather than leaving the note's "in a moment" unfulfilled.
    if (Number.isFinite(after.version)) watchDeltaForVersion(rec.osm_url, after.version);
  } else if (last) {
    // The record stays: coming back to the tab re-arms the reads until the
    // TTL runs out, for the reader who returned once before answering — but
    // the "log in and upload" nudge is given once, not on every return;
    // never to a hidden tab (the reader may still be inside MapComplete, and
    // the return will re-read before anything is claimed); and only to a
    // reader who was away long enough to have answered at all. Most clicks
    // are a glance at MapComplete and back, and those deserve silence.
    if (rec.told || document.hidden || (rec.away ?? 0) < EDIT_AWAY_MS) { dropEditNote(); return; }
    rec.told = true;
    writeEdit(rec);
    setEditNote(rec, "none", "editNone");
  }
}

// "Room: unisex toilet" — the popup's own labels, in the reader's language
// where roomLabel has one, the tag value verbatim otherwise. Which lines
// there are (and that "Play area: yes · Indoor play area: no" is two of
// them) is printableEditTagLines' business, in datasource.js where the tags
// and their labels live; this only puts the words to it, at render time, the
// way the two popups do — editTagLines itself still hands back "yes" and the
// raw room token unchanged. "Changing table: yes" is dropped the same way it
// is in the popups (v37): the line would only repeat what every object here
// already has — pollEdit asks the same question to pick editFound over
// editFoundPlain, so the two can never disagree about whether there is
// anything here to show. Goes through textContent, so no escaping here.
const tagsLabel = (tags) =>
  printableEditTagLines(tags)
    .map(([label, value]) => label === "popupTable" ? tableRowText(value)
      : `${t(label)}: ${label === "popupRoom" ? roomLabel(value) : value}`)
    .join(" · ");

const editText = (note) =>
  note.key === "editFound" ? t("editFound", { tags: tagsLabel(note.tags) }) : t(note.key, note.vars ?? {});

// Into the open popup when it is this object's, otherwise a toast that
// reopens the pin — except "looking", which nobody asked to be told about.
// With the tab hidden an 8 s toast would burn down unseen, so it waits for
// the visibilitychange that brings the reader back.
function setEditNote(rec, cls, key, tags = null, vars = null) {
  editNote = { kind: rec.kind, osm_url: rec.osm_url, cls, key, tags, vars, at: Date.now(), unseen: false };
  if (attachEditNote() || cls === "looking") return;
  if (document.hidden) { editNote.unseen = true; return; }
  toastEditNote();
}

function toastEditNote() {
  const note = editNote;
  const obj = (note.kind === "place" ? placesByOsmUrl : featuresByOsmUrl).get(note.osm_url);
  toast(editText(note), {
    ms: 8000,
    onTap: obj ? () => reopen(note.kind, obj) : null,
  });
}

// A row at the bottom of the open popup, if that popup belongs to the object
// being checked. Returns whether it found one to live in. A note is worth
// showing for as long as the check itself could run; after that the nightly
// build has had its say and the row would only repeat it.
function attachEditNote() {
  if (editNote && Date.now() - editNote.at >= EDIT_TTL_MS) editNote = null;
  if (!editNote || !popup?.isOpen() || popupObj?.obj.osm_url !== editNote.osm_url) return false;
  const root = popup.getElement()?.querySelector(".popup");
  if (!root) return false;
  let el = root.querySelector(".edit-note");
  if (!el) { el = document.createElement("div"); root.appendChild(el); }
  el.className = `edit-note ${editNote.cls}`;
  el.textContent = editText(editNote);
  return true;
}

function dropEditNote() {
  editNote = null;
  popup?.getElement()?.querySelector(".edit-note")?.remove();
}

// ---- Share: the same https link the app's own deep link opens ----
// A plain URL, not a MapComplete or OSM one: it opens for anyone, the app
// installed or not, and openPin (below) is the one parser that reads it back,
// on the website's own load and on papamap://table?osm=… alike.
async function sharePin(kind, obj) {
  const url = shareUrl(obj.osm_url);
  const title = obj.name || t(obj.amenity === "toilets" ? "popupToilets" : "popupUnnamed");
  // "a changing table on PapaMap" is false for a play place OSM records no
  // table on — shareText is for a real pin, or a play place this reader has
  // just answered "yes" to in this session (answer() sets obj.changing_table
  // the moment OSM confirms it, same as the popup's own tag row). Everything
  // else — the open question, or a recorded "no" — gets sharePlaceText, which
  // names the place, not a table it does not have.
  const hasTable = kind === "table" || obj.changing_table === "yes";
  const text = t(hasTable ? "shareText" : "sharePlaceText", { name: title });
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; }
    // AbortError: the reader closed the OS share sheet without picking
    // anything — that is not a failure worth a toast, only a change of mind.
    catch (err) { if (err?.name === "AbortError") return; }
  }
  await copyShareLink(url);
}

// Three ways to get the link into the reader's hands, tried in order: the
// modern clipboard API, then the one every WebView has carried for years (a
// hidden textarea and the browser's own copy command), and if neither is
// there at all, the link itself in the toast — read it, at least.
async function copyShareLink(url) {
  try { await navigator.clipboard.writeText(url); toast(t("shareCopied")); return; }
  catch { /* try the older way below */ }
  try {
    const el = document.createElement("textarea");
    el.value = url;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.append(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    if (!ok) throw new Error("execCommand copy failed");
    toast(t("shareCopied"));
  } catch { toast(t("shareFailed")); }
}

// The popup markup is rebuilt on every open, so the hook listens once at the
// document; the button itself keeps its plain target=_blank navigation.
document.addEventListener("click", (e) => {
  if (popupObj && e.target.closest?.("a[data-edit-check]"))
    startEditCheck(popupObj.kind, popupObj.obj);
  if (popupObj && e.target.closest?.("button[data-share]"))
    sharePin(popupObj.kind, popupObj.obj);
  const room = e.target.closest?.("button.ask-btn");
  if (room && popupObj) answer(popupObj.kind, popupObj.obj, room.dataset.room);
  const more = e.target.closest?.("button.ask-more");
  if (more) {
    more.nextElementSibling?.removeAttribute("hidden");
    more.remove();
    panPopupIntoView();   // three more pills: the card just grew a row
  }
  if (e.target.closest?.("button[data-logout]")) { logout(); if (meDialog.open) renderMeDialog(); }
  const star = e.target.closest?.("button.star-btn");
  if (star) toggleStar(star);
});

// ---- The two-tap answer: written to OSM under the reader's own account ----
// One tap on the pin, one on the room. The first time, the second tap goes
// through OSM's consent screen and comes back here with the answer still in
// hand (the intent, kept in sessionStorage for the round trip), so nobody is
// asked twice. OSM's reply is quoted in the popup the way the MapComplete
// confirmation quotes it, and the pin keeps its colour until tonight's build:
// what was written is displayed, never classified.
function rememberView() {
  // The redirect comes back to https://papamap.de/ bare, so the reader's
  // language and reading have to survive it in storage. Blocked storage
  // (private mode, quota) is not a reason for the tap to do nothing: the
  // login still starts, and the view is reset to the defaults on return.
  try {
    localStorage.setItem("papamap-lang", lang);
    localStorage.setItem("papamap-mode", mode);
  } catch { /* blocked storage: the defaults on return */ }
}

// Leaves for OSM's consent screen. When the page cannot keep the return
// verifiable (storage blocked: some privacy settings, some webviews) the
// login does not start, and the reader is told rather than left with a
// button that does nothing.
const goLogin = (intent) => startLogin(osm, intent, isNative() ? nativeNavigate : undefined).then((went) => { if (!went) toast(t("loginFailed")); });

// Answers on their way to OSM, by object. A pin closed and reopened during
// the round trip renders its question again; it must not take a second
// answer for the same object — the second write would lose the version race
// and the popup would blame a stranger for the reader's own first one.
const inFlight = new Set();

// One path for both pin kinds: a grey table gets its room, a play place gets
// the table and the room. The kind rides along in the login intent so the
// return leg knows which dataset to look the object up in.
// `freshToken`: the token just exchanged on the return leg, handed in
// directly. Reading it back from storage would, on a browser that lets
// sessionStorage through but not localStorage, find nothing and send the
// reader to the consent screen again, and again.
async function answer(kind, obj, choice, freshToken = null) {
  const token = freshToken ?? getToken();
  const intent = { kind, osm_url: obj.osm_url, choice };
  if (!token) { rememberView(); goLogin(intent); return; }
  if (inFlight.has(obj.osm_url)) return;
  inFlight.add(obj.osm_url);
  // The popup this answer belongs to, taken now: OSM takes seconds to reply,
  // and by then the reader may have opened another pin, whose question must
  // stay. Its buttons go quiet for the round trip — a second tap on a slow
  // connection would otherwise open a second changeset for the same answer.
  const el = popup?.getElement();
  const btns = [...(el?.querySelectorAll("button.ask-btn, button.ask-more") ?? [])];
  btns.forEach((b) => { b.disabled = true; });
  const rec = { kind, osm_url: obj.osm_url };
  setEditNote(rec, "looking", "askSaving");
  try {
    // Inside the try: a choice that is not one of ours (a stale or edited
    // intent from storage) fails like any other answer, with a note, rather
    // than as an unhandled rejection the reader never sees.
    const play = isPlayChoice(choice);
    const patch = play ? playPatch(choice)
      : kind === "place" ? tablePatch(choice) : roomPatch(choice);
    // "none" only ever arrives for a place, and it gets its own changeset
    // comment — the room comment would claim a room was named. A play answer
    // names itself.
    const comment = play ? CHANGESET_COMMENT[choice]
      : kind === "place" && choice === "none" ? CHANGESET_COMMENT.place_none : CHANGESET_COMMENT[kind];
    const out = await writeTags(osm, token, osmRef(obj.osm_url), patch, comment);
    // "Mein PapaMap"'s own count moves on this tap, not the next time the
    // dialog happens to page the changesets list: the write's own reply
    // already has everything an entry needs (CONTRACT.md v39).
    recordMyAnswer(out.changeset, obj.lon, obj.lat);
    // The popup's tag row and the question's absence both read from the
    // object, so the one in memory learns the answer. A room answer's own
    // status recolours instantly below (stats.json's answer_status — never
    // re-derived here); everything else — a status this reader did NOT just
    // answer, and the blue play ring either way — still only moves once the
    // pipeline says so: the delta follower within a few minutes, tonight's
    // build as the backstop.
    if (play) {
      // Answered is answered, whichever way: the question does not come back
      // when this popup is reopened. Only its own line goes; a room question
      // still waiting above it stays.
      obj.play_recorded = true;
      el?.querySelector(".ask-play")?.remove();
    } else {
      obj.changing_table = out.tags.changing_table;
      obj.location_raw = out.tags["changing_table:location"];
      // Instant recolour (CONTRACT.md's live-updates amendment): stats.json's
      // answer_status is the one lookup the frontend may use for a reader's
      // OWN confirmed answer — everything else still waits for the delta or
      // tonight's build. `choice` covers every room (roomPatch/tablePatch);
      // "none" (a play place with no table) and the three play_* choices
      // never carry a status, so this stays untouched for those, exactly as
      // before. obj.status is set directly (not only via the override layer)
      // so the very next refreshPins() call — right below, via
      // renderMergedDataset() — repaints this object without waiting on
      // localStorage to round-trip.
      const newStatus = lastStats?.answer_status?.[choice];
      // v50: the same lookup for "the men's room only" — undefined in a
      // stats.json from before it, which the override then leaves to the base.
      const newMenOnly = lastStats?.answer_men_only?.[choice];
      if (newStatus !== undefined && newStatus !== null) {
        const t = new Date().toISOString();
        // out.version is the OSM object's version AFTER this write (writeTags,
        // web/osm.js) — the primary key pruneAnswerOverrides matches against
        // a delta upsert's own osm_version. `t` (the client clock, after the
        // round trip) stays only as the secondary, data_base-time fallback:
        // OSM's own edited_at on that same delta feature is the server's
        // timestamp from DURING the write, routinely earlier than `t`, so a
        // time-only comparison against it would never clear this override.
        answerOverrides = { ...answerOverrides, [obj.osm_url]:
          { status: newStatus, men_only: newMenOnly, changing_table: obj.changing_table,
            location_raw: obj.location_raw, t, version: out.version } };
        saveAnswerOverrides(answerOverrides);
        renderMergedDataset();
        // renderMergedDataset() rebuilds featuresByOsmUrl/placesByOsmUrl and
        // popupObj from the merged view — obj itself (this closure's own
        // reference) may now be a stale copy if the answer promoted a place
        // to a table, so the rest of this branch keeps using it only for the
        // tag row below, never for anything that must reflect the promotion.
      }
      // Everything that was true only while the question was open goes: the
      // question itself (.ask — querySelector would take the headline alone
      // and leave the buttons standing, sandbox test 13 Sep 2026) and the
      // context lines marked .ask-ctx: a pin's "room unknown" headline in
      // either reading, a play place's "OSM says nothing" and "been here?".
      // .ask-play is neither, and stays.
      el?.querySelectorAll(".ask, .ask-ctx").forEach((x) => x.remove());
    }
    // Whatever survived the sweep is the other question, and it was quieted
    // for this round trip, not answered: give it its buttons back.
    btns.forEach((b) => { if (b.isConnected) b.disabled = false; });
    // Quoted back: the group this answer wrote. A room answer names the table
    // and its room, a play answer the play corner — never the other question's
    // tags, which this tap did not touch.
    const tags = {};
    for (const k of (play ? PLAY_TAGS : TABLE_TAGS)) if (out.tags[k]) tags[k] = out.tags[k];
    setEditNote(rec, "found", "editFound", tags);
  } catch (err) {
    btns.forEach((b) => { b.disabled = false; });
    // A dead token is not the reader's problem: log in again, answer in hand.
    if (err.status === 401) { clearLogin(); rememberView(); goLogin(intent); return; }
    setEditNote(rec, "none", err.status === 409 ? "askConflict" : "askFailed", null,
                { status: err.status || "network" });
  } finally {
    inFlight.delete(obj.osm_url);
  }
}

const reopen = (kind, obj) => (kind === "place" ? openPlacePopup : openPopup)(obj);

function logout() {
  const token = getToken();
  clearLogin();
  // The next login may be someone else's account on the same device (a
  // shared phone, a library computer) — their answers must not carry over.
  try { localStorage.removeItem(MY_ANSWERS_KEY); } catch { /* nothing to clear */ }
  myAnswers = null;
  // Without this a login right after logout waited out the five-minute
  // throttle before fetching anything — "0 Antworten" until it did.
  myAnswersFetchedAt = 0;
  // A refresh already in flight when this runs must not write its result
  // back once it lands — bumping invalidates it (refreshMyAnswers checks
  // this via refreshApplies before touching storage or the in-memory cache)
  // — and aborting its own requests stops it outrunning the check for no
  // reason.
  myAnswersGeneration++;
  myAnswersAbort?.abort();
  if (token) revoke(osm, token);
  if (popupObj) reopen(popupObj.kind, popupObj.obj);   // the footer line changes
}
// The "reader is back" path — what actually needs to happen once whatever
// took them away (MapComplete, OSM, another tab) is behind them again. The
// website reaches this from visibilitychange, below; the iOS app, whose
// in-app Browser sheet never sets document.hidden at all (native.js's own
// comment on onBrowserFinished), reaches it from that event instead
// (bootNative). Idempotent — safe to call from both on a platform where,
// in principle, either could fire.
function onReturnToFront() {
  if (editNote?.unseen) {
    editNote.unseen = false;
    if (!attachEditNote() && editNote) toastEditNote();
  }
  // A schedule already running keeps running: its 20 s / 1 min / 2 min /
  // 5 min reads catch an answer made in between, and a reader flipping
  // between the two tabs must not turn into one API request per flip.
  if (!editTimers.length && readEdit()) armEditCheck();
  // "Poll on returning to the front" — a reader who just came back from
  // MapComplete (or from any other tab) should not wait out the rest of the
  // 3-minute/30-second schedule for their own edit to show up.
  if (dataReady) { pollDelta(); scheduleDeltaPoll(); }
}

document.addEventListener("visibilitychange", () => {
  // Book the time spent away: the nudge at the end of a schedule is for a
  // reader who was in MapComplete long enough to have answered.
  const rec = readEdit();
  if (rec) {
    if (document.visibilityState === "visible" && rec.hiddenAt)
      { rec.away = (rec.away ?? 0) + (Date.now() - rec.hiddenAt); rec.hiddenAt = null; }
    else if (document.visibilityState !== "visible") rec.hiddenAt = Date.now();
    writeEdit(rec);
  }
  if (document.visibilityState !== "visible") return;
  onReturnToFront();
});

// ---- Add a place: deep links out to MapComplete, at the current view ----
// The links are (re)built on every open so they always carry the map position
// the user is actually looking at, and the language chosen on the site. Both
// open the same theme; the venue one lands a zoom level inside the dad_venue
// layer's minzoom so the untagged cafés are on screen straight away.
const addDialog = document.getElementById("add-dialog");

document.getElementById("add-place").addEventListener("click", () => {
  // wrap(): with no maxBounds a pan past the antimeridian leaves lng at 182,
  // which MapComplete reads as somewhere else entirely.
  const c = map.getCenter().wrap(), z = map.getZoom();
  document.getElementById("add-toilet-link").href = mapCompleteAddUrl(c.lng, c.lat, z, lang);
  document.getElementById("add-venue-link").href = mapCompleteVenueUrl(c.lng, c.lat, z, lang);
  addDialog.showModal();
});
document.getElementById("add-close").addEventListener("click", () => addDialog.close());

// ---- Add a place: watching the delta for the new object to arrive --------
// Tapping either link leaves for MapComplete; there is no osm_url to check
// yet (the object doesn't exist), so — unlike startEditCheck — this watches
// a place (the view's own bbox) and a time, not one object. Cleared once
// resolved one way or the other, so a reader who adds two places in a row
// only ever watches for the most recent.
const ADD_WATCH_KEY = "papamap-add-watch";
const ADD_WATCH_TIMEOUT_MS = 10 * 60 * 1000;

function writeAddWatch(rec) {
  try { sessionStorage.setItem(ADD_WATCH_KEY, JSON.stringify(rec)); }
  catch { /* blocked storage: the toast/pulse simply never fires */ }
}
function readAddWatch() {
  try { return JSON.parse(sessionStorage.getItem(ADD_WATCH_KEY) || "null"); }
  catch { return null; }
}
function clearAddWatch() {
  try { sessionStorage.removeItem(ADD_WATCH_KEY); } catch { /* nothing to clear */ }
}

for (const id of ["add-toilet-link", "add-venue-link"]) {
  document.getElementById(id).addEventListener("click", () => {
    const b = map.getBounds();
    writeAddWatch({
      t: new Date().toISOString(),
      bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
      // The actual zoom at the tap, not an estimate from the bbox's own
      // span — used only for the "wide view, skip the fly-to" decision
      // below, but there is no reason to approximate what MapLibre already
      // hands over for free.
      zoom: map.getZoom(),
    });
    addDialog.close();
  });
}

// A short visual "look here": fly to the new pin and (re)open its popup —
// which already pulses in on open the way any freshly drawn/selected pin
// does (the selected-pin marker, CONTRACT.md v44's scale-in). No separate
// animation is added on top of it. Skipped — the toast alone still fires —
// when the view the reader tapped "add a place" from was wider than about
// zoom 14 (the actual zoom recorded in the watch at tap time, never
// estimated from the bbox): flying in from a whole-country view would be a
// bigger jump than "look here" is meant to be, and the toast already names
// what happened.
function pulseNewPin(kind, obj, watch) {
  if (watch.zoom < 14) return;
  map.flyTo({ center: [obj.lon, obj.lat], zoom: Math.max(map.getZoom(), 16) });
  reopen(kind, obj);
}

// Checked on every delta poll (applyDelta, below) while a watch is pending.
// selectAddedPlace (web/datasource.js, pure and tested) is the whole
// decision — which candidate, if any, is what this reader added, and
// whether it's a table, a play place or a toilet with no table yet; this
// is only the side effects (toast, fly-to, clearing the watch). Falls back
// to the existing "nothing new yet" nudge after ten minutes with nothing.
function maybeNotifyAddedPlace(deltaJson) {
  const watch = readAddWatch();
  const result = selectAddedPlace(deltaJson, watch);
  if (!result) {
    if (watch && Date.now() - Date.parse(watch.t) > ADD_WATCH_TIMEOUT_MS) {
      clearAddWatch();
      toast(t("editNone"));   // "nothing new on OSM yet / log in to MapComplete and upload"
    }
    return;
  }
  clearAddWatch();
  if (result.type === "toilet_no_table") { toast(t("toastToiletNoTable")); return; }
  toast(t(result.type === "place" ? "toastNewPlace" : "toastNewTable"));
  const obj = (result.type === "place" ? placesByOsmUrl : featuresByOsmUrl)
    .get(result.feature.properties.osm_url);
  if (obj) pulseNewPin(result.type, obj, watch);
}

// ---- Language picker: re-render everything that carries text ----
// A <select> rather than the old DE → EN → DA cycle button. Nine languages
// cannot be reached by cycling — a Swede would tap seven times — and the
// native control is keyboard- and screen-reader-accessible for free and gets
// the platform's own wheel on a phone.
//
// Options are built from LANGS rather than written into index.html, so the
// list and the language set cannot drift apart, and each is labelled with that
// language's own name: a reader who cannot read the current UI can still find
// their own row.
const langSelect = document.getElementById("lang-select");
langSelect.replaceChildren(...LANGS.map((code) => {
  const opt = document.createElement("option");
  opt.value = code;
  opt.textContent = STRINGS[code]?.langName ?? code;
  return opt;
}));
langSelect.value = lang;
// A select is as wide as its longest option — 103px for the 32 names here —
// and on a 375px phone that one width wrapped the German and English nav to
// a second row while the Czech one fit. style.css sizes it to the shown name
// with field-sizing; browsers without it get the same by measurement.
function fitLangSelect() {
  if (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content")) return;
  const cs = getComputedStyle(langSelect);
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return;
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const text = langSelect.selectedOptions[0]?.textContent ?? "";
  const px = (v) => parseFloat(v) || 0;
  const w = ctx.measureText(text).width + text.length * px(cs.letterSpacing) +
    px(cs.paddingLeft) + px(cs.paddingRight) +
    px(cs.borderLeftWidth) + px(cs.borderRightWidth) + 2;
  langSelect.style.width = `${Math.ceil(w)}px`;
}
fitLangSelect();

// ---- Papa/Mama toggle: repaint, never re-fetch ----
// Two buttons rather than a select: there are exactly two states and there
// always will be, which is the case a segmented control is for. The pins are
// recoloured with one setPaintProperty on a source whose data never moves —
// 26k features change meaning without a byte being re-read.
const modeButtons = { papa: document.getElementById("mode-papa"),
                      mama: document.getElementById("mode-mama") };

function syncModeButtons() {
  for (const m of MODES) {
    const on = m === mode;
    modeButtons[m].classList.toggle("on", on);
    modeButtons[m].setAttribute("aria-pressed", String(on));
  }
  // The <h1> is the map's promise, and in the mother's reading the father's
  // version contradicts the pins under it. Swap the key rather than the text —
  // the same trick the stats toggle uses for its aria-label — so applyI18n()
  // re-reads it on a language change instead of resetting it to the father's.
  // Crawlers only ever see the markup default, which is the papa line.
  const tagline = document.querySelector(".tagline");
  tagline.dataset.i18n = mode === "mama" ? "taglineMama" : "tagline";
  tagline.textContent = t(tagline.dataset.i18n);
}

function applyMode() {
  syncModeButtons();
  // Guarded: a click before the WebGL style is ready would throw, and the
  // layer is created with pinColorExpression(mode) anyway, so a mode chosen
  // that early is already painted correctly when the style arrives.
  if (styleReady) map.setPaintProperty(SRC, "circle-color", pinColorExpression(mode));
  // A table popup's status line, its room pills and its sign-pin marker are
  // all read out of `mode` (viewFor, roomChoices, paintSignMarker) — repainted
  // in place rather than closed, the same "still here, redrawn" rule
  // applyDataset already gives a popup that survives a background refresh
  // (CONTRACT.md v44). A prospect's headline never reads `mode` and carries
  // no marker, so there is nothing here worth keeping open over — it still
  // just closes.
  if (popupObj?.kind === "table") {
    popup.setHTML(popupHTML(popupObj.obj));
    attachEditNote();
    updateSignMarker();
  } else {
    closePopupSilently();   // its text belonged to the old reading; not the reader's own close
  }
  renderStats(lastStats);
  renderChips();
  positionZoomCtrl();   // the sentence can wrap to a different height
  // After, not before: positionZoomCtrl can move the column popupPan avoids,
  // and renderStats can change the topbar height panPopupIntoView reads.
  if (popupObj?.kind === "table") panPopupIntoView();
}

for (const m of MODES) {
  modeButtons[m].addEventListener("click", () => {
    if (mode === m) return;
    mode = m;
    try { localStorage.setItem("papamap-mode", mode); } catch { /* blocked storage: this page only */ }
    shareSettings({ mode, lang });
    // A ?mode= param would override the stored choice on the next reload —
    // drop it once the reader has chosen in-page, exactly as ?lang= does.
    if (new URLSearchParams(location.search).has("mode")) {
      const url = new URL(location.href);
      url.searchParams.delete("mode");
      history.replaceState(null, "", url);
    }
    applyMode();
  });
}

langSelect.addEventListener("change", () => {
  lang = LANGS.includes(langSelect.value) ? langSelect.value : DEFAULT_LANG;
  localStorage.setItem("papamap-lang", lang);
  fitLangSelect();
  shareSettings({ mode, lang });
  // A ?lang= param would override the stored choice on reload — drop it.
  if (new URLSearchParams(location.search).has("lang")) {
    const url = new URL(location.href);
    url.searchParams.delete("lang");
    history.replaceState(null, "", url);
  }
  closePopupSilently();   // same reason as applyMode: not the reader's own close
  applyI18n();
  renderStats(lastStats);
  renderChips();
  refreshPins();
  syncModeButtons();   // applyI18n() relabels them; the pressed state is ours
  positionZoomCtrl();  // strip height can change with string lengths
  if (meDialog.open) renderMeDialog();   // the app's picker lives in that dialog
});
// Click on the backdrop (the dialog element itself, not its children) closes.
addDialog.addEventListener("click", (e) => { if (e.target === addDialog) addDialog.close(); });

// ---- Boot ----
// The chrome (stats strip, chips, count) is decoupled from the map's WebGL
// "load" event: the UI stays usable even while the map is still warming up.
// Pins are plotted once BOTH the data and the map style are ready. Either data
// file may be missing (pipeline not run yet) — the page degrades to a message.
let dataReady = false, styleReady = false;

// NOT map.on("load"): MapLibre fires that only after "all necessary resources
// have been downloaded and the first visually complete rendering has occurred",
// and the raster basemap is one of those resources. With no signal its tiles
// can never arrive, so "load" never fires, the pin layer is never added, and
// the map sits empty — offline failing in precisely the case offline exists
// for. "styledata" plus an isStyleLoaded() guard is the documented way to wait
// for the style alone, which is all adding a layer actually needs.
// isStyleLoaded() is no good as a guard here either: it reports false until
// every source cache has loaded, the raster basemap included, so offline it
// stays false through all the styledata events and then never fires another.
// "style.load" is the event that means the style JSON itself is parsed, which
// is all adding a layer needs. "load" stays attached behind a run-once latch
// as a belt-and-braces fallback: it is the event that definitely exists, it
// just cannot be relied on without a network.
function whenStyleReady(fn) {
  let done = false;
  const go = () => { if (done) return; done = true; fn(); };
  map.on("style.load", go);
  map.on("load", go);
}

whenStyleReady(() => {
  styleReady = true; addTableLayer(); refreshPins();
  if (isNative()) mountSavedCities();
});

// Set when any dataset file was answered by the service worker's stored copy
// (the website) or the app's own stored copy (the app, always — copy-first
// draws from it on every launch). On the website that header is the only
// honest "you are looking at old data" signal there is: navigator.onLine
// reports the machine's interface, and a Wi-Fi with no internet — or a
// basement with one bar — says "online" all the same. In the app it no
// longer decides the offline toast by itself; see watchRefresh below.
let fromStore = false;

// On the website: papamap.de, the service worker's stored copy on a failure
// (X-PapaMap-Source: cache). `refreshed` is always null here — there is
// nothing more to ask once fetch has answered; the app's own loader
// (loadDataset, below) is the one that hands back a real promise for it.
async function loadJSON(url) {
  try {
    const r = await fetch(url);
    if (r.headers.get("X-PapaMap-Source") === "cache") fromStore = true;
    return { json: r.ok ? await r.json() : null, refreshed: null };
  } catch {
    return { json: null, refreshed: null };
  }
}

// boot()'s four files, in the order it always asked for them. On the website
// each is its own request, as always (loadJSON). In the app, `urls` goes
// straight to native.js's loadDatasetNative, which does the app's own thing
// with them: data/stats.json (about 1 KB, rewritten by the same nightly
// build in the same second as the other three) refreshes first, and the
// three big files are downloaded only when its raw text turns out to
// differ — see loadDatasetNative's own comment for the gate and the
// invariant it keeps. The shape handed back — `{ json, refreshed }` per
// url, in the same order — is exactly loadJSON's, so watchRefresh and
// applyDataset below never have to ask which loader answered.
async function loadDataset(urls) {
  if (isNative()) {
    const results = await loadDatasetNative(urls);
    if (results.some((r) => r?.fromStore)) fromStore = true;
    return results.map((r) => ({ json: r?.json ?? null, refreshed: r?.refreshed ?? null }));
  }
  return Promise.all(urls.map(loadJSON));
}

// What the widget and the Siri shortcut search (native.js, shareDataset): the
// tables under the wheelchair chip's reading, through the same pinFeatures the
// app's own nearest button uses — so all three name the same table. The Swift
// side never learns the chip exists; it is handed the narrowed rows.
function shareTables() {
  if (isNative()) shareDataset(pinFeatures(allFeatures, wheelchairOnly));
}

// The return from OSM's consent screen: ?code= and ?state= on the page's own
// URL, or the papamap://auth URL the OS hands the app (native.js). Exchanges
// the code, stores the login, and files the answer that was waiting.
async function completeLogin(href) {
  const login = await finishLogin(osm, href).catch(() => ({ failed: true }));
  if (login && href === location.href) {
    const url = new URL(location.href);
    for (const k of ["code", "state", "error", "error_description"]) url.searchParams.delete(k);
    history.replaceState(null, "", url);
  }
  if (login?.token) {
    setLogin(login.token, await userName(osm, login.token).catch(() => null));
    // A refresh started under a previous login (or no login at all, on a
    // shared device) must not write its result under this one's name.
    myAnswersGeneration++;
  }
  else if (login?.failed) toast(t("loginFailed"));
  // Taken whether or not the login went through: a refused consent must not
  // leave an answer waiting to be filed under the next login.
  const intent = takeIntent();
  // The answer given before the login round trip: land on its pin and file it.
  if (intent && login?.token) {
    const kind = intent.kind === "place" ? "place" : "table";
    const obj = (kind === "place" ? placesByOsmUrl : featuresByOsmUrl).get(intent.osm_url);
    if (obj) {
      map.jumpTo({ center: [obj.lon, obj.lat], zoom: Math.max(map.getZoom(), 16) });
      reopen(kind, obj);
      // Checked again against the dataset just loaded, not the one the tap
      // was made on: had the nightly build landed during the consent round
      // trip with somebody else's room on this object, the popup now shows
      // that room and the stored answer stays unfiled rather than writing
      // over it.
      const open = isPlayChoice(intent.choice)
        ? !obj.play_recorded
        : kind === "place" ? !obj.changing_table
                           : obj.status === "unknown" && !obj.location_raw;
      if (open) answer(kind, obj, intent.choice, login.token);
    }
  }
  // The login the "Mein PapaMap" dialog itself started: land back on it
  // rather than on a bare map (renderMeStats, above).
  if (intent?.kind === "me" && login?.token) { meDialog.showModal(); renderMeDialog(); refreshMyAnswers(); }
  if (popupObj) reopen(popupObj.kind, popupObj.obj);   // the footer line names the login
}

// A pin (or a play place) by its OSM URL — the widget's and the shortcut's
// deep link (papamap://table?osm=…), and now also this page's own ?osm=
// share link (CONTRACT.md v38): shareUrl builds one from the same identifier,
// so this is the one parser both read. Before the data is here the request
// waits. A URL neither array has any more (deleted, or from a stranger's
// bookmark) flies nowhere and says so once, rather than doing nothing —
// which the widget and the shortcut inherit for free, not only the share link.
let pendingPin = null;
function openPin(osmUrl) {
  if (!osmUrl) return;
  if (!dataReady) { pendingPin = osmUrl; return; }
  const f = featuresByOsmUrl.get(osmUrl);
  if (f) {
    map.jumpTo({ center: [f.lon, f.lat], zoom: Math.max(map.getZoom(), 16) });
    openPopup(f);
    stripOsmParam();
    pinOpenedBeforeFix = true;   // the boot fix's own turn to stand aside, if it hasn't yet
    return;
  }
  const p = placesByOsmUrl.get(osmUrl);
  if (p) {
    map.jumpTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 16) });
    openPlacePopup(p);
    stripOsmParam();
    pinOpenedBeforeFix = true;
    return;
  }
  toast(t("sharePinGone"));
  stripOsmParam();
}

// A page installed to the home screen from a shared link, or simply left
// open in a tab, must not reopen the same pin on every future launch —
// ?lang= and ?mode= already strip themselves once honoured, and ?osm= now
// does the same, once openPin above has actually resolved it.
function stripOsmParam() {
  const stripped = withoutOsmParam(location.href);
  if (stripped) history.replaceState(null, "", stripped);
}

// The five assignments a set of four files turns into on screen — boot()'s
// own first draw and a later background refresh (watchRefresh, below) both
// call this rather than each keeping its own copy, so the two can never
// drift apart. Never moves the map — no fitHome, no flyTo/jumpTo — because a
// reader who is not looking at boot's first paint any more should not have
// their view pulled out from under them for a dataset that is rebuilt once a
// night; boot() calls fitHome() itself, once, after this returns. If a popup
// is open, its object is looked up again by osm_url and, when it still
// exists, redrawn in place (setHTML, not a fresh openPopup — that would
// panPopupIntoView and could pan); gone from the new data entirely, the
// popup is simply closed rather than left showing a table that is no longer
// there. Before boot's own first call, `popupObj` is always null — nothing
// is open yet — so this branch is a no-op the first time through.
// The repaint half of applyDataset, factored out (live-updates amendment) so
// applyDelta below can redraw the merged view on top of a delta or a fresh
// answer override without re-running renderStats/areaIndex, which only the
// base dataset itself (a nightly build, or the app's background refresh)
// ever changes.
function applyFeatureSets(fc, places) {
  allFeatures = loadFeatures(fc);
  allPlaces = loadPlaces(places);
  // "Mein PapaMap"'s own nearest-feature lookup (answerArea, web/me.js) —
  // rebuilt here with everything else that depends on allFeatures, not
  // lazily on first use, so a background refresh's new dataset is what the
  // next answer gets attributed against too.
  myFeatureGrid = buildFeatureGrid(allFeatures);
  featuresByOsmUrl = new Map();
  for (const f of allFeatures) if (f.osm_url) featuresByOsmUrl.set(f.osm_url, f);
  placesByOsmUrl = new Map();
  for (const p of allPlaces) if (p.osm_url) placesByOsmUrl.set(p.osm_url, p);
  renderChips();
  positionZoomCtrl();   // topbar height depends on the rendered strip
  refreshPins();
  if (isNative()) shareTables();   // the widget and the shortcut search this same data
  if (popupObj) {
    const byUrl = popupObj.kind === "place" ? placesByOsmUrl : featuresByOsmUrl;
    const obj = byUrl.get(popupObj.obj.osm_url);
    if (obj) {
      popupObj = { kind: popupObj.kind, obj };
      if (popup) {
        popup.setHTML(popupObj.kind === "place" ? placeHTML(obj) : popupHTML(obj));
        attachEditNote();
        updateSignMarker();   // tonight's build (or a delta, or this reader's own answer) may carry a new status for it
      }
    } else if (popup) {
      popup.remove();
      popup = null;
      popupObj = null;
    }
  }
  // A background refresh can drop the very object a STANDING room card is
  // named after — only re-evaluate when one is actually up, to retarget or
  // drop it, never to raise one that is not showing: evaluateRoomCard reads
  // only lastFix, with no memory of whether the reader panned away from the
  // fix's own spot in the meantime (hideRoomCard, the moveend handler below,
  // clears roomCardFeature but not lastFix itself) or closed the card
  // outright, and calling it unconditionally here would resurrect either.
  if (roomCardFeature) evaluateRoomCard();
}

// Base + delta + this reader's own pending answers, merged and drawn — the
// one function that has to run after any of the three changes. Never called
// with a null baseFC (before the first applyDataset).
function renderMergedDataset() {
  let fc = baseFC, places = basePlacesFC;
  if (currentDelta) {
    fc = mergeFeatureCollection(fc, currentDelta.tables?.upsert, currentDelta.tables?.remove);
    places = mergeFeatureCollection(places, currentDelta.places?.upsert, currentDelta.places?.remove);
  }
  if (Object.keys(answerOverrides).length) {
    ({ fc, places } = applyAnswerOverrides(fc, places, answerOverrides));
  }
  applyFeatureSets(fc, places);
}

function applyDataset(fc, places, stats, areas) {
  baseFC = fc;
  basePlacesFC = places;
  // A fresh base dataset (a new nightly build, or the app's background
  // refresh) already contains whatever the delta and this reader's own
  // answers described — pruneAnswerOverrides below drops the ones it truly
  // covers, keeping the very few made after this dataset's own data_base;
  // the delta itself is kept only while it is still at least as new as this
  // dataset (isDeltaFresh) — the app's background refresh usually lands
  // after boot's first poll, and dropping a still-valid delta there hid a
  // fresh edit until the next 3-minute poll. An older one is dropped and
  // re-fetched (watchRefresh polls right after this).
  if (currentDelta && !isDeltaFresh(currentDelta.base, stats?.data_base)) currentDelta = null;
  const versionByUrl = new Map();   // nothing to compare a fresh delta against yet — data_base alone decides here
  answerOverrides = pruneAnswerOverrides(answerOverrides, stats?.data_base, versionByUrl);
  saveAnswerOverrides(answerOverrides);
  renderStats(stats);
  areaIndex = Array.isArray(areas) ? areas : null;
  updateRegionsLink();
  renderMergedDataset();
}

// The app's background refresh, watched once boot has already drawn: waits
// for all four of loadJSON's `refreshed` promises together, not as each lands
// — a redraw on the first of four and another on the second would flicker,
// and the toast below has to see all four before it can say anything. Applies
// whatever changed exactly once (applyDataset, above), keeping whichever
// files did not change or did not answer as they were drawn. The reassurance
// toast a stale copy used to get from `fromStore` alone — true on every
// single app launch under copy-first, so it stopped meaning anything — is
// replaced by this: it fires only once every one of the four refreshes has
// settled and NOT ONE of them found anything fresh at all, which is the one
// condition that actually says "this is old data and nothing newer could be
// had". A background refresh that is still running, or that succeeded even
// with nothing changed, says nothing.
// ---- The delta follower's own file: web/data/delta.json ----
// Never shell-precached (SHELL in sw.js is the app's own code, not data) and
// fetched with cache: "no-store" for the same reason the dataset files
// aren't: it changes minute to minute, and the service worker's runtime
// cache is for the offline case, not for staying current online.
// Relative on purpose, like the other dataset files' own path strings
// (boot()'s loadDataset call below) — but unlike those, this one is fetched
// directly rather than through loadDataset/loadDatasetNative, so it has to
// resolve the app's own origin itself. In the store app the page runs from
// papamap://localhost (iOS) or https://localhost (Android), where data/
// is not bundled — loadDatasetNative's own dataset fetches already prefix
// SITE for exactly this reason (native.js); fetchDelta does the same by hand.
const DELTA_URL = "data/delta.json";
const DELTA_POLL_MS = 3 * 60 * 1000;          // "re-poll every 3 min while visible"
const DELTA_POLL_PENDING_MS = 30 * 1000;      // "...every 30s with a pending own edit"
let deltaPollTimer = null;

async function fetchDelta() {
  try {
    const r = await fetch(resolveDataUrl(DELTA_URL, isNative(), SITE), { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// A delta merged on top of the base dataset — never on top of a previous
// delta, so a dropped object (tables.remove) can never come back to life
// through an older upsert still sitting in currentDelta. Ignored outright
// when it is older than the loaded dataset's own base (isDeltaFresh):
// CONTRACT.md's live-updates amendment.
function applyDelta(deltaJson) {
  if (!baseFC || !deltaJson || !isDeltaFresh(deltaJson.base, lastStats?.data_base)) return;
  currentDelta = deltaJson;
  const versionByUrl = new Map();
  for (const f of (deltaJson.tables?.upsert || []).concat(deltaJson.places?.upsert || [])) {
    const url = f?.properties?.osm_url;
    const version = f?.properties?.osm_version;
    if (url && version != null) versionByUrl.set(url, version);
  }
  const pruned = pruneAnswerOverrides(answerOverrides, lastStats?.data_base, versionByUrl);
  if (Object.keys(pruned).length !== Object.keys(answerOverrides).length) {
    answerOverrides = pruned;
    saveAnswerOverrides(answerOverrides);
  }
  renderMergedDataset();
  maybeNotifyAddedPlace(deltaJson);
}

async function pollDelta() {
  if (!dataReady || document.hidden) return;
  const json = await fetchDelta();
  if (json) applyDelta(json);
}

// A schedule already running keeps its own pace; the next tick reschedules
// itself, so a poll that races a slow network never queues a second one on
// top. Faster (30s) for as long as this reader has an answer of their own
// still waiting to reach the delta — the same readEdit() record
// startEditCheck/armEditCheck already keep in sessionStorage.
function scheduleDeltaPoll() {
  clearTimeout(deltaPollTimer);
  const ms = readEdit() ? DELTA_POLL_PENDING_MS : DELTA_POLL_MS;
  deltaPollTimer = setTimeout(async () => { await pollDelta(); scheduleDeltaPoll(); }, ms);
}

// Waits for the delta to carry a specific object at or past a specific OSM
// version — the edit check's "found" case (pollEdit, above), where the OSM
// API has already confirmed the edit exists and only the delta follower's
// own catch-up (up to ~2-4 min, per the design) stands between it and a
// repaint. 15s cadence, ~5 min ceiling; gives up quietly — the object still
// arrives with the next scheduled poll or tonight's build either way.
function watchDeltaForVersion(osmUrl, minVersion, attemptsLeft = 20) {
  const check = async () => {
    const json = await fetchDelta();
    if (json && isDeltaFresh(json.base, lastStats?.data_base)) {
      const hit = (json.tables?.upsert || []).concat(json.places?.upsert || [])
        .find((f) => f.properties.osm_url === osmUrl
          && Number.isFinite(f.properties.osm_version) && f.properties.osm_version >= minVersion);
      if (hit) { applyDelta(json); return; }
    }
    if (attemptsLeft > 1) setTimeout(() => watchDeltaForVersion(osmUrl, minVersion, attemptsLeft - 1), 15000);
  };
  check();
}

async function watchRefresh(loaded) {
  const results = await Promise.all(loaded.map((l) => l.refreshed));
  if (results.some((r) => r?.json != null)) {
    const [fc, places, stats, areas] = results.map((r, i) => r?.json ?? loaded[i].json);
    applyDataset(fc, places, stats, areas);
    pollDelta();
  }
  if (allFeatures.length && results.every((r) => !r || r.ok === false)) toast(t("toastOffline"));
}

async function boot() {
  applyI18n();  // markup default is German — swap before first paint if not
  syncModeButtons();  // ...and the markup default is papa
  if (isNative()) bootNative();
  // iOS draws "my location" as an arrow, everyone else as a crosshair
  // (index.html, #locate): the app on an iPhone, and Safari on one.
  if (platform() === "ios" || (!isNative() && isAppleTouch(navigator.userAgent, navigator.maxTouchPoints)))
    document.documentElement.classList.add("ios");
  // A shared https://papamap.de/?osm=… link (CONTRACT.md v38): the data is
  // not here yet, so this only sets pendingPin, resolved below once it is —
  // the same queue the app's own deep link uses, so the two never race each
  // other for the one popup that can be open.
  openPin(parseShareOsm(location.search));
  // Kicked off now rather than after the dataset, so its own "second or
  // three" (openAtLocationFix, near locate() above) overlaps the load
  // instead of adding to it. Applied below, after fitHome() — never before,
  // or a fast fix would open on the reader only for fitHome to undo it a
  // moment later.
  const locationFix = openAtLocationFix();
  const loaded = await loadDataset([
    "data/changing_tables.geojson",
    "data/play_places.geojson",
    "data/stats.json",
    "data/areas.json",
  ]);
  // dataReady before applyDataset, not after: its own refreshPins() call
  // reads the flag, and finding it still false here would skip the very
  // first paint — the count text included, not only the pins.
  dataReady = true;
  map.on("moveend", updateRegionsLink);   // registered once, here — applyDataset never does
  applyDataset(...loaded.map((l) => l.json));
  // Only the topbar's rendered height, which applyDataset's own
  // renderChips()/positionZoomCtrl() have already settled by the time it
  // returns — applyDataset itself never calls this, so a later background
  // refresh (watchRefresh, below) never pulls the view out from under a
  // reader who has since panned somewhere else.
  fitHome();
  const fitHomeAt = Date.now();   // LATE_FIX_MS is measured from here, not from boot's own start
  // On the website `fromStore` is still the service worker's honest "you are
  // looking at old data" signal (X-PapaMap-Source: cache) and the toast fires
  // on it exactly as it always has. In the app the copy draws on every
  // launch, so this would fire every time; watchRefresh below carries the
  // app's own version of this toast instead, once the background refresh has
  // had its say.
  if (!isNative() && fromStore && allFeatures.length) toast(t("toastOffline"));
  // Applied whenever it lands — never awaited. A fix can take the whole of
  // its own timeout (indoors, no cached fix), and boot() must not make the
  // pendingPin open below, completeLogin's OAuth return, shareSettings,
  // watchRefresh or armEditCheck wait for it. Three reasons the camera stands
  // still even once a fix does arrive: touchedBeforeFix (the reader did
  // anything at all), popup?.isOpen() and pinOpenedBeforeFix (boot itself
  // opened a pin in the meantime — the pendingPin open just below, or a
  // papamap://table deep link that arrived late; openAtLocationFix itself
  // does not re-check this, on purpose — see its own comment). The dot is
  // drawn regardless of all three: showYou is never wrong, only the camera
  // move can be. No noteFix() either way: this fix must never feed
  // evaluateRoomCard, not even indirectly through some later, unrelated
  // popup close (the first testers' "too much happens when the app opens",
  // CONTRACT.md v43/v44). And a throw from a bad fix — malformed coordinates
  // reaching MapLibre — must not surface as an unhandled rejection for a
  // nicety nobody asked for; the outer .catch is that backstop.
  locationFix.then((coords) => {
    if (!coords) return;
    const at = [coords.longitude, coords.latitude];
    showYou(at);
    if (touchedBeforeFix || pinOpenedBeforeFix || popup?.isOpen()) return;
    const zoom = Math.max(map.getZoom(), 14);
    // Early: the map simply opens there, no motion to notice. Late: the
    // reader has had time to actually look at the home view first, so the
    // camera travels to them on purpose instead of snapping.
    if (Date.now() - fitHomeAt > LATE_FIX_MS) map.flyTo({ center: at, zoom, duration: LATE_FIX_FLY_MS });
    else map.jumpTo({ center: at, zoom });
  }).catch(() => {});
  // Whatever queued a pin above the data — the app's own deep link (bootNative,
  // an appUrlOpen already fired) or this load's own ?osm= — opens it now that
  // there is a dataset to look it up in. jumpTo overrides fitHome's view.
  if (pendingPin) { const u = pendingPin; pendingPin = null; openPin(u); }
  // A return from OSM's consent screen lands here with ?code= and ?state=.
  await completeLogin(location.href);
  if (isNative()) {
    // applyDataset above already shared the tables with the widget and the
    // shortcut; the settings are boot's own to hand over.
    shareSettings({ mode, lang });
    watchRefresh(loaded);   // runs on; boot does not wait for it
  }
  // A phone that dropped the tab while the reader was in MapComplete comes
  // back to a reloaded page: pick the check up where it was. (Only with its
  // baseline — a record whose first read never landed stays quiet.) The
  // visibilitychange that would have booked the time away never fires on a
  // fresh load, so a record still marked hidden is credited here.
  const pending = readEdit();
  if (pending) {
    if (pending.hiddenAt) {
      pending.away = (pending.away ?? 0) + (Date.now() - pending.hiddenAt);
      pending.hiddenAt = null;
      writeEdit(pending);
    }
    armEditCheck();
  }
  // The delta follower's own catch-up: the very first poll right away (an
  // edit made in the last few minutes, by anyone, should not need a boot's
  // worth of waiting to show up), the schedule from then on.
  pollDelta();
  scheduleDeltaPoll();
}

// ---- The store app (app/): what the shell adds around this same page ----
// Everything here runs only under Capacitor. The website never reaches it.
const offlineBtn = document.getElementById("offline");
const offlineDialog = document.getElementById("offline-dialog");
const offlineList = document.getElementById("offline-list");

let nativeScripts = Promise.resolve();   // declared before the call site below
function bootNative() {
  interceptLinks();                  // site pages and OSM open in the in-app browser
  document.getElementById("app-link").hidden = true;   // this is the app
  // The app's first screen is the brand, the chips and the map. The website's
  // header is a website's: four links, a language picker, a tagline for search
  // engines and a stats strip, 218 of a 667px phone before the notch — "too
  // much on the screen" was the first thing the first testers said
  // (2026-09-21). The links, the picker and the strip move into Mein PapaMap,
  // the same nodes with the same listeners, so nothing about them changes but
  // where they stand; the tagline is hidden by .native in style.css.
  document.documentElement.classList.add("native");
  const about = document.getElementById("me-about");
  about.append(document.querySelector(".stats-wrap"), document.querySelector(".header-actions"));
  about.hidden = false;
  positionZoomCtrl();   // applyI18n placed the column under the taller header a moment ago
  offlineBtn.hidden = false;
  onAppUrl({ auth: (url) => completeLogin(url), table: openPin });
  // The in-app Browser sheet (every OSM/MapComplete link, and MapComplete's
  // own OAuth screen) never hides this page, so visibilitychange alone would
  // never tell the app a reader came back from it (native.js's own comment).
  onBrowserFinished(onReturnToFront);
  nativeScripts = Promise.all([loadScript("vendor/pmtiles.js"), loadScript("vendor/protomaps/basemaps.js")]);
}

// The two vendored libraries the offline cities need, loaded only here so
// the website's shell stays what it was.
function loadScript(src) {
  return new Promise((ok, fail) => {
    const el = document.createElement("script");
    el.src = src; el.onload = ok; el.onerror = fail;
    document.head.append(el);
  });
}

// ---- Offline cities: a PMTiles extract per city, rendered under the pins ----
// The Protomaps layers sit between the raster basemap and the pins. Outside
// the extract they draw nothing, so the online map shows through; inside,
// the city is vector, sharp at any zoom, and there with no signal. Once a
// city is saved it is used whether or not there is a network: the reader
// sees one map for their city, not one look online and another offline.
const mounted = new Set();
let pmProtocol = null;

function ensureProtocol() {
  if (pmProtocol || !globalThis.pmtiles) return;
  pmProtocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", pmProtocol.tile);
  // The tokens stay literal: new URL() would percent-encode the braces.
  map.setGlyphs(new URL("vendor/protomaps/fonts/", location.href).href + "{fontstack}/{range}.pbf");
  map.setSprite(new URL("vendor/protomaps/sprites/light", location.href).href);
}

const pinLayerBelow = () =>
  map.getStyle().layers.find((l) => l.source === SRC || l.source === PLACES)?.id;

// A mounted city is its whole archive in memory (native.js, citySource), so
// not every saved city is mounted: only the ones the view is on, two at most
// (citiesToMount). Six saved cities at launch were several hundred MB in the
// WebView — iOS kills the app for that, and deleting a city needs the app.
const mounting = new Set();
// The slugs the latest view asked for, and the ones whose file would not
// read this session (lost, corrupt): those are not tried again on every map
// move — a fresh download clears the mark.
let wanted = new Set();
const unreadable = new Set();
// A read failure is retried a few times before a city is written off —
// syncCities calls mountCity again on every moveend, and one transient read
// (issue #124) used to mark a saved city unreadable on the very first of
// those and hide its vector map for the rest of the session. A slug's count
// resets to zero the moment it mounts.
const MAX_CITY_FAILURES = 3;
const failures = new Map();
async function mountCity(city) {
  if (mounted.has(city.slug) || mounting.has(city.slug) || unreadable.has(city.slug) || !styleReady) return;
  ensureProtocol();
  if (!pmProtocol) return;
  mounting.add(city.slug);
  try {
    const src = await citySource(city.slug);
    // The read takes a while for 80 MB and the view may have moved on: a city
    // nobody is looking at any more is dropped here, before it is held.
    if (!wanted.has(city.slug)) return;
    pmProtocol.add(new pmtiles.PMTiles(src));
    map.addSource(`city-${city.slug}`, { type: "vector", url: `pmtiles://${city.slug}` });
    const before = pinLayerBelow();
    for (const l of cityLayers(city.slug, lang)) map.addLayer(l, before);
    mounted.add(city.slug);
    failures.delete(city.slug);
  } catch (e) {
    const n = (failures.get(city.slug) ?? 0) + 1;
    if (n >= MAX_CITY_FAILURES) {
      failures.delete(city.slug);
      unreadable.add(city.slug);
      toast(t("offlineFailed"));
    } else {
      failures.set(city.slug, n);
    }
    throw e;
  } finally {
    mounting.delete(city.slug);
  }
}

function unmountCity(slug) {
  for (const l of map.getStyle().layers)
    if (l.id.startsWith(`city-${slug}-`)) map.removeLayer(l.id);
  if (map.getSource(`city-${slug}`)) map.removeSource(`city-${slug}`);
  pmProtocol?.tiles.delete(slug);   // the archive is in memory; let it go
  mounted.delete(slug);
}

let savedList = [];
function syncCities() {
  if (!styleReady) return;
  const b = map.getBounds(), c = map.getCenter();
  const want = citiesToMount(savedList, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
                             { lat: c.lat, lon: c.lng }, map.getZoom());
  if (!want) return;   // zoomed out: leave what is mounted alone
  wanted = new Set(want.map((x) => x.slug));
  for (const slug of [...mounted]) if (!want.some((x) => x.slug === slug)) unmountCity(slug);
  for (const city of want) mountCity(city).catch(() => {});
}

async function mountSavedCities() {
  await nativeScripts.catch(() => {});   // the map's load event can beat the two scripts
  savedList = await savedCities();
  map.on("moveend", syncCities);
  syncCities();
}

// The dialog: every city in the catalogue, nearest to the map's centre
// first, with its size; saved ones can be deleted. Progress is written
// into the button while a download runs.
async function renderOfflineList() {
  offlineList.replaceChildren();
  const [cat, saved] = await Promise.all([cityCatalogue(), savedCities()]);
  if (!cat?.cities?.length) {
    const li = document.createElement("li");
    li.textContent = t("offlineNoList");
    offlineList.append(li);
    return;
  }
  const c = map.getCenter();
  const savedBy = new Map(saved.map((x) => [x.slug, x]));
  const cities = [...cat.cities].sort((a, b) => {
    const ca = bboxCentre(a.bbox), cb = bboxCentre(b.bbox);
    return kmBetween(c.lat, c.lng, ca.lat, ca.lon) - kmBetween(c.lat, c.lng, cb.lat, cb.lon);
  });
  for (const city of cities) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = city.name;
    const small = document.createElement("small");
    small.textContent = savedBy.has(city.slug) ? t("offlineSaved") : `${formatMB(city.bytes, NUMBER_LOCALE[lang])} MB`;
    name.append(small);
    const btn = document.createElement("button");
    btn.type = "button";
    if (savedBy.has(city.slug)) {
      btn.className = "saved";
      btn.textContent = t("offlineDelete");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        unmountCity(city.slug);
        // A mountCity(city) already in flight (its own await past, deleting
        // this very city) reads `wanted` again before it adds anything back —
        // without this, it could re-add a city just deleted out from under it.
        wanted.delete(city.slug);
        // A deleted city starts fresh if it is ever saved again — its old
        // failure count belongs to a file that no longer exists.
        failures.delete(city.slug);
        savedList = await deleteCity(city.slug);
        renderOfflineList();
      });
    } else {
      btn.textContent = t("offlineLoad", { mb: formatMB(city.bytes, NUMBER_LOCALE[lang]) });
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          savedList = await downloadCity(city, (p) => { btn.textContent = t("offlineLoading", { pct: Math.round(p * 100) }); });
          unreadable.delete(city.slug);
          failures.delete(city.slug);
          syncCities();
          toast(t("offlineDone", { city: city.name }));
        } catch {
          toast(t("offlineFailed"));
        }
        renderOfflineList();
      });
    }
    li.append(name, btn);
    offlineList.append(li);
  }
}

offlineBtn.addEventListener("click", () => {
  offlineDialog.showModal();
  renderOfflineList();
});
document.getElementById("offline-close").addEventListener("click", () => offlineDialog.close());
// As on the add dialog: a tap on the backdrop (the dialog element itself) closes.
offlineDialog.addEventListener("click", (e) => { if (e.target === offlineDialog) offlineDialog.close(); });

// ---- The Route button in the iOS app ----
// Everywhere else the anchor is an anchor and the OS does the choosing. Here
// the tap is caught and native.js's cascade answers instead: the reader's own
// default navigation app first, then Apple Maps, then whichever navigation app
// is installed, and the web as the last resort. Nothing is stored — the next
// tap asks the phone again, so installing a maps app tomorrow is enough.
const routeDialog = document.getElementById("route-dialog");
const routeList = document.getElementById("route-list");

// More than one and no default: one button per app, in the dialog style the
// offline list already uses. `web` is the same route on the open web, for the
// case where the OS declines the app's URL — doing nothing at all is the one
// bad answer.
function showRouteChoices(choices, web) {
  routeList.replaceChildren();
  for (const c of choices) {
    const li = document.createElement("li"), btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = c.name;
    btn.addEventListener("click", () => {
      routeDialog.close();
      followRoute(c.url, web).catch(() => {});
    });
    li.append(btn);
    routeList.append(li);
  }
  routeDialog.showModal();
}

// The same dialog on the website, for an iPhone's browser (webRouteChoices).
// Links here, not buttons: iOS hands a universal link to its app only when the
// reader themselves taps a real anchor, and a location.href set from a click
// handler is not reliably that.
function showWebRouteChoices(choices) {
  routeList.replaceChildren();
  for (const c of choices) {
    const li = document.createElement("li"), a = document.createElement("a");
    a.href = c.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = c.name;
    a.addEventListener("click", () => routeDialog.close());
    li.append(a);
    routeList.append(li);
  }
  routeDialog.showModal();
}

document.addEventListener("click", (e) => {
  const a = e.target.closest?.("a[data-route]");
  if (!a) return;
  if (!isNative()) {
    // The website: only an iPhone's Route button asks; every other is a link.
    if (!("routeChoose" in a.dataset)) return;
    e.preventDefault();
    const [lat, lon] = a.dataset.route.split(",").map(Number);
    showWebRouteChoices(webRouteChoices(lat, lon, a.dataset.routeLabel || ""));
    return;
  }
  if (platform() !== "ios") return;
  e.preventDefault();
  const href = a.getAttribute("href");
  const [lat, lon] = a.dataset.route.split(",").map(Number);
  planRoute(lat, lon, a.dataset.routeLabel || "").then(
    (plan) => {
      const web = routeWebUrl(lat, lon);
      return plan.open ? followRoute(plan.open, web) : showRouteChoices(plan.choose, web);
    },
    // No AppLauncher in this build, or the bridge failed: it is still a link.
    () => { location.href = href; },
  ).catch(() => {});
});
document.getElementById("route-close").addEventListener("click", () => routeDialog.close());
routeDialog.addEventListener("click", (e) => { if (e.target === routeDialog) routeDialog.close(); });

// ---- "Mein PapaMap": the reader's own numbers and saved places (CONTRACT.md v39) ----
// Same shape as the offline dialog just above: a zoom-ctrl button opens a
// <dialog>, closed by × or a tap on the backdrop. Nothing here is a second
// data source — the game sentence reads the same stats.json numbers the strip
// already rendered (renderStats/lastStats), "yours" reads the reader's own
// public OSM changesets, and saved places live only in this browser.
const meBtn = document.getElementById("me");
const meDialog = document.getElementById("me-dialog");
const meSentenceEl = document.getElementById("me-sentence");
const meStatsEl = document.getElementById("me-stats");
const meSavedListEl = document.getElementById("me-saved-list");

// ---- Saved places (device only, papamap-saved) ----
const SAVED_KEY = "papamap-saved";
function loadSavedRaw() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY)) ?? []; } catch { return []; }
}
function writeSavedRaw(list) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); return true; }
  catch { return false; }   // private mode, quota: the caller tells the reader once
}
let savedPlaces = loadSavedRaw();

// The star, in the title line of both popups (popupHTML, placeHTML) rather
// than the Route row a colleague's PR fills. No star at all on a pin with no
// OSM id — should not happen, but nothing here should assume it can't.
function starHTML(osmUrl, name) {
  if (!osmUrl) return "";
  const saved = isSaved(savedPlaces, osmUrl);
  const svg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}" ` +
    `fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  return `<button type="button" class="star-btn${saved ? " on" : ""}" data-osm="${esc(osmUrl)}"` +
    ` data-name="${esc(name)}" aria-label="${esc(t(saved ? "ariaUnsave" : "ariaSave"))}">${svg}</button>`;
}

// Failure (private mode, quota) leaves the star exactly as it was and says so
// once — never a star that claims to be on when nothing was written.
function toggleStar(btn) {
  const osm = btn.dataset.osm;
  const already = isSaved(savedPlaces, osm);
  let next;
  if (already) next = removeSaved(savedPlaces, osm);
  else {
    const obj = featuresByOsmUrl.get(osm) || placesByOsmUrl.get(osm);
    if (!obj) return;
    next = addSaved(savedPlaces, { osm, name: btn.dataset.name || "", lon: obj.lon, lat: obj.lat });
  }
  if (!writeSavedRaw(next)) { toast(t("meSaveFailed")); return; }
  savedPlaces = next;
  const nowSaved = !already;
  btn.classList.toggle("on", nowSaved);
  btn.querySelector("path")?.setAttribute("fill", nowSaved ? "currentColor" : "none");
  btn.setAttribute("aria-label", t(nowSaved ? "ariaUnsave" : "ariaSave"));
  if (meDialog.open) renderSavedList();
}

// Fly to a saved place and reopen it — via the same openPin the widget and
// the Siri shortcut use, when it is still a table pin tonight; a play place
// or a place that has since fallen out of the sweep still gets the fly, just
// not the popup (its own lon/lat came along in the saved record for exactly
// this case).
function openSavedPlace(row) {
  meDialog.close();
  const f = featuresByOsmUrl.get(row.osm);
  if (f) { map.flyTo({ center: [f.lon, f.lat], zoom: Math.max(map.getZoom(), 16) }); openPin(row.osm); return; }
  const p = placesByOsmUrl.get(row.osm);
  if (p) { map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 16) }); openPlacePopup(p); return; }
  map.flyTo({ center: [row.lon, row.lat], zoom: Math.max(map.getZoom(), 16) });
}

// The dot beside a saved row's name: the pin's own colour when tonight's data
// still has it (a table's status, a play place's blue), a plain outline when
// it does not — never a status this project did not actually classify.
function savedDotClass(osmUrl) {
  const f = featuresByOsmUrl.get(osmUrl);
  if (f) return viewOf(f, mode).cls;
  return placesByOsmUrl.has(osmUrl) ? "play" : "neutral";
}

function renderSavedList() {
  if (!savedPlaces.length) {
    meSavedListEl.innerHTML = `<li class="saved-empty">${esc(t("meSavedEmpty"))}</li>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const row of savedPlaces) {
    const li = document.createElement("li");
    li.className = "saved-row";
    const name = row.name || t("popupUnnamed");
    const dist = lastFix ? formatDistance(haversineKm(lastFix.lat, lastFix.lon, row.lat, row.lon)) : null;
    const open = document.createElement("button");
    open.type = "button";
    open.className = "saved-link";
    open.innerHTML = `<span class="dot ${savedDotClass(row.osm)}"></span>${esc(name)}` +
      (dist ? ` <span class="dist">${esc(t(dist.key, { n: num(dist.n) }))}</span>` : "");
    open.addEventListener("click", () => openSavedPlace(row));
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "saved-remove";
    rm.setAttribute("aria-label", t("ariaMeSavedRemove", { name }));
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      savedPlaces = removeSaved(savedPlaces, row.osm);
      writeSavedRaw(savedPlaces);   // a failed remove just leaves the row; nothing to toast about
      renderSavedList();
    });
    li.append(open, rm);
    frag.append(li);
  }
  meSavedListEl.replaceChildren(frag);
}

// ---- "Yours": the reader's own public OSM changesets, read live ----
// Cached on the device (papamap-my-answers), tied to the logged-in user so a
// second account on the same browser never sees the first one's numbers —
// logout() above clears the key outright. Compact records only: id, lon,
// lat, closed_at, n (me.js's changesetAnswer/extractAnswers — n is
// changes_count, 1 for this site's own writes, more for a MapComplete
// session that answered several of the theme's questions in one changeset)
// and radius_m (the changeset's own area-attribution search radius) —
// never a changeset's contents, which are never downloaded at all.
const MY_ANSWERS_KEY = "papamap-my-answers";
// Bumped whenever the cached record's own shape changes (v1 -> v2 added n/
// radius_m/backfill — CONTRACT.md v39): a record from an older shape is
// worth less than refetching it correctly, not worth a migration. v3 changed
// no shape: v2 caches were filled by a rule that skipped every MapComplete
// changeset (isOwnChangeset, me.js) and had marked that history as scanned,
// so nothing short of dropping them would ever look at it again.
const MY_ANSWERS_CACHE_VERSION = 3;
// "A few pages max per open": on a reader's very first open this is a
// one-time scan of the newest 500 of their changesets of any kind (the API
// filters by user, not by tag); once the cache holds anything, the same
// budget splits between a top-up (what's new) and continuing the backfill
// cursor (older answers a previous open's budget did not reach) — see
// fetchMyAnswers below.
const MY_ANSWERS_PAGES = 5;
const MY_ANSWERS_REFRESH_MS = 5 * 60 * 1000;   // at most one refresh per open, and per five minutes
let myAnswers = null;         // { user, answers, backfill } once loaded/fetched this page load
let myAnswersFetchedAt = 0;
// Bumped by logout() and by a fresh login (possibly as another user) — a
// refresh started before either must not write its result once it lands:
// the privacy page's own promise ("beim Abmelden werden sie gelöscht") has
// to hold even for a fetch already running when the reader logs out mid-
// dialog (the logout button lives inside this very dialog).
let myAnswersGeneration = 0;
// The one AbortController a running refresh's requests can be cancelled
// through — logout() aborts it too, not just outrunning it via the
// generation check, so a reader closing the loop does not leave a request
// quietly finishing in the background for nothing.
let myAnswersAbort = null;

function loadMyAnswersRaw(user) {
  try {
    const raw = JSON.parse(localStorage.getItem(MY_ANSWERS_KEY));
    if (!raw || raw.user !== user || raw.v !== MY_ANSWERS_CACHE_VERSION) return { answers: [], backfill: null };
    return { answers: raw.answers ?? [], backfill: raw.backfill ?? null };
  } catch { return { answers: [], backfill: null }; }
}
function writeMyAnswersRaw(user, answers, backfill) {
  try {
    localStorage.setItem(MY_ANSWERS_KEY,
      JSON.stringify({ v: MY_ANSWERS_CACHE_VERSION, user, answers, backfill }));
  } catch { /* blocked storage: the count lives for this page load only */ }
}
function ensureMyAnswers(user) {
  if (!myAnswers || myAnswers.user !== user) {
    const stored = loadMyAnswersRaw(user);
    myAnswers = { user, answers: stored.answers, backfill: stored.backfill };
  }
  return myAnswers;
}

// Appended the moment OSM confirms the write — the dialog's number moves on
// this same tap rather than waiting for the next time it happens to page the
// changesets list. `answer()` in the two-tap flow above calls this; it is a
// no-op logged out (an answer cannot be written logged out in the first
// place, but a stale intent replayed after a fresh login is exactly the kind
// of edge this guards). Always exactly one answer at this site's own hand
// (n: 1) at the exact object's own position, so the 50 m floor always finds
// it — never a MapComplete session, which only ever arrives via the
// changesets list itself.
function recordMyAnswer(changesetId, lon, lat) {
  const user = getUser();
  if (!user) return;
  const cache = ensureMyAnswers(user);
  cache.answers = mergeAnswers(cache.answers,
    [{ id: Number(changesetId), lon, lat, closed_at: new Date().toISOString(), n: 1, radius_m: 50 }]);
  writeMyAnswersRaw(user, cache.answers, cache.backfill);
}

// One page of the changesets list: the raw `changesets` array, or null on
// any failure (offline, a timeout, a dead mirror, a non-OK response, bad
// JSON) — swallowed here so the caller can simply stop rather than surface
// an error the spec says never to show for this.
// `outerSignal`, when given, aborts this request too — refreshMyAnswers
// passes the one AbortController logout() can reach, so a reader who logs
// out mid-refresh does not leave a request quietly finishing in the
// background with nothing left to hand its answer to.
async function fetchChangesetPage(url, outerSignal) {
  try {
    const timeout = AbortSignal.timeout?.(15000);
    const signal = timeout && outerSignal && AbortSignal.any
      ? AbortSignal.any([timeout, outerSignal]) : (outerSignal ?? timeout);
    const r = await fetch(url, { signal });
    if (!r.ok) return null;
    const list = (await r.json())?.changesets;
    return Array.isArray(list) ? list : null;
  } catch { return null; }
}

// GET .../changesets.json?display_name=<user>[&time=...] (me.js's
// changesetsUrl says exactly what `time=` means and why). No auth header: a
// user's changesets are public. Bounded to MY_ANSWERS_PAGES calls total,
// split between two passes that share the one budget:
//
// 1. Top-up — what's new since the cache's own newest record (`since`). On
//    a first-ever open the cache is empty and this pass is skipped outright:
//    with no watermark to top up from it would only repeat pass 2's own
//    first call. Its very first call is always unbounded at the top, so it
//    always learns the true newest changesets regardless of budget — if the
//    budget runs out before it pages all the way back down to `since`, the
//    stretch it did not reach must not just vanish the next time `since`
//    advances past it: reopenGap (web/me.js) reopens the backfill cursor
//    there instead, with a floor so a previously-finished backfill does not
//    have to re-walk territory it already covered.
// 2. Backfill — continues from `backfill.oldest_scanned` (or the start of
//    OSM's own history, on a first-ever open) with whatever budget the
//    top-up did not spend, so a reader who has answered a lot, or who also
//    makes a lot of unrelated edits, is not stuck forever on the newest 500.
//    Stops for good (`done: true`) once a page comes back short, or once it
//    reaches its own floor (a gap reopenGap gave it).
//
// Either pass can spend its whole share of the budget without reaching the
// end of what it is asking for; the next open picks up exactly where this
// one left off (the top-up from the cache's new watermark, the backfill
// from its advanced cursor).
async function fetchMyAnswers(user, cache, signal) {
  let answers = cache.answers ?? [];
  let backfill = cache.backfill ?? { oldest_scanned: null, done: false, floor: null };
  let pagesUsed = 0;

  if (answers.length) {
    const since = newestClosedAt(answers);
    let before = null;
    let reachedWatermark = false;
    while (pagesUsed < MY_ANSWERS_PAGES) {
      const page = await fetchChangesetPage(changesetsUrl(osm.api, user, since, before), signal);
      pagesUsed++;
      if (page === null) return { answers, backfill };   // network failure: keep what we have
      if (!page.length) { reachedWatermark = true; break; }
      answers = mergeAnswers(answers, extractAnswers(page));
      before = pageBoundary(page);
      if (!before) { reachedWatermark = true; break; }   // caught up to the cache's own watermark
    }
    if (!reachedWatermark && before) backfill = reopenGap(before, since, backfill);
  }

  while (!backfill.done && pagesUsed < MY_ANSWERS_PAGES) {
    const url = backfill.oldest_scanned
      ? changesetsUrl(osm.api, user, null, backfill.oldest_scanned)
      : changesetsUrl(osm.api, user, null, null);
    const page = await fetchChangesetPage(url, signal);
    pagesUsed++;
    if (page === null) break;
    answers = mergeAnswers(answers, extractAnswers(page));
    backfill = advanceBackfillCursor(backfill, page);
  }

  return { answers, backfill };
}

// Called once per dialog open, and no more often than every few minutes: the
// cache already rendered (renderMeDialog, below) is not held hostage to this.
async function refreshMyAnswers() {
  const user = getUser();
  if (!user || Date.now() - myAnswersFetchedAt < MY_ANSWERS_REFRESH_MS) return;
  myAnswersFetchedAt = Date.now();
  const generation = myAnswersGeneration;
  const cache = ensureMyAnswers(user);
  myAnswersAbort = new AbortController();
  const { answers, backfill } = await fetchMyAnswers(user, cache, myAnswersAbort.signal);
  // The reader may have logged out (or into a different account) while this
  // was in flight — refreshApplies (web/me.js) is the one place that decides
  // whether a result may still be applied. Discarded silently otherwise:
  // never write a previous account's changesets back after logout cleared
  // them, and never mutate the in-memory cache/re-render under the new
  // account's name either.
  if (!refreshApplies(generation, myAnswersGeneration)) return;
  cache.answers = answers;
  cache.backfill = backfill;
  writeMyAnswersRaw(user, answers, backfill);
  if (meDialog.open) { renderMeSentence(); renderMeStats(); }
}

// ---- The game sentence ----
// The area is whichever one pickArea last chose for the footer link
// (currentArea, updateRegionsLink above) — never a second, differently-fed
// pick, so a pan from Hamburg to Berlin between opens says Berlin, and the
// dialog can never name a place the header link itself doesn't show. Only
// when pickArea has found nothing at all (open sea, zoomed out past any
// area's reach) does this fall back to the site's own whole-sweep numbers,
// the same ones the stats strip renders (localAnswered/answeredPercent).
function meAreaNumbers() {
  if (currentArea) {
    // The number counted has to match exactly the area the printed label
    // names — areaForLabel (web/datasource.js, CONTRACT.md v40) is the one
    // place that decides both together, so they cannot diverge. A chunk
    // (Land, région, prefecture) shown to a reader whose language it has no
    // page of its own in falls back to the PARENT country's label
    // (areaLink's own rule, CONTRACT.md v32) — areaKeysFor(currentArea)
    // alone would still only be that one chunk's own area, scoring Hamburg's
    // 131 tables under "Changing tables in Germany". `areaIndex` is the full
    // areas.json list, needed to look the parent row up when that happens.
    const { label: area, keys } = areaForLabel(currentArea, lang, areaIndex);
    return { area, percent: areaPercent(allFeatures, keys), keys };
  }
  const l = lastStats?.local;
  return { area: l ? areaLabel(lastStats) : null, percent: l ? answeredPercent(l) : null, keys: null };
}

function renderMeSentence() {
  const { area, percent, keys } = meAreaNumbers();
  const user = getUser();
  const answers = user ? ensureMyAnswers(user).answers : null;
  const yours = !user ? null
    : keys ? answersInArea(answers, myFeatureGrid, keys) : totalAnswers(answers);
  const greyCount = lastFix ? greyNearby(allFeatures, lastFix.lat, lastFix.lon).length : 0;
  const parts = sentenceParts({ area, percent, yours, greyCount, hasFix: !!lastFix, mama: mode === "mama" });
  const bits = [];
  bits.push(parts.area
    ? `<span>${t(parts.area.key, { area: esc(area), percent: num(percent) })}</span>`
    // No area (stats.json missing entirely) is the one case renderStats
    // itself falls back to statsMissing rather than naming an area; the
    // dialog says the same rather than guessing at one from the map view.
    : `<span>${esc(t("statsMissing", { href: t("methodsHref") }))}</span>`);
  if (parts.yours)
    bits.push(`<span>${t(parts.yours.key, parts.yours.vars ? { n: num(parts.yours.vars.n) } : {})}</span>`);
  if (parts.grey.locate) {
    bits.push(`<button type="button" id="me-locate" class="linkish">${esc(t("meLocate"))}</button>`);
  } else if (parts.grey.vars) {
    bits.push(`<button type="button" id="me-grey" class="linkish" aria-label="${esc(t("ariaMeGrey"))}">` +
      `${t(parts.grey.key, { n: num(parts.grey.vars.n) })}</button>`);
  } else {
    bits.push(`<span>${t(parts.grey.key)}</span>`);
  }
  meSentenceEl.innerHTML = bits.join(" ");
  meSentenceEl.querySelector("#me-locate")?.addEventListener("click", () => {
    if (!hasGeo()) { toast(t("toastNoGeo")); return; }
    locate().then((coords) => {
      showYou([coords.longitude, coords.latitude]);
      noteFix(coords.latitude, coords.longitude);
      renderMeSentence();
    }, () => toast(t("toastGeoFail")));
  });
  meSentenceEl.querySelector("#me-grey")?.addEventListener("click", () => {
    meDialog.close();
    map.fitBounds(circleBounds(lastFix.lat, lastFix.lon, 1), { padding: 40 });
  });
}

// ---- Part 2: your stats ----
function renderMeStats() {
  const user = getUser();
  if (!user) {
    meStatsEl.innerHTML = `<p>${esc(t("meLoginInvite"))}</p>` +
      `<button type="button" id="me-login" class="btn primary">${esc(t("meLogin"))}</button>`;
    meStatsEl.querySelector("#me-login").addEventListener("click", () => {
      // The intent brings the reader back to this dialog once logged in
      // (completeLogin, above) rather than dropping them back on a bare map.
      rememberView();
      goLogin({ kind: "me" });
    });
    return;
  }
  const cache = ensureMyAnswers(user);
  const answers = cache.answers;
  // n-weighted: a MapComplete session's one changeset can hold several of
  // the theme's own questions answered at once, and every one of those is
  // counted, not one per changeset (CONTRACT.md v39).
  const total = totalAnswers(answers);
  const first = answers.length ? answers.reduce((a, b) => ((a.closed_at ?? "") < (b.closed_at ?? "") ? a : b)) : null;
  const lines = [`<p>${esc(total > 0 ? t("meStatsTotal", { n: num(total) }) : t("meStatsTotalZero"))}</p>`];
  if (first?.closed_at) {
    // The full month, not the abbreviated one: German abbreviates with a
    // trailing period of its own ("1. Aug."), which collided with the
    // template's — "1. Aug.." with two. The full form has no such period in
    // any of the 32 languages, so the template can own the one it prints.
    const date = new Date(first.closed_at).toLocaleDateString(NUMBER_LOCALE[lang] ?? "en-GB",
      { day: "numeric", month: "long", year: "numeric" });
    lines.push(`<p>${esc(t("meStatsSince", { date }))}</p>`);
  }
  // The backfill (fetchMyAnswers, above) may not have reached the true start
  // of the reader's OSM history yet — a bounded budget per open means a
  // heavy mapper's full total can take several opens to settle. Said
  // quietly rather than left for the total to simply look wrong meanwhile.
  if (!cache.backfill?.done)
    lines.push(`<p class="me-backfill">${esc(t("meBackfillPending"))}</p>`);
  lines.push(`<p><button type="button" class="linkish" data-logout>${esc(t("askLogout"))}</button></p>`);
  meStatsEl.innerHTML = lines.join("");
}

// "Mehr aus der App": the three things iOS keeps on its own screens (me.js,
// appTips). Plain text — nothing here is a link, the reader has to leave the
// app to do any of it. Hidden wherever appTips has nothing to say.
const meTipsEl = document.getElementById("me-tips");
const meTipsListEl = document.getElementById("me-tips-list");
function renderMeTips() {
  const tips = appTips(platform(), lang);
  meTipsEl.hidden = tips.length === 0;
  meTipsListEl.replaceChildren(...tips.map((key) => {
    const li = document.createElement("li");
    li.textContent = t(key);
    return li;
  }));
}

// Said once, after the first "nearest" that found something: the moment the
// reader has just used the very thing the control and the widget do in one
// tap. Waits out the "x m away" toast instead of replacing it. A tap opens
// Mein PapaMap, where the three are spelled out. The flag is set when the
// toast is shown — not when it is tapped, a hint that returns until it is
// obeyed is an advert; and not when it is scheduled, an app killed in the
// wait would have spent its one hint unseen. It also waits its turn: never
// over another toast (one with a tap of its own would lose it) and never
// under an open dialog, where it could be read but not tapped. A few tries,
// then it is left for the next "nearest". Storage blocked: once per launch.
const TIP_DELAY_MS = 4500, TIP_TRIES = 4;
let tipPending = false, tipSaidThisLaunch = false;
function maybeToastTip() {
  if (tipPending || tipSaidThisLaunch || appTips(platform(), lang).length === 0) return;
  try { if (localStorage.getItem(TIP_SEEN_KEY)) return; } catch { /* no storage: fall through */ }
  tipPending = true;
  let tries = 0;
  const say = () => {
    const busy = document.getElementById("toast").classList.contains("show")
      || document.querySelector("dialog[open]");
    if (busy) {
      if (++tries < TIP_TRIES) setTimeout(say, TIP_DELAY_MS); else tipPending = false;
      return;
    }
    tipPending = false;
    tipSaidThisLaunch = true;
    try { localStorage.setItem(TIP_SEEN_KEY, "1"); } catch { /* said once per launch instead */ }
    toast(t("toastTip"), { ms: 8000, onTap: () => meBtn.click() });
  };
  setTimeout(say, TIP_DELAY_MS);
}

function renderMeDialog() {
  renderMeSentence();
  renderMeStats();
  renderSavedList();
  renderMeTips();
}

meBtn.addEventListener("click", () => {
  meDialog.showModal();
  renderMeDialog();
  refreshMyAnswers();   // best-effort background top-up; re-renders when it lands
});
document.getElementById("me-close").addEventListener("click", () => meDialog.close());
meDialog.addEventListener("click", (e) => { if (e.target === meDialog) meDialog.close(); });

boot();
window.addEventListener("resize", positionZoomCtrl);

// ---- Offline: register the service worker ----
// Last thing in the module and deliberately unawaited — a browser without
// service workers, a failed registration, or a page opened over plain http
// must all leave the map working exactly as before. sw.js stores the shell and
// the dataset; it never touches map tiles, and the comment at the top of that
// file says why that is not a detail but the whole constraint.
if ("serviceWorker" in navigator)
  window.addEventListener("load",
    () => navigator.serviceWorker.register("sw.js").catch(() => {}));
