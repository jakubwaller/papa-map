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

import { CREATED_BY } from "./osm.js";
import { localAnswered, haversineKm } from "./datasource.js";

// ---- The game sentence's percentage ----
// localAnswered (web/datasource.js) is the one place "how many tables are
// answered" is computed from stats.json's `local` block; statsLocal (the
// stats strip, web/app.js) and this percentage both call it, so the two can
// never read the counts two different ways — only the presentation (a raw
// count there, a percentage here) differs.
export function answeredPercent(local) {
  if (!local) return null;
  const { tables, known } = localAnswered(local);
  return tables > 0 ? Math.round((known / tables) * 100) : null;
}

// ---- Which clause the sentence needs, and with which numbers ----
// Kept here, tested, rather than three copies of the same branching living in
// template strings: the zero case ("none of those are yours yet") wants
// inviting words, not "0 of those are yours", and the no-fix case swaps the
// grey-pin clause for a small "use my location" action rather than ever
// prompting for one on open. `area` is the already-declined label
// (areaLabel(stats, true) in web/app.js — the same dative form statsLocal
// uses); `percent`/`yours`/`greyCount` are numbers or null when unknown.
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
// MapComplete tags its own changesets `theme: "papamap"` (theme/papamap.theme.json's
// own id) rather than PapaMap's own `created_by` — the hand-off writes under
// MapComplete's name, not this site's — but the theme id is exactly as
// reliable a marker, so both are counted as "yours". Nothing else is: a
// changeset a reader made with iD or StreetComplete on an unrelated object is
// not this project's to count, and is not identifiable from its tags as one
// of ours anyway.
export const MAPCOMPLETE_THEME = "papamap";

export function isOwnChangeset(tags) {
  return !!tags && (tags.created_by === CREATED_BY || tags.theme === MAPCOMPLETE_THEME);
}

// A PapaMap (or MapComplete-under-this-theme) changeset edits exactly one
// changing-table object, so its bounding box is — bar float rounding — a
// point: the centre is where the answer was. No changeset's contents are
// ever downloaded to get this. A changeset with no bbox at all (opened, then
// closed with nothing written — a dropped connection mid-write) is not an
// answer and is dropped rather than counted with a fabricated position.
export function changesetAnswer(cs) {
  if (!cs || !isOwnChangeset(cs.tags)) return null;
  const { min_lon, min_lat, max_lon, max_lat } = cs;
  if (![min_lon, min_lat, max_lon, max_lat].every(Number.isFinite)) return null;
  return {
    id: cs.id,
    lon: (min_lon + max_lon) / 2,
    lat: (min_lat + max_lat) / 2,
    closed_at: cs.closed_at || cs.created_at,
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

// "In this area": papamap.de sweeps one area today — everything the site
// shows — so every one of the reader's own answers already lies in it; see
// CONTRACT.md v39. Kept as its own function rather than inlined as
// `.length` so a future narrower deployment (a single-country build) has one
// place to add a real geographic filter instead of a site-wide rewrite.
export function answersInArea(answers) {
  return (answers ?? []).length;
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

// The oldest `created_at` in a full page — the next call's upper bound — or
// null when the page came back short (fewer than 100: there is nothing older
// left to ask for, so paging stops).
export function pageBoundary(list, fullPage = 100) {
  if (!Array.isArray(list) || list.length < fullPage) return null;
  let oldest = null;
  for (const cs of list) if (cs.created_at && (!oldest || cs.created_at < oldest)) oldest = cs.created_at;
  return oldest;
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
