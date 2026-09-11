// Pure data functions for PapaMap — no DOM, no fetch, unit-tested via node --test.
// Input shape: the pipeline's GeoJSON per the data contract in CONTRACT.md.

// Every status the pipeline can emit, in legend order. Also the stable key set
// for countsByStatus, so the UI can render zero badges.
export const STATUSES = ["accessible", "female_only", "unknown"];

// Flatten the pipeline FeatureCollection into plain {lon, lat, ...props} objects.
// Tolerates a missing/empty/malformed collection by returning [] — the UI shows
// a "no data" message instead of crashing. Features without a usable Point
// geometry are skipped; an unrecognized status degrades to "unknown". idx is
// the object's position in the returned array: the map layer carries only idx
// and clicks look the full object up again.
// [lon, lat] of a Point feature, or null for anything this map can't draw.
function pointOf(f) {
  const coords = f && f.geometry && f.geometry.type === "Point"
    ? f.geometry.coordinates : null;
  return Array.isArray(coords) && coords.length >= 2 ? coords : null;
}

export function loadFeatures(fc) {
  if (!fc || !Array.isArray(fc.features)) return [];
  const out = [];
  for (const f of fc.features) {
    const coords = pointOf(f);
    if (!coords) continue;
    const p = f.properties || {};
    out.push({
      idx: out.length,
      lon: coords[0],
      lat: coords[1],
      name: p.name ?? null,
      amenity: p.amenity ?? null,
      changing_table: p.changing_table ?? null,
      location_raw: p.location_raw ?? null,
      status: STATUSES.includes(p.status) ? p.status : "unknown",
      // Strict === true: a dataset written before this property existed leaves
      // it undefined, and "no play corner recorded" must never render as one.
      play: p.play === true,
      fee: p.fee ?? null,
      opening_hours: p.opening_hours ?? null,
      osm_url: p.osm_url ?? null,
      mapcomplete_url: p.mapcomplete_url ?? null,
    });
  }
  return out;
}

// play_places.geojson — places that record an indoor play area and carry no
// changing_table tag at all. A separate dataset, not a fourth status: these
// have no answer to colour, so they get no status field, no filter by status
// and no count in the table totals. Same tolerance as loadFeatures — a missing
// file degrades to [] and the chip simply reads 0.
export function loadPlaces(fc) {
  if (!fc || !Array.isArray(fc.features)) return [];
  const out = [];
  for (const f of fc.features) {
    const coords = pointOf(f);
    if (!coords) continue;
    const p = f.properties || {};
    out.push({
      idx: out.length,
      lon: coords[0],
      lat: coords[1],
      name: p.name ?? null,
      kind: p.kind ?? null,
      opening_hours: p.opening_hours ?? null,
      osm_url: p.osm_url ?? null,
      mapcomplete_url: p.mapcomplete_url ?? null,
    });
  }
  return out;
}

// Keep only features whose status is in `visible` (a Set or array of statuses).
export function filterByStatus(features, visible) {
  const set = visible instanceof Set ? visible : new Set(visible);
  return features.filter((f) => set.has(f.status));
}

// { accessible: n, female_only: n, unknown: n } — always all three keys.
export function countsByStatus(features) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const f of features) counts[f.status] += 1;
  return counts;
}

// How many of these also have a play corner. Its own function rather than a
// fourth key on countsByStatus: play is orthogonal to status, and folding it
// in would make the three counts stop summing to the total.
export function countPlay(features) {
  return features.reduce((n, f) => n + (f.play ? 1 : 0), 0);
}

// What the map actually draws: the status toggles, then the play filter
// narrowing on top. The play filter subtracts and never adds — an untagged
// object is unrecorded, not known to lack a play corner, so switching it on
// promises "these definitely have one", not "the rest definitely don't".
export function filterFeatures(features, visible, playOnly = false) {
  const byStatus = filterByStatus(features, visible);
  return playOnly ? byStatus.filter((f) => f.play) : byStatus;
}

// ?bbox=minLon,minLat,maxLon,maxLat — how the Bundesland pages link into the
// map, so "Hessen auf der Karte öffnen" opens on Hessen instead of the
// Germany+Denmark home view. Returns MapLibre's [[w,s],[e,n]] or null; anything
// malformed degrades to the home view, because handing fitBounds a NaN or an
// inverted box produces a broken camera the user can't recover from.
export function parseBbox(value) {
  const parts = String(value ?? "").split(",");
  if (parts.length !== 4) return null;
  const [w, s, e, n] = parts.map(Number);
  if (![w, s, e, n].every(Number.isFinite)) return null;
  if (w < -180 || e > 180 || s < -90 || n > 90) return null;
  if (w >= e || s >= n) return null;   // empty or inverted
  return [[w, s], [e, n]];
}

// Deep links for the "add a place" flow, built from the current map view.
// Coordinates are clamped to 5 decimals (~1 m) so the URLs stay readable;
// zoom is rounded and floored at the editors' useful minimum, because handing
// MapComplete or iD a country-level zoom just strands the user in the clouds.
// Same userlayout theme as the pin popups (pipeline/export.py): its dad_toilet
// layer has an add-toilet preset, and edits through it carry theme=papamap in
// the changeset — the official toilets theme would make them uncountable.
const PAPAMAP_THEME = "https://mapcomplete.org/theme.html?userlayout=" +
  "https://raw.githubusercontent.com/jakubwaller/papa-map/main/theme/papamap.theme.json";

// MapComplete's own UI languages (its langs/ directory), keyed by the site's
// codes. Only these get a language= parameter: MapComplete falls back to
// English for an unknown code, which would be worse than its own detection
// (OSM account language, then the browser). The parameter also disables the
// in-app language switch, so it is passed only where the site's choice is a
// deliberate one — and it steers MapComplete's chrome; the theme's own
// questions exist in de/da/en and fall back to English elsewhere.
const MAPCOMPLETE_LANG = {
  ca: "ca", cs: "cs", da: "da", de: "de", el: "el", en: "en", es: "es", fi: "fi",
  fr: "fr", hu: "hu", it: "it", nl: "nl", no: "nb_NO", pl: "pl", pt: "pt",
  ro: "ro", sl: "sl", sv: "sv", uk: "uk", ja: "ja",
};

export function mapCompleteLanguage(lang) {
  return MAPCOMPLETE_LANG[lang] ?? null;
}

// Append language= to a MapComplete URL (the pipeline's per-feature deep links
// are language-neutral; the site knows the reader's language, the build does
// not). Goes before the #fragment, which is the preselected object.
export function withMapCompleteLanguage(url, lang) {
  const code = mapCompleteLanguage(lang);
  if (!code || typeof url !== "string") return url;
  const hash = url.indexOf("#");
  const base = hash < 0 ? url : url.slice(0, hash), frag = hash < 0 ? "" : url.slice(hash);
  return `${base}&language=${code}${frag}`;
}

function mapCompleteViewUrl(lon, lat, zoom, minZoom, lang) {
  const z = Math.max(minZoom, Math.round(zoom));
  return withMapCompleteLanguage(
    `${PAPAMAP_THEME}&z=${z}&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`, lang);
}

// "A public toilet is missing": the dad_toilet layer with its add preset.
export function mapCompleteAddUrl(lon, lat, zoom, lang) {
  return mapCompleteViewUrl(lon, lat, zoom, 14, lang);
}

// "A café / shop / restaurant has a table": the theme's dad_venue layer lists
// such places without a changing_table tag from zoom 16, so the link lands one
// zoom level inside that — tap the place, answer the question. Replaced the
// iD deep link (2026-08-27): on a phone, iD meant finding the object, opening
// the raw tag editor and typing two keys.
export function mapCompleteVenueUrl(lon, lat, zoom, lang) {
  return mapCompleteViewUrl(lon, lat, zoom, 17, lang);
}

// Rebuild a FeatureCollection for the map source. Properties carry only
// {idx, status, play}: status drives the data-driven circle color, play the
// halo layer's filter, idx the click lookup. "unknown" features are emitted
// last so their grey circles draw on top of the others — the untagged rooms
// are the call to action.
export function toFeatureCollection(features) {
  const ordered = [...features].sort(
    (a, b) => (a.status === "unknown") - (b.status === "unknown"));
  return {
    type: "FeatureCollection",
    features: ordered.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [f.lon, f.lat] },
      properties: { idx: f.idx, status: f.status, play: f.play },
    })),
  };
}

// The same for the play places, which need no status and no ordering — one
// uniform ring layer, and idx for the click lookup.
export function placesToFeatureCollection(places) {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { idx: p.idx },
    })),
  };
}

// ---- Papa/Mama: two readings of the same three answers ----
// The pipeline's `status` is, and stays, the dad question: can a father reach
// this table. Mothers are the larger audience by a distance (roughly nine in
// ten parental-leave months), and for them the same three answers mean
// something else — a table in the women's room is usable, and an unrecorded
// room is usually usable too. So the site gets a second *reading*, never a
// second classification: everything below is a lookup over the three values
// classify.py already emits, and no OSM tag is consulted here. That is what
// keeps CONTRACT.md's rule intact — classification lives only in Python.
export const MODES = ["papa", "mama"];
export const DEFAULT_MODE = "papa";

// ?mode= beats the stored choice beats the default — the precedence pickLang
// already uses, minus browser detection: a mode is not a locale, and no
// browser header says whether the reader is a father or a mother.
export function pickMode(query, stored) {
  if (MODES.includes(query)) return query;
  if (MODES.includes(stored)) return stored;
  return DEFAULT_MODE;
}

// One row per (mode, status). `bucket` is the shared vocabulary the pin
// layer, the chips and the popup all paint and label from, so none of the
// three can drift into disagreeing about what a mode means. The papa rows
// are exactly the STATUS_COLOR / STATUS_META tables app.js carried before,
// moved here so they are unit-testable and so "papa mode is unchanged" is a
// property of one file rather than a promise.
const VIEW = {
  papa: {
    accessible:  { bucket: "good",  cls: "ok",    labelKey: "stAccessible",     metaKey: "metaAccessible" },
    female_only: { bucket: "bad",   cls: "bad",   labelKey: "stFemaleOnly",     metaKey: "metaFemaleOnly" },
    unknown:     { bucket: "ask",   cls: "ask",   labelKey: "stUnknown",        metaKey: "metaUnknown" },
  },
  mama: {
    // Both rooms collapse into one bucket: an openly accessible table and a
    // women's-room table are equally usable to her. Unknown becomes "maybe"
    // rather than the grey call to action — for a mother an unrecorded room
    // is usually still her room, so grey would overstate the doubt.
    accessible:  { bucket: "good",  cls: "ok",    labelKey: "stAccessibleMama", metaKey: "metaAccessibleMama" },
    female_only: { bucket: "good",  cls: "ok",    labelKey: "stFemaleOnlyMama", metaKey: "metaFemaleOnlyMama" },
    unknown:     { bucket: "maybe", cls: "maybe", labelKey: "stUnknownMama",    metaKey: "metaUnknownMama" },
  },
};

// An unknown mode or status degrades to the papa reading rather than throwing:
// a hand-typed ?mode=papi must render the map, not a blank page.
export function viewFor(status, mode) {
  const rows = VIEW[mode] ?? VIEW[DEFAULT_MODE];
  return rows[status] ?? VIEW[DEFAULT_MODE].unknown;
}

// Okabe-Ito throughout. good/bad/ask are the exact three values app.js used
// before; `maybe` is the one new colour — the palette's orange, far enough
// from the blue play halo and from all three status colours to stay readable
// under the common kinds of colour-vision deficiency.
export const BUCKET_COLOR = {
  good: "#009e73", bad: "#d55e00", ask: "#3d4247", maybe: "#e69f00",
};

// A MapLibre paint expression rather than a per-feature branch: switching
// mode is then one setPaintProperty on a layer whose source data never
// moves, so 26k pins recolour without a setData() or a re-fetch.
export function pinColorExpression(mode) {
  return ["match", ["get", "status"],
    "accessible", BUCKET_COLOR[viewFor("accessible", mode).bucket],
    "female_only", BUCKET_COLOR[viewFor("female_only", mode).bucket],
    /* unknown */ BUCKET_COLOR[viewFor("unknown", mode).bucket]];
}

// The mama reading of the local stats sentence: the two rooms add up, the
// unrecorded ones stay their own number. Same three fields stats.json already
// carries — no new pipeline field, no new query, nothing added to the
// contract's emitted shape.
export function momCounts({ accessible = 0, female_only = 0, unknown = 0 } = {}) {
  return { good: accessible + female_only, maybe: unknown };
}

// ---- Nearest usable table ----
// "Usable" is the reading's own verdict, not a second classification: a status
// counts when the view already buckets it "good". So a father searches the
// green pins and a mother searches green and red together, both fall out of
// the same VIEW table the colours come from, and neither one re-derives
// anything from the raw tags. Add a mode to VIEW and this follows for free.
export function usableStatuses(mode) {
  return STATUSES.filter((s) => viewFor(s, mode).bucket === "good");
}

const EARTH_KM = 6371;
const rad = (deg) => (deg * Math.PI) / 180;

// Haversine on a sphere. The answers here are a few kilometres at most, where
// the error against a proper ellipsoid geodesic is centimetres — orders below
// the accuracy of the phone fix the distance is measured from, so the extra
// arithmetic would buy precision the input never had.
export function haversineKm(aLat, aLon, bLat, bLon) {
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  // min(1, …) guards the domain of asin: for two identical points the root can
  // land a float epsilon above 1 and hand back NaN.
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Straight-line nearest over the whole loaded set, which is every pin in every
// swept country — the site holds the entire GeoJSON in memory, so this is a
// real global nearest and not the nearest thing in the current viewport.
//
// Straight-line, though, and the popup says so: a table 200 m away across a
// river or a motorway is not 200 m away on foot. Routing is what would fix
// that, and routing needs a server this project does not have.
export function nearestUsable(features, lat, lon, mode) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const ok = new Set(usableStatuses(mode));
  let best = null;
  for (const f of features) {
    if (!ok.has(f.status)) continue;
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) continue;
    const km = haversineKm(lat, lon, f.lat, f.lon);
    if (best === null || km < best.km) best = { feature: f, km };
  }
  return best;
}

// Metres below a kilometre, and rounded to the nearest ten: a good phone fix
// is accurate to a handful of metres and a poor one to fifty, so "437 m" would
// claim a precision the sensor cannot deliver. Returns the i18n key and the
// bare number; the caller formats the number in the reader's own locale.
export function formatDistance(km) {
  // Round first, then choose the unit: picking metres for anything under a
  // kilometre and rounding afterwards renders 999 m as "1000 m", which is a
  // kilometre written the long way round.
  const m = Math.round((km * 1000) / 10) * 10;
  return m < 1000
    ? { key: "distM", n: m }
    : { key: "distKm", n: Math.round(km * 10) / 10 };
}

// A geo: URI hands the coordinates to whichever map app the reader already has
// — Apple Maps on an iPhone, Google Maps or Organic Maps or OsmAnd on Android
// — instead of this site picking one for them and telling a third party where
// they are standing. Desktop browsers mostly ignore it, which is why the popup
// keeps the openstreetmap.org link beside it.
export function geoUri(lat, lon, label) {
  const at = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const q = label ? `(${encodeURIComponent(label)})` : "";
  return `geo:${at}?q=${at}${q}`;
}

// ---- Edit confirmation: one object re-read from the OSM API ----
// The nightly build is the only path from OSM into the map, so a reader who
// has just answered the room question sees nothing for up to a day. The OSM
// API's single-object read reflects a changeset the moment it lands (Overpass
// lags minutes; this does not), needs no login, and answers papamap.de
// cross-origin — so app.js keeps the object's version and tags as a baseline
// when the MapComplete button is clicked and re-reads it a few times once the
// tab is back in front. What it shows is the raw tag value, never a colour:
// classification stays in the pipeline (CONTRACT.md v23).
const OSM_REF = /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/(\d+)$/;

// The pipeline's osm_url → { type, id }, or null for anything else.
export function osmRef(osmUrl) {
  const m = OSM_REF.exec(String(osmUrl ?? ""));
  return m ? { type: m[1], id: m[2] } : null;
}

export function osmApiUrl(ref) {
  return `https://api.openstreetmap.org/api/0.6/${ref.type}/${ref.id}.json`;
}

// The API wraps the one element in { elements: [ { version, tags, … } ] }.
// Returns { version, tags } or null when the reply is not that shape.
export function osmElementFromApi(json) {
  const el = json?.elements?.[0];
  if (!el || !Number.isFinite(el.version)) return null;
  return { version: el.version, tags: el.tags ?? {} };
}

// The two tags the confirmation names, in display order. Displayed verbatim —
// this file must never map them to a status.
export const EDIT_TAGS = ["changing_table", "changing_table:location"];

// Re-read schedule in ms once the tab is back in front. MapComplete uploads
// within seconds of an answer, so the first read usually settles it; the tail
// covers a slow upload or a reader who came back before answering.
export const EDIT_CHECK_DELAYS = [0, 20000, 60000, 120000, 300000];

// Compare the baseline read with a later one. `after` is null while the API
// is unreachable, { gone: true } once the object was deleted. Returns
// { changed, tags }: `tags` carries the object's current EDIT_TAGS when the
// edit touched one of them, null when the version moved for another reason
// (the confirmation then says "your edit is on OSM" without quoting a tag it
// did not change) or when the object is gone.
export function editOutcome(before, after) {
  if (!after) return null;
  if (!before || !Number.isFinite(before.version)) return { changed: false, tags: null };
  if (after.gone) return { changed: true, tags: null };
  if (after.version <= before.version) return { changed: false, tags: null };
  const tags = {};
  for (const k of EDIT_TAGS) if (after.tags?.[k] != null) tags[k] = after.tags[k];
  const moved = EDIT_TAGS.some(
    (k) => (before.tags?.[k] ?? null) !== (after.tags?.[k] ?? null));
  return { changed: true, tags: moved && Object.keys(tags).length ? tags : null };
}
