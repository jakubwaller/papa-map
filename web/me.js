// "Mein PapaMap" — pure logic for the reader's own numbers and saved places.
// No DOM, no fetch, unit-tested via node --test; the wiring (the dialog, the
// star in a popup, the localStorage reads/writes, the OSM request itself)
// lives in web/app.js next to the offline dialog's, the same split
// datasource.js already keeps. CONTRACT.md v39 documents the shapes below.
//
// Nothing here stores anything about anyone: the three functions below that
// touch "the reader" only ever read what the reader's own browser already
// holds (a localStorage cache) or what OSM already publishes about the
// reader's own account (their changesets, which OSM shows to anyone).

// The ?v= pin matches index.html's / app.js's — bump together, or a cached
// half-pair serves for up to an hour (web/app.js's own header, web/sw.test.js
// now checks every shell module's imports for this, not just app.js's).
import { CREATED_BY } from "./osm.js?v=app35";
import { localAnswered, haversineKm } from "./datasource.js?v=app35";

// ---- The game sentence's percentage ----
const pctOf = (tables, known) => (tables > 0 ? Math.round((known / tables) * 100) : null);

// The whole-site fallback only (pickArea found no area — open sea, zoomed to
// the world): localAnswered (web/datasource.js) is the one place "how many
// tables are answered" is computed from stats.json's `local` block;
// statsLocal (the stats strip, web/app.js) and this percentage both call it,
// so the two can never read the counts two different ways.
export function answeredPercent(local) {
  if (!local) return null;
  const { tables, known } = localAnswered(local);
  return pctOf(tables, known);
}

// ---- The game sentence's numbers, scoped to one sweep area ----
// The area is whichever one pickArea chose for the footer link (web/app.js
// keeps that exact row, never picks a second time) — `areaKeys` is its
// areaKeysFor() set (web/datasource.js). Counted over every LOADED feature,
// never the chip-filtered subset: a reader who switched off "female only"
// must not see the score move (CONTRACT.md v39).
export function areaAnswered(features, areaKeys) {
  const keys = areaKeys instanceof Set ? areaKeys : new Set(areaKeys ?? []);
  let tables = 0, known = 0, unknown = 0;
  if (keys.size)
    for (const f of features ?? []) {
      if (!f.area || !keys.has(f.area)) continue;
      tables++;
      if (f.status === "accessible" || f.status === "female_only") known++;
      else if (f.status === "unknown") unknown++;
    }
  return { tables, unknown, known };
}

export function areaPercent(features, areaKeys) {
  const { tables, known } = areaAnswered(features, areaKeys);
  return pctOf(tables, known);
}

// ---- A coarse grid over the loaded features ----
// answerArea (below) used to scan every one of ~26k loaded features per
// answer — a few hundred ms blocked on a phone once a reader has more than
// a handful of answers, run on open and again when the background refresh
// lands. Bucketed once per dataset (web/app.js's applyDataset, the same
// place every other per-dataset value is rebuilt) into ~5.5 km cells;
// answerArea then only compares against the answer's own cell and its
// neighbours, widened just far enough to guarantee the true nearest feature
// within `maxKm` is not missed by a search that stopped at the first ring
// that happened to contain something.
const GRID_DEG = 0.05;   // ~5.56 km north-south; a generous, simple constant
const KM_PER_DEG = 111.32;
const cellOf = (lat, lon) => [Math.floor(lat / GRID_DEG), Math.floor(lon / GRID_DEG)];

export function buildFeatureGrid(features) {
  const grid = new Map();
  for (const f of features ?? []) {
    if (!f.area || !Number.isFinite(f.lat) || !Number.isFinite(f.lon)) continue;
    const [la, lo] = cellOf(f.lat, f.lon);
    const key = `${la},${lo}`;
    let bucket = grid.get(key);
    if (!bucket) grid.set(key, bucket = []);
    bucket.push(f);
  }
  return grid;
}

// The nearest gridded feature to (lat, lon) within maxKm, or null. Rings
// outward from the answer's own cell only as far as maxKm could possibly
// reach, so a small search radius (the common case: a 50 m PapaMap answer)
// touches a handful of cells, never the whole grid. Latitude and longitude
// need separate ring counts: a degree of longitude is only GRID_DEG*KM_PER_DEG
// wide at the equator, and shrinks by cos(lat) moving toward the poles — the
// same ring count in both directions under-covers east-west the further
// north or south the search is (at 70°N, two rings reached ~3.8 km east-west
// while still correctly reaching 5 km north-south, before this).
function nearestInGrid(lat, lon, grid, maxKm) {
  const [baseLa, baseLo] = cellOf(lat, lon);
  const latRings = Math.max(1, Math.ceil(maxKm / (GRID_DEG * KM_PER_DEG)) + 1);
  // Clamped well short of 0 so a search vanishingly close to a pole (no
  // sweep area is, but the formula should not blow up regardless) still
  // gets a finite, generous ring count rather than dividing by ~0.
  const lonScale = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const lonRings = Math.max(1, Math.ceil(maxKm / (GRID_DEG * KM_PER_DEG * lonScale)) + 1);
  let best = null, bestKm = Infinity;
  for (let dLa = -latRings; dLa <= latRings; dLa++) {
    for (let dLo = -lonRings; dLo <= lonRings; dLo++) {
      const bucket = grid.get(`${baseLa + dLa},${baseLo + dLo}`);
      if (!bucket) continue;
      for (const f of bucket) {
        const km = haversineKm(lat, lon, f.lat, f.lon);
        if (km < bestKm) { bestKm = km; best = f; }
      }
    }
  }
  return best && bestKm <= maxKm ? { feature: best, km: bestKm } : null;
}

// Which sweep area a reader's own answer lands in: the `area` of the
// nearest loaded feature within the answer's own `radius_m` (changesetAnswer,
// below — max(50 m, half the changeset's own bbox diagonal), capped at
// 5 km) of the changeset's centre. `grid` is buildFeatureGrid's own index,
// or a plain feature array for a brute-force fallback (tests, a caller with
// nothing built yet). Trusts only that feature's own `area`, never a guess
// from distance alone; an answer with nothing that close (the object has
// since fallen out of the sweep, or the features simply have not loaded
// yet) is not in any area, though it still counts in the reader's total.
export function answerArea(answer, grid) {
  if (!Number.isFinite(answer?.lon) || !Number.isFinite(answer?.lat)) return null;
  const maxKm = Math.min(5, Math.max(0.05, (answer.radius_m ?? 50) / 1000));
  const idx = grid instanceof Map ? grid : buildFeatureGrid(grid);
  const hit = nearestInGrid(answer.lat, answer.lon, idx, maxKm);
  return hit ? hit.feature.area : null;
}

// How many of the reader's own answers fall in the given area (its
// areaKeysFor() set) — each attributed via answerArea above, weighted by
// the changeset's own `n` (changesetAnswer): a MapComplete session answers
// more than one question in the one changeset it opens, and every one of
// those `n` changes is an answer, all landing wherever the changeset itself
// did (CONTRACT.md v39).
export function answersInArea(answers, grid, areaKeys) {
  const keys = areaKeys instanceof Set ? areaKeys : new Set(areaKeys ?? []);
  if (!keys.size) return 0;
  let sum = 0;
  for (const a of answers ?? []) if (keys.has(answerArea(a, grid))) sum += a.n ?? 1;
  return sum;
}

// The reader's answers, total — every `n` summed, not one per cached
// changeset record (the MapComplete-session case above).
export function totalAnswers(answers) {
  return (answers ?? []).reduce((sum, a) => sum + (a.n ?? 1), 0);
}

// ---- Which clause the sentence needs, and with which numbers ----
// Kept here, tested, rather than three copies of the same branching living in
// template strings: the zero case ("none of those are yours yet") wants
// inviting words, not "0 of those are yours", and the no-fix case swaps the
// grey-pin clause for a small "use my location" action rather than ever
// prompting for one on open. `area` is the exact label the footer link
// itself shows ("Wickeltische in Hamburg", `currentAreaLink.label` in
// web/app.js — never a bare sweep-area key on its own, so the dialog and the
// link can never read differently) and the sentence keys are written not to
// need a preposition or a declined form on top of it (web/i18n.js).
// `percent`/`yours`/`greyCount` are numbers or null when unknown.
export function sentenceParts({ area, percent, yours, greyCount, hasFix, mama }) {
  const areaPart = (area && percent != null)
    ? { key: mama ? "meAreaSentenceMama" : "meAreaSentence", vars: { area, percent } }
    : null;
  const yoursPart = yours == null ? null
    : yours > 0 ? { key: "meYours", vars: { n: yours } }
                : { key: "meYoursZero" };
  const greyPart = !hasFix ? { locate: true }
    : greyCount > 0
      ? { key: mama ? "meGreyNearbyMama" : "meGreyNearby", vars: { n: greyCount } }
      : { key: mama ? "meGreyNearbyZeroMama" : "meGreyNearbyZero" };
  return { area: areaPart, yours: yoursPart, grey: greyPart };
}

// ---- Grey pins nearby ----
// Only a genuinely open question counts: `location_raw` is set the moment
// anyone answers in words the classifier does not read, even before tonight's
// build turns the pin green or red (CONTRACT.md v25/v37) — counting those
// here would send a reader to tap something already spoken for. Mama mode
// reads the same pins as amber rather than grey (web/i18n.js), never a
// different set: `status === "unknown"` is the one literal fact, in either
// reading.
export function greyNearby(features, lat, lon, radiusKm = 1) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  return (features ?? []).filter((f) => f.status === "unknown" && !f.location_raw
    && Number.isFinite(f.lat) && Number.isFinite(f.lon)
    && haversineKm(lat, lon, f.lat, f.lon) <= radiusKm);
}

// A flat-earth degrees-per-km box around (lat, lon) — plenty accurate for a
// 1 km circle on a map already drawn in Web Mercator, and needs no map
// instance: map.fitBounds takes exactly this shape (web/app.js).
export function circleBounds(lat, lon, km) {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180) || 1);
  return [[lon - dLon, lat - dLat], [lon + dLon, lat + dLat]];
}

// ---- "Yours": OSM changesets this reader made through PapaMap ----
// MapComplete writes under its own `created_by`, not this site's, and marks
// the changeset with the theme it ran instead. For a theme it loads from a
// URL — which is how every hand-off from this site opens it (`userlayout=`,
// PAPAMAP_THEME in datasource.js) — the `theme` tag is **that URL**, not the
// id inside the file. Until app35 this compared against the bare id only, so
// not one MapComplete session was ever counted: a reader with 3 taps on this
// site and 14 MapComplete sessions was told "3" (build 24, 2026-09-19). The
// bare id stays accepted for the day MapComplete lists the theme itself.
// Nothing else is counted: a changeset a reader made with iD or
// StreetComplete on an unrelated object is not this project's to count, and
// is not identifiable from its tags as one of ours anyway.
export const MAPCOMPLETE_THEME = "papamap";
export const MAPCOMPLETE_THEME_URL =
  "https://raw.githubusercontent.com/jakubwaller/papa-map/main/theme/papamap.theme.json";

export function isOwnChangeset(tags) {
  return !!tags && (tags.created_by === CREATED_BY ||
    tags.theme === MAPCOMPLETE_THEME || tags.theme === MAPCOMPLETE_THEME_URL);
}

// A PapaMap changeset edits exactly one object, so its bounding box is — bar
// float rounding — a point. **A MapComplete changeset is not the same
// shape**: MapComplete reuses one changeset across a whole theme session, so
// one changeset can hold several answers (the room question and the play
// question on one table, or several tables visited in one sitting) spread
// over its own bbox, not a point. MapComplete counts them itself, in the
// changeset's `answer` tag, and that is `n` where it is there. The API's
// `changes_count` is the fallback and is the smaller number: it counts
// object versions, and two questions answered on one table are one version
// (measured on 14 real sessions: 42 answers, 18 changes). `n` defaults to 1
// for a changeset that carries neither (this site's own writes always are
// 1). No changeset's contents are ever downloaded to learn any of this —
// tags, bbox and changes_count are all already on the list the reader's
// changesets.json call returns. A changeset with no bbox at all (opened,
// then closed with nothing written — a dropped connection mid-write) is not
// an answer and is dropped rather than counted with a fabricated position.
const positiveInt = (n) => (Number.isFinite(n) && n > 0 ? Math.round(n) : null);
// A tag is always a string; changes_count is a number or it is not trusted.
const tagCount = (v) => (typeof v === "string" && /^\d+$/.test(v) ? positiveInt(Number(v)) : null);

export function changesetAnswer(cs) {
  if (!cs || !isOwnChangeset(cs.tags)) return null;
  const { min_lon, min_lat, max_lon, max_lat } = cs;
  if (![min_lon, min_lat, max_lon, max_lat].every(Number.isFinite)) return null;
  const n = tagCount(cs.tags.answer) ?? positiveInt(cs.changes_count) ?? 1;
  // Area attribution's own search radius (answerArea, above): a point
  // changeset needs only the 50 m floor, a MapComplete session's wider bbox
  // needs enough to reach every object it touched — half the bbox's own
  // diagonal, capped at 5 km so one changeset can never claim a whole
  // country's worth of area.
  const diagonalM = haversineKm(min_lat, min_lon, max_lat, max_lon) * 1000;
  return {
    id: cs.id,
    lon: (min_lon + max_lon) / 2,
    lat: (min_lat + max_lat) / 2,
    closed_at: cs.closed_at || cs.created_at,
    n,
    radius_m: Math.min(5000, Math.max(50, diagonalM / 2)),
  };
}

// The API's changesets.json list ({ changesets: [...] }'s array already
// unwrapped by the caller) → the compact records the cache stores.
export function extractAnswers(list) {
  return (Array.isArray(list) ? list : []).map(changesetAnswer).filter(Boolean);
}

// Cached and freshly-fetched records, deduplicated by changeset id (the same
// answer can arrive twice: once from the write's own response, appended on
// the spot, and again the next time the list is paged) and sorted newest
// first, which is also the order the OSM API itself returns by default.
export function mergeAnswers(cached, fresh) {
  const byId = new Map();
  for (const a of [...(cached ?? []), ...(fresh ?? [])]) byId.set(a.id, a);
  return [...byId.values()].sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""));
}

export function newestClosedAt(answers) {
  return answers?.[0]?.closed_at ?? null;   // mergeAnswers keeps them newest-first
}

export function oldestClosedAt(answers) {
  return answers?.length ? answers[answers.length - 1].closed_at ?? null : null;
}

// ---- Paging the OSM changesets list ----
// GET .../changesets.json?display_name=U[&time=...] returns at most 100,
// newest first. `time=T1` asks "closed after T1" — exactly a "what's new
// since the cache" query. `time=T1,T2` additionally bounds "created before
// T2", which is how a page beyond the first 100 is reached: T1 stays the
// cache's watermark (or the start of OSM's own history, for a first-ever
// backfill) and T2 becomes the oldest `created_at` seen so far, so the next
// call picks up exactly where the last one stopped rather than repeating it.
export const EPOCH = "1970-01-01T00:00:00Z";

export function changesetsUrl(api, user, since, before) {
  const u = new URL(`${api}/changesets.json`);
  u.searchParams.set("display_name", user);
  if (before) u.searchParams.set("time", `${since || EPOCH},${before}`);
  else if (since) u.searchParams.set("time", since);
  return u.href;
}

// The next call's upper bound — a page beyond the first 100 is reached by
// asking for `created_at` before this — or null when the page came back
// short (fewer than 100: there is nothing older left to ask for, so paging
// stops). One second later than the page's own oldest `created_at`: OSM's
// `time=` bound has only second resolution, so a full page that happens to
// end mid-second could have one changeset sharing that second cut off by
// the 100-item limit and then excluded again by an exclusive "before" bound
// set to that exact second. The +1s reopens that whole second on the next
// call; mergeAnswers' own dedup-by-id absorbs the repeat this introduces for
// the changeset(s) already on this page.
export function pageBoundary(list, fullPage = 100) {
  if (!Array.isArray(list) || list.length < fullPage) return null;
  let oldest = null;
  for (const cs of list) if (cs.created_at && (!oldest || cs.created_at < oldest)) oldest = cs.created_at;
  if (!oldest) return null;
  const d = new Date(oldest);
  return Number.isNaN(d.getTime()) ? oldest : new Date(d.getTime() + 1000).toISOString();
}

// ---- Backfilling further into the reader's history than one open can reach ----
// A first-ever open can only spend MY_ANSWERS_PAGES pages (web/app.js)
// before its budget runs out — for a reader who has mapped through PapaMap
// for a while, or who also makes a lot of unrelated edits (the API filters
// by user, not by tag, so every one of those counts against the same page
// budget), that is not their whole history. `cursor` is `{oldest_scanned,
// done, floor}`, kept in the cache record: `oldest_scanned` is how far back
// a `time=EPOCH,<oldest_scanned>` scan has reached across every open
// combined, `done` once a page has come back short — the true beginning of
// the reader's OSM history, not just this session's budget running out —
// or once the walk reaches `floor` (below). `floor` is null on an ordinary
// backfill (the walk must reach the real beginning); reopenGap sets it when
// this cursor is standing in for an unfinished top-up instead (below).
export function advanceBackfillCursor(cursor, page) {
  const boundary = pageBoundary(page);
  if (!boundary) return { oldest_scanned: cursor?.oldest_scanned ?? null, done: true, floor: null };
  // Reached (or passed) the floor: everything below it was already known
  // before this cursor was reopened to close a gap, so there is nothing
  // further to walk — see reopenGap.
  if (cursor?.floor && boundary <= cursor.floor) return { oldest_scanned: boundary, done: true, floor: null };
  return { oldest_scanned: boundary, done: false, floor: cursor?.floor ?? null };
}

// A top-up (web/app.js's fetchMyAnswers) always starts unbounded at the very
// top of the reader's changesets, so it always learns the true newest ones
// in its first page regardless of budget — but if its budget runs out before
// it pages all the way back down to the cache's own OLD watermark, the
// stretch between where it stopped (`before`) and that old watermark
// (`oldWatermark`) has not been examined at all, and must not simply vanish
// the moment the watermark advances past it on the next open. This reopens
// the backfill cursor there instead of at the true beginning: `floor` is set
// to `oldWatermark` only when `previousBackfill` had already finished
// (`done`) — only then is everything below `oldWatermark` actually already
// known, so the reopened walk can stop there rather than needlessly
// re-walking history it already has. When the previous backfill had NOT
// finished, there is no safe floor to give it (below `oldWatermark` may
// still be genuinely unscanned) and the walk must reach the real beginning,
// same as an ordinary backfill.
//
// Known simplification: if a second gap opens while an earlier one is still
// being closed, this reopens at the newer gap's own point and the older,
// still-unfinished stretch between the two is not separately tracked — a
// reader would need to leave more than a page's worth of new changesets
// between nearly every single dialog open for that to matter in practice.
export function reopenGap(before, oldWatermark, previousBackfill) {
  return { oldest_scanned: before, done: false, floor: previousBackfill?.done ? oldWatermark : null };
}

// ---- Saved places (device only, papamap-saved) ----
// A bounded list, not a bag that grows forever on someone's phone: 200 is
// comfortably more than a reader keeps meaning to revisit, and the record is
// tiny (an id, a name, a point, a date) so 200 of them is a few kilobytes.
export const SAVED_MAX = 200;

export function isSaved(list, osm) {
  return (list ?? []).some((r) => r.osm === osm);
}

export function addSaved(list, place) {
  const rest = (list ?? []).filter((r) => r.osm !== place.osm);
  return [{ osm: place.osm, name: place.name ?? "", lon: place.lon, lat: place.lat,
            saved_at: place.saved_at ?? new Date().toISOString() }, ...rest].slice(0, SAVED_MAX);
}

export function removeSaved(list, osm) {
  return (list ?? []).filter((r) => r.osm !== osm);
}

// ---- May a background refresh's result still be applied? ----
// A reader can log out — or into a different account — while a changesets
// fetch is still in flight (the logout button lives inside this very
// dialog); the privacy page's own promise ("deleted on logout") has to hold
// even then. `startGeneration` is what the generation counter read at the
// moment the refresh began; `currentGeneration` is what it reads now, after
// the fetch has resolved. Kept as its own tested function, trivial as the
// comparison is, so "may this still be applied" is one decision rather than
// a comparison re-typed at every call site that needs it.
export function refreshApplies(startGeneration, currentGeneration) {
  return startGeneration === currentGeneration;
}
