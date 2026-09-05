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
