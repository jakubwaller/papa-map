import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VENUE_TAGS, isVenue, isSearchVenue, venueOsmTags, venueSearchOsmTags, venueReverseUrl,
         venueSearchUrl, venueRows, venueDistance, venueCentreKey, VENUE_LIMIT,
         VENUE_SEARCH_KEYS, VENUE_SEARCH_EXCLUDE, venueAnswer, venueFromIntent,
         venueQuestions, asksHighchair } from "./venues.js";
import { isHighchairVenue, PLAY_CHOICES, HIGHCHAIR_CHOICES, roomChoices, roomChoicesMore } from "./osm.js";

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

// A preset outside the filter would add a place the layer then hides, so its
// changing-table questions are never asked.
test("every dad_venue preset adds a place the layer shows", () => {
  const theme = JSON.parse(readFileSync(new URL("../theme/papamap.theme.json", import.meta.url)));
  const layer = theme.layers.find((l) => l.id === "dad_venue");
  assert.ok(layer.presets.length);
  for (const tag of layer.presets.flatMap((p) => p.tags)) {
    const [k, v] = tag.split("=");
    assert.ok(VENUE_TAGS[k]?.includes(v), tag);
  }
});

// The changing-table layer also holds rooms, playgrounds and bare table nodes,
// which rightly have no name: only the venue categories are asked for one.
test("the name question asks only dad_venue's categories, in both layers", () => {
  const theme = JSON.parse(readFileSync(new URL("../theme/papamap.theme.json", import.meta.url)));
  const layer = (id) => theme.layers.find((l) => l.id === id);
  const venueOr = layer("dad_venue").source.osmTags.and.find((x) => x?.or);
  for (const id of ["dad_venue", "dad_changing_table_amenity"]) {
    const name = layer(id).tagRenderings.find((r) => r.id === "name");
    assert.deepEqual(name.condition.and.find((x) => x?.or), venueOr, id);
  }
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
  assert.equal(isSearchVenue("amenity", "parking"), false, "the supermarket's car park");
  assert.equal(isSearchVenue("leisure", "park"), false);
  assert.equal(isSearchVenue("tourism", "camp_site"), true, "a place in its own right");
});

test("VENUE_SEARCH_EXCLUDE never takes back a place the list offers", () => {
  for (const [k, vs] of Object.entries(VENUE_SEARCH_EXCLUDE)) {
    assert.ok(VENUE_SEARCH_KEYS.includes(k), k);
    for (const v of vs) assert.equal(isVenue(k, v), false, `${k}=${v}`);
  }
});

test("venueSearchOsmTags: bare keys, plus the list's pairs under any other key", () => {
  const tags = venueSearchOsmTags();
  for (const k of VENUE_SEARCH_KEYS) assert.ok(tags.includes(k), k);
  assert.ok(tags.includes("railway:station"));
  assert.ok(tags.includes("aeroway:terminal"));
  assert.ok(tags.includes("!amenity:toilets"));
  assert.ok(tags.includes("!amenity:parking"));
  assert.ok(!tags.some((t) => !t.startsWith("!") && t.includes(":")
                              && VENUE_SEARCH_KEYS.includes(t.split(":")[0])),
            "no include pair a bare key already covers");
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

// The venue step asks the high chair where the pin card would (isHighchairVenue),
// so a row carries its amenity — from a duplicate when the first one Photon
// sent was the same object under another tag.
test("venueRows: a row carries its amenity, or null, the high-chair question's test", () => {
  const json = { features: [
    cafe(1, "Café"),
    feat({ osm_type: "N", osm_id: 2, osm_key: "shop", osm_value: "supermarket", name: "Markt" }),
    feat({ osm_type: "N", osm_id: 3, osm_key: "shop", osm_value: "yes", name: "Bistro" }),
    feat({ osm_type: "N", osm_id: 3, osm_key: "amenity", osm_value: "restaurant", name: "Bistro" }),
  ] };
  const rows = Object.fromEntries(venueRows(json, { lat: 53.5745, lon: 9.9563 }).map((r) => [r.name, r]));
  assert.equal(rows["Café"].amenity, "cafe");
  assert.equal(rows.Markt.amenity, null);
  assert.equal(rows.Bistro.amenity, "restaurant");
  assert.equal(Object.keys(rows).length, 3);
  assert.ok(isHighchairVenue(rows["Café"].amenity) && !isHighchairVenue(rows.Markt.amenity));
});

test("venueAnswer: each choice answers its own question with its own patch", () => {
  assert.deepEqual(venueAnswer("hc_yes"), { q: "hc", patch: { highchair: "yes" }, comment: "hc_yes", pin: true });
  assert.deepEqual(venueAnswer("hc_no"), { q: "hc", patch: { highchair: "no" }, comment: "hc_no", pin: false });
  assert.deepEqual(venueAnswer("play_yes"),
    { q: "play", patch: { "kids_area:indoor": "yes", kids_area: "yes" }, comment: "play_yes", pin: true });
  assert.equal(venueAnswer("play_outdoor").pin, true);   // an outdoor play area rings too (v97)
  assert.deepEqual(venueAnswer("play_no"), { q: "play", patch: { kids_area: "no" }, comment: "play_no", pin: false });
  assert.deepEqual(venueAnswer("none"), { q: "table", patch: { changing_table: "no" }, comment: "place_none", pin: false });
  assert.deepEqual(venueAnswer("male"),
    { q: "table", patch: { changing_table: "yes", "changing_table:location": "male_toilet" }, comment: "place", pin: true });
  // Every pill the step renders routes somewhere; anything else throws.
  for (const c of [...roomChoices("papa"), ...roomChoicesMore(), "none", ...PLAY_CHOICES, ...HIGHCHAIR_CHOICES])
    assert.ok(venueAnswer(c).q);
  for (const c of ["wc_yes", "bogus", undefined]) assert.throws(() => venueAnswer(c));
});

test("venueFromIntent: the place a login brings back, amenity and all", () => {
  const intent = { kind: "venue", osm_url: "https://www.openstreetmap.org/node/1", choice: "hc_yes",
                   name: "Café Beispiel", context: "Beispielweg 1", lon: 9.95, lat: 53.57, amenity: "cafe" };
  assert.deepEqual(venueFromIntent(intent), { osm_url: intent.osm_url, name: "Café Beispiel",
    context: "Beispielweg 1", lon: 9.95, lat: 53.57, amenity: "cafe", tags: [] });
  // An intent from before v112 has no amenity: no high-chair question, nothing broken.
  const { amenity, ...old } = intent;
  assert.equal(venueFromIntent(old).amenity, null);
  assert.equal(venueFromIntent({ ...intent, amenity: 7 }).amenity, null);
  assert.equal(venueFromIntent({ ...intent, lon: "x" }), null);
  assert.equal(venueFromIntent({ ...intent, kind: "table" }), null);
  assert.equal(venueFromIntent({ ...intent, osm_url: null }), null);
  assert.equal(venueFromIntent(null), null);
});

test("venueQuestions: table always, play unless a play ring, high chair where asked and not on record", () => {
  const cafe = { amenity: "cafe" }, shop = { amenity: null };
  assert.deepEqual(venueQuestions(cafe), ["table", "play", "hc"]);
  assert.deepEqual(venueQuestions(shop), ["table", "play"]);
  // A play ring's play area is on record, maybe as kids_area:outdoor or leisure=indoor_play.
  assert.deepEqual(venueQuestions(cafe, { play_area: true, highchair_recorded: false }), ["table", "hc"]);
  assert.deepEqual(venueQuestions(cafe, { play_area: true, highchair_recorded: true }), ["table"]);
  // A high-chair ring: its high chair is on record, its play area is not.
  assert.deepEqual(venueQuestions(cafe, { play_area: false, highchair_recorded: true }), ["table", "play"]);
  assert.deepEqual(venueQuestions(cafe, null), ["table", "play", "hc"]);
});

test("asksHighchair: eating places plus bakery, pastry and indoor play; a supermarket never", () => {
  const rows = (...tags) => venueRows({ features: tags.map((t, i) => {
    const [k, v] = t.split("=");
    return feat({ osm_type: "N", osm_id: i + 1, osm_key: k, osm_value: v, name: `P${i}` });
  }) }, { lat: 53.5745, lon: 9.9563, accept: () => true });
  const ask = (t) => asksHighchair(rows(t)[0]);
  for (const t of ["shop=bakery", "shop=pastry", "leisure=indoor_play", "amenity=cafe"]) assert.ok(ask(t), t);
  assert.equal(ask("shop=supermarket"), false);
  assert.deepEqual(venueQuestions(rows("shop=bakery")[0]), ["table", "play", "hc"]);
  assert.deepEqual(venueQuestions(rows("shop=supermarket")[0]), ["table", "play"]);
});

test("venueRows: duplicates merge their tags", () => {
  const json = { features: [
    feat({ osm_type: "N", osm_id: 3, osm_key: "shop", osm_value: "yes", name: "Backstube" }),
    feat({ osm_type: "N", osm_id: 3, osm_key: "shop", osm_value: "bakery", name: "Backstube" }),
    feat({ osm_type: "N", osm_id: 3, osm_key: "shop", osm_value: "bakery", name: "Backstube" }),
  ] };
  const rows = venueRows(json, { lat: 53.5745, lon: 9.9563, accept: isSearchVenue });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].tags, ["shop=yes", "shop=bakery"]);
  assert.ok(asksHighchair(rows[0]));
});

test("venueFromIntent: tags round-trip; an intent without them replays with none", () => {
  const intent = { kind: "venue", osm_url: "https://www.openstreetmap.org/node/1", choice: "hc_yes",
                   name: "Backstube", context: "", lon: 9.95, lat: 53.57, tags: ["shop=bakery", 7] };
  const v = venueFromIntent(intent);
  assert.deepEqual(v.tags, ["shop=bakery"]);
  assert.ok(asksHighchair(v));
  const { tags, ...old } = intent;
  assert.deepEqual(venueFromIntent(old).tags, []);
  assert.equal(asksHighchair(venueFromIntent(old)), false);
});
