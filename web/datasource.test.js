import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STATUSES, loadFeatures, loadPlaces, filterByStatus, filterFeatures,
         countsByStatus, countPlay, toFeatureCollection, WHEELCHAIR_STATES,
         chipKeys, chipView,
         isWheelchairOk, countWheelchair, pinFeatures, placeFeatures,
         placesToFeatureCollection, mapCompleteAddUrl, mapCompleteVenueUrl,
         mapCompleteLanguage, withMapCompleteLanguage,
         parseBbox, pickArea, areaLink, areaKeysFor, areaForLabel, nearestAreas, visibleMapView, MODES, DEFAULT_MODE, pickMode, pickWheelchair, viewFor, BUCKET_COLOR,
         pinColorExpression, viewOf, momCounts, localAnswered, usableStatuses, haversineKm,
         nearestUsable, formatDistance, geoUri, webRouteHref, webRouteChoices, PAPAMAP_THEME_URL, osmRef, osmApiUrl,
         osmElementFromApi, editOutcome, EDIT_TAGS, TABLE_TAGS, PLAY_TAGS,
         EDIT_TAG_LABEL, editTagLines, printableTableValue, printableEditTagLines,
         EDIT_CHECK_DELAYS, shareUrl, parseShareOsm, withoutOsmParam, ROOM_CARD_RADIUS_KM,
         nearestUnknownRoom, isFixFresh, popupPan, isAppleTouch,
         shouldOpenAtLocation, mergeFeatureCollection, isDeltaFresh,
         applyAnswerOverrides, pruneAnswerOverrides, resolveDataUrl,
         isNewlyCreated, selectAddedPlace } from "./datasource.js";
import { STRINGS, LANGS } from "./i18n.js";

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
    // answered, and the answer was no (v27): a place, not a pin
    feat(10.03, 53.59, {
      osm_type: "node", osm_id: 9004, kind: "cafe", changing_table: "no",
      osm_url: "https://www.openstreetmap.org/node/9004",
    }),
    // no geometry at all — must not become a ring on the map
    { type: "Feature", geometry: null, properties: { osm_id: 9003 } },
  ],
};

test("loadPlaces flattens the prospects and skips undrawable ones", () => {
  const places = loadPlaces(PLACES_FC);
  assert.equal(places.length, 3);
  assert.deepEqual(places[0], {
    idx: 0, lon: 9.98, lat: 53.54, name: "Café Bauklotz", kind: "cafe", changing_table: null,
    wheelchair: null, toilets_wheelchair: null, wheelchair_description: null,
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

test("loadPlaces reads changing_table=no and nothing else as an answer", () => {
  const places = loadPlaces(PLACES_FC);
  assert.equal(places[0].changing_table, null);   // the open question
  assert.equal(places[2].changing_table, "no");   // answered: no table
  // A yes would be a pin, junk is junk: neither may render as an answer.
  for (const v of ["yes", "limited", "02", "", true, 0]) {
    const [p] = loadPlaces({ features: [feat(1, 2, { changing_table: v })] });
    assert.equal(p.changing_table, null, `value ${JSON.stringify(v)}`);
  }
});

test("play places narrow under the wheelchair chip by the tables' rule", () => {
  const places = loadPlaces({ features: [
    feat(1, 1, { wheelchair: "yes", toilets_wheelchair: "no", wheelchair_description: "Aufzug" }),
    feat(2, 2, { wheelchair: "limited" }),
    feat(3, 3, { toilets_wheelchair: "yes" }),
    feat(4, 4, { wheelchair: "YES" }),
    feat(5, 5, {}),
  ] });
  assert.deepEqual(places.map((p) => p.wheelchair), ["yes", "limited", null, null, null]);
  assert.equal(places[0].toilets_wheelchair, "no");
  assert.equal(places[0].wheelchair_description, "Aufzug");
  // off: every place; on: wheelchair=yes and nothing else
  assert.equal(placeFeatures(places).length, 5);
  assert.deepEqual(placeFeatures(places, true).map((p) => p.idx), [0]);
  // a dataset from before v28 has no tag on any place, so the chip shows none
  assert.deepEqual(placeFeatures(loadPlaces(PLACES_FC), true), []);
});

test("loadPlaces carries no status — these places have no answer to colour", () => {
  for (const p of loadPlaces(PLACES_FC)) {
    assert.equal("status" in p, false);
    assert.equal("play" in p, false);
  }
});

test("loadPlaces tolerates a missing or malformed file", () => {
  assert.deepEqual(loadPlaces(null), []);
  assert.deepEqual(loadPlaces({}), []);
  assert.deepEqual(loadPlaces({ features: "nope" }), []);
});

test("placesToFeatureCollection carries idx and the no flag", () => {
  const out = placesToFeatureCollection(loadPlaces(PLACES_FC));
  assert.equal(out.type, "FeatureCollection");
  assert.deepEqual(out.features.map((f) => f.properties),
    [{ idx: 0, no: false }, { idx: 1, no: false }, { idx: 2, no: true }]);
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

test("play_recorded separates 'no play corner' from 'nobody has said'", () => {
  // v30: the popup asks the play question only where this is false. true is
  // both an answered yes (the ring) and an answered no (no ring, no question
  // — the reader already said so and must not be asked on every visit).
  const one = (play) => loadFeatures({ type: "FeatureCollection",
    features: [feat(9.9, 53.5, { status: "unknown", play })] })[0];
  assert.equal(one(true).play_recorded, true);
  assert.equal(one(false).play_recorded, true);
  assert.equal(one(null).play_recorded, false);
  assert.equal(one(undefined).play_recorded, false);
  // A dataset from before v30 wrote false for every pin without a corner, so
  // it reads as answered: the question waits for the next build rather than
  // appearing on a pin whose reader has already answered it.
  assert.equal(one(false).play, false);
  // Junk is not an answer either way — neither ring nor question.
  for (const p of ["no", 0, ""]) {
    assert.equal(one(p).play, false, String(p));
    assert.equal(one(p).play_recorded, false, String(p));
  }
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

test("wheelchair is a tri-state or null — never derived, never a status", () => {
  const load = (props) => loadFeatures({ type: "FeatureCollection",
    features: [feat(9.9, 53.5, { status: "unknown", ...props })] })[0];
  for (const v of WHEELCHAIR_STATES) assert.equal(load({ wheelchair: v }).wheelchair, v);
  // pre-v26 GeoJSON and junk both read as unrecorded, not as "no"
  for (const v of [undefined, null, "designated", true, 1, ""])
    assert.equal(load({ wheelchair: v }).wheelchair, null);
  assert.equal(load({ toilets_wheelchair: "yes" }).toilets_wheelchair, "yes");
  assert.equal(load({ toilets_wheelchair: "yes" }).wheelchair, null);
  assert.equal(load({ wheelchair_description: "eine Stufe" }).wheelchair_description, "eine Stufe");
  assert.equal(load({ wheelchair_description: 3 }).wheelchair_description, null);
  assert.equal(load({ key: "eurokey" }).key, "eurokey");
  for (const v of [undefined, null, "", 0]) assert.equal(load({ key: v }).key, null);
  // the status is whatever the pipeline said, whatever the wheelchair tags say
  assert.equal(load({ wheelchair: "no", status: "accessible" }).status, "accessible");
});

test("the wheelchair chip admits wheelchair=yes and nothing else", () => {
  assert.equal(isWheelchairOk({ wheelchair: "yes" }), true);
  assert.equal(isWheelchairOk({ wheelchair: "limited" }), false);
  assert.equal(isWheelchairOk({ wheelchair: "no" }), false);
  assert.equal(isWheelchairOk({ wheelchair: null }), false);
  // an accessible toilet at a place with a step at the door is not enough
  assert.equal(isWheelchairOk({ wheelchair: null, toilets_wheelchair: "yes" }), false);
  assert.equal(isWheelchairOk({ wheelchair: "limited", toilets_wheelchair: "yes" }), false);
  assert.equal(countWheelchair([{ wheelchair: "yes" }, { wheelchair: "yes", key: "eurokey" },
                                { wheelchair: "limited" }, {}]), 2);
});

test("keyed tables are hidden by default and come back only under the chip", () => {
  const fc = { type: "FeatureCollection", features: [
    feat(1, 1, { status: "accessible", wheelchair: "yes" }),
    feat(2, 2, { status: "accessible", wheelchair: "yes", key: "eurokey" }),
    feat(3, 3, { status: "unknown", wheelchair: "limited", key: "nks" }),
    feat(4, 4, { status: "unknown" }),
  ] };
  const v = loadFeatures(fc);
  // the default universe: every pin, no keyed table
  assert.deepEqual(pinFeatures(v).map((f) => f.idx), [0, 3]);
  assert.deepEqual(filterFeatures(v, new Set(STATUSES)).map((f) => f.idx), [0, 3]);
  // rows without the property at all (older callers, tests) are pins
  assert.equal(pinFeatures([{ status: "unknown" }]).length, 1);
  // under the chip: the rule alone decides, and the Euro-key table is back
  assert.deepEqual(pinFeatures(v, true).map((f) => f.idx), [0, 1]);
  assert.deepEqual(filterFeatures(v, new Set(STATUSES), false, true).map((f) => f.idx), [0, 1]);
  // a keyed table that fails the rule stays hidden either way
  assert.ok(!filterFeatures(v, new Set(STATUSES), false, true).some((f) => f.idx === 2));
  // the status toggles and the play filter still narrow on top
  assert.deepEqual(filterFeatures(v, new Set(["unknown"]), false, true), []);
  assert.deepEqual(filterFeatures(v, new Set(STATUSES), true, true), []);
  // the map source carries the key as a flag for the icon layer
  assert.deepEqual(toFeatureCollection(pinFeatures(v, true)).features.map((f) => f.properties.key),
    [false, true]);
});

test("nearestUsable skips keyed tables unless the chip is on, then obeys it", () => {
  const rows = [
    { id: "near-keyed", status: "accessible", wheelchair: "yes", key: "eurokey", lat: 53.5503, lon: 9.9920 },
    { id: "mid-step", status: "accessible", wheelchair: "limited", lat: 53.5510, lon: 9.9940 },
    { id: "far-level", status: "accessible", wheelchair: "yes", lat: 53.5528, lon: 10.0067 },
  ];
  assert.equal(nearestUsable(rows, 53.5503, 9.9920, "papa").feature.id, "mid-step");
  assert.equal(nearestUsable(rows, 53.5503, 9.9920, "papa", true).feature.id, "near-keyed");
  assert.equal(nearestUsable(rows.slice(1), 53.5503, 9.9920, "papa", true).feature.id, "far-level");
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

test("toFeatureCollection carries only {idx, status, men_only, play, key} and idx survives the reorder", () => {
  const v = loadFeatures(FC);
  const out = toFeatureCollection(filterByStatus(v, ["unknown", "accessible"]));
  assert.equal(out.type, "FeatureCollection");
  for (const f of out.features) {
    assert.deepEqual(Object.keys(f.properties).sort(), ["idx", "key", "men_only", "play", "status"]);
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

test("pickWheelchair: only a stored \"1\" turns the chip on", () => {
  assert.equal(pickWheelchair("1"), true);
  for (const v of [null, undefined, "", "0", "true", "yes", 1]) assert.equal(pickWheelchair(v), false);
});

// Just enough of MapLibre's expression language to run the pin colour against
// a feature's properties: the test checks what the map paints, not the tree.
function evalExpr(e, props) {
  if (!Array.isArray(e)) return e;
  const [op, ...a] = e;
  if (op === "get") return props[a[0]];
  if (op === "==") return evalExpr(a[0], props) === evalExpr(a[1], props);
  if (op === "all") return a.every((x) => evalExpr(x, props));
  if (op === "case") {
    for (let i = 0; i + 1 < a.length; i += 2) if (evalExpr(a[i], props)) return evalExpr(a[i + 1], props);
    return evalExpr(a[a.length - 1], props);
  }
  if (op === "match") {
    const v = evalExpr(a[0], props);
    for (let i = 1; i + 1 < a.length; i += 2) if (a[i] === v) return evalExpr(a[i + 1], props);
    return evalExpr(a[a.length - 1], props);
  }
  throw new Error(`unsupported op ${op}`);
}

test("pinColorExpression paints each status in each reading", () => {
  const paint = (mode, status, men_only = false) =>
    evalExpr(pinColorExpression(mode), { status, men_only });
  // accessible and female_only both green in mama mode, unknown orange.
  assert.equal(paint("mama", "accessible"), BUCKET_COLOR.good);
  assert.equal(paint("mama", "female_only"), BUCKET_COLOR.good);
  assert.equal(paint("mama", "unknown"), BUCKET_COLOR.maybe);
  // Papa keeps the three distinct colours it always had.
  assert.equal(paint("papa", "accessible"), BUCKET_COLOR.good);
  assert.equal(paint("papa", "female_only"), BUCKET_COLOR.bad);
  assert.equal(paint("papa", "unknown"), BUCKET_COLOR.ask);
});

test("pinColorExpression: the men's room alone is red for a mum, green for a dad (v50)", () => {
  const paint = (mode, props) => evalExpr(pinColorExpression(mode), props);
  assert.equal(paint("mama", { status: "accessible", men_only: true }), BUCKET_COLOR.bad);
  assert.equal(paint("papa", { status: "accessible", men_only: true }), BUCKET_COLOR.good);
  // A pre-v50 source has no men_only at all: today's green, not red.
  assert.equal(paint("mama", { status: "accessible" }), BUCKET_COLOR.good);
  // The papa expression stays the plain match it always was.
  assert.equal(pinColorExpression("papa")[0], "match");
});

test("viewFor / viewOf: men_only changes only the mama reading of accessible", () => {
  assert.equal(viewFor("accessible", "mama", true).bucket, "bad");
  assert.equal(viewFor("accessible", "mama", true).labelKey, "stMenOnlyMama");
  assert.deepEqual(viewFor("accessible", "papa", true), viewFor("accessible", "papa"));
  // Never on another status, and never under an unknown mode (papa fallback).
  assert.deepEqual(viewFor("unknown", "mama", true), viewFor("unknown", "mama"));
  assert.deepEqual(viewFor("accessible", "papi", true), viewFor("accessible", "papa"));
  assert.equal(viewOf({ status: "accessible", men_only: true }, "mama").bucket, "bad");
  assert.equal(viewOf({ status: "accessible" }, "mama").bucket, "good");
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

test("momCounts leaves the men's-room-only tables out of hers (v50)", () => {
  // men_only is a subset of accessible, so it is taken away, never added.
  assert.deepEqual(momCounts({ accessible: 10, female_only: 3, unknown: 9, men_only: 2 }),
                   { good: 11, maybe: 9 });
});

// statsLocal (renderStats, web/app.js) and "Mein PapaMap"'s percentage
// (web/me.js's answeredPercent) both call this, so the two can never read
// the local block two different ways — see CONTRACT.md v39.
test("localAnswered: tables partitions into known and unknown, the pipeline's own split (v24)", () => {
  assert.deepEqual(localAnswered({ ct_yes: 25, ct_limited: 2, accessible: 10, female_only: 3, unknown: 14 }),
    { tables: 27, unknown: 14, known: 13 });
  assert.deepEqual(localAnswered({}), { tables: 0, unknown: 0, known: 0 });
  assert.deepEqual(localAnswered(undefined), { tables: 0, unknown: 0, known: 0 });
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

test("the theme URL is the same one on both sides of the pipeline", () => {
  // MapComplete stamps this URL on every changeset made through the theme,
  // and "Mein PapaMap" counts a reader's answers by it (me.js). If the theme
  // moves and only one side follows, the count silently drops to the site's
  // own writes. export.py writes it as adjacent string literals.
  const py = readFileSync(new URL("../pipeline/export.py", import.meta.url), "utf8")
    .replace(/"\s*\n\s*"/g, "");
  assert.ok(py.includes(`"${PAPAMAP_THEME_URL}"`), "pipeline/export.py names a different theme URL");
});

const FIREFOX_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:142.0) Gecko/20100101 Firefox/142.0";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

test("isAppleTouch: an iPhone, and an iPad that calls itself a Mac", () => {
  assert.equal(isAppleTouch(SAFARI_IPHONE, 5), true);
  // iPadOS Safari sends a desktop Mac UA; only the touch points give it away.
  assert.equal(isAppleTouch(FIREFOX_MAC, 5), true);
  assert.equal(isAppleTouch(FIREFOX_MAC, 0), false);
  assert.equal(isAppleTouch("Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile", 5), false);
  assert.equal(isAppleTouch(), false);
});

test("webRouteHref: geo: only where something answers it", () => {
  const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36";
  // The reported case: a desktop has no geo: handler, the click did nothing.
  assert.deepEqual(webRouteHref(53.5503, 9.992, "Café", FIREFOX_MAC, 0), {
    href: "https://www.openstreetmap.org/directions?to=53.550300%2C9.992000", external: true });
  // An iPhone's browser cannot be asked for the default navigation app, so
  // the reader is: three universal links, never an app scheme (a dead link
  // from a web page where the app is missing).
  const ios = webRouteHref(53.5503, 9.992, "Café A&B", SAFARI_IPHONE, 5);
  assert.deepEqual(ios.choose, webRouteChoices(53.5503, 9.992, "Café A&B"));
  assert.deepEqual(ios.choose.map((c) => c.name), ["Google Maps", "Apple Maps", "Waze"]);
  assert.ok(ios.choose.every((c) => c.url.startsWith("https://")));
  // Never a provider's link before the reader chose one (Datenschutz).
  assert.equal(ios.href, "#");
  assert.equal(ios.external, false);
  assert.equal(ios.choose[0].url, "https://www.google.com/maps/dir/?api=1&destination=53.550300,9.992000");
  // q is only a label once ll names the place; alone it is a search.
  assert.equal(ios.choose[1].url,
    "https://maps.apple.com/?q=Caf%C3%A9%20A%26B&ll=53.550300,9.992000&daddr=53.550300,9.992000");
  assert.equal(webRouteChoices(1, 2, "")[1].url, "https://maps.apple.com/?ll=1.000000,2.000000&daddr=1.000000,2.000000");
  assert.equal(ios.choose[2].url, "https://waze.com/ul?ll=53.550300,9.992000&navigate=yes");
  assert.equal(webRouteHref(53.5503, 9.992, "Café", FIREFOX_MAC, 0).choose, undefined);
  assert.deepEqual(webRouteHref(53.5503, 9.992, "Café", CHROME_ANDROID, 5), {
    href: geoUri(53.5503, 9.992, "Café"), external: false });
  // An iPad asking for the desktop site calls itself a Mac; a Mac has no touch points.
  assert.equal(webRouteHref(1, 2, "", FIREFOX_MAC.replace("Firefox/142.0", "Safari/605"), 5).choose.length, 3);
  // No UA at all (a test, a bot): the link that works everywhere.
  assert.equal(webRouteHref(1, 2).external, true);
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

// ---- Share a pin ----

test("shareUrl builds the canonical host's link, always, whatever page built it", () => {
  const url = "https://www.openstreetmap.org/node/123";
  assert.equal(shareUrl(url), `https://papamap.de/?osm=${encodeURIComponent(url)}`);
  // Round-trips through the very parser that reads it back on load.
  assert.equal(parseShareOsm(new URL(shareUrl(url)).search), url);
});

test("parseShareOsm reads ?osm= and nothing else", () => {
  assert.equal(parseShareOsm("?osm=https%3A%2F%2Fwww.openstreetmap.org%2Fnode%2F1"),
    "https://www.openstreetmap.org/node/1");
  assert.equal(parseShareOsm("?lang=en"), null);
  assert.equal(parseShareOsm(""), null);
  // ?lang= and ?osm= coexist, as the feature requires.
  assert.equal(parseShareOsm("?lang=en&osm=https%3A%2F%2Fwww.openstreetmap.org%2Fnode%2F1"),
    "https://www.openstreetmap.org/node/1");
});

test("withoutOsmParam strips ?osm= once resolved, keeping every other param", () => {
  assert.equal(
    withoutOsmParam("https://papamap.de/?osm=https%3A%2F%2Fwww.openstreetmap.org%2Fnode%2F1"),
    "https://papamap.de/");
  // Other params survive, in place, whichever side of ?osm= they sat.
  assert.equal(
    withoutOsmParam("https://papamap.de/?lang=en&osm=https%3A%2F%2Fwww.openstreetmap.org%2Fnode%2F1&mode=mama"),
    "https://papamap.de/?lang=en&mode=mama");
  // Nothing to strip: null, not the URL echoed back, so the caller can skip
  // a no-op history.replaceState.
  assert.equal(withoutOsmParam("https://papamap.de/?lang=en"), null);
  assert.equal(withoutOsmParam("https://papamap.de/"), null);
});

// ---- Open at location ----

test("shouldOpenAtLocation: granted, no deep link — opens at the reader", () => {
  assert.equal(shouldOpenAtLocation({ search: "", permission: "granted" }), true);
  assert.equal(shouldOpenAtLocation({ search: "?lang=en", permission: "granted" }), true);
});

test("shouldOpenAtLocation: never without an already-granted permission", () => {
  assert.equal(shouldOpenAtLocation({ search: "", permission: "prompt" }), false);
  assert.equal(shouldOpenAtLocation({ search: "", permission: "denied" }), false);
  // A first-time visitor, or "Allow once": no Permissions API answer at all.
  assert.equal(shouldOpenAtLocation({ search: "", permission: null }), false);
  assert.equal(shouldOpenAtLocation({}), false);
});

test("shouldOpenAtLocation: a ?bbox= link asks for its own view", () => {
  assert.equal(
    shouldOpenAtLocation({ search: "?bbox=9,53,10,54", permission: "granted" }), false);
  // A malformed bbox is no view of its own (parseBbox returns null for it).
  assert.equal(
    shouldOpenAtLocation({ search: "?bbox=not-a-box", permission: "granted" }), true);
});

test("shouldOpenAtLocation: a ?osm= share link asks for its own pin", () => {
  assert.equal(
    shouldOpenAtLocation({
      search: `?osm=${encodeURIComponent("https://www.openstreetmap.org/node/1")}`,
      permission: "granted",
    }),
    false);
});

test("shouldOpenAtLocation: the app's own papamap://table deep link wins too", () => {
  assert.equal(
    shouldOpenAtLocation({ search: "", permission: "granted", hasPendingPin: true }), false);
});

test("shouldOpenAtLocation: a return from OSM's consent screen keeps the reader where they were", () => {
  assert.equal(
    shouldOpenAtLocation({ search: "?code=abc&state=xyz", permission: "granted" }), false);
  // Either alone is no OAuth return (state is required to match the PKCE
  // verifier; a bare ?code= or ?state= is nonsense, not a login).
  assert.equal(shouldOpenAtLocation({ search: "?code=abc", permission: "granted" }), true);
  assert.equal(shouldOpenAtLocation({ search: "?state=xyz", permission: "granted" }), true);
});

// ---- The "which room?" card ----

test("nearestUnknownRoom: only status unknown with no recorded room, within 75 m", () => {
  const rows = [
    // In range, but somebody already named its room: not this reader's to ask.
    { id: "answered", status: "unknown", location_raw: "female_toilet", lat: 53.5503, lon: 9.9921 },
    // In range and open — the one the card should surface.
    { id: "open-near", status: "unknown", location_raw: null, lat: 53.5504, lon: 9.9921 },
    // Open, but a green pin: nothing to ask.
    { id: "green", status: "accessible", location_raw: null, lat: 53.5503, lon: 9.9920 },
    // Open and unknown, but 200+ m away — outside ROOM_CARD_RADIUS_KM.
    { id: "far", status: "unknown", location_raw: null, lat: 53.552, lon: 9.995 },
  ];
  const hit = nearestUnknownRoom(rows, 53.5503, 9.9920);
  assert.equal(hit.feature.id, "open-near");
  assert.ok(hit.km <= ROOM_CARD_RADIUS_KM);
});

test("nearestUnknownRoom degrades instead of throwing, and ignores an empty-string room", () => {
  assert.equal(nearestUnknownRoom([], 53.55, 9.99), null);
  assert.equal(nearestUnknownRoom([{ status: "unknown", location_raw: null, lat: NaN, lon: 9.99 }],
    53.55, 9.99), null);
  assert.equal(nearestUnknownRoom([{ status: "unknown", location_raw: null, lat: 53.55, lon: 9.99 }],
    NaN, 9.99), null);
  // A dataset from before location_raw existed reads as unrecorded, not as
  // "somebody answered with nothing" — undefined must ask exactly like null.
  const hit = nearestUnknownRoom(
    [{ status: "unknown", lat: 53.5503, lon: 9.9920 }], 53.5503, 9.9920);
  assert.ok(hit);
});

test("nearestUnknownRoom respects nothing else: it is not pinFeatures", () => {
  // A keyed (central-key-locked) table is hidden from the map by default, but
  // the card asks about the place, not the view — the rule takes every
  // loaded feature, filters never apply here.
  const hit = nearestUnknownRoom(
    [{ status: "unknown", location_raw: null, key: "eurokey", lat: 53.5503, lon: 9.9920 }],
    53.5503, 9.9920);
  assert.ok(hit);
});

test("isFixFresh: good for 5 minutes, stale a moment past it", () => {
  const now = 1_000_000_000;
  assert.equal(isFixFresh(now, now), true);   // this instant
  assert.equal(isFixFresh(now - 4 * 60 * 1000, now), true);
  assert.equal(isFixFresh(now - 5 * 60 * 1000, now), true);   // exactly the edge
  assert.equal(isFixFresh(now - 5 * 60 * 1000 - 1, now), false);
  assert.equal(isFixFresh(now - 6 * 60 * 1000, now), false);
  // A malformed or missing timestamp reads as stale, not as fresh-by-default.
  assert.equal(isFixFresh(NaN, now), false);
  assert.equal(isFixFresh(undefined, now), false);
  assert.equal(isFixFresh(null, now), false);
});

// ---- Popup pan ----
// The numbers are the 375x667 phone the bug was measured on: topbar 218,
// control column from x=325, card 300 wide.
const BOX = { left: 8, top: 226, right: 367, bottom: 620 };
const COLUMN = { left: 317, top: 228, bottom: 422 };

test("popupPan: a card that fits moves nothing", () => {
  assert.deepEqual(popupPan({ left: 10, top: 300, right: 310, bottom: 500 }, BOX, COLUMN), [0, 0]);
});

test("popupPan: a card beside the control column stops at the column, not the canvas edge", () => {
  // The measured case: right edge 338 put the card's × under the zoom-out button.
  assert.deepEqual(popupPan({ left: 38, top: 278, right: 338, bottom: 621 }, BOX, COLUMN), [21, 1]);
  // Below the column's last button the full width is free again.
  assert.deepEqual(popupPan({ left: 60, top: 430, right: 360, bottom: 600 }, BOX, COLUMN), [0, 0]);
  // No column given: the old rule, canvas edge only.
  assert.deepEqual(popupPan({ left: 38, top: 278, right: 338, bottom: 600 }, BOX), [0, 0]);
});

test("popupPan: the column is judged where the card lands, not where it started", () => {
  // Starts below the column, overflows the foot by 200, and lands beside it.
  assert.deepEqual(popupPan({ left: 60, top: 430, right: 360, bottom: 820 }, BOX, COLUMN), [43, 200]);
});

test("popupPan: taller or wider than the space keeps the head and the left edge", () => {
  assert.deepEqual(popupPan({ left: 20, top: 100, right: 300, bottom: 700 }, BOX, COLUMN), [0, -126]);
  assert.deepEqual(popupPan({ left: 5, top: 300, right: 400, bottom: 500 }, BOX, COLUMN), [-3, 0]);
});

test("popupPan: the sign-pin above a pin close under the topbar slides out from behind it", () => {
  // Pin 14 px under the band's head: the card opens below it, the marker's
  // 45 px stand above it, 31 of them behind the topbar.
  const card = { left: 38, top: 254, right: 338, bottom: 504 }, marker = { top: 195, bottom: 240 };
  assert.deepEqual(popupPan(card, BOX, null, marker), [0, -31]);
  // Already clear of the topbar, or no marker at all: the card's own answer.
  assert.deepEqual(popupPan(card, BOX, null, { top: 230, bottom: 275 }), [0, 0]);
  assert.deepEqual(popupPan(card, BOX, null), [0, 0]);
});

test("popupPan: the sign-pin only gets the room the card leaves", () => {
  // 20 px under the card: the marker comes out by 20, not by its 31.
  assert.deepEqual(popupPan({ left: 38, top: 254, right: 338, bottom: 600 }, BOX, null, { top: 195, bottom: 240 }), [0, -20]);
  // A card that overflows the band gives nothing: the same pan as with no marker.
  const tall = { left: 38, top: 240, right: 338, bottom: 752 }, marker = { top: 181, bottom: 226 };
  assert.deepEqual(popupPan(tall, BOX, null, marker), popupPan(tall, BOX, null));
  assert.deepEqual(popupPan(tall, BOX, null, marker), [0, 14]);
});

test("popupPan: the column is judged after the sign-pin has moved the card", () => {
  // The marker's 45 px carry the card from beside a short column to below it.
  const column = { left: 317, top: 100, bottom: 250 };
  const card = { left: 38, top: 240, right: 338, bottom: 400 };
  assert.deepEqual(popupPan(card, BOX, column), [21, 0]);
  assert.deepEqual(popupPan(card, BOX, column, { top: 181, bottom: 226 }), [0, -45]);
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

test("the edit check names the tags this site can write and stops within five minutes", () => {
  // The two table tags, and since v30 the play-corner pair the popup's second
  // question writes. Nothing else: the confirmation quotes an edit back, so
  // every key here is one the reader was asked about.
  assert.deepEqual(TABLE_TAGS, ["changing_table", "changing_table:location"]);
  assert.deepEqual(PLAY_TAGS, ["kids_area", "kids_area:indoor"]);
  assert.deepEqual(EDIT_TAGS, [...TABLE_TAGS, ...PLAY_TAGS]);
  assert.equal(EDIT_CHECK_DELAYS[0], 0);
  for (let i = 1; i < EDIT_CHECK_DELAYS.length; i++)
    assert.ok(EDIT_CHECK_DELAYS[i] > EDIT_CHECK_DELAYS[i - 1], "ascending");
  assert.ok(EDIT_CHECK_DELAYS.at(-1) <= 5 * 60 * 1000);
});

test("\"changing table: yes\" prints nothing — every object here has one", () => {
  assert.equal(printableTableValue("yes"), null);
  // Real information: kept.
  assert.equal(printableTableValue("limited"), "limited");
  assert.equal(printableTableValue("no"), "no");
  // Absent: nothing to print either.
  assert.equal(printableTableValue(null), null);
  assert.equal(printableTableValue(undefined), null);
  assert.equal(printableTableValue(""), null);
});

test("the confirmation gives each play key its own line when the two disagree", () => {
  // The theme's outdoors-only pair. One label for both keys read as "Play
  // area: yes · Play area: no", which says nothing (issue #119).
  assert.deepEqual(editTagLines({ kids_area: "yes", "kids_area:indoor": "no" }),
    [["tagPlay", "yes"], ["tagPlayIndoor", "no"]]);
  // The site's own "indoors" answer writes yes to both, and that is one fact:
  // the sub-key's line is dropped, so the note stays "Play area: yes" as it
  // has read since v30.
  assert.deepEqual(editTagLines({ kids_area: "yes", "kids_area:indoor": "yes" }),
    [["tagPlay", "yes"]]);
  // "none", and a sub-key somebody set on its own.
  assert.deepEqual(editTagLines({ kids_area: "no" }), [["tagPlay", "no"]]);
  assert.deepEqual(editTagLines({ "kids_area:indoor": "yes" }), [["tagPlayIndoor", "yes"]]);
  // A disagreement the other way round is still two lines.
  assert.deepEqual(editTagLines({ kids_area: "no", "kids_area:indoor": "yes" }),
    [["tagPlay", "no"], ["tagPlayIndoor", "yes"]]);
  // The room answer is untouched, and EDIT_TAGS order is display order.
  assert.deepEqual(editTagLines({ "changing_table:location": "unisex_toilet", changing_table: "yes" }),
    [["popupTable", "yes"], ["popupRoom", "unisex_toilet"]]);
  // Values are verbatim — this file never interprets one.
  assert.deepEqual(editTagLines({ kids_area: "maybe" }), [["tagPlay", "maybe"]]);
  assert.deepEqual(editTagLines({}), []);
  assert.deepEqual(editTagLines(null), []);
});

test("printableEditTagLines drops the empty \"changing table: yes\" line editTagLines still reports", () => {
  // The bug this exists to close: the theme's standalone table question,
  // answered on a play place with no room, changes only changing_table=yes —
  // editTagLines still reports it (verbatim, as always), but nothing about
  // it is printable, and the caller needs to know that in one place rather
  // than asking twice and risking a different answer each time.
  assert.deepEqual(printableEditTagLines({ changing_table: "yes" }), []);
  // A room beside it: the room line stays, "yes" still drops.
  assert.deepEqual(printableEditTagLines({ changing_table: "yes", "changing_table:location": "unisex_toilet" }),
    [["popupRoom", "unisex_toilet"]]);
  // limited is real information and is never dropped.
  assert.deepEqual(printableEditTagLines({ changing_table: "limited" }), [["popupTable", "limited"]]);
  // A play answer with no table tag at all is untouched.
  assert.deepEqual(printableEditTagLines({ kids_area: "yes" }), [["tagPlay", "yes"]]);
  // Nothing changed, nothing printable.
  assert.deepEqual(printableEditTagLines({}), []);
  assert.deepEqual(printableEditTagLines(null), []);
});

test("every tag the confirmation prints has a label, in every language", () => {
  assert.deepEqual(Object.keys(EDIT_TAG_LABEL), EDIT_TAGS);
  // Two keys sharing a label is the bug the test above pins; nothing else may
  // reintroduce it.
  const labels = Object.values(EDIT_TAG_LABEL);
  assert.equal(new Set(labels).size, labels.length);
  for (const lang of LANGS)
    for (const key of labels)
      assert.ok(STRINGS[lang][key]?.trim(), `${lang}: ${key}`);
});

// ---- Footer area link follows the map view (17 Sep 2026) ----
const DE_EN = { href: "wickeltische/deutschland-en.html", label: "Changing tables in Germany" };
const AREAS = [
  { href: "wickeltische/", lang: "de", label: "Wickeltische in Deutschland", bbox: [5.5, 47.1, 15.4, 56.6],
    en: DE_EN, areas: ["Bayern", "Hamburg", "Schleswig-Holstein"] },
  { href: "wickeltische/hamburg.html", lang: "de", label: "Wickeltische in Hamburg", bbox: [8.4, 53.3, 10.4, 53.8],
    en: DE_EN, area: "Hamburg", parent: "wickeltische/" },
  { href: "wickeltische/schleswig-holstein.html", lang: "de", label: "Wickeltische in Schleswig-Holstein",
    bbox: [7.8, 53.3, 11.4, 55.1], en: DE_EN, area: "Schleswig-Holstein", parent: "wickeltische/" },
  { href: "wickeltische/bayern.html", lang: "de", label: "Wickeltische in Bayern", bbox: null,
    en: DE_EN, area: "Bayern", parent: "wickeltische/" },
  { href: "wickeltische/danmark.html", lang: "da", label: "Pusleborde i Danmark", bbox: [8.0, 54.5, 15.3, 57.8],
    en: { href: "wickeltische/danmark-en.html", label: "Changing tables in Denmark" }, areas: ["Danmark"] },
  { href: "wickeltische/france.html", lang: "fr", label: "Tables à langer en France", bbox: [-5, 41.3, 9.6, 51.1],
    en: { href: "wickeltische/france-en.html", label: "Changing tables in France" }, areas: ["Grand Est"] },
  { href: "wickeltische/grand-est.html", lang: "fr", label: "Tables à langer dans le Grand Est", bbox: [3.4, 47.4, 8.3, 50.2],
    en: { href: "wickeltische/france-en.html", label: "Changing tables in France" }, area: "Grand Est", parent: "wickeltische/france.html" },
  { href: "wickeltische/florida.html", lang: "en", label: "Changing tables in Florida", bbox: [-87.7, 24.4, -79.9, 31.1],
    area: "Florida", parent: "wickeltische/united-states.html" },
  { href: "wickeltische/united-kingdom.html", lang: "en", label: "Changing tables in the United Kingdom",
    bbox: [-8.7, 49.8, 1.8, 60.9], areas: ["United Kingdom"] },
];
const pin = (lon, lat, area) => ({ lon, lat, area, status: "unknown" });
const PINS = [
  pin(9.99, 53.55, "Hamburg"), pin(10.01, 53.56, "Hamburg"), pin(10.03, 53.54, "Hamburg"),
  pin(9.44, 54.79, "Schleswig-Holstein"),                    // Flensburg
  pin(12.57, 55.68, "Danmark"), pin(12.6, 55.7, "Danmark"),
  pin(7.75, 48.58, "Grand Est"), pin(7.74, 48.59, "Grand Est"),   // Strasbourg
  pin(7.85, 48.0, "Baden-Württemberg"),                      // Freiburg, no row
  pin(11.58, 48.14, "Bayern"),
  pin(-0.1, 51.5, "United Kingdom"),
  pin(-82.4, 28.0, "Florida"),
  pin(13.4, 52.5, null),                                     // a pin without an area never votes
];

test("nearestAreas returns the k nearest pins that carry an area, nearest first", () => {
  const near = nearestAreas(PINS, 10.0, 53.55, 3);
  assert.deepEqual(near.map((n) => n.area), ["Hamburg", "Hamburg", "Hamburg"]);
  assert.ok(near[0].km <= near[1].km && near[1].km <= near[2].km);
  assert.deepEqual(nearestAreas(PINS, 13.4, 52.5, 1).map((n) => n.area), ["Hamburg"]);  // the null pin is skipped
  assert.deepEqual(nearestAreas([], 10, 53), []);
  assert.deepEqual(nearestAreas(null, 10, 53), []);
});

test("pickArea asks the nearest pins which area is on screen, then the box how far in the reader is", () => {
  const at = (lon, lat, view) => pickArea(AREAS, PINS, [lon, lat], view)?.href ?? null;
  // Zoomed into Hamburg: the view lies inside Hamburg's box.
  assert.equal(at(10.0, 53.55, [[9.8, 53.45], [10.2, 53.65]]), "wickeltische/hamburg.html");
  // The Land page's own deep link fits its box with padding: still Hamburg.
  assert.equal(at(9.4, 53.55, [[8.2, 53.2], [10.6, 53.9]]), "wickeltische/hamburg.html");
  // Country zoom with Hamburg pins nearest the centre: the Land is a sliver
  // of the view, so the country.
  assert.equal(at(10.0, 53.55, [[6.0, 47.5], [15.0, 58.5]]), "wickeltische/");
  // Strasbourg lies inside Germany's box, but its pins say Grand Est.
  assert.equal(at(7.75, 48.58, [[7.7, 48.55], [7.8, 48.61]]), "wickeltische/grand-est.html");
  assert.equal(at(7.75, 48.58, [[2.0, 44.0], [12.0, 52.0]]), "wickeltische/france.html");
  // A Land whose row has no box (no feature last night) resolves to its country.
  assert.equal(at(11.58, 48.14, [[11.5, 48.1], [11.7, 48.2]]), "wickeltische/");
  // A pan north: Denmark, a country without chunks.
  assert.equal(at(12.6, 55.7, [[12.4, 55.6], [12.8, 55.8]]), "wickeltische/danmark.html");
  // Flensburg at the Danish border: its pin votes Schleswig-Holstein.
  assert.equal(at(9.44, 54.79, [[9.4, 54.77], [9.48, 54.81]]), "wickeltische/schleswig-holstein.html");
  // An area with no row at all (Baden-Württemberg here) is no answer.
  assert.equal(at(7.85, 48.0, [[7.8, 47.95], [7.9, 48.05]]), null);
  // A US state page is English and its own reading.
  assert.equal(at(-82.4, 28.0, [[-82.5, 27.9], [-82.3, 28.1]]), "wickeltische/florida.html");
  // Open sea beyond reach of any pin, or no index, or no pins: null.
  assert.equal(at(-30, 45, [[-31, 44], [-29, 46]]), null);
  assert.equal(pickArea(null, PINS, [10, 53.55], null), null);
  assert.equal(pickArea([], PINS, [10, 53.55], null), null);
  assert.equal(pickArea(AREAS, [], [10, 53.55], null), null);
  // No view yet: the country, never a chunk.
  assert.equal(at(10.0, 53.55, null), "wickeltische/");
});

test("pickArea weighs the voters by nearness, so a close cluster outvotes one nearer pin and a far city never does", () => {
  // Five Danish pins just over the border outvote the one nearer German pin...
  const pins = [pin(9.45, 54.80, "Schleswig-Holstein"),
                ...[1, 2, 3, 4, 5].map((i) => pin(9.45 + i * 0.01, 54.83, "Danmark"))];
  assert.equal(pickArea(AREAS, pins, [9.45, 54.81], [[9.4, 54.78], [9.6, 54.86]]).href, "wickeltische/danmark.html");
  // ...while Hamburg's three pins, 150 km off, do not outvote it.
  const far = [pins[0], ...[1, 2, 3].map((i) => pin(10.0 + i * 0.01, 53.55, "Hamburg"))];
  assert.equal(pickArea(AREAS, far, [9.45, 54.81], [[9.4, 54.78], [9.6, 54.86]]).href, "wickeltische/schleswig-holstein.html");
});

test("areaLink reads the page in the UI language, else its English twin", () => {
  const hh = AREAS[1];
  assert.deepEqual(areaLink(hh, "de"), { href: "wickeltische/hamburg.html", label: "Wickeltische in Hamburg" });
  assert.deepEqual(areaLink(hh, "en"), { href: "wickeltische/deutschland-en.html", label: "Changing tables in Germany" });
  assert.deepEqual(areaLink(hh, "cs"), { href: "wickeltische/deutschland-en.html", label: "Changing tables in Germany" });
  // An English page is its own English reading, for every UI language.
  assert.deepEqual(areaLink(AREAS.find((a) => a.area === "Florida"), "de"), { href: "wickeltische/florida.html", label: "Changing tables in Florida" });
  assert.equal(areaLink(null, "de"), null);
});

test("areaKeysFor: a chunk's own one area, a country's several, nothing for null", () => {
  const hh = AREAS[1], de = AREAS[0];
  assert.deepEqual(areaKeysFor(hh), new Set(["Hamburg"]));
  assert.deepEqual(areaKeysFor(de), new Set(["Bayern", "Hamburg", "Schleswig-Holstein"]));
  assert.deepEqual(areaKeysFor(null), new Set());
});

// ---- The count "Mein PapaMap" shows has to match exactly what the label names ----
// Live bug (19 Sep 2026, PR #147 hotfix, CONTRACT.md v40): an English reader
// over Hamburg saw "Changing tables in Germany: 31 % answered" — Hamburg's
// own number (131 tables) under the whole country's name, because
// areaLink's fallback for a chunk with no page in the reader's language
// points at the PARENT's twin while areaKeysFor(row) taken alone still
// named only the chunk.
test("areaForLabel: a German reader over a chunk gets the chunk's own label and keys", () => {
  const hh = AREAS.find((a) => a.href === "wickeltische/hamburg.html");
  assert.deepEqual(areaForLabel(hh, "de", AREAS),
    { label: "Wickeltische in Hamburg", keys: new Set(["Hamburg"]) });
});

test("areaForLabel: a reader whose language the chunk has no page in gets the PARENT's label AND its keys — never the chunk's own smaller ones under the country's name", () => {
  const hh = AREAS.find((a) => a.href === "wickeltische/hamburg.html");
  const result = areaForLabel(hh, "en", AREAS);
  assert.equal(result.label, "Changing tables in Germany");
  assert.deepEqual(result.keys, new Set(["Bayern", "Hamburg", "Schleswig-Holstein"]));
  // Any language the chunk has no page in falls back the same way.
  assert.deepEqual(areaForLabel(hh, "cs", AREAS).keys, new Set(["Bayern", "Hamburg", "Schleswig-Holstein"]));
});

test("areaForLabel: a French région, in French and in English, per what areas.json actually holds", () => {
  const grandEst = AREAS.find((a) => a.href === "wickeltische/grand-est.html");
  assert.deepEqual(areaForLabel(grandEst, "fr", AREAS),
    { label: "Tables à langer dans le Grand Est", keys: new Set(["Grand Est"]) });
  const enResult = areaForLabel(grandEst, "en", AREAS);
  assert.equal(enResult.label, "Changing tables in France");
  assert.deepEqual(enResult.keys, new Set(["Grand Est"]));   // this fixture's France row has only one région behind it
});

test("areaForLabel: an unchunked country never redirects to a 'parent' — there isn't one", () => {
  const dk = AREAS.find((a) => a.href === "wickeltische/danmark.html");
  assert.deepEqual(areaForLabel(dk, "da", AREAS), { label: "Pusleborde i Danmark", keys: new Set(["Danmark"]) });
  // A Czech reader gets the English twin's label, but it is still Denmark's
  // OWN twin (a country row's `en` never points at something bigger) — the
  // keys stay Denmark's.
  assert.deepEqual(areaForLabel(dk, "cs", AREAS),
    { label: "Changing tables in Denmark", keys: new Set(["Danmark"]) });
});

test("areaForLabel: a chunk with no twin of its own (a US state) never falls back, in any language", () => {
  const florida = AREAS.find((a) => a.area === "Florida");
  assert.deepEqual(areaForLabel(florida, "en", AREAS),
    { label: "Changing tables in Florida", keys: new Set(["Florida"]) });
  // No `en` field at all on this fixture row: areaLink has nothing to fall
  // back to, so a German reader still gets Florida's own (English) label —
  // untranslated, but the right area, matching CONTRACT.md v32.
  assert.deepEqual(areaForLabel(florida, "de", AREAS),
    { label: "Changing tables in Florida", keys: new Set(["Florida"]) });
});

test("areaForLabel: no row, or a parent that cannot be found, degrades rather than throwing", () => {
  assert.deepEqual(areaForLabel(null, "de", AREAS), { label: null, keys: new Set() });
  const orphan = { href: "wickeltische/orphan.html", lang: "xx", label: "Orphan",
                   en: { href: "wickeltische/parent-en.html", label: "Parent" },
                   area: "Orphan", parent: "wickeltische/does-not-exist.html" };
  // The row claims a parent, but no row in the index has that href: falls
  // back to the chunk's own area rather than an empty score.
  assert.deepEqual(areaForLabel(orphan, "en", AREAS), { label: "Parent", keys: new Set(["Orphan"]) });
});

// A fake unproject standing in for map.unproject: north is up (lat falls as
// the pixel y grows), and lng tracks x directly — enough to check the
// geometry without MapLibre.
const fakeUnproject = ([x, y]) => ({ lng: x, lat: -y });

test("visibleMapView with no covered top bar matches the canvas's own centre", () => {
  const { center, bounds } = visibleMapView({ width: 300, height: 600 }, 0, fakeUnproject);
  assert.deepEqual(center, [150, -300]);
  assert.deepEqual(bounds, [[0, -600], [300, -0]]);
});

test("visibleMapView with a top bar covering a third moves the centre down by a sixth of the height", () => {
  const { center } = visibleMapView({ width: 300, height: 600 }, 200, fakeUnproject);
  // No bar: centre at y=300 (lat -300). A 200px bar (a third of 600) pushes
  // the visible midpoint to y=400 (lat -400) — a sixth of 600 further south.
  assert.deepEqual(center, [150, -400]);
});

test("visibleMapView falls back to the canvas centre when the covered height is nonsense", () => {
  const plain = visibleMapView({ width: 300, height: 600 }, 0, fakeUnproject);
  for (const coveredTop of [-50, NaN, undefined, "a lot"]) {
    assert.deepEqual(
      visibleMapView({ width: 300, height: 600 }, coveredTop, fakeUnproject), plain,
      `coveredTop ${coveredTop}`);
  }
});

test("visibleMapView clamps a bar covering the whole canvas at half its height, not zero", () => {
  const half = visibleMapView({ width: 300, height: 600 }, 300, fakeUnproject);
  for (const coveredTop of [600, 700, 10000]) {
    assert.deepEqual(
      visibleMapView({ width: 300, height: 600 }, coveredTop, fakeUnproject), half,
      `coveredTop ${coveredTop}`);
  }
});

// ---- live updates ------------------------------------------------------

test("mergeFeatureCollection upserts and removes by osm_url", () => {
  const base = { type: "FeatureCollection", features: [
    feat(1, 1, { osm_url: "https://www.openstreetmap.org/node/1", status: "unknown" }),
    feat(2, 2, { osm_url: "https://www.openstreetmap.org/node/2", status: "accessible" }),
  ] };
  const upsert = [feat(1, 1, { osm_url: "https://www.openstreetmap.org/node/1", status: "accessible" }),
                 feat(3, 3, { osm_url: "https://www.openstreetmap.org/node/3", status: "female_only" })];
  const merged = mergeFeatureCollection(base, upsert, ["https://www.openstreetmap.org/node/2"]);
  const byUrl = Object.fromEntries(merged.features.map((f) => [f.properties.osm_url, f.properties.status]));
  assert.deepEqual(byUrl, {
    "https://www.openstreetmap.org/node/1": "accessible",
    "https://www.openstreetmap.org/node/3": "female_only",
  });
});

test("mergeFeatureCollection tolerates a missing/empty base", () => {
  const upsert = [feat(1, 1, { osm_url: "https://www.openstreetmap.org/node/1", status: "accessible" })];
  assert.equal(mergeFeatureCollection(null, upsert, []).features.length, 1);
  assert.equal(mergeFeatureCollection(undefined).features.length, 0);
});

test("isDeltaFresh rejects a delta older than the dataset it would sit on", () => {
  assert.equal(isDeltaFresh("2026-09-23T08:00:00+00:00", "2026-09-22T02:00:00+00:00"), true);
  assert.equal(isDeltaFresh("2026-09-21T08:00:00+00:00", "2026-09-22T02:00:00+00:00"), false);
  assert.equal(isDeltaFresh("2026-09-22T02:00:00+00:00", "2026-09-22T02:00:00+00:00"), true);
});

test("isDeltaFresh accepts any delta when the dataset has no base to compare", () => {
  assert.equal(isDeltaFresh("2026-09-23T08:00:00+00:00", null), true);
});

test("isDeltaFresh rejects a delta with no base of its own", () => {
  assert.equal(isDeltaFresh(null, "2026-09-22T02:00:00+00:00"), false);
});

test("resolveDataUrl prefixes the site origin only in the store app", () => {
  assert.equal(resolveDataUrl("data/delta.json", false, "https://papamap.de/"), "data/delta.json");
  assert.equal(resolveDataUrl("data/delta.json", true, "https://papamap.de/"),
    "https://papamap.de/data/delta.json");
});

test("applyAnswerOverrides recolours an existing table in place", () => {
  const fc = { type: "FeatureCollection", features: [
    feat(1, 1, { osm_url: "https://www.openstreetmap.org/node/1", status: "unknown",
                changing_table: "yes", location_raw: null }),
  ] };
  const places = { type: "FeatureCollection", features: [] };
  const overrides = { "https://www.openstreetmap.org/node/1":
    { status: "accessible", changing_table: "yes", location_raw: "male_toilet", t: "2026-09-23T10:00:00Z" } };
  const out = applyAnswerOverrides(fc, places, overrides);
  assert.equal(out.fc.features[0].properties.status, "accessible");
  assert.equal(out.fc.features[0].properties.location_raw, "male_toilet");
  assert.equal(out.places.features.length, 0);
});

test("applyAnswerOverrides promotes a play place to a table when the answer carries a status", () => {
  const fc = { type: "FeatureCollection", features: [] };
  const places = { type: "FeatureCollection", features: [
    feat(1, 1, { osm_url: "https://www.openstreetmap.org/node/9", kind: "cafe" }),
  ] };
  const overrides = { "https://www.openstreetmap.org/node/9":
    { status: "female_only", changing_table: "yes", location_raw: "female_toilet", t: "2026-09-23T10:00:00Z" } };
  const out = applyAnswerOverrides(fc, places, overrides);
  assert.equal(out.places.features.length, 0);
  assert.equal(out.fc.features.length, 1);
  assert.equal(out.fc.features[0].properties.status, "female_only");
});

test("applyAnswerOverrides keeps a no-status answer (e.g. play 'none') in places", () => {
  const fc = { type: "FeatureCollection", features: [] };
  const places = { type: "FeatureCollection", features: [
    feat(1, 1, { osm_url: "https://www.openstreetmap.org/node/9", kind: "cafe" }),
  ] };
  const overrides = { "https://www.openstreetmap.org/node/9":
    { status: null, changing_table: "no", location_raw: null, t: "2026-09-23T10:00:00Z" } };
  const out = applyAnswerOverrides(fc, places, overrides);
  assert.equal(out.fc.features.length, 0);
  assert.equal(out.places.features[0].properties.changing_table, "no");
});

test("applyAnswerOverrides ignores an override for an object neither collection has", () => {
  const fc = { type: "FeatureCollection", features: [] };
  const places = { type: "FeatureCollection", features: [] };
  const overrides = { "https://www.openstreetmap.org/node/404": { status: "accessible" } };
  const out = applyAnswerOverrides(fc, places, overrides);
  assert.equal(out.fc.features.length, 0);
  assert.equal(out.places.features.length, 0);
});

test("pruneAnswerOverrides drops an entry once the base dataset's data_base time covers it (secondary rule)", () => {
  const overrides = { a: { t: "2026-09-23T08:00:00Z" }, b: { t: "2026-09-23T12:00:00Z" } };
  const pruned = pruneAnswerOverrides(overrides, "2026-09-23T10:00:00Z", new Map());
  assert.deepEqual(Object.keys(pruned), ["b"]);
});

test("pruneAnswerOverrides drops an entry once a delta upsert's osm_version reaches the write's own version (primary rule)", () => {
  const overrides = { a: { t: "2026-09-23T08:00:00Z", version: 3 } };
  const pruned = pruneAnswerOverrides(overrides, null, new Map([["a", 3]]));
  assert.deepEqual(Object.keys(pruned), []);
});

test("pruneAnswerOverrides keeps an entry whose delta version has not caught up yet, even with a later edited_at-style clock", () => {
  // The exact bug the version-based rule fixes: a delta upsert can carry an
  // edit time later than the override's own client-clock `t` (OSM's
  // edited_at is set DURING the write, `t` only AFTER the round trip) while
  // still being an EARLIER version than the one this reader's write
  // produced — an in-between edit by someone else must not clear this
  // reader's own override.
  const overrides = { a: { t: "2026-09-23T08:00:00Z", version: 5 } };
  const pruned = pruneAnswerOverrides(overrides, null, new Map([["a", 4]]));
  assert.deepEqual(pruned, overrides);
});

test("pruneAnswerOverrides keeps an entry nothing has caught up with yet", () => {
  const overrides = { a: { t: "2026-09-23T08:00:00Z", version: 2 } };
  assert.deepEqual(pruneAnswerOverrides(overrides, "2026-09-23T07:00:00Z", new Map()), overrides);
});

// ---- the play-place thin path, end to end through the pure functions -------
// A room answered on a play place (not a grey table) promotes it to a
// coloured pin, the promotion survives a reload (the override is just a
// plain object — "reload" is re-running applyAnswerOverrides against it),
// and it is dropped once a dataset/delta whose own data covers the answer's
// edit time arrives — after which the object's real (now-promoted) table
// feature carries the colour on its own, with no override needed at all.
test("a play-place room answer promotes it, survives a reload, then is dropped once a newer build covers it", () => {
  const url = "https://www.openstreetmap.org/node/42";
  const basePlaces = { type: "FeatureCollection", features: [
    feat(9.99, 53.55, { osm_url: url, kind: "cafe" }),
  ] };
  const baseTables = { type: "FeatureCollection", features: [] };
  const overrides = { [url]: {
    status: "accessible", changing_table: "yes", location_raw: "male_toilet",
    t: "2026-09-23T10:00:00Z", version: 3,
  } };

  // 1. The answer promotes the play place to a coloured table pin.
  const answered = applyAnswerOverrides(baseTables, basePlaces, overrides);
  assert.equal(answered.places.features.length, 0);
  assert.equal(answered.fc.features.length, 1);
  assert.equal(answered.fc.features[0].properties.status, "accessible");
  assert.equal(answered.fc.features[0].properties.osm_url, url);

  // 2. A reload: the base dataset is loaded fresh (still just the play
  // place — no nightly build has run since the answer), and localStorage's
  // overrides object — a plain, JSON-round-tripped copy of the same data —
  // is re-applied on top of it. The promotion survives unchanged.
  const reloadedOverrides = JSON.parse(JSON.stringify(overrides));
  const afterReload = applyAnswerOverrides(baseTables, basePlaces, reloadedOverrides);
  assert.deepEqual(afterReload, answered);

  // 3. A dataset/delta lands whose own data covers the answer's edit time —
  // it now carries the object as a real, already-classified table feature
  // (the pipeline caught up), so the override is no longer needed and must
  // not shadow a status the pipeline might have revised in the meantime.
  const newerBaseTables = { type: "FeatureCollection", features: [
    feat(9.99, 53.55, { osm_url: url, status: "accessible", changing_table: "yes" }),
  ] };
  const newerBasePlaces = { type: "FeatureCollection", features: [] };
  const prunedByDataset = pruneAnswerOverrides(overrides, "2026-09-23T11:00:00+00:00", new Map());
  assert.deepEqual(prunedByDataset, {});
  const afterDatasetCatchUp = applyAnswerOverrides(newerBaseTables, newerBasePlaces, prunedByDataset);
  assert.equal(afterDatasetCatchUp.fc.features.length, 1);
  assert.equal(afterDatasetCatchUp.fc.features[0].properties.status, "accessible");

  // Same outcome via a delta upsert instead of a full dataset refresh — the
  // override is dropped because the delta's own osm_version for this
  // osm_url has reached the version the write itself produced (the primary
  // rule pruneAnswerOverrides now uses, not a timestamp comparison).
  const versionByUrl = new Map([[url, 3]]);
  const prunedByDelta = pruneAnswerOverrides(overrides, null, versionByUrl);
  assert.deepEqual(prunedByDelta, {});

  // And a delta upsert that has NOT yet reached this write's own version
  // keeps the override — the promotion must not flicker back to a play
  // place mid-transit, even if that older delta entry's own edited_at
  // happens to read later than the override's client-clock `t`.
  const notYetCovered = pruneAnswerOverrides(overrides, "2026-09-23T09:00:00+00:00",
    new Map([[url, 2]]));
  assert.deepEqual(notYetCovered, overrides);
});

// ---- the add-a-place flow: selectAddedPlace / isNewlyCreated ---------------

test("isNewlyCreated reads properties.created, never osm_version", () => {
  assert.equal(isNewlyCreated({ created: true, osm_version: 2 }), true);
  assert.equal(isNewlyCreated({ created: false, osm_version: 1 }), false);
  assert.equal(isNewlyCreated({ osm_version: 1 }), false);
  assert.equal(isNewlyCreated({}), false);
  assert.equal(isNewlyCreated(null), false);
});

const WATCH = { t: "2026-09-23T10:00:00Z", bbox: [9.9, 53.5, 10.1, 53.6], zoom: 16 };

test("selectAddedPlace returns null with no watch or no delta", () => {
  assert.equal(selectAddedPlace({ tables: {}, places: {} }, null), null);
  assert.equal(selectAddedPlace(null, WATCH), null);
});

test("selectAddedPlace picks a genuinely created table upsert inside the watch bbox, edited after the tap", () => {
  const delta = { tables: { upsert: [
    feat(10.0, 53.55, { osm_url: "https://www.openstreetmap.org/node/1",
                       created: true, edited_at: "2026-09-23T10:01:00Z" }),
  ], remove: [] }, places: { upsert: [], remove: [] }, new_toilets_no_table: [] };
  const result = selectAddedPlace(delta, WATCH);
  assert.deepEqual(result, { type: "table", feature: delta.tables.upsert[0] });
});

test("selectAddedPlace ignores an upsert that was already known before the tap (created !== true)", () => {
  const delta = { tables: { upsert: [
    feat(10.0, 53.55, { osm_url: "https://www.openstreetmap.org/node/1",
                       created: false, edited_at: "2026-09-23T10:01:00Z" }),
  ], remove: [] }, places: { upsert: [], remove: [] }, new_toilets_no_table: [] };
  assert.equal(selectAddedPlace(delta, WATCH), null);
});

test("selectAddedPlace ignores an edit that predates the tap even if created", () => {
  const delta = { tables: { upsert: [
    feat(10.0, 53.55, { osm_url: "https://www.openstreetmap.org/node/1",
                       created: true, edited_at: "2026-09-23T09:59:00Z" }),
  ], remove: [] }, places: { upsert: [], remove: [] }, new_toilets_no_table: [] };
  assert.equal(selectAddedPlace(delta, WATCH), null);
});

test("selectAddedPlace ignores a match outside the watch bbox", () => {
  const delta = { tables: { upsert: [
    feat(20.0, 53.55, { osm_url: "https://www.openstreetmap.org/node/1",
                       created: true, edited_at: "2026-09-23T10:01:00Z" }),
  ], remove: [] }, places: { upsert: [], remove: [] }, new_toilets_no_table: [] };
  assert.equal(selectAddedPlace(delta, WATCH), null);
});

test("selectAddedPlace prefers the candidate nearest the watch's own bbox centre", () => {
  const near = feat(10.0, 53.55, { osm_url: "https://www.openstreetmap.org/node/near",
                                   created: true, edited_at: "2026-09-23T10:01:00Z" });
  const far = feat(10.09, 53.59, { osm_url: "https://www.openstreetmap.org/node/far",
                                   created: true, edited_at: "2026-09-23T10:01:00Z" });
  const delta = { tables: { upsert: [far, near], remove: [] },
                  places: { upsert: [], remove: [] }, new_toilets_no_table: [] };
  const result = selectAddedPlace(delta, WATCH);
  assert.equal(result.feature.properties.osm_url, "https://www.openstreetmap.org/node/near");
});

test("selectAddedPlace returns a place-typed result for a play-place upsert, not table", () => {
  const delta = { tables: { upsert: [], remove: [] },
                  places: { upsert: [feat(10.0, 53.55,
                    { osm_url: "https://www.openstreetmap.org/node/9",
                     created: true, edited_at: "2026-09-23T10:01:00Z" })], remove: [] },
                  new_toilets_no_table: [] };
  const result = selectAddedPlace(delta, WATCH);
  assert.equal(result.type, "place");
});

test("selectAddedPlace falls back to a toilet_no_table entry when no upsert qualifies", () => {
  const delta = { tables: { upsert: [], remove: [] }, places: { upsert: [], remove: [] },
                  new_toilets_no_table: [
                    { osm_url: "https://www.openstreetmap.org/node/5",
                      lon: 10.0, lat: 53.55, t: "2026-09-23T10:01:00Z", version: 1, created: true },
                  ] };
  const result = selectAddedPlace(delta, WATCH);
  assert.deepEqual(result, { type: "toilet_no_table", entry: delta.new_toilets_no_table[0] });
});

test("selectAddedPlace ignores a toilet_no_table entry whose url also has an upsert this tick", () => {
  // The ordinary MapComplete flow: the toilet's own creation and the table
  // answer can land in the same delta — the upsert already claims it, so
  // the stale-looking toilet_no_table entry (which pipeline/delta.py should
  // already have dropped server-side) must not also fire its own toast.
  const url = "https://www.openstreetmap.org/node/5";
  const delta = {
    tables: { upsert: [feat(10.0, 53.55, { osm_url: url, created: true,
                                           edited_at: "2026-09-23T10:01:30Z" })], remove: [] },
    places: { upsert: [], remove: [] },
    new_toilets_no_table: [{ osm_url: url, lon: 10.0, lat: 53.55,
                            t: "2026-09-23T10:01:00Z", version: 1, created: true }],
  };
  const result = selectAddedPlace(delta, WATCH);
  assert.equal(result.type, "table");
});

test("selectAddedPlace: the ordinary MapComplete flow (create v1, answer v2) resolves to the table, not a false toilet_no_table toast", () => {
  // Mirrors pipeline/delta.py's own fix: the accumulator only keeps the
  // latest version (2), but process_changes stamps created: true on it
  // because it remembers the object's true first version — this is the
  // exact upsert selectAddedPlace has to accept, which osm_version === 1
  // never would have.
  const url = "https://www.openstreetmap.org/node/42";
  const delta = {
    tables: { upsert: [feat(10.0, 53.55, { osm_url: url, created: true,
                                           osm_version: 2, edited_at: "2026-09-23T10:01:30Z" })],
             remove: [] },
    places: { upsert: [], remove: [] },
    new_toilets_no_table: [],
  };
  const result = selectAddedPlace(delta, WATCH);
  assert.deepEqual(result, { type: "table", feature: delta.tables.upsert[0] });
});

// ---- v50: the men's room alone ----

test("loadFeatures and toFeatureCollection carry men_only, strictly", () => {
  const fc = { type: "FeatureCollection", features: [
    feat(1, 1, { status: "accessible", men_only: true }),
    feat(2, 2, { status: "accessible" }),            // a pre-v50 dataset
    feat(3, 3, { status: "accessible", men_only: "yes" }),
  ] };
  const rows = loadFeatures(fc);
  assert.deepEqual(rows.map((f) => f.men_only), [true, false, false]);
  assert.deepEqual(toFeatureCollection(rows).features.map((f) => f.properties.men_only),
    [true, false, false]);
});

test("nearestUsable sends a mum past the men's room alone, a dad into it", () => {
  const rows = [
    { id: "near-men", status: "accessible", men_only: true, key: null, lat: 53.5503, lon: 9.9920 },
    { id: "far-both", status: "accessible", men_only: false, key: null, lat: 53.5528, lon: 10.0067 },
  ];
  assert.equal(nearestUsable(rows, 53.5503, 9.9920, "papa").feature.id, "near-men");
  assert.equal(nearestUsable(rows, 53.5503, 9.9920, "mama").feature.id, "far-both");
});

test("applyAnswerOverrides sets men_only from the answer, keeps the base's without one", () => {
  const url = "https://www.openstreetmap.org/node/1";
  const fc = () => ({ type: "FeatureCollection", features: [
    feat(1, 1, { osm_url: url, status: "accessible", men_only: true,
                 changing_table: "yes", location_raw: "male_toilet" }),
  ] });
  const places = { type: "FeatureCollection", features: [] };
  const both = applyAnswerOverrides(fc(), places, { [url]: { status: "accessible", men_only: false,
    changing_table: "yes", location_raw: "female_toilet;male_toilet", t: "2026-09-25T10:00:00Z" } });
  assert.equal(both.fc.features[0].properties.men_only, false);
  // An override stored before v50 has no men_only: the base's value stands.
  const old = applyAnswerOverrides(fc(), places, { [url]: { status: "accessible",
    changing_table: "yes", location_raw: "male_toilet", t: "2026-09-25T10:00:00Z" } });
  assert.equal(old.fc.features[0].properties.men_only, true);
});

// ---- v51: the mum's fourth chip ----

const MIXED = () => loadFeatures({ type: "FeatureCollection", features: [
  feat(1, 1, { status: "accessible", men_only: true }),
  feat(2, 2, { status: "accessible" }),
  feat(3, 3, { status: "female_only" }),
  feat(4, 4, { status: "unknown" }),
] });

test("chipKeys: papa keeps the three statuses, mama adds the men's room alone", () => {
  assert.deepEqual(chipKeys("papa"), STATUSES);
  assert.deepEqual(chipKeys("nonsense"), STATUSES);
  assert.deepEqual(chipKeys("mama"), ["accessible", "female_only", "men_only", "unknown"]);
});

test("countsByStatus in mama moves men_only tables out of the green chip", () => {
  assert.deepEqual(countsByStatus(MIXED()), { accessible: 2, female_only: 1, unknown: 1 });
  assert.deepEqual(countsByStatus(MIXED(), "mama"),
    { accessible: 1, female_only: 1, men_only: 1, unknown: 1 });
  assert.deepEqual(countsByStatus([], "mama"),
    { accessible: 0, female_only: 0, men_only: 0, unknown: 0 });
});

test("filterByStatus in mama: the men_only chip alone hides or shows them", () => {
  const ids = (xs) => xs.map((f) => f.idx);
  assert.deepEqual(ids(filterByStatus(MIXED(), ["accessible"], "mama")), [1]);  // idx of feat 2
  assert.deepEqual(ids(filterByStatus(MIXED(), ["men_only"], "mama")), [0]);
  // Papa never sees a men_only chip key: the table is under accessible there.
  assert.deepEqual(ids(filterByStatus(MIXED(), ["accessible"])), [0, 1]);
  assert.deepEqual(ids(filterByStatus(MIXED(), ["men_only"])), []);
});

test("chipView: the men_only chip is red and carries its own label", () => {
  assert.equal(chipView("men_only", "mama").bucket, "bad");
  assert.equal(chipView("men_only", "mama").labelKey, "stMenOnlyMama");
  assert.deepEqual(chipView("accessible", "mama"), viewFor("accessible", "mama"));
});

test("a reader's own answer moves the table between the mum's chips at once", () => {
  // The live-edit path: stats.json's answer tables -> the stored override ->
  // applyAnswerOverrides -> loadFeatures -> the chip counts renderChips shows.
  const url = "https://www.openstreetmap.org/node/7";
  const base = { type: "FeatureCollection", features: [
    feat(1, 1, { osm_url: url, status: "unknown", changing_table: "yes", location_raw: null }),
  ] };
  const places = { type: "FeatureCollection", features: [] };
  const answer = (status, men_only, location_raw) => countsByStatus(loadFeatures(
    applyAnswerOverrides(base, places, { [url]: { status, men_only, changing_table: "yes",
      location_raw, t: "2026-09-25T20:00:00Z" } }).fc), "mama");
  assert.deepEqual(answer("accessible", true, "male_toilet"),
    { accessible: 0, female_only: 0, men_only: 1, unknown: 0 });
  assert.deepEqual(answer("accessible", false, "female_toilet;male_toilet"),
    { accessible: 1, female_only: 0, men_only: 0, unknown: 0 });
});
