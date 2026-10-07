import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VENUE_TAGS, isVenue, isSearchVenue, venueOsmTags, venueSearchOsmTags, venueReverseUrl,
         venueSearchUrl, venueRows, venueDistance, venueCentreKey, VENUE_LIMIT,
         VENUE_SEARCH_KEYS } from "./venues.js";

const feat = (props, coords = [9.9563, 53.5745]) =>
  ({ type: "Feature", geometry: { type: "Point", coordinates: coords }, properties: props });
const cafe = (id, name, coords, extra = {}) =>
  feat({ osm_type: "N", osm_id: id, osm_key: "amenity", osm_value: "cafe", name, ...extra }, coords);

test("VENUE_TAGS is the theme's dad_venue filter, value for value", () => {
  const theme = JSON.parse(readFileSync(new URL("../theme/papamap.theme.json", import.meta.url)));
  const layer = theme.layers.find((l) => l.id === "dad_venue");
  const ors = layer.source.osmTags.and.find((x) => x?.or).or;
  const fromTheme = {};
  for (const term of ors) {
    let m = /^([a-z_]+)~\^\(([^)]+)\)\$$/.exec(term);
    if (m) { fromTheme[m[1]] = m[2].split("|"); continue; }
    m = /^([a-z_]+)=([a-z_]+)$/.exec(term);
    assert.ok(m, `unparsed theme term ${term}`);
    (fromTheme[m[1]] ??= []).push(m[2]);
  }
  const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, [...o[k]].sort()]));
  assert.deepEqual(sorted(VENUE_TAGS), sorted(fromTheme));
});

test("isVenue: on the list, off the list, toilets never", () => {
  assert.equal(isVenue("amenity", "cafe"), true);
  assert.equal(isVenue("railway", "station"), true);
  assert.equal(isVenue("amenity", "toilets"), false);
  assert.equal(isVenue("amenity", "bench"), false);
  assert.equal(isVenue("nonsense", "cafe"), false);
});

test("isSearchVenue: the list, plus any shop, amenity, tourism or leisure; toilets never", () => {
  assert.equal(isSearchVenue("amenity", "cafe"), true);
  assert.equal(isSearchVenue("railway", "station"), true);
  assert.equal(isSearchVenue("shop", "clothes"), true);
  assert.equal(isSearchVenue("shop", "bakery"), true);
  assert.equal(isSearchVenue("amenity", "toilets"), false);
  assert.equal(isSearchVenue("railway", "halt"), false);
  assert.equal(isSearchVenue("highway", "bus_stop"), false);
});

test("venueSearchOsmTags: bare keys, plus the list's pairs under any other key", () => {
  const tags = venueSearchOsmTags();
  for (const k of VENUE_SEARCH_KEYS) assert.ok(tags.includes(k), k);
  assert.ok(tags.includes("railway:station"));
  assert.ok(tags.includes("aeroway:terminal"));
  assert.ok(!tags.some((t) => VENUE_SEARCH_KEYS.includes(t.split(":")[0]) && t.includes(":")),
            "no pair a bare key already covers");
});

test("venueReverseUrl: centre rounded to ~100 m, radius, limit, one osm_tag per pair", () => {
  const u = new URL(venueReverseUrl(53.574512345, 9.956298765, { lang: "de" }));
  assert.equal(u.origin + u.pathname, "https://photon.komoot.io/reverse");
  assert.equal(u.searchParams.get("lat"), "53.575");
  assert.equal(u.searchParams.get("lon"), "9.956");
  assert.equal(u.searchParams.get("radius"), "0.3");
  assert.equal(u.searchParams.get("limit"), String(VENUE_LIMIT));
  assert.equal(u.searchParams.get("lang"), "de");
  assert.deepEqual(u.searchParams.getAll("osm_tag"), venueOsmTags());
  assert.ok(u.searchParams.getAll("osm_tag").includes("shop:supermarket"));
});

test("venueReverseUrl: a language Photon lacks is left off, not sent", () => {
  const u = new URL(venueReverseUrl(50.08, 14.42, { lang: "cs" }));
  assert.equal(u.searchParams.has("lang"), false);
});

test("venueSearchUrl: query inside a box about a kilometre around the rounded centre", () => {
  const u = new URL(venueSearchUrl("rewe", 53.574512, 9.956298, { lang: "en" }));
  assert.equal(u.origin + u.pathname, "https://photon.komoot.io/api/");
  assert.equal(u.searchParams.get("q"), "rewe");
  assert.equal(u.searchParams.get("lat"), "53.575");
  const [w, s, e, n] = u.searchParams.get("bbox").split(",").map(Number);
  assert.ok(w < 9.956 && e > 9.956 && s < 53.575 && n > 53.575);
  assert.ok(Math.abs((n - s) * 111 - 2) < 0.01, "about 2 km tall");
  assert.ok(Math.abs((e - w) * 111 * Math.cos(53.575 * Math.PI / 180) - 2) < 0.05, "about 2 km wide");
  assert.deepEqual(u.searchParams.getAll("osm_tag"), venueSearchOsmTags());
});

test("venueCentreKey: one key per ~100 m cell", () => {
  assert.equal(venueCentreKey(53.5741, 9.95629), venueCentreKey(53.5743, 9.95631));
  assert.notEqual(venueCentreKey(53.5745, 9.9563), venueCentreKey(53.5765, 9.9563));
});

test("venueRows: nearest first, with osm_url, name, context and distance", () => {
  const json = { features: [
    cafe(2, "Far", [9.9600, 53.5745], { street: "Osterstraße", housenumber: "12", city: "Hamburg" }),
    cafe(1, "Near", [9.9564, 53.5745]),
  ] };
  const rows = venueRows(json, { lat: 53.5745, lon: 9.9563 });
  assert.deepEqual(rows.map((r) => r.name), ["Near", "Far"]);
  assert.equal(rows[0].osm_url, "https://www.openstreetmap.org/node/1");
  assert.equal(rows[1].context, "Osterstraße 12, Hamburg");
  assert.ok(rows[0].km < rows[1].km);
  assert.equal(rows[0].lon, 9.9564);
});

test("venueRows: ways and relations get their own URL kind", () => {
  const json = { features: [
    feat({ osm_type: "W", osm_id: 7, osm_key: "shop", osm_value: "supermarket", name: "Markt" }),
    feat({ osm_type: "R", osm_id: 8, osm_key: "tourism", osm_value: "zoo", name: "Zoo" }),
  ] };
  const urls = venueRows(json, { lat: 53.5745, lon: 9.9563 }).map((r) => r.osm_url);
  assert.deepEqual(urls.sort(), ["https://www.openstreetmap.org/relation/8", "https://www.openstreetmap.org/way/7"]);
});

test("venueRows: drops nameless, off-list, toilets, duplicates and what the map knows", () => {
  const json = { features: [
    cafe(1, ""),
    feat({ osm_type: "N", osm_id: 2, osm_key: "amenity", osm_value: "toilets", name: "WC" }),
    feat({ osm_type: "N", osm_id: 3, osm_key: "amenity", osm_value: "bench", name: "Bank" }),
    cafe(4, "Twice"), cafe(4, "Twice"),
    cafe(5, "Known"),
    feat({ osm_id: 6, osm_key: "amenity", osm_value: "cafe", name: "No type" }),
    { properties: { osm_type: "N", osm_id: 9, osm_key: "amenity", osm_value: "cafe", name: "No geometry" } },
  ] };
  const known = (u) => u === "https://www.openstreetmap.org/node/5";
  const rows = venueRows(json, { lat: 53.5745, lon: 9.9563, known });
  assert.deepEqual(rows.map((r) => r.name), ["Twice"]);
});

test("venueRows: a typed search keeps a shop off the nearby list, never toilets", () => {
  const json = { features: [
    feat({ osm_type: "N", osm_id: 4415681189, osm_key: "shop", osm_value: "clothes", name: "Kinderladen" }),
    feat({ osm_type: "N", osm_id: 2, osm_key: "amenity", osm_value: "toilets", name: "WC" }),
  ] };
  assert.deepEqual(venueRows(json, { lat: 53.5745, lon: 9.9563 }), []);
  const rows = venueRows(json, { lat: 53.5745, lon: 9.9563, accept: isSearchVenue });
  assert.deepEqual(rows.map((r) => r.osm_url), ["https://www.openstreetmap.org/node/4415681189"]);
});

test("venueRows: anything but a FeatureCollection is no rows, not a crash", () => {
  for (const j of [null, undefined, {}, { features: "x" }, { message: "rate limited" }])
    assert.deepEqual(venueRows(j, { lat: 0, lon: 0 }), []);
});

test("venueRows: honours the limit", () => {
  const json = { features: Array.from({ length: 10 }, (_, i) => cafe(i + 1, `C${i}`)) };
  assert.equal(venueRows(json, { lat: 53.5745, lon: 9.9563, limit: 3 }).length, 3);
});

test("venueDistance: metres to the nearest ten, never 0 m", () => {
  assert.equal(venueDistance(0), "10 m");
  assert.equal(venueDistance(0.084), "80 m");
  assert.equal(venueDistance(1.236), "1240 m");
  assert.equal(venueDistance(null), "");
});

test("every key of VENUE_TAGS turns into osm_tag pairs", () => {
  const n = Object.values(VENUE_TAGS).reduce((a, v) => a + v.length, 0);
  assert.equal(venueOsmTags().length, n);
});
