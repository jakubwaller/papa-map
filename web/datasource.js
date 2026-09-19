// Pure data functions for PapaMap — no DOM, no fetch, unit-tested via node --test.
// Input shape: the pipeline's GeoJSON per the data contract in CONTRACT.md.

// Every status the pipeline can emit, in legend order. Also the stable key set
// for countsByStatus, so the UI can render zero badges.
export const STATUSES = ["accessible", "female_only", "unknown"];

// The three values `wheelchair` / `toilets:wheelchair` can carry (v26).
export const WHEELCHAIR_STATES = ["yes", "limited", "no"];

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
      // Has anybody answered the play question here at all (v30)? true both
      // for a recorded play corner and for a recorded "there is none"; false
      // only where OSM is silent, which is the one case the popup asks about.
      // A dataset from before v30 says false for every pin without a corner,
      // so the question simply does not appear until the next nightly build —
      // never on a pin whose reader has already answered it.
      play_recorded: p.play === true || p.play === false,
      // Tri-state or null, straight from the pipeline (v26). Same strictness
      // as play: only the three wiki values pass, so a dataset from before the
      // property, or a junk value, reads as "unrecorded" — never as "no".
      wheelchair: WHEELCHAIR_STATES.includes(p.wheelchair) ? p.wheelchair : null,
      toilets_wheelchair: WHEELCHAIR_STATES.includes(p.toilets_wheelchair)
        ? p.toilets_wheelchair : null,
      wheelchair_description: typeof p.wheelchair_description === "string"
        ? p.wheelchair_description : null,
      // The central key system that locks the door ("eurokey", "nks", …) or
      // null. A keyed table is not a pin: it is hidden by default and comes
      // back only under the wheelchair chip, whose audience holds the key.
      key: typeof p.key === "string" && p.key ? p.key : null,
      fee: p.fee ?? null,
      opening_hours: p.opening_hours ?? null,
      osm_url: p.osm_url ?? null,
      mapcomplete_url: p.mapcomplete_url ?? null,
      // The sweep area that found the object (v32): a Land, a région, a
      // state, or a whole country. Null from a dataset written before the
      // property existed, which the footer link treats as "no vote".
      area: typeof p.area === "string" && p.area ? p.area : null,
    });
  }
  return out;
}

// play_places.geojson — places that record an indoor play area and are not
// pins: no changing_table tag at all (the open question), or, since v27,
// `changing_table=no` (answered, and the answer was no). A separate dataset,
// not a fourth status: neither has an answer to colour — red would promise a
// mother a table — so they get no status field, no filter by status and no
// count in the table totals. Same tolerance as loadFeatures — a missing file
// degrades to [] and the chip simply reads 0.
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
      // "no" or null, and only those: a dataset from before v27 has no such
      // property and must read as the open question, never as an answer.
      changing_table: p.changing_table === "no" ? "no" : null,
      // As on the pins (v26), read with the same strictness (v28).
      wheelchair: WHEELCHAIR_STATES.includes(p.wheelchair) ? p.wheelchair : null,
      toilets_wheelchair: WHEELCHAIR_STATES.includes(p.toilets_wheelchair)
        ? p.toilets_wheelchair : null,
      wheelchair_description: typeof p.wheelchair_description === "string"
        ? p.wheelchair_description : null,
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

// The wheelchair chip's rule, in one place: `wheelchair=yes` and nothing
// else. `limited` is heterogeneous by the wiki's definition (one step of up
// to 7 cm, or help needed) and Wheelmap keeps it orange, never green;
// `toilets:wheelchair=yes` alone would admit places with a step or a "no" at
// the door. Both stay visible in the popup — the information is worth more
// than the filter — but neither gets a place under the chip.
export function isWheelchairOk(f) {
  return f.wheelchair === "yes";
}

export function countWheelchair(features) {
  return features.reduce((n, f) => n + (isWheelchairOk(f) ? 1 : 0), 0);
}

// The universe the chips, the counts and the nearest search work over. By
// default it is every pin — the features with no central key on the door
// (CONTRACT v5: a Euro key is issued only against proof of disability, so a
// door it gates is closed to most dads). Under the wheelchair chip it is
// every table that passes the chip's rule, keyed or not: the chip's audience
// is exactly who holds the key, so the tables v5 took away come back here,
// marked, and nowhere else.
export function pinFeatures(features, wheelchairOnly = false) {
  return wheelchairOnly
    ? features.filter(isWheelchairOk)
    : features.filter((f) => !f.key);
}

// What the map actually draws: the pin universe, the status toggles, then
// the play filter narrowing on top. The play and wheelchair filters subtract
// and never add — an untagged object is unrecorded, not known to lack a play
// corner or a level entrance, so switching one on promises "these definitely
// have it", not "the rest definitely don't".
export function filterFeatures(features, visible, playOnly = false, wheelchairOnly = false) {
  const byStatus = filterByStatus(pinFeatures(features, wheelchairOnly), visible);
  return playOnly ? byStatus.filter((f) => f.play) : byStatus;
}

// The play places the map draws (v28). Under the wheelchair chip they follow
// the tables' rule: a ring left standing there reads as "you get in here" as
// much as a pin does, and one with a step at the door would break that.
export function placeFeatures(places, wheelchairOnly = false) {
  return wheelchairOnly ? places.filter(isWheelchairOk) : places;
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
// {idx, status, play, key}: status drives the data-driven circle color, play
// the halo layer's filter, key the key-icon layer's, idx the click lookup. "unknown" features are emitted
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
      properties: { idx: f.idx, status: f.status, play: f.play, key: f.key !== null },
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
      // `no` picks the dashed ring over the hollow one.
      properties: { idx: p.idx, no: p.changing_table === "no" },
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

// The wheelchair chip, as remembered on the device (`papamap-wheelchair`).
// Whoever needs it needs it every time, and the home-screen app would open
// with it off otherwise. Only "1" is on: a missing or blocked store, or
// anything else in it, leaves the map as a first visit sees it.
export const WHEELCHAIR_KEY = "papamap-wheelchair";
export function pickWheelchair(stored) {
  return stored === "1";
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
//
// Searched over the same universe the map draws from (pinFeatures): a keyed
// table is nobody's nearest unless the wheelchair chip is on, and with it on
// the nearest is the nearest that passes the chip — a reader who switched it
// on is asking for a table they can get to, not the closest one of any kind.
export function nearestUsable(features, lat, lon, mode, wheelchairOnly = false) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const ok = new Set(usableStatuses(mode));
  let best = null;
  for (const f of pinFeatures(features, wheelchairOnly)) {
    if (!ok.has(f.status)) continue;
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) continue;
    const km = haversineKm(lat, lon, f.lat, f.lon);
    if (best === null || km < best.km) best = { feature: f, km };
  }
  return best;
}

// ---- The "which room?" card: nearest unanswered table to a fix already had ----
// Straight-line, like nearestUsable, and over EVERY loaded feature rather than
// pinFeatures: the question is about the place the reader is standing in front
// of, not about the view — neither the status chips nor the wheelchair chip
// should decide whether it gets asked. 75 m is a fix's own accuracy plus a
// building's width, not a search radius meant to catch a table down the
// street. Play places are out of scope for v1 (CONTRACT.md v38): folding them
// in would mean deciding whether the card also files their bare
// changing_table=yes, a bigger question than this one.
export const ROOM_CARD_RADIUS_KM = 0.075;

export function nearestUnknownRoom(features, lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null;
  for (const f of features) {
    if (f.status !== "unknown" || f.location_raw) continue;
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) continue;
    const km = haversineKm(lat, lon, f.lat, f.lon);
    if (km > ROOM_CARD_RADIUS_KM) continue;
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

// ---- Share a pin: a plain https link that opens for anyone, app or not ----
// The identifier is the pipeline's own osm_url, verbatim — the same string
// TableStore.swift's deepLink already puts on papamap://table?osm=… for the
// widget and the Siri shortcut — so one parser (openPin, web/app.js) serves
// both: the app's deep link and this web one differ only in scheme. Always
// the canonical host, never location.origin: a link opened from a dev server
// or the sandbox must still work for whoever it was sent to. Carries no
// ?lang=: a shared link is not the sharer's language to choose for someone
// else, so the receiver's own detection/stored choice wins as it would on any
// other visit.
const SHARE_ORIGIN = "https://papamap.de/";

export function shareUrl(osmUrl) {
  return `${SHARE_ORIGIN}?osm=${encodeURIComponent(osmUrl)}`;
}

// The other half of the round trip: what app.js reads out of its own
// location.search on load. A thin wrapper over URLSearchParams, kept here
// rather than inlined so the pairing with shareUrl above is one glance away
// and both are covered by the same tests.
export function parseShareOsm(search) {
  return new URLSearchParams(search).get("osm");
}

// ---- Edit confirmation: one object re-read from the OSM API ----
// The nightly build is the only path from OSM into the map, so a reader who
// has just answered the room question sees nothing for up to a day. The OSM
// API's single-object read reflects a changeset the moment it lands (Overpass
// lags minutes; this does not), needs no login, and answers papamap.de
// cross-origin — so app.js keeps the object's version and tags as a baseline
// when the MapComplete button is clicked and re-reads it a few times once the
// tab is back in front. What it shows is the tag as OSM now holds it, in the
// reader's own language where app.js has one to show it in (v37) — never a
// colour: classification stays in the pipeline (CONTRACT.md v23).
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
// The tags an answer through this site can touch, in the two groups the
// popup's two questions write. A confirmation quotes back the group the
// answer belongs to — a room says nothing about a play corner — while the
// MapComplete edit check watches all of them, since the theme asks both
// questions. The play pair joined in v30.
export const TABLE_TAGS = ["changing_table", "changing_table:location"];
export const PLAY_TAGS = ["kids_area", "kids_area:indoor"];
export const EDIT_TAGS = [...TABLE_TAGS, ...PLAY_TAGS];

// "Changing table: yes" says nothing a reader does not already know — every
// pin and every place card that reaches this function has one — so the pin
// popup, the play-place card and the edit confirmation all print the value
// only when it says something else: "limited", or whatever other value OSM
// holds. One rule instead of three inline conditions, so the three render
// sites cannot drift apart on it. Returns the value to print, or null.
export const printableTableValue = (value) => (value && value !== "yes" ? value : null);

// The label each of those tags is printed under, as an i18n key — the popup's
// own words, never a value this file interpreted. `kids_area` and its
// `:indoor` sub-key have a label each (v31): they can disagree, and the pair
// the theme writes for "there is a play area, but outdoors only"
// (`kids_area=yes` + `kids_area:indoor=no`) read as one label twice over
// ("Play area: yes · Play area: no", issue #119).
export const EDIT_TAG_LABEL = {
  changing_table: "popupTable",
  "changing_table:location": "popupRoom",
  kids_area: "tagPlay",
  "kids_area:indoor": "tagPlayIndoor",
};

// The confirmation's lines for what OSM now holds: [i18n key, value verbatim],
// in EDIT_TAGS order. The sub-key's line is dropped where it only repeats the
// parent's value — the site's own "indoors" answer writes `yes` to both, and
// that is one fact, not two — so a disagreement between the two keys is the
// only thing that ever prints two play lines.
export function editTagLines(tags) {
  const [parent, sub] = PLAY_TAGS;
  const repeats = tags?.[parent] != null && tags[parent] === tags[sub];
  return EDIT_TAGS
    .filter((k) => tags?.[k] && !(repeats && k === sub))
    .map((k) => [EDIT_TAG_LABEL[k], tags[k]]);
}

// editTagLines minus the line printableTableValue would drop — the lines the
// confirmation actually prints, not just the tags it read. Pulled out as its
// own tested rule because app.js needs the same "is there anything to show"
// question twice: once to render the toast's body (tagsLabel), once to pick
// between it and the tagless "found" toast (editFoundPlain) in the first
// place — and those two used to ask it two different ways, so a reader whose
// only change was `changing_table=yes` (the theme's own standalone table
// question, answered on a play place with no room) saw a toast quoting an
// empty line. "No printable line → the plain toast" is now one rule, tested
// once, rather than a filter in the render path that the caller upstream
// does not see.
export function printableEditTagLines(tags) {
  return editTagLines(tags).filter(([label, value]) => label !== "popupTable" || printableTableValue(value));
}

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

// ---- The footer's area link follows the map view (2026-09-17) ----
// data/areas.json (CONTRACT.md v32): one row per generated area page. A
// country row names the sweep areas behind it (`areas`), a chunk row — a
// Land, région, state, prefecture — its one sweep area (`area`) and its
// country row (`parent`). Which area is on screen is asked of the pins: the
// few nearest the map centre vote, by nearness, with the `area` the sweep
// gave them, which is exact where a bounding box is not (Strasbourg lies inside Germany's
// box, Salzburg inside Bavaria's). The chunk's box then only decides how
// far in the reader is: the chunk when its box fills a fair share of the
// view, else the country — a city view is its Land, a country view the
// country, and a deep link from a Land page (which fits that Land's box,
// with padding) the Land. Null when no pin is within reach of the centre
// (open sea, an unswept country), and the caller keeps the language-routed
// link the footer had before.
// `view` is [[w, s], [e, n]] as map.getBounds().toArray() gives it.
export const AREA_VOTERS = 7;
export const AREA_REACH_KM = 250;
const CHUNK_FILL = 0.25;

export function nearestAreas(features, lon, lat, k = AREA_VOTERS) {
  const best = [];   // ascending by km, at most k long
  for (const f of features ?? []) {
    if (!f.area || !Number.isFinite(f.lat) || !Number.isFinite(f.lon)) continue;
    const km = haversineKm(lat, lon, f.lat, f.lon);
    if (best.length === k && km >= best[k - 1].km) continue;
    let i = best.length;
    while (i > 0 && best[i - 1].km > km) i--;
    best.splice(i, 0, { area: f.area, km });
    if (best.length > k) best.pop();
  }
  return best;
}

export function pickArea(areas, features, center, view) {
  const rows = Array.isArray(areas) ? areas : [];
  if (!rows.length) return null;
  const near = nearestAreas(features, center[0], center[1]);
  if (!near.length || near[0].km > AREA_REACH_KM) return null;
  // Votes weighted by nearness (1 / km, softened): the nearest pin decides
  // unless a cluster across the border is about as close, and a lone border
  // pin is not outvoted by a city 200 km away. Ties go to the nearer pin,
  // which is first.
  const votes = new Map();
  for (const n of near) votes.set(n.area, (votes.get(n.area) ?? 0) + 1 / (n.km + 0.2));
  let winner = null, most = 0;
  for (const n of near) if (votes.get(n.area) > most) { winner = n.area; most = votes.get(n.area); }
  const chunk = rows.find((r) => r.area === winner) ?? null;
  const country = chunk
    ? rows.find((r) => r.href === chunk.parent) ?? null
    : rows.find((r) => Array.isArray(r.areas) && r.areas.includes(winner)) ?? null;
  if (!chunk) return country;
  if (!country) return chunk;
  const b = chunk.bbox;
  if (!view || !Array.isArray(b) || b.length !== 4) return country;
  const viewArea = (view[1][0] - view[0][0]) * (view[1][1] - view[0][1]);
  const overlap = Math.max(0, Math.min(b[2], view[1][0]) - Math.max(b[0], view[0][0]))
    * Math.max(0, Math.min(b[3], view[1][1]) - Math.max(b[1], view[0][1]));
  return viewArea > 0 && overlap / viewArea >= CHUNK_FILL ? chunk : country;
}

// The reading of an area for a UI language: the page itself when it is in
// that language or has no English twin (an English page, a US state), else
// the twin. A reader with the UI in Czech looking at Hamburg gets
// deutschland-en.html, not a German page they cannot read. The label is the
// target page's own h1, so the link says where it leads in the language it
// leads to.
export function areaLink(area, lang) {
  if (!area) return null;
  if (area.lang === lang || !area.en) return { href: area.href, label: area.label };
  return { href: area.en.href, label: area.en.label };
}

// pickArea's centre and view have to be what the reader can actually SEE, not
// the map canvas's own centre: the canvas extends underneath the (partly
// transparent) top bar, so on a phone the canvas centre sits a third of a
// screen further into the map than anything visible, and can name the wrong
// country outright. This is the pure geometry for that — no DOM, no MapLibre,
// so it is unit-testable without a map — used by updateRegionsLink in
// web/app.js. canvasSize is {width, height} in the CSS-pixel frame `unproject`
// takes points in (the map container's); coveredTop is the height of that
// frame the top bar hides, the same number web/app.js's positionZoomCtrl
// measures as topbar.offsetHeight; unproject is a (point: [x, y]) => {lng,
// lat} function, `map.unproject` on a live map. A coveredTop that isn't a
// finite positive number is nonsense and falls back to 0 — the pre-fix,
// whole-canvas centre — rather than guessing. One that reaches or exceeds
// the canvas's own height is clamped at half of it instead, the same limit
// fitHome and the card pan hold their own topbar height to: a bar that
// covers everything still leaves a visible bottom half to centre on, rather
// than snapping back to the whole canvas's centre as if nothing were
// covered at all.
export function visibleMapView(canvasSize, coveredTop, unproject) {
  const { width, height } = canvasSize ?? {};
  const top = Number.isFinite(coveredTop) && coveredTop > 0
    ? Math.min(coveredTop, height / 2) : 0;
  const cx = width / 2, cy = top + (height - top) / 2;
  const center = unproject([cx, cy]);
  const nw = unproject([0, top]);
  const se = unproject([width, height]);
  return { center: [center.lng, center.lat], bounds: [[nw.lng, se.lat], [se.lng, nw.lat]] };
}
