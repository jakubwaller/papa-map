import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalise, matchLocal, photonUrl, photonLang, photonRow, photonTarget,
         photonResults, PHOTON_ENDPOINT, PHOTON_LANGS, PHOTON_LIMIT,
         LOCAL_MIN_CHARS, PHOTON_MIN_CHARS, LOCAL_LIMIT } from "./search.js";
import { LANGS, STRINGS, DEFAULT_LANG } from "./i18n.js";

const table = (name, lat, lon, extra = {}) => ({ name, lat, lon, status: "accessible", ...extra });

// Hamburg Rathaus and its surroundings; the centre is the Rathausmarkt.
const CENTRE = { lat: 53.55, lon: 9.993 };

test("normalise folds case and diacritics, both sides of the comparison", () => {
  assert.equal(normalise("Mühlenkamp"), "muhlenkamp");
  assert.equal(normalise("NÁMĚSTÍ"), "namesti");
  assert.equal(normalise("Åre"), "are");
  assert.equal(normalise(null), "");
  // Greek and Cyrillic have no Latin fold to make; they only lower-case.
  assert.equal(normalise("Αθήνα"), "αθηνα");
});

test("matchLocal: substring, diacritic-blind, nearest to the map centre first", () => {
  const tables = [
    table("Rewe City", 53.60, 9.993),      // ~5.6 km north
    table("Mühlenkamp Rewe", 53.56, 9.993),  // ~1.1 km north
    table("Edeka", 53.551, 9.993),
  ];
  const hits = matchLocal(tables, [], "rewe", CENTRE);
  assert.deepEqual(hits.map((h) => h.obj.name), ["Mühlenkamp Rewe", "Rewe City"]);
  assert.deepEqual(hits.map((h) => h.kind), ["table", "table"]);
  // Typed without the umlaut, which is what a phone keyboard gives you.
  assert.deepEqual(matchLocal(tables, [], "muhlen", CENTRE).map((h) => h.obj.name),
    ["Mühlenkamp Rewe"]);
});

test("matchLocal: the play-place prospects are searched too, and say which they are", () => {
  const places = [{ name: "Rewe Spielecke", lat: 53.552, lon: 9.993 }];
  const hits = matchLocal([table("Rewe City", 53.60, 9.993)], places, "rewe", CENTRE);
  assert.deepEqual(hits.map((h) => h.kind), ["place", "table"]);
});

test("matchLocal: nothing under two characters, at most three rows, no nameless pin", () => {
  const many = Array.from({ length: 10 }, (_, i) => table(`Rewe ${i}`, 53.55 + i / 100, 9.993));
  assert.deepEqual(matchLocal(many, [], "r", CENTRE), []);
  assert.equal(matchLocal(many, [], "re", CENTRE).length, LOCAL_LIMIT);
  // A pin with no name, or no coordinates, can never be a row.
  assert.deepEqual(matchLocal([table(null, 53.55, 9.993), table("Rewe", NaN, 9.993)],
    [], "rewe", CENTRE), []);
  // A missing list is not a crash: the dataset may not have loaded yet.
  assert.deepEqual(matchLocal(null, undefined, "rewe", CENTRE), []);
});

test("photonUrl: the bias is the map centre rounded to about 10 km, never a GPS fix", () => {
  const url = new URL(photonUrl("rathaus", { lang: "de", lat: 53.55123, lon: 9.99321, zoom: 14.7 }));
  assert.equal(url.origin + url.pathname, PHOTON_ENDPOINT);
  assert.equal(url.searchParams.get("q"), "rathaus");
  assert.equal(url.searchParams.get("limit"), String(PHOTON_LIMIT));
  assert.equal(url.searchParams.get("lang"), "de");
  // One decimal: 53.55123 must never leave as anything a house could be found at.
  assert.equal(url.searchParams.get("lat"), "53.6");
  assert.equal(url.searchParams.get("lon"), "10.0");
  assert.equal(url.searchParams.get("zoom"), "15");
  // No centre yet (a map that has not painted): no bias at all, not a 0/0 one
  // off the coast of Africa.
  const bare = new URL(photonUrl("rathaus", {}));
  assert.equal(bare.searchParams.get("lat"), null);
  assert.equal(bare.searchParams.get("lon"), null);
  assert.equal(bare.searchParams.get("zoom"), null);
});

test("photonUrl: lang goes only where Photon has translations", () => {
  assert.deepEqual(PHOTON_LANGS, ["de", "en", "fr"]);
  for (const l of PHOTON_LANGS) assert.equal(photonLang(l), l);
  // Every other UI language falls back to the local name rather than telling
  // komoot which of the 32 the reader picked.
  for (const l of LANGS.filter((x) => !PHOTON_LANGS.includes(x))) {
    assert.equal(photonLang(l), null, l);
    assert.equal(new URL(photonUrl("x", { lang: l })).searchParams.get("lang"), null, l);
  }
});

test("photonUrl is the one place the bias is rounded, and one decimal is all that leaves", () => {
  // The centre is not always somewhere the reader chose: after the locate
  // button, or on a map that opened at their position, it is roughly where
  // they are standing. The rounding is therefore the whole protection, so it
  // is pinned to a literal pair rather than to "it calls toFixed somewhere".
  const u = new URL(photonUrl("x", { lat: 53.5511, lon: 9.9937 })).searchParams;
  assert.equal(u.get("lat"), "53.6");
  assert.equal(u.get("lon"), "10.0");
  // Southern and western hemispheres, a pair that rounds across zero, and one
  // that rounds up to a whole degree: never more than one decimal, ever.
  for (const [lat, lon] of [[-53.5511, -9.9937], [0.04, -0.06], [47.999, 179.96]]) {
    const p = new URL(photonUrl("x", { lat, lon })).searchParams;
    for (const k of ["lat", "lon"])
      assert.match(p.get(k), /^-?\d+\.\d$/, `${k}=${p.get(k)} carries more than one decimal`);
  }
  // ...and web/app.js hands the centre over untouched. Rounding in two places
  // is two rules that can drift apart, and the one that drifts is the one
  // nobody wrote a test for.
  const call = /photonUrl\([^)]*\)/.exec(
    readFileSync(new URL("./app.js", import.meta.url), "utf8"))?.[0] ?? "";
  assert.match(call, /lat: c\.lat, lon: c\.lng/);
  assert.equal(/toFixed|Math\.round/.test(call), false, "the centre must reach photonUrl unrounded");
});

test("the pages promise what the code does: the fix is not sent, the centre is rounded", () => {
  // Both pages used to say the reader's location was "never part of it", which
  // stops being true the moment the map is centred on them — after the locate
  // button, or on a map opened at their position. The narrower claim is the
  // true one, and the ~10 km the rounding buys has to be named with it.
  for (const f of ["./datenschutz.html", "./datenschutz-en.html"]) {
    const html = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.equal(/Standort ist daran niemals beteiligt|location is never part of it/.test(html),
      false, `${f} still claims the reader's position is never involved`);
    assert.match(html, /nie gesendet|never sent/, f);
    assert.match(html, /10 km/, f);
  }
});

test("photonUrl: the endpoint is one constant a proxy can replace", () => {
  const src = readFileSync(new URL("./search.js", import.meta.url), "utf8")
    + readFileSync(new URL("./app.js", import.meta.url), "utf8");
  const hosts = [...src.matchAll(/photon\.komoot\.io/g)];
  assert.equal(hosts.length, 1, "photon.komoot.io must appear once, in PHOTON_ENDPOINT");
  assert.equal(photonUrl("x", { endpoint: "/geocode" }).startsWith("/geocode?"), true);
});

// The live shape, copied from photon.komoot.io on 21 Sep 2026
// (?q=hamburg rathaus&limit=3&lang=de&lat=53.55&lon=9.99&zoom=12). The town
// hall really does come back twice — once as amenity=townhall, once as
// office=government — which is why photonResults deduplicates.
const LIVE = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { osm_type: "W", osm_id: 142944431, osm_key: "amenity", osm_value: "townhall", type: "house", housenumber: "1", name: "Rathaus", street: "Rathausmarkt", district: "Altstadt", city: "Hamburg", country: "Deutschland", postcode: "20095", countrycode: "DE", extent: [9.9915642, 53.5509132, 9.9931776, 53.5499029] }, geometry: { type: "Point", coordinates: [9.9925658, 53.5503287] } },
    { type: "Feature", properties: { osm_type: "W", osm_id: 142944431, osm_key: "office", osm_value: "government", type: "house", housenumber: "1", name: "Rathaus", street: "Rathausmarkt", district: "Altstadt", city: "Hamburg", country: "Deutschland", postcode: "20095", countrycode: "DE", extent: [9.9915642, 53.5509132, 9.9931776, 53.5499029] }, geometry: { type: "Point", coordinates: [9.9925658, 53.5503287] } },
    { type: "Feature", properties: { osm_type: "N", osm_id: 6284717662, osm_key: "railway", osm_value: "station", type: "house", name: "Rathaus", street: "Rathausmarkt", district: "Altstadt", city: "Hamburg", country: "Deutschland", postcode: "20095", countrycode: "DE" }, geometry: { type: "Point", coordinates: [9.9940526, 53.550371] } },
  ],
};

test("photonRow: the name, then the next two levels that are not already in it", () => {
  assert.deepEqual(photonRow(LIVE.features[0]),
    { name: "Rathaus", context: "Rathausmarkt 1, Hamburg" });
  // A city names itself: its own state repeats the name and is dropped.
  assert.deepEqual(
    photonRow({ properties: { name: "Hamburg", state: "Hamburg", country: "Deutschland", type: "city" } }),
    { name: "Hamburg", context: "Deutschland" });
  // A country has nothing above it.
  assert.deepEqual(
    photonRow({ properties: { name: "Portugal", country: "Portugal", type: "country" } }),
    { name: "Portugal", context: "" });
  // An address with no name of its own is its street.
  assert.deepEqual(
    photonRow({ properties: { street: "Rathausmarkt", housenumber: "1", city: "Hamburg", type: "house" } }),
    { name: "Rathausmarkt 1", context: "Hamburg" });
  assert.deepEqual(photonRow(null), { name: "", context: "" });
});

test("photonTarget: an extent fits, everything else flies to a zoom by level", () => {
  // Photon's extent is [west, north, east, south]; a bounds is [[w,s],[e,n]].
  assert.deepEqual(photonTarget(LIVE.features[0]),
    { bounds: [[9.9915642, 53.5499029], [9.9931776, 53.5509132]] });
  assert.deepEqual(photonTarget(LIVE.features[2]),
    { center: [9.9940526, 53.550371], zoom: 17 });
  const at = (type) => photonTarget({ properties: { type }, geometry: { type: "Point", coordinates: [0, 0] } }).zoom;
  assert.equal(at("city"), 12);
  assert.equal(at("country"), 5);
  assert.equal(at("something-new"), 12);
  // No geometry and no extent is not a row at all.
  assert.equal(photonTarget({ properties: { type: "city" } }), null);
});

test("photonResults: the live answer parses, and the doubled town hall is one row", () => {
  const rows = photonResults(LIVE);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    name: "Rathaus",
    context: "Rathausmarkt 1, Hamburg",
    target: { bounds: [[9.9915642, 53.5499029], [9.9931776, 53.5509132]] },
  });
  assert.equal(rows[1].target.zoom, 17);
});

test("photonResults: anything that is not a FeatureCollection is no results, not a crash", () => {
  // A throttled Photon can answer 200 with a body that is not what we asked
  // for; the field has to read that as "nothing found" and keep the map's own
  // matches on screen.
  for (const bad of [null, undefined, {}, { features: "no" }, { features: [null, 7] },
                     { features: [{ properties: { type: "city" } }] }])
    assert.deepEqual(photonResults(bad), []);
  assert.equal(photonResults({ features: Array(20).fill(LIVE.features[2]) }).length, 1);
});

test("the search strings exist in every language, and none of them is a template", () => {
  const keys = ["searchPlaceholder", "ariaSearchClear", "searchOnMap",
                "searchWorld", "searchNone", "searchFailed"];
  for (const key of keys) {
    assert.ok(STRINGS[DEFAULT_LANG][key], `${key} missing from the default language`);
    for (const lang of LANGS) {
      const s = STRINGS[lang][key];
      assert.ok(s && s.trim(), `${lang}.${key} is empty`);
      assert.equal(/\{/.test(s), false, `${lang}.${key} carries a token nothing fills`);
    }
  }
});

test("the field does not ask a third party before the third character", () => {
  // Two characters search this map's own places, which costs nothing and
  // sends nothing; the geocoder waits for three. The Datenschutz says so in
  // those words, so the constants and the page have to agree.
  assert.equal(LOCAL_MIN_CHARS, 2);
  assert.equal(PHOTON_MIN_CHARS, 3);
  const dse = readFileSync(new URL("./datenschutz.html", import.meta.url), "utf8");
  assert.match(dse, /ab dem dritten Zeichen/);
  assert.match(dse, /komoot GmbH/);
  assert.match(dse, /https:\/\/www\.komoot\.com\/privacy/);
});
