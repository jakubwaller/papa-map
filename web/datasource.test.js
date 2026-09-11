import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUSES, loadFeatures, loadPlaces, filterByStatus, filterFeatures,
         countsByStatus, countPlay, toFeatureCollection,
         placesToFeatureCollection, mapCompleteAddUrl, mapCompleteVenueUrl,
         mapCompleteLanguage, withMapCompleteLanguage,
         parseBbox, MODES, DEFAULT_MODE, pickMode, viewFor, BUCKET_COLOR,
         pinColorExpression, momCounts, usableStatuses, haversineKm,
         nearestUsable, formatDistance, geoUri, osmRef, osmApiUrl,
         osmElementFromApi, editOutcome, EDIT_TAGS, EDIT_CHECK_DELAYS } from "./datasource.js";

const feat = (lon, lat, props) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: props,
});

const FC = {
  type: "FeatureCollection",
  features: [
    feat(9.99, 53.55, {
      osm_type: "node", osm_id: 1, name: "Rathaus WC", amenity: "toilets",
      changing_table: "yes", location_raw: "unisex_toilet", status: "accessible",
      fee: "no", opening_hours: "24/7",
      osm_url: "https://www.openstreetmap.org/node/1",
      mapcomplete_url: "https://mapcomplete.org/toilets?z=18&lat=53.55&lon=9.99#node/1",
    }),
    feat(10.0, 53.56, {
      osm_type: "way", osm_id: 2, name: "Café Elbblick", amenity: "cafe",
      changing_table: "yes", location_raw: "female_toilet", status: "female_only",
      play: true, fee: null, opening_hours: null,
      osm_url: "https://www.openstreetmap.org/way/2", mapcomplete_url: null,
    }),
    feat(10.01, 53.57, {
      osm_type: "node", osm_id: 3, name: null, amenity: "toilets",
      changing_table: "limited", location_raw: null, status: "unknown",
      fee: null, opening_hours: null,
      osm_url: "https://www.openstreetmap.org/node/3",
      mapcomplete_url: "https://mapcomplete.org/toilets?z=18&lat=53.57&lon=10.01#node/3",
    }),
  ],
};

const PLACES_FC = {
  type: "FeatureCollection",
  features: [
    feat(9.98, 53.54, {
      osm_type: "node", osm_id: 9001, name: "Café Bauklotz", kind: "cafe",
      opening_hours: "Mo-Fr 09:00-18:00",
      osm_url: "https://www.openstreetmap.org/node/9001",
      mapcomplete_url: "https://mapcomplete.org/theme.html#node/9001",
    }),
    feat(10.02, 53.58, {
      osm_type: "way", osm_id: 9002, kind: "indoor_play",
      osm_url: "https://www.openstreetmap.org/way/9002",
    }),
    // no geometry at all — must not become a ring on the map
    { type: "Feature", geometry: null, properties: { osm_id: 9003 } },
  ],
};

test("loadPlaces flattens the prospects and skips undrawable ones", () => {
  const places = loadPlaces(PLACES_FC);
  assert.equal(places.length, 2);
  assert.deepEqual(places[0], {
    idx: 0, lon: 9.98, lat: 53.54, name: "Café Bauklotz", kind: "cafe",
    opening_hours: "Mo-Fr 09:00-18:00",
    osm_url: "https://www.openstreetmap.org/node/9001",
    mapcomplete_url: "https://mapcomplete.org/theme.html#node/9001",
  });
  // idx is the position in the returned array, so it still addresses the
  // right object after the geometry-less feature was dropped.
  assert.equal(places[1].idx, 1);
  assert.equal(places[1].name, null);
  assert.equal(places[1].mapcomplete_url, null);
});

test("loadPlaces carries no status — these places have no answer to colour", () => {
  for (const p of loadPlaces(PLACES_FC)) {
    assert.equal("status" in p, false);
    assert.equal("play" in p, false);
    assert.equal("changing_table" in p, false);
  }
});

test("loadPlaces tolerates a missing or malformed file", () => {
  assert.deepEqual(loadPlaces(null), []);
  assert.deepEqual(loadPlaces({}), []);
  assert.deepEqual(loadPlaces({ features: "nope" }), []);
});

test("placesToFeatureCollection carries only idx", () => {
  const out = placesToFeatureCollection(loadPlaces(PLACES_FC));
  assert.equal(out.type, "FeatureCollection");
  assert.deepEqual(out.features.map((f) => f.properties), [{ idx: 0 }, { idx: 1 }]);
  assert.deepEqual(out.features[0].geometry.coordinates, [9.98, 53.54]);
  assert.deepEqual(placesToFeatureCollection([]).features, []);
});

test("loadFeatures flattens coordinates and the contract properties", () => {
  const f = loadFeatures(FC)[0];
  assert.equal(f.lon, 9.99);
  assert.equal(f.lat, 53.55);
  assert.equal(f.name, "Rathaus WC");
  assert.equal(f.amenity, "toilets");
  assert.equal(f.changing_table, "yes");
  assert.equal(f.location_raw, "unisex_toilet");
  assert.equal(f.status, "accessible");
  assert.equal(f.osm_url, "https://www.openstreetmap.org/node/1");
});

test("loadFeatures assigns sequential idx", () => {
  assert.deepEqual(loadFeatures(FC).map((f) => f.idx), [0, 1, 2]);
});

test("loadFeatures tolerates a missing or malformed collection", () => {
  assert.deepEqual(loadFeatures(null), []);
  assert.deepEqual(loadFeatures(undefined), []);
  assert.deepEqual(loadFeatures({}), []);
  assert.deepEqual(loadFeatures({ type: "FeatureCollection", features: "nope" }), []);
});

test("loadFeatures skips features without a usable Point geometry", () => {
  const fc = { type: "FeatureCollection", features: [
    { type: "Feature", geometry: null, properties: { status: "unknown" } },
    { type: "Feature", geometry: { type: "LineString", coordinates: [[1, 2], [3, 4]] },
      properties: { status: "unknown" } },
    FC.features[0],
  ] };
  const v = loadFeatures(fc);
  assert.equal(v.length, 1);
  assert.equal(v[0].name, "Rathaus WC");
  assert.equal(v[0].idx, 0);
});

test("loadFeatures degrades an unrecognized or missing status to unknown", () => {
  const fc = { type: "FeatureCollection", features: [
    feat(9.9, 53.5, { status: "banana" }),
    feat(9.9, 53.5, {}),
  ] };
  assert.deepEqual(loadFeatures(fc).map((f) => f.status), ["unknown", "unknown"]);
});

test("filterByStatus keeps only statuses in the set (Set or array)", () => {
  const v = loadFeatures(FC);
  assert.deepEqual(filterByStatus(v, new Set(["accessible"])).map((f) => f.name), ["Rathaus WC"]);
  assert.deepEqual(filterByStatus(v, ["female_only", "unknown"]).map((f) => f.idx), [1, 2]);
  assert.deepEqual(filterByStatus(v, new Set()), []);
  assert.equal(filterByStatus(v, new Set(STATUSES)).length, 3);
});

test("countsByStatus counts per status with all keys present", () => {
  assert.deepEqual(countsByStatus(loadFeatures(FC)),
    { accessible: 1, female_only: 1, unknown: 1 });
});

test("countsByStatus of an empty list is all zeros", () => {
  assert.deepEqual(countsByStatus([]), { accessible: 0, female_only: 0, unknown: 0 });
});

test("play is strictly boolean — a dataset without the property has none", () => {
  const v = loadFeatures(FC);
  assert.deepEqual(v.map((f) => f.play), [false, true, false]);
  // pre-play GeoJSON, and every value that is not exactly true
  for (const p of [undefined, null, "yes", 1, "true", 0, ""])
    assert.equal(loadFeatures({ type: "FeatureCollection",
      features: [feat(9.9, 53.5, { status: "unknown", play: p })] })[0].play, false);
});

test("countPlay counts the play corners, never the statuses", () => {
  assert.equal(countPlay(loadFeatures(FC)), 1);
  assert.equal(countPlay([]), 0);
  // orthogonal to status: the three status counts still sum to the total
  const counts = countsByStatus(loadFeatures(FC));
  assert.equal(counts.accessible + counts.female_only + counts.unknown, 3);
});

test("filterFeatures narrows to play corners on top of the status filter", () => {
  const v = loadFeatures(FC);
  // off: identical to the plain status filter
  assert.deepEqual(filterFeatures(v, new Set(STATUSES)).map((f) => f.idx), [0, 1, 2]);
  assert.deepEqual(filterFeatures(v, new Set(STATUSES), false).map((f) => f.idx), [0, 1, 2]);
  // on: subtracts, and never adds back a status the user switched off
  assert.deepEqual(filterFeatures(v, new Set(STATUSES), true).map((f) => f.idx), [1]);
  assert.deepEqual(filterFeatures(v, new Set(["accessible"]), true), []);
  assert.deepEqual(filterFeatures(v, new Set(), true), []);
});

test("toFeatureCollection emits unknown last so grey pins draw on top", () => {
  const fc = { type: "FeatureCollection", features: [
    feat(1, 1, { status: "unknown" }),
    feat(2, 2, { status: "accessible" }),
    feat(3, 3, { status: "female_only" }),
  ] };
  const out = toFeatureCollection(loadFeatures(fc));
  assert.deepEqual(out.features.map((f) => f.properties.status),
    ["accessible", "female_only", "unknown"]);
});

test("add-place URLs carry the view, rounded, with a floor on the zoom", () => {
  const theme = "https://mapcomplete.org/theme.html?userlayout=" +
    "https://raw.githubusercontent.com/jakubwaller/papa-map/main/theme/papamap.theme.json";
  assert.equal(mapCompleteAddUrl(9.993712, 53.551085, 15.7),
    theme + "&z=16&lat=53.55109&lon=9.99371");
  // The venue layer starts at zoom 16, so its link never lands outside it.
  assert.equal(mapCompleteVenueUrl(9.993712, 53.551085, 15.7),
    theme + "&z=17&lat=53.55109&lon=9.99371");
  assert.equal(mapCompleteVenueUrl(9.993712, 53.551085, 18.2),
    theme + "&z=18&lat=53.55109&lon=9.99371");
  // A Germany-level zoom must not produce a country-level editor link.
  assert.ok(mapCompleteAddUrl(10, 51, 5.6).includes("&z=14&"));
  assert.ok(mapCompleteVenueUrl(10, 51, 5.6).includes("&z=17&"));
  // The site's language rides along where MapComplete has it, under its code.
  assert.ok(mapCompleteAddUrl(10, 51, 14, "de").endsWith("&language=de"));
  assert.ok(mapCompleteVenueUrl(10, 51, 17, "no").endsWith("&language=nb_NO"));
  assert.ok(!mapCompleteAddUrl(10, 51, 14, "bs").includes("language="));
});

test("MapComplete language: only codes it has, and the fragment stays last", () => {
  assert.equal(mapCompleteLanguage("da"), "da");
  assert.equal(mapCompleteLanguage("no"), "nb_NO");
  assert.equal(mapCompleteLanguage("lv"), null);
  assert.equal(mapCompleteLanguage(undefined), null);
  const deep = "https://mapcomplete.org/theme.html?userlayout=x&z=18&lat=1&lon=2#node/5";
  assert.equal(withMapCompleteLanguage(deep, "fr"),
    "https://mapcomplete.org/theme.html?userlayout=x&z=18&lat=1&lon=2&language=fr#node/5");
  assert.equal(withMapCompleteLanguage(deep, "mk"), deep);
  assert.equal(withMapCompleteLanguage("https://mapcomplete.org/theme.html?a=1", "en"),
    "https://mapcomplete.org/theme.html?a=1&language=en");
  assert.equal(withMapCompleteLanguage(null, "en"), null);
});

test("toFeatureCollection carries only {idx, status, play} and idx survives the reorder", () => {
  const v = loadFeatures(FC);
  const out = toFeatureCollection(filterByStatus(v, ["unknown", "accessible"]));
  assert.equal(out.type, "FeatureCollection");
  for (const f of out.features) {
    assert.deepEqual(Object.keys(f.properties).sort(), ["idx", "play", "status"]);
    const orig = v[f.properties.idx];  // the click-lookup the app does
    assert.equal(orig.status, f.properties.status);
    assert.equal(orig.play, f.properties.play);   // drives the halo layer filter
    assert.deepEqual(f.geometry.coordinates, [orig.lon, orig.lat]);
  }
});

test("parseBbox accepts a Bundesland page's box and rejects anything unusable", () => {
  // What pipeline/pages.py writes into the "auf der Karte öffnen" link.
  assert.deepEqual(parseBbox("8.4,53.0,9.0,53.6"), [[8.4, 53.0], [9.0, 53.6]]);
  assert.deepEqual(parseBbox("-1.5,-2.5,1.5,2.5"), [[-1.5, -2.5], [1.5, 2.5]]);
  // Everything below must fall back to the home view rather than reach
  // fitBounds: a NaN or inverted box leaves a camera the user can't recover.
  for (const bad of [null, undefined, "", "8.4,53.0,9.0", "8.4,53.0,9.0,53.6,1",
                     "a,b,c,d", "8.4,53.0,,53.6", "9.0,53.0,8.4,53.6",
                     "8.4,53.6,9.0,53.0", "8.4,53.0,8.4,53.6", "-181,53,9,53.6",
                     "8.4,-91,9,53.6", "8.4,53,181,53.6", "8.4,53,9,91",
                     "Infinity,53,9,53.6"])
    assert.equal(parseBbox(bad), null, `expected null for ${JSON.stringify(bad)}`);
});

// ---- Papa/Mama: the second reading ----

test("papa mode is exactly what the map rendered before the toggle existed", () => {
  // The guard against the whole feature: if these three rows ever change, a
  // father's map has silently changed meaning. Colours are the STATUS_COLOR
  // values app.js carried; classes are its STATUS_META ones.
  assert.equal(BUCKET_COLOR[viewFor("accessible", "papa").bucket], "#009e73");
  assert.equal(BUCKET_COLOR[viewFor("female_only", "papa").bucket], "#d55e00");
  assert.equal(BUCKET_COLOR[viewFor("unknown", "papa").bucket], "#3d4247");
  assert.equal(viewFor("accessible", "papa").cls, "ok");
  assert.equal(viewFor("female_only", "papa").cls, "bad");
  assert.equal(viewFor("unknown", "papa").cls, "ask");
});

test("mama mode reads both rooms as usable and the unrecorded one as maybe", () => {
  // The point of the feature: a women's-room table stops being the red pin
  // it is for a father. It must NOT go the other way — accessible stays good.
  assert.equal(viewFor("female_only", "mama").bucket, "good");
  assert.equal(viewFor("accessible", "mama").bucket, "good");
  assert.equal(viewFor("unknown", "mama").bucket, "maybe");
  assert.notEqual(BUCKET_COLOR.maybe, BUCKET_COLOR.ask);   // orange, not grey
});

test("every mode/status pair resolves, and junk degrades to the papa reading", () => {
  for (const mode of MODES)
    for (const status of STATUSES) {
      const v = viewFor(status, mode);
      assert.ok(BUCKET_COLOR[v.bucket], `${mode}/${status} has no bucket colour`);
      assert.ok(v.labelKey && v.metaKey && v.cls);
    }
  // A hand-typed ?mode=papi, or a status this build predates, must still
  // render a map rather than throw on the first pin.
  assert.deepEqual(viewFor("accessible", "papi"), viewFor("accessible", "papa"));
  assert.deepEqual(viewFor("nonsense", "mama"), viewFor("unknown", "papa"));
  assert.deepEqual(viewFor(undefined, undefined), viewFor("unknown", "papa"));
});

test("the mama reading never invents a status the pipeline does not emit", () => {
  // CONTRACT.md: classification lives only in Python. The view may recolour
  // the three values, never add a fourth or consult an OSM tag.
  const rows = STATUSES.map((s) => viewFor(s, "mama"));
  assert.equal(rows.length, STATUSES.length);
  for (const r of rows) assert.ok(["good", "bad", "ask", "maybe"].includes(r.bucket));
});

test("pickMode: query beats stored beats the default", () => {
  assert.equal(pickMode("mama", "papa"), "mama");
  assert.equal(pickMode(null, "mama"), "mama");
  assert.equal(pickMode(null, null), DEFAULT_MODE);
  assert.equal(DEFAULT_MODE, "papa");   // today's rendering stays the default
  // Anything unrecognised falls through rather than ending the search.
  assert.equal(pickMode("papi", "mama"), "mama");
  assert.equal(pickMode("", ""), DEFAULT_MODE);
  assert.equal(pickMode(undefined, "nonsense"), DEFAULT_MODE);
});

test("pinColorExpression is a MapLibre match over the three statuses", () => {
  const expr = pinColorExpression("mama");
  assert.deepEqual(expr.slice(0, 2), ["match", ["get", "status"]]);
  // accessible and female_only both green in mama mode, unknown orange.
  assert.equal(expr[3], BUCKET_COLOR.good);
  assert.equal(expr[5], BUCKET_COLOR.good);
  assert.equal(expr[6], BUCKET_COLOR.maybe);
  // Papa keeps the three distinct colours it always had.
  const papa = pinColorExpression("papa");
  assert.equal(papa[3], BUCKET_COLOR.good);
  assert.equal(papa[5], BUCKET_COLOR.bad);
  assert.equal(papa[6], BUCKET_COLOR.ask);
});

test("momCounts adds the two rooms and keeps the unrecorded ones apart", () => {
  assert.deepEqual(momCounts({ accessible: 2, female_only: 3, unknown: 9 }),
                   { good: 5, maybe: 9 });
  // stats.json may be missing, or missing a key: the sentence renders zeros
  // rather than NaN, the way the papa sentence already degrades.
  assert.deepEqual(momCounts({}), { good: 0, maybe: 0 });
  assert.deepEqual(momCounts(), { good: 0, maybe: 0 });
  assert.deepEqual(momCounts({ accessible: 4 }), { good: 4, maybe: 0 });
});

// ---- Nearest usable table ----

test("usable means what the reading already calls good, nothing new", () => {
  // A father can only use the open room. A mother can use both — and the
  // difference is read out of VIEW, not written down a second time here.
  assert.deepEqual(usableStatuses("papa"), ["accessible"]);
  assert.deepEqual(usableStatuses("mama"), ["accessible", "female_only"]);
  // Junk degrades to the father's reading, like every other mode lookup.
  assert.deepEqual(usableStatuses("nonsense"), ["accessible"]);
  // "unknown" is never usable in either reading: nobody has recorded the room,
  // so sending a parent there is a guess dressed up as an answer.
  for (const m of MODES) assert.ok(!usableStatuses(m).includes("unknown"));
});

test("haversineKm measures a known distance", () => {
  // Hamburg Rathaus → Hamburg Hbf, ~1.2 km apart.
  const km = haversineKm(53.5503, 9.9920, 53.5528, 10.0067);
  assert.ok(km > 0.9 && km < 1.3, `got ${km}`);
  // Symmetric, zero on itself, and no NaN from asin's domain edge.
  assert.equal(haversineKm(53.55, 9.99, 53.55, 9.99), 0);
  assert.equal(haversineKm(1, 2, 3, 4).toFixed(9),
               haversineKm(3, 4, 1, 2).toFixed(9));
});

test("nearestUsable picks by mode, not by proximity alone", () => {
  const rows = [
    { id: "near-red", status: "female_only", lat: 53.5503, lon: 9.9920 },
    { id: "far-green", status: "accessible", lat: 53.5528, lon: 10.0067 },
    { id: "near-grey", status: "unknown", lat: 53.5504, lon: 9.9921 },
  ];
  // The closest pin is the women's room. A father is sent past it to the one
  // he can actually walk into — this is the whole point of the feature.
  assert.equal(nearestUsable(rows, 53.5503, 9.9920, "papa").feature.id, "far-green");
  // A mother is sent to the near one, because for her it is a usable table.
  assert.equal(nearestUsable(rows, 53.5503, 9.9920, "mama").feature.id, "near-red");
  assert.ok(nearestUsable(rows, 53.5503, 9.9920, "papa").km > 0.9);
});

test("nearestUsable degrades instead of throwing", () => {
  assert.equal(nearestUsable([], 53.55, 9.99, "papa"), null);
  // Only grey pins in range: no answer is the honest answer.
  assert.equal(nearestUsable([{ status: "unknown", lat: 53.55, lon: 9.99 }],
                             53.55, 9.99, "papa"), null);
  // A feature with no usable coordinates is skipped, not ranked as distance 0
  // or NaN — a NaN would sort first and fly the map to nowhere.
  const rows = [{ id: "broken", status: "accessible", lat: null, lon: 9.99 },
                { id: "real", status: "accessible", lat: 53.60, lon: 9.99 }];
  assert.equal(nearestUsable(rows, 53.55, 9.99, "papa").feature.id, "real");
  // A geolocation fix that arrived without coordinates finds nothing rather
  // than picking whichever pin NaN happens to compare against.
  assert.equal(nearestUsable(rows, NaN, 9.99, "papa"), null);
});

test("formatDistance rounds to what a phone fix can actually claim", () => {
  assert.deepEqual(formatDistance(0.437), { key: "distM", n: 440 });
  assert.deepEqual(formatDistance(0.004), { key: "distM", n: 0 });
  // 999 m rounds up to a full kilometre, so it must switch units rather than
  // render "1000 m" — the unit is chosen after the rounding, not before.
  assert.deepEqual(formatDistance(0.999), { key: "distKm", n: 1 });
  assert.deepEqual(formatDistance(0.994), { key: "distM", n: 990 });
  assert.deepEqual(formatDistance(1), { key: "distKm", n: 1 });
  assert.deepEqual(formatDistance(3.47), { key: "distKm", n: 3.5 });
  // The number stays a number: the caller renders it in the reader's locale,
  // so a German sees "3,5 km" and not "3.5 km".
  assert.equal(typeof formatDistance(3.47).n, "number");
});

test("geoUri carries the point and escapes the label", () => {
  assert.equal(geoUri(53.5503, 9.992), "geo:53.550300,9.992000?q=53.550300,9.992000");
  // A venue name is a free-text OSM field. It goes through encodeURIComponent
  // so a name with a space, an ampersand or a parenthesis cannot break out of
  // the q= parameter and turn into a different destination.
  assert.equal(geoUri(1, 2, "Café A&B (Nord)"),
    "geo:1.000000,2.000000?q=1.000000,2.000000(Caf%C3%A9%20A%26B%20(Nord))");
  // Six decimals is ~11 cm — plenty for a doorway, and it never emits
  // exponent notation the way a raw float can.
  assert.ok(!geoUri(0.0000001, 0.0000001).includes("e-"));
});

// ---- Edit confirmation ----

test("osmRef reads the pipeline's osm_url and nothing else", () => {
  assert.deepEqual(osmRef("https://www.openstreetmap.org/node/123"), { type: "node", id: "123" });
  assert.deepEqual(osmRef("https://www.openstreetmap.org/way/2"), { type: "way", id: "2" });
  assert.deepEqual(osmRef("https://www.openstreetmap.org/relation/99"), { type: "relation", id: "99" });
  assert.equal(osmRef(null), null);
  assert.equal(osmRef(""), null);
  assert.equal(osmRef("https://www.openstreetmap.org/node/abc"), null);
  assert.equal(osmRef("https://www.openstreetmap.org/node/1/history"), null);
  // Only the site's own URL shape: never build an API call from a foreign host.
  assert.equal(osmRef("https://evil.example/openstreetmap.org/node/1"), null);
  assert.equal(osmRef("http://www.openstreetmap.org/node/1"), null);
});

test("osmApiUrl is the single-object JSON read", () => {
  assert.equal(osmApiUrl({ type: "node", id: "123" }),
    "https://api.openstreetmap.org/api/0.6/node/123.json");
  assert.equal(osmApiUrl(osmRef("https://www.openstreetmap.org/way/2")),
    "https://api.openstreetmap.org/api/0.6/way/2.json");
});

test("osmElementFromApi unwraps the API's envelope and rejects the rest", () => {
  const json = { version: 0.6, elements: [{ type: "node", id: 1, version: 7,
    tags: { amenity: "toilets", changing_table: "yes" } }] };
  assert.deepEqual(osmElementFromApi(json),
    { version: 7, tags: { amenity: "toilets", changing_table: "yes" } });
  // A node with no tags at all still has a version.
  assert.deepEqual(osmElementFromApi({ elements: [{ id: 1, version: 2 }] }),
    { version: 2, tags: {} });
  assert.equal(osmElementFromApi({ elements: [] }), null);
  assert.equal(osmElementFromApi({}), null);
  assert.equal(osmElementFromApi(null), null);
  assert.equal(osmElementFromApi({ elements: [{ id: 1 }] }), null);
});

test("editOutcome: nothing to say while the API is unreachable or the version stands", () => {
  const before = { version: 3, tags: { changing_table: "yes" } };
  assert.equal(editOutcome(before, null), null);
  assert.deepEqual(editOutcome(before, { version: 3, tags: { changing_table: "yes" } }),
    { changed: false, tags: null });
  // A lower version cannot happen, but must not read as an edit either.
  assert.deepEqual(editOutcome(before, { version: 2, tags: {} }), { changed: false, tags: null });
  // Without a baseline version there is nothing to compare against.
  assert.deepEqual(editOutcome(null, { version: 4, tags: {} }), { changed: false, tags: null });
  assert.deepEqual(editOutcome({ version: null, tags: {} }, { version: 4, tags: {} }),
    { changed: false, tags: null });
  // A deletion is no verdict either without a baseline.
  assert.deepEqual(editOutcome(null, { gone: true }), { changed: false, tags: null });
});

test("editOutcome quotes the changing-table tags when the edit touched them", () => {
  const before = { version: 3, tags: { amenity: "toilets", changing_table: "yes" } };
  const after = { version: 4, tags: { amenity: "toilets", changing_table: "yes",
    "changing_table:location": "unisex_toilet" } };
  assert.deepEqual(editOutcome(before, after),
    { changed: true, tags: { changing_table: "yes", "changing_table:location": "unisex_toilet" } });
  // A prospect (no changing_table before) that just got one.
  assert.deepEqual(editOutcome({ version: 1, tags: { amenity: "cafe" } },
    { version: 2, tags: { amenity: "cafe", changing_table: "yes" } }),
    { changed: true, tags: { changing_table: "yes" } });
  // Displayed verbatim, whatever the value — "no" and "female_toilet" included.
  assert.deepEqual(editOutcome(before,
    { version: 4, tags: { changing_table: "no", "changing_table:location": "female_toilet" } }),
    { changed: true, tags: { changing_table: "no", "changing_table:location": "female_toilet" } });
});

test("editOutcome does not quote tags the edit left alone", () => {
  const before = { version: 3, tags: { changing_table: "yes", "changing_table:location": "room" } };
  // Opening hours changed, the table tags did not: an edit, but not "your answer".
  assert.deepEqual(editOutcome(before,
    { version: 4, tags: { changing_table: "yes", "changing_table:location": "room", opening_hours: "24/7" } }),
    { changed: true, tags: null });
  // Both table tags removed: an edit with nothing left to quote.
  assert.deepEqual(editOutcome(before, { version: 4, tags: { amenity: "toilets" } }),
    { changed: true, tags: null });
  // Deleted object.
  assert.deepEqual(editOutcome(before, { gone: true }), { changed: true, tags: null });
});

test("the edit check names only the two table tags and stops within five minutes", () => {
  assert.deepEqual(EDIT_TAGS, ["changing_table", "changing_table:location"]);
  assert.equal(EDIT_CHECK_DELAYS[0], 0);
  for (let i = 1; i < EDIT_CHECK_DELAYS.length; i++)
    assert.ok(EDIT_CHECK_DELAYS[i] > EDIT_CHECK_DELAYS[i - 1], "ascending");
  assert.ok(EDIT_CHECK_DELAYS.at(-1) <= 5 * 60 * 1000);
});
