import { test } from "node:test";
import assert from "node:assert/strict";
import { CREATED_BY } from "./osm.js";
import { haversineKm } from "./datasource.js";
import {
  answeredPercent, areaAnswered, areaPercent,
  buildFeatureGrid, answerArea, answersInArea, totalAnswers,
  sentenceParts, greyNearby, circleBounds,
  MAPCOMPLETE_THEME, isOwnChangeset, changesetAnswer, extractAnswers,
  mergeAnswers, newestClosedAt, oldestClosedAt,
  EPOCH, changesetsUrl, pageBoundary, advanceBackfillCursor, reopenGap,
  SAVED_MAX, isSaved, addSaved, removeSaved, refreshApplies,
} from "./me.js";

// ---- The game sentence's percentage: must read stats.json's local block the
// same way statsLocal (web/app.js) does — the fixture below is the live-build
// numbers CONTRACT.md's v24 amendment itself cites (2,873 + 477 + 22,419). ----
test("answeredPercent: the same tables/known split statsLocal renders from", () => {
  const local = { ct_yes: 25746, ct_limited: 23, accessible: 2873, female_only: 477, unknown: 22419 };
  // (2873 + 477) / (25746 + 23) = 3350 / 25769 ≈ 13 %
  assert.equal(answeredPercent(local), 13);
  assert.equal(answeredPercent({ ct_yes: 0, ct_limited: 0, accessible: 0, female_only: 0, unknown: 0 }), null);
  assert.equal(answeredPercent(null), null);
});

test("sentenceParts: the zero case invites rather than reporting a zero", () => {
  const base = { area: "Hamburg", percent: 61, hasFix: true, mama: false };
  assert.deepEqual(sentenceParts({ ...base, yours: 0, greyCount: 3 }).yours, { key: "meYoursZero" });
  assert.deepEqual(sentenceParts({ ...base, yours: 4, greyCount: 3 }).yours,
    { key: "meYours", vars: { n: 4 } });
  assert.equal(sentenceParts({ ...base, yours: null, greyCount: 0 }).yours, null);
});

test("sentenceParts: no location fix asks to use one, never a zero count", () => {
  const parts = sentenceParts({ area: "Hamburg", percent: 61, yours: 1, greyCount: 0, hasFix: false, mama: false });
  assert.deepEqual(parts.grey, { locate: true });
});

test("sentenceParts: mama mode reads the grey pins as amber, same literal status", () => {
  const dad = sentenceParts({ area: "Hamburg", percent: 61, yours: 1, greyCount: 5, hasFix: true, mama: false });
  const mama = sentenceParts({ area: "Hamburg", percent: 61, yours: 1, greyCount: 5, hasFix: true, mama: true });
  assert.equal(dad.grey.key, "meGreyNearby");
  assert.equal(mama.grey.key, "meGreyNearbyMama");
  assert.deepEqual(dad.grey.vars, mama.grey.vars);
  assert.equal(sentenceParts({ area: "H", percent: 1, yours: 0, greyCount: 0, hasFix: true, mama: true }).grey.key,
    "meGreyNearbyZeroMama");
  assert.equal(sentenceParts({ area: "H", percent: 1, yours: 0, greyCount: 0, hasFix: true, mama: false }).grey.key,
    "meGreyNearbyZero");
});

test("sentenceParts: no area (stats.json missing) names no clause at all", () => {
  assert.equal(sentenceParts({ area: null, percent: null, yours: 1, greyCount: 0, hasFix: true, mama: false }).area,
    null);
});

// ---- Grey pins nearby ----
test("greyNearby: only a genuinely open question counts, within the radius", () => {
  const features = [
    { status: "unknown", location_raw: null, lat: 53.55, lon: 10.0 },       // 0 km: counts
    { status: "unknown", location_raw: "room", lat: 53.55, lon: 10.0 },     // answered in words: not open
    { status: "accessible", location_raw: null, lat: 53.55, lon: 10.0 },    // not unknown
    { status: "unknown", location_raw: null, lat: 55.0, lon: 12.0 },        // far away
  ];
  const near = greyNearby(features, 53.55, 10.0, 1);
  assert.equal(near.length, 1);
  assert.equal(near[0].location_raw, null);
});

test("greyNearby: no fix at all is an empty list, not a crash", () => {
  assert.deepEqual(greyNearby([{ status: "unknown", lat: 1, lon: 1 }], NaN, NaN), []);
});

test("circleBounds: a box that actually contains the centre, roughly 1 km wide", () => {
  const [[w, s], [e, n]] = circleBounds(53.55, 10.0, 1);
  assert.ok(w < 10.0 && e > 10.0 && s < 53.55 && n > 53.55);
  // Roughly a kilometre on each side — loose bounds, this is a flat-earth
  // approximation, not a geodesic.
  assert.ok(e - w > 0.01 && e - w < 0.04);
});

// ---- "Yours": OSM changesets ----
test("isOwnChangeset: PapaMap's own created_by, or MapComplete under this theme", () => {
  assert.equal(isOwnChangeset({ created_by: CREATED_BY }), true);
  assert.equal(isOwnChangeset({ created_by: "MapComplete 0.42.1", theme: MAPCOMPLETE_THEME }), true);
  assert.equal(isOwnChangeset({ created_by: "iD 2.x" }), false);
  assert.equal(isOwnChangeset({ created_by: "MapComplete 0.42.1", theme: "some_other_theme" }), false);
  assert.equal(isOwnChangeset(null), false);
});

test("changesetAnswer: the bbox centre is the answer's position, no contents downloaded", () => {
  const cs = { id: 42, tags: { created_by: CREATED_BY }, closed_at: "2026-09-19T10:00:00Z",
               min_lon: 10.0, max_lon: 10.02, min_lat: 53.5, max_lat: 53.52 };
  const answer = changesetAnswer(cs);
  assert.equal(answer.id, 42);
  assert.equal(answer.closed_at, "2026-09-19T10:00:00Z");
  assert.ok(Math.abs(answer.lon - 10.01) < 1e-9);
  assert.ok(Math.abs(answer.lat - 53.51) < 1e-9);
  // No changes_count on this fixture: defaults to a single answer.
  assert.equal(answer.n, 1);
});

test("changesetAnswer: a genuinely point-sized bbox gets the 50 m floor", () => {
  const cs = { id: 46, tags: { created_by: CREATED_BY }, closed_at: "t",
               min_lon: 10.0, max_lon: 10.0001, min_lat: 53.5, max_lat: 53.5001 };
  assert.equal(changesetAnswer(cs).radius_m, 50);
});

test("changesetAnswer: changes_count becomes n; a MapComplete session's wider bbox widens the search radius", () => {
  const cs = { id: 43, tags: { created_by: "MapComplete 0.42.1", theme: MAPCOMPLETE_THEME },
               closed_at: "2026-09-19T10:00:00Z", changes_count: 3,
               min_lon: 10.0, max_lon: 10.2, min_lat: 53.5, max_lat: 53.6 };
  const answer = changesetAnswer(cs);
  assert.equal(answer.n, 3);
  // The bbox diagonal here is a good few km; half of it, not the 50 m floor.
  assert.ok(answer.radius_m > 50, "radius_m should widen for a spread-out session");
  assert.ok(answer.radius_m <= 5000, "radius_m is capped at 5 km");
});

test("changesetAnswer: a huge bbox is capped at 5 km, never a whole country's worth", () => {
  const cs = { id: 44, tags: { created_by: CREATED_BY }, closed_at: "2026-09-19T10:00:00Z",
               changes_count: 50, min_lon: 5.0, max_lon: 15.0, min_lat: 47.0, max_lat: 55.0 };
  assert.equal(changesetAnswer(cs).radius_m, 5000);
});

test("changesetAnswer: a non-numeric or zero changes_count falls back to one answer", () => {
  const base = { id: 45, tags: { created_by: CREATED_BY }, closed_at: "t", min_lon: 1, max_lon: 1, min_lat: 1, max_lat: 1 };
  assert.equal(changesetAnswer({ ...base, changes_count: 0 }).n, 1);
  assert.equal(changesetAnswer({ ...base, changes_count: "3" }).n, 1);
  assert.equal(changesetAnswer({ ...base, changes_count: -1 }).n, 1);
});

test("changesetAnswer: not ours, or no bbox at all (a dropped write), is dropped", () => {
  assert.equal(changesetAnswer({ id: 1, tags: { created_by: "iD" }, min_lon: 1, max_lon: 1, min_lat: 1, max_lat: 1 }), null);
  assert.equal(changesetAnswer({ id: 1, tags: { created_by: CREATED_BY } }), null);   // opened, closed empty
  assert.equal(changesetAnswer(null), null);
});

test("changesetAnswer: falls back to created_at when a changeset has no closed_at", () => {
  const cs = { id: 1, tags: { created_by: CREATED_BY }, created_at: "2026-01-01T00:00:00Z",
               min_lon: 1, max_lon: 1, min_lat: 1, max_lat: 1 };
  assert.equal(changesetAnswer(cs).closed_at, "2026-01-01T00:00:00Z");
});

test("extractAnswers: the API's list, filtered and mapped, tolerant of a bad shape", () => {
  const list = [
    { id: 1, tags: { created_by: CREATED_BY }, closed_at: "t1", min_lon: 1, max_lon: 1, min_lat: 1, max_lat: 1 },
    { id: 2, tags: { created_by: "iD" }, min_lon: 1, max_lon: 1, min_lat: 1, max_lat: 1 },
  ];
  assert.deepEqual(extractAnswers(list).map((a) => a.id), [1]);
  assert.deepEqual(extractAnswers(null), []);
  assert.deepEqual(extractAnswers("nope"), []);
});

test("mergeAnswers: deduplicated by id, sorted newest first", () => {
  const cached = [{ id: 1, lon: 0, lat: 0, closed_at: "2026-01-01" }];
  const fresh = [
    { id: 1, lon: 0, lat: 0, closed_at: "2026-01-01" },   // the write's own echo, later paged again
    { id: 2, lon: 0, lat: 0, closed_at: "2026-06-01" },
  ];
  const merged = mergeAnswers(cached, fresh);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((a) => a.id), [2, 1]);
});

test("newestClosedAt / oldestClosedAt read mergeAnswers' own order", () => {
  const answers = mergeAnswers([], [
    { id: 1, closed_at: "2026-01-01" }, { id: 2, closed_at: "2026-06-01" }, { id: 3, closed_at: "2026-03-01" },
  ]);
  assert.equal(newestClosedAt(answers), "2026-06-01");
  assert.equal(oldestClosedAt(answers), "2026-01-01");
  assert.equal(newestClosedAt([]), null);
  assert.equal(oldestClosedAt(null), null);
});

// ---- The game sentence's numbers, scoped to one sweep area ----
// The live fixture: Hamburg today is 131 tables, 35 accessible + 6
// female_only -> 31%, checked against a real copy of changing_tables.geojson
// (CONTRACT.md v39).
const HAMBURG_FEATURES = [
  ...Array.from({ length: 35 }, () => ({ area: "Hamburg", status: "accessible" })),
  ...Array.from({ length: 6 }, () => ({ area: "Hamburg", status: "female_only" })),
  ...Array.from({ length: 90 }, () => ({ area: "Hamburg", status: "unknown" })),
  { area: "Bayern", status: "accessible" },   // a different chunk: must not be counted
  { area: null, status: "unknown" },          // no sweep area at all: must not be counted
];

test("areaAnswered: every loaded feature in the area, never the chip-filtered subset", () => {
  assert.deepEqual(areaAnswered(HAMBURG_FEATURES, new Set(["Hamburg"])),
    { tables: 131, unknown: 90, known: 41 });
  assert.equal(areaPercent(HAMBURG_FEATURES, new Set(["Hamburg"])), 31);
  assert.deepEqual(areaAnswered(HAMBURG_FEATURES, new Set()), { tables: 0, unknown: 0, known: 0 });
  assert.equal(areaPercent([], new Set(["Hamburg"])), null);
});

test("areaAnswered: a country row's several chunk keys all count", () => {
  const stats = areaAnswered(HAMBURG_FEATURES, new Set(["Hamburg", "Bayern"]));
  assert.equal(stats.tables, 132);
});

const AREA_FEATURES = [
  { area: "Hamburg", lat: 53.5511, lon: 9.9937 },
  { area: "Bayern", lat: 48.1351, lon: 11.5820 },
];

test("answerArea: the nearest feature within the answer's own radius_m, never a guess further out", () => {
  const grid = buildFeatureGrid(AREA_FEATURES);
  // ~5 m away: well inside the 50 m default.
  assert.equal(answerArea({ lat: 53.55112, lon: 9.99372, radius_m: 50 }, grid), "Hamburg");
  // A long way from either fixture point, even with a widened (MapComplete
  // session) radius: still nothing close enough.
  assert.equal(answerArea({ lat: 0, lon: 0, radius_m: 5000 }, grid), null);
  assert.equal(answerArea({ lat: NaN, lon: NaN }, grid), null);
  assert.equal(answerArea(null, grid), null);
  // A missing radius_m defaults to 50 m, not unlimited.
  assert.equal(answerArea({ lat: 53.55112, lon: 9.99372 }, grid), "Hamburg");
});

test("answerArea: also takes a plain feature array (a caller with no grid built yet)", () => {
  assert.equal(answerArea({ lat: 53.55112, lon: 9.99372, radius_m: 50 }, AREA_FEATURES), "Hamburg");
});

test("answerArea: a widened radius (a MapComplete session's own bbox) reaches further", () => {
  const grid = buildFeatureGrid(AREA_FEATURES);
  // ~500 m from the Hamburg fixture point: too far for the 50 m default,
  // reachable once the changeset's own radius_m says so.
  assert.equal(answerArea({ lat: 53.5556, lon: 9.9937, radius_m: 50 }, grid), null);
  assert.equal(answerArea({ lat: 53.5556, lon: 9.9937, radius_m: 600 }, grid), "Hamburg");
});

test("answersInArea: attributes each answer via answerArea, weighted by n, only this area's", () => {
  const grid = buildFeatureGrid(AREA_FEATURES);
  const answers = [
    { id: 1, lat: 53.55112, lon: 9.99372, radius_m: 50, n: 1 },    // Hamburg
    { id: 2, lat: 48.13511, lon: 11.58201, radius_m: 50, n: 3 },   // Bayern, a MapComplete session of 3
    { id: 3, lat: 0, lon: 0, radius_m: 50, n: 1 },                 // nowhere close: in the total, in no area
  ];
  assert.equal(answersInArea(answers, grid, new Set(["Hamburg"])), 1);
  assert.equal(answersInArea(answers, grid, new Set(["Bayern"])), 3);
  assert.equal(answersInArea(answers, grid, new Set()), 0);
});

test("totalAnswers: sums n, not one per cached changeset record", () => {
  assert.equal(totalAnswers([{ n: 1 }, { n: 3 }, { n: 1 }]), 5);
  assert.equal(totalAnswers([{}, {}]), 2);   // a missing n defaults to one answer each
  assert.equal(totalAnswers([]), 0);
  assert.equal(totalAnswers(null), 0);
});

// ---- The grid index gives the same answer as a brute-force scan ----
test("buildFeatureGrid + answerArea matches a brute-force nearest-feature scan", () => {
  // A scattered fixture spanning several grid cells (GRID_DEG is 0.05deg),
  // with gaps, so the ring search has to actually widen past its first ring.
  const rnd = (seed) => { let s = seed >>> 0; return () => {
    s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff;
  }; };
  const next = rnd(7);
  const features = Array.from({ length: 500 }, (_, i) => ({
    area: `area-${i % 11}`,
    lat: 53 + next() * 2,   // 53..55
    lon: 9 + next() * 2,    // 9..11
  }));
  const grid = buildFeatureGrid(features);
  // Same distance formula the grid itself uses (haversineKm, via
  // web/datasource.js) — an exact brute force, not an approximation, so the
  // two must agree exactly, at any radius.
  const bruteForce = (lat, lon, maxKm) => {
    let best = null, bestKm = Infinity;
    for (const f of features) {
      const km = haversineKm(lat, lon, f.lat, f.lon);
      if (km < bestKm) { bestKm = km; best = f; }
    }
    return best && bestKm <= maxKm ? best.area : null;
  };
  for (let i = 0; i < 50; i++) {
    const lat = 53 + next() * 2, lon = 9 + next() * 2, radius_m = 50 + next() * 4950;
    const gridResult = answerArea({ lat, lon, radius_m }, grid);
    const expected = bruteForce(lat, lon, radius_m / 1000);
    assert.equal(gridResult, expected, `at (${lat},${lon}) r=${radius_m}`);
  }
});

// A degree of longitude is only ~111 km at the equator and shrinks by
// cos(lat) toward the poles — the grid's ring search has to widen east-west
// to compensate, or it under-covers the requested radius the further north
// (or south) the search is. 70°N with a 5 km radius (the cap) is exactly the
// case that used to reach only ~3.8 km east-west before the ring count
// accounted for cos(lat).
test("buildFeatureGrid + answerArea still matches a brute-force scan near 70°N, at the 5 km cap", () => {
  const rnd = (seed) => { let s = seed >>> 0; return () => {
    s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff;
  }; };
  const next = rnd(70);
  // Scattered mostly east-west of the search points (a narrow latitude band,
  // a wide longitude one) — exactly the direction the bug under-covered.
  const features = Array.from({ length: 300 }, (_, i) => ({
    area: `area-${i % 7}`,
    lat: 69.9 + next() * 0.2,     // 69.9..70.1
    lon: 20 + next() * 4,         // 20..24 — several degrees of longitude
  }));
  const grid = buildFeatureGrid(features);
  const bruteForce = (lat, lon, maxKm) => {
    let best = null, bestKm = Infinity;
    for (const f of features) {
      const km = haversineKm(lat, lon, f.lat, f.lon);
      if (km < bestKm) { bestKm = km; best = f; }
    }
    return best && bestKm <= maxKm ? best.area : null;
  };
  for (let i = 0; i < 50; i++) {
    const lat = 69.9 + next() * 0.2, lon = 20 + next() * 4;
    const gridResult = answerArea({ lat, lon, radius_m: 5000 }, grid);
    const expected = bruteForce(lat, lon, 5);
    assert.equal(gridResult, expected, `at (${lat},${lon}) r=5000 near 70°N`);
  }
});

// ---- Paging ----
test("changesetsUrl: display_name always, time= only when there is a bound to give", () => {
  const api = "https://api.openstreetmap.org/api/0.6";
  assert.equal(changesetsUrl(api, "example_user", null, null),
    "https://api.openstreetmap.org/api/0.6/changesets.json?display_name=example_user");
  // "what's new since the cache": closed after T1, no upper bound.
  assert.equal(changesetsUrl(api, "example_user", "2026-09-01T00:00:00Z", null),
    `${api}/changesets.json?display_name=example_user&time=2026-09-01T00%3A00%3A00Z`);
  // Paging further back than the first 100: T1 stays the watermark (or EPOCH
  // for a first-ever backfill), T2 is the oldest seen so far.
  const withBound = changesetsUrl(api, "example_user", null, "2026-01-01T00:00:00Z");
  assert.ok(withBound.includes(encodeURIComponent(`${EPOCH},2026-01-01T00:00:00Z`)));
  const topUpBound = changesetsUrl(api, "example_user", "2026-06-01T00:00:00Z", "2026-08-01T00:00:00Z");
  assert.ok(topUpBound.includes(encodeURIComponent("2026-06-01T00:00:00Z,2026-08-01T00:00:00Z")));
});

test("pageBoundary: one second past the oldest created_at in a full page, null once a page is short", () => {
  const full = Array.from({ length: 100 }, (_, i) =>
    ({ created_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` }));
  // +1s past the oldest (2026-01-01T00:00:00Z), not the bare value: a
  // changeset sharing that exact second would otherwise be skippable.
  assert.equal(pageBoundary(full), "2026-01-01T00:00:01.000Z");
  assert.equal(pageBoundary(full.slice(0, 99)), null);   // fewer than 100: nothing older to ask for
  assert.equal(pageBoundary([]), null);
  assert.equal(pageBoundary(null), null);
});

test("pageBoundary: an unparseable created_at is returned as-is rather than throwing", () => {
  const full = Array.from({ length: 100 }, () => ({ created_at: "not-a-date" }));
  assert.equal(pageBoundary(full), "not-a-date");
});

test("advanceBackfillCursor: walks the cursor back a page, marks done on a short page", () => {
  const full = Array.from({ length: 100 }, (_, i) =>
    ({ created_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` }));
  const c1 = advanceBackfillCursor(null, full);
  assert.equal(c1.done, false);
  assert.equal(c1.oldest_scanned, "2026-01-01T00:00:01.000Z");
  // A short page (or empty): the true beginning of the reader's history.
  const c2 = advanceBackfillCursor(c1, full.slice(0, 40));
  assert.equal(c2.done, true);
  assert.equal(c2.oldest_scanned, c1.oldest_scanned, "the cursor stops moving once done");
  const c3 = advanceBackfillCursor(null, []);
  assert.deepEqual(c3, { oldest_scanned: null, done: true, floor: null });
});

// ---- Closing a gap the top-up could not finish within its own budget ----
test("reopenGap: floors at the old watermark only when the previous backfill had actually finished", () => {
  const finished = { oldest_scanned: "2020-01-01T00:00:00Z", done: true, floor: null };
  const g1 = reopenGap("2026-08-01T00:00:00Z", "2026-06-01T00:00:00Z", finished);
  assert.deepEqual(g1, { oldest_scanned: "2026-08-01T00:00:00Z", done: false, floor: "2026-06-01T00:00:00Z" });

  // The previous backfill had not finished: there is nothing safe to floor
  // at, so the reopened walk still has to reach the real beginning.
  const unfinished = { oldest_scanned: "2024-03-01T00:00:00Z", done: false, floor: null };
  const g2 = reopenGap("2026-08-01T00:00:00Z", "2026-06-01T00:00:00Z", unfinished);
  assert.deepEqual(g2, { oldest_scanned: "2026-08-01T00:00:00Z", done: false, floor: null });

  // No previous backfill at all (a reader's first-ever top-up gap): same as
  // "not finished" — no floor to give it.
  const g3 = reopenGap("2026-08-01T00:00:00Z", "2026-06-01T00:00:00Z", null);
  assert.equal(g3.floor, null);
});

test("advanceBackfillCursor: a floor stops the reopened walk early, without re-walking known history", () => {
  const cursor = reopenGap("2026-08-01T00:00:00Z", "2026-06-01T00:00:00Z",
    { oldest_scanned: "2020-01-01T00:00:00Z", done: true, floor: null });
  // A full page whose oldest entry (+1s from pageBoundary) lands at or below
  // the floor: the gap is closed, and there is nothing left below it to
  // fetch a second time.
  const page = Array.from({ length: 100 }, (_, i) =>
    ({ created_at: `2026-06-${String(30 - i).padStart(2, "0")}T00:00:00Z` }));
  const next = advanceBackfillCursor(cursor, page);
  assert.equal(next.done, true);
  assert.equal(next.floor, null);

  // Not there yet: still walking, the floor carries forward unchanged.
  const shortOfFloor = Array.from({ length: 100 }, (_, i) =>
    ({ created_at: `2026-07-${String(30 - i).padStart(2, "0")}T00:00:00Z` }));
  const stillGoing = advanceBackfillCursor(cursor, shortOfFloor);
  assert.equal(stillGoing.done, false);
  assert.equal(stillGoing.floor, "2026-06-01T00:00:00Z");
});

// ---- Saved places ----
test("isSaved / addSaved / removeSaved: newest first, deduplicated by osm id", () => {
  let list = addSaved([], { osm: "https://www.openstreetmap.org/node/1", name: "Café", lon: 10, lat: 53 });
  assert.equal(isSaved(list, "https://www.openstreetmap.org/node/1"), true);
  assert.equal(isSaved(list, "https://www.openstreetmap.org/node/2"), false);
  list = addSaved(list, { osm: "https://www.openstreetmap.org/node/2", name: "Bakery", lon: 11, lat: 54 });
  assert.equal(list.length, 2);
  assert.equal(list[0].osm, "https://www.openstreetmap.org/node/2", "newest saved is first");
  // Saving the same place again moves it to the front rather than duplicating it.
  list = addSaved(list, { osm: "https://www.openstreetmap.org/node/1", name: "Café", lon: 10, lat: 53 });
  assert.equal(list.length, 2);
  assert.equal(list[0].osm, "https://www.openstreetmap.org/node/1");
  list = removeSaved(list, "https://www.openstreetmap.org/node/1");
  assert.equal(list.length, 1);
  assert.equal(isSaved(list, "https://www.openstreetmap.org/node/1"), false);
});

test("addSaved: bounded at SAVED_MAX, oldest dropped first", () => {
  let list = [];
  for (let i = 0; i < SAVED_MAX + 5; i++)
    list = addSaved(list, { osm: `https://www.openstreetmap.org/node/${i}`, name: String(i), lon: 0, lat: 0 });
  assert.equal(list.length, SAVED_MAX);
  // The most recently added are kept; the earliest ones fell off the end.
  assert.equal(list[0].osm, `https://www.openstreetmap.org/node/${SAVED_MAX + 4}`);
  assert.equal(isSaved(list, "https://www.openstreetmap.org/node/0"), false);
});

test("addSaved: a missing name is stored as empty, never undefined in the record", () => {
  const list = addSaved([], { osm: "x", lon: 0, lat: 0 });
  assert.equal(list[0].name, "");
  assert.ok(list[0].saved_at);
});

// ---- A background refresh's result must not outlive the login it started under ----
test("refreshApplies: only when the generation has not moved since the refresh began", () => {
  assert.equal(refreshApplies(3, 3), true);
  // logout() or a fresh login bumps the generation while the fetch was in
  // flight: the result it eventually brings back is stale and must not be
  // written.
  assert.equal(refreshApplies(3, 4), false);
  assert.equal(refreshApplies(0, 0), true);
});
