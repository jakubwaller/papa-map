// Pure logic for the search field — no DOM, no fetch, unit-tested via
// node --test. web/app.js owns the field, the dropdown and the keyboard;
// everything here is a function of its arguments.
//
// Two sources, one dropdown. The first is this map's own places, matched in
// memory against the GeoJSON that is already loaded: no request leaves the
// browser for it, which is what keeps the "nearest table" promise in the
// Datenschutz true for the search field as well. The second is the rest of
// the world, from a geocoder — because a parent planning a trip wants to look
// at Lisbon before they are standing in it, and this map has no street index
// of its own.
import { haversineKm } from "./datasource.js?v=app41";

// ---- The geocoder ----
// Photon (komoot), not Nominatim. Nominatim's usage policy forbids
// autocomplete outright ("no heavy uses ... no bulk geocoding ... autocomplete
// search"), and a field that queries on every keystroke is exactly that.
// Photon is built for it — its own feature list says "search-as-you-type" —
// runs on the same OSM data, and its demo server is komoot's. Their terms are
// fair use and nothing more: "You are welcome to use the API for your project
// as long as the number of requests stay in a reasonable limit. Extensive
// usage will be throttled or completely banned. We do not give guarantees for
// availability and reserve the right to implement changes without notice."
// (https://github.com/komoot/photon, read 21 Sep 2026.) So: three characters
// before the first request, a debounce, one request in flight at a time, and
// a dropdown that still works from the map's own places when this answers
// nothing at all.
//
// One constant, on purpose. Swapping the public demo for a same-origin proxy
// on papamap.de — which is what an "extensive usage" mail would make us do —
// is then this line and the Datenschutz paragraph, not a hunt through app.js.
export const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";

// Photon translates a name only into the languages its dumps carry: "The dumps
// contain names in English, German, French and local language"
// (komoot/photon README). Asking for anything else is not an error, it simply
// falls back — but sending `lang=ja` would be a claim about the reader we have
// no reason to send, so the parameter is left off and the local name comes
// back, which is what a sign in that street says anyway.
export const PHOTON_LANGS = ["de", "en", "fr"];

export function photonLang(lang) {
  return PHOTON_LANGS.includes(lang) ? lang : null;
}

// From two characters for the map's own places (free, in memory), from three
// before anything is sent anywhere.
export const LOCAL_MIN_CHARS = 2;
export const PHOTON_MIN_CHARS = 3;
export const LOCAL_LIMIT = 3;
export const PHOTON_LIMIT = 5;
export const PHOTON_DEBOUNCE_MS = 300;

// The bias point is the map's centre rounded to one decimal — about 10 km at
// these latitudes, a city rather than a street corner.
//
// The GPS fix itself is never sent: `lastFix` in web/app.js belongs to the
// nearest button and the room card, and is not in scope in the search path at
// all. That is NOT the same as "the reader's position is never involved", and
// the rounding exists precisely because it is not. After the locate button —
// or when the map opens at the reader's position because permission was
// already granted — the map centre is roughly where the reader is standing,
// and they did not steer there. One decimal is what turns that from a street
// corner into "somewhere around Hamburg" before it leaves the browser. The
// Datenschutz page says exactly this, rather than promising more than the
// code delivers.
//
// Rounded in exactly one place, photonUrl below: two roundings are two rules
// that can drift apart, and the one that drifts is the one nobody tested.
export const PHOTON_BIAS_DECIMALS = 1;

// Case- and diacritic-insensitive, both sides. NFD splits "ü" into "u" plus a
// combining diaeresis and the range strips the mark, so a German reader typing
// "muhlen" finds "Mühlenkamp" and a Czech one typing "namesti" finds
// "Náměstí" — which is the whole point on a phone keyboard.
export function normalise(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// The map's own places, nearest to the map centre first. `tables` are the pins
// (they carry a status and get a bucket-coloured dot), `places` the play-area
// prospects (no status — web/app.js draws them in the play blue). Substring,
// not prefix: "rewe" should find "Rewe Markt" and "Kaufland Rewe-Center"
// alike, and there is no tokenizer here to do better.
export function matchLocal(tables, places, query, centre, limit = LOCAL_LIMIT) {
  const q = normalise(query);
  if (q.length < LOCAL_MIN_CHARS) return [];
  const hits = [];
  const scan = (list, kind) => {
    for (const obj of list ?? []) {
      if (!obj?.name || !Number.isFinite(obj.lat) || !Number.isFinite(obj.lon)) continue;
      if (!normalise(obj.name).includes(q)) continue;
      hits.push({ kind, obj, km: haversineKm(centre.lat, centre.lon, obj.lat, obj.lon) });
    }
  };
  scan(tables, "table");
  scan(places, "place");
  hits.sort((a, b) => a.km - b.km);
  return hits.slice(0, limit);
}

export function photonUrl(query, {
  lang = null, lat = null, lon = null, zoom = null,
  limit = PHOTON_LIMIT, endpoint = PHOTON_ENDPOINT,
} = {}) {
  const p = new URLSearchParams({ q: String(query), limit: String(limit) });
  const l = photonLang(lang);
  if (l) p.set("lang", l);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    p.set("lat", lat.toFixed(PHOTON_BIAS_DECIMALS));
    p.set("lon", lon.toFixed(PHOTON_BIAS_DECIMALS));
    // Photon weighs the bias by zoom (its default is 12). Sending the map's
    // own zoom is what makes a search from a city view prefer that city and
    // one from a continent view not pretend to.
    if (Number.isFinite(zoom)) p.set("zoom", String(Math.round(zoom)));
  }
  return `${endpoint}?${p}`;
}

// One row's two lines. Photon has no single "label" field — it returns the
// address in parts — so the name is whatever the object is called, falling
// back to its street and then to the administrative names, and the context is
// the next two levels up with anything already in the name left out. "Rathaus
// / Rathausmarkt 1, Hamburg", "Lissabon / Portugal", "Portugal / ".
export function photonRow(feature) {
  const p = feature?.properties ?? {};
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const name = p.name || street || p.city || p.state || p.country || "";
  const parts = [];
  for (const v of [p.name ? street : null, p.city, p.state, p.country])
    if (v && v !== name && !parts.includes(v)) parts.push(v);
  return { name, context: parts.slice(0, 2).join(", ") };
}

// Where the map goes when a row is chosen, for a result with no extent.
// Photon's `type` is the level the object sits at, so it answers "how much of
// the world did they just ask for" better than any radius we could guess.
export const PHOTON_ZOOM = {
  house: 17, street: 17, locality: 15, district: 14,
  city: 12, county: 10, state: 7, country: 5,
};
export const PHOTON_ZOOM_DEFAULT = 12;

export function photonTarget(feature) {
  const p = feature?.properties ?? {};
  // Photon's extent is [west, north, east, south] — not GeoJSON's bbox order.
  // Verified against the live API (Hamburg Rathaus, 21 Sep 2026): the second
  // number is the larger latitude.
  const e = p.extent;
  if (Array.isArray(e) && e.length === 4 && e.every((n) => Number.isFinite(n)))
    return { bounds: [[e[0], e[3]], [e[2], e[1]]] };
  const c = feature?.geometry?.coordinates;
  if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
  return { center: [c[0], c[1]], zoom: PHOTON_ZOOM[p.type] ?? PHOTON_ZOOM_DEFAULT };
}

// The whole answer, turned into rows the dropdown can render, or [] for
// anything that is not a usable FeatureCollection — a throttled Photon can
// answer with an error body and a 200, and the field must read that as "no
// results", never as a crash.
//
// Deduplicated by OSM identity: Photon indexes one object once per matching
// tag, so the Hamburg town hall comes back twice in a five-result answer
// (amenity=townhall and office=government) and the reader would see the same
// row twice.
export function photonResults(json, limit = PHOTON_LIMIT) {
  const feats = Array.isArray(json?.features) ? json.features : [];
  const out = [], seen = new Set();
  for (const f of feats) {
    const target = photonTarget(f);
    const row = photonRow(f);
    if (!target || !row.name) continue;
    const p = f.properties ?? {};
    const key = p.osm_type && p.osm_id != null
      ? `${p.osm_type}${p.osm_id}`
      : `${row.name}|${row.context}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...row, target });
    if (out.length >= limit) break;
  }
  return out;
}
