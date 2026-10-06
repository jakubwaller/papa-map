// Pure logic for the add dialog's place list — no DOM, no fetch, unit-tested
// via node --test. web/app.js owns the dialog, the requests and the answer.
//
// The case this serves: a café, shop or museum that OpenStreetMap already
// knows, with nothing recorded about a changing table. The pipeline never
// emits those (there are millions of them; it emits tables), so the list is
// asked for live, from the same Photon the search field uses (web/search.js
// says why Photon and what its fair-use terms are). Measured against
// Overpass from Eimsbüttel on 2 Oct 2026 at midday: Photon answered ten
// times out of ten in 2-3.5 s and listed 47 of the 49 untagged venues
// Overpass found; Overpass itself answered four times out of ten. Photon
// cannot filter on `changing_table`, which is why venueRows drops what the
// map already has a pin for, and why writeTags' own re-read (web/osm.js)
// stays the last word on whether the place is still unanswered.
import { haversineKm } from "./datasource.js?v=app77";
import { PHOTON_ENDPOINT, photonLang, photonRow } from "./search.js?v=app77";

// The MapComplete theme's dad_venue layer, as tag lists: the same places the
// theme offers for the same question. theme/papamap.theme.json is the source,
// and venues.test.js fails if the two drift apart.
export const VENUE_TAGS = {
  amenity: ["cafe", "restaurant", "fast_food", "food_court", "ice_cream", "bar", "pub",
    "biergarten", "library", "community_centre", "cinema", "theatre", "arts_centre",
    "events_venue", "pharmacy", "doctors", "clinic", "hospital", "dentist", "fuel",
    "childcare", "kindergarten", "social_facility", "townhall", "marketplace", "public_bath"],
  shop: ["mall", "department_store", "supermarket", "hypermarket", "baby_goods", "toys",
    "furniture", "garden_centre", "doityourself", "hardware", "chemist", "variety_store"],
  tourism: ["museum", "zoo", "aquarium", "theme_park", "gallery", "hotel"],
  leisure: ["sports_centre", "swimming_pool", "water_park", "fitness_centre", "ice_rink",
    "bowling_alley", "amusement_arcade"],
  railway: ["station"],
  public_transport: ["station"],
  aeroway: ["terminal"],
};

export function isVenue(key, value) {
  return Boolean(VENUE_TAGS[key]?.includes(value));
}

// Photon's own filter: one `osm_tag=key:value` per pair, ORed.
export function venueOsmTags() {
  return Object.entries(VENUE_TAGS).flatMap(([k, vs]) => vs.map((v) => `${k}:${v}`));
}

// 300 m around the map centre: a street and its corners, what a reader
// standing in the café can see. 50 is Photon's own ceiling on one answer.
export const VENUE_RADIUS_KM = 0.3;
export const VENUE_LIMIT = 50;
// Below this the map centre is a district, not a street, and a list of the
// nearest fifty places to it would be a list of strangers.
export const VENUE_MIN_ZOOM = 14;
// The centre leaves the browser rounded to three decimals, about 100 m — the
// precision a 300 m radius needs and no more. That is street level, unlike
// the search field's 10 km, and the Datenschutz page says so: this request
// is only made when the reader opens the dialog to add a place at this view.
export const VENUE_CENTRE_DECIMALS = 3;
// The search inside the dialog stays in the neighbourhood: a box about 1 km
// either side of the centre, so "Rewe" finds this street's, not Berlin's.
export const VENUE_SEARCH_BOX_KM = 1;
export const VENUE_SEARCH_LIMIT = 15;

const round = (n) => Number(n.toFixed(VENUE_CENTRE_DECIMALS));

// The cache key for one centre: two opens of the dialog at the same view ask
// Photon once.
export function venueCentreKey(lat, lon) {
  return `${round(lat)},${round(lon)}`;
}

const REVERSE_ENDPOINT = PHOTON_ENDPOINT.replace(/\/api\/$/, "/reverse");

export function venueReverseUrl(lat, lon, { lang = null, endpoint = REVERSE_ENDPOINT } = {}) {
  const p = new URLSearchParams({
    lat: String(round(lat)), lon: String(round(lon)),
    radius: String(VENUE_RADIUS_KM), limit: String(VENUE_LIMIT),
  });
  const l = photonLang(lang);
  if (l) p.set("lang", l);
  for (const tag of venueOsmTags()) p.append("osm_tag", tag);
  return `${endpoint}?${p}`;
}

export function venueSearchUrl(query, lat, lon, { lang = null, endpoint = PHOTON_ENDPOINT } = {}) {
  const dLat = VENUE_SEARCH_BOX_KM / 111;
  const dLon = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const c = { lat: round(lat), lon: round(lon) };
  const bbox = [c.lon - dLon, c.lat - dLat, c.lon + dLon, c.lat + dLat].map((n) => n.toFixed(4));
  const p = new URLSearchParams({
    q: String(query), limit: String(VENUE_SEARCH_LIMIT),
    lat: String(c.lat), lon: String(c.lon), bbox: bbox.join(","),
  });
  const l = photonLang(lang);
  if (l) p.set("lang", l);
  for (const tag of venueOsmTags()) p.append("osm_tag", tag);
  return `${endpoint}?${p}`;
}

const OSM_TYPE = { N: "node", W: "way", R: "relation" };

// Photon's answer as rows the dialog can render, nearest first, or [] for
// anything that is not a usable FeatureCollection (a throttled Photon can
// answer an error body with a 200). Dropped: rows without a name (nobody
// recognises "unnamed" from the street), anything not on the venue list (the
// search box does not restrict by tag as strictly as reverse does), toilets
// (they are the other button), duplicates (Photon indexes one object once
// per matching tag), and whatever `known(osm_url)` says the map already has
// a pin for — a table there is answered, the room question lives on its pin.
export function venueRows(json, { lat, lon, known = () => false, limit = VENUE_LIMIT } = {}) {
  const feats = Array.isArray(json?.features) ? json.features : [];
  const out = [], seen = new Set();
  for (const f of feats) {
    const p = f?.properties ?? {};
    const type = OSM_TYPE[p.osm_type];
    const c = f?.geometry?.coordinates;
    if (!type || p.osm_id == null || !p.name) continue;
    if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    if (!isVenue(p.osm_key, p.osm_value)) continue;
    const osm_url = `https://www.openstreetmap.org/${type}/${p.osm_id}`;
    if (seen.has(osm_url) || known(osm_url)) continue;
    seen.add(osm_url);
    const { context } = photonRow(f);
    out.push({
      osm_url, name: p.name, context, lon: c[0], lat: c[1],
      km: Number.isFinite(lat) && Number.isFinite(lon) ? haversineKm(lat, lon, c[1], c[0]) : null,
    });
  }
  out.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  return out.slice(0, limit);
}

// "80 m", "1240 m" — metres only, to the nearest ten: the list never reaches
// past the search box's corners, and digits plus "m" read the same in every
// one of the site's languages, with no decimal separator to localise.
export function venueDistance(km) {
  if (!Number.isFinite(km)) return "";
  return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
}
