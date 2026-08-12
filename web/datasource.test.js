import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUSES, loadFeatures, filterByStatus, countsByStatus, toFeatureCollection,
         mapCompleteAddUrl, osmEditUrl, parseBbox } from "./datasource.js";

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
      fee: null, opening_hours: null,
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
  assert.equal(mapCompleteAddUrl(9.993712, 53.551085, 15.7),
    "https://mapcomplete.org/theme.html?userlayout=" +
    "https://raw.githubusercontent.com/jakubwaller/papa-map/main/theme/papamap.theme.json" +
    "&z=16&lat=53.55109&lon=9.99371");
  assert.equal(osmEditUrl(9.993712, 53.551085, 18),
    "https://www.openstreetmap.org/edit#map=18/53.55109/9.99371");
  // A Germany-level zoom must not produce a country-level editor link.
  assert.ok(mapCompleteAddUrl(10, 51, 5.6).includes("&z=14&"));
  assert.ok(osmEditUrl(10, 51, 5.6).includes("#map=17/"));
});

test("toFeatureCollection carries only {idx, status} and idx survives the reorder", () => {
  const v = loadFeatures(FC);
  const out = toFeatureCollection(filterByStatus(v, ["unknown", "accessible"]));
  assert.equal(out.type, "FeatureCollection");
  for (const f of out.features) {
    assert.deepEqual(Object.keys(f.properties).sort(), ["idx", "status"]);
    const orig = v[f.properties.idx];  // the click-lookup the app does
    assert.equal(orig.status, f.properties.status);
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
