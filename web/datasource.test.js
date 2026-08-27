import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUSES, loadFeatures, loadPlaces, filterByStatus, filterFeatures,
         countsByStatus, countPlay, toFeatureCollection,
         placesToFeatureCollection, mapCompleteAddUrl, mapCompleteVenueUrl,
         mapCompleteLanguage, withMapCompleteLanguage,
         parseBbox } from "./datasource.js";

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
