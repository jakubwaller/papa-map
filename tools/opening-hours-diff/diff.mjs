// Differential check of web/opening-hours.js against the reference
// opening_hours library (the one openingh.openstreetmap.de runs on).
//
// Every opening_hours value in the data is evaluated by both at a grid of
// timestamps; wherever ours gives an answer ("open"/"closed") the reference
// must agree. Ours returning "unknown" is a coverage gap, not a bug, and is
// only counted. Run it before merging any change to the parser:
//
//   cd tools/opening-hours-diff && npm ci && node diff.mjs [file-or-url ...]
//
// With no arguments it fetches the live layers from papamap.de. Exits 1 when
// there is any disagreement.

// Ours reads the clock in the device's timezone; pin it before any Date.
process.env.TZ = "Europe/Berlin";

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { isOpenNow } from "../../web/opening-hours.js";

const OpeningHours = createRequire(import.meta.url)("opening_hours");

const DEFAULT_SOURCES = [
  "https://papamap.de/data/changing_tables.geojson",
  "https://papamap.de/data/play_places.geojson",
];
// Ours assumes "today is not a public holiday"; the reference knows the
// calendar. Holidays are looked up for Hamburg, and any sampled date that is a
// public or school holiday there is dropped, so both read PH/SH the same way.
const ADDRESS = { country_code: "de", state: "Hamburg" };
// One week per season, so month/date selectors and sun times vary and every
// weekday is covered.
const WEEKS = ["2026-02-09", "2026-06-15", "2026-10-05"];
const STEP_MINUTES = 30;
const EXAMPLES = 3;
const SUN_SLACK = 10; // minutes
const shift = (at, min) => new Date(at.getTime() + min * 60000);

// The reference expects a Nominatim response: coordinates as strings. Given
// numbers it silently falls back to fixed 06:00/18:00 sun times.
const nominatim = (lat, lon) => ({ lat: String(lat), lon: String(lon), address: ADDRESS });

// Where the two deliberately differ: a span that runs past midnight
// ("Th 20:00-02:00"). Ours keeps the after-midnight part with the day it
// started on, so a later rule for the next day ("Fr 10:00-12:00") doesn't
// cancel it; the reference re-evaluates it as part of the next day, where
// such a rule overrides it. Disagreements before the latest such spill end are
// counted as this known difference instead of failing the run.
function spillEnd(value) {
  let max = 0;
  for (const [, sh, sm, eh, em] of value.matchAll(/(\d\d):(\d\d)\s*-\s*(\d\d):(\d\d)/g)) {
    const start = sh * 60 + +sm, end = eh * 60 + +em;
    if (end > 24 * 60) max = Math.max(max, end - 24 * 60);
    else if (end <= start && !(start === 0 && end === 0)) max = Math.max(max, end);
  }
  return max;
}

async function load(src) {
  const text = /^https?:/.test(src)
    ? await (await fetch(src)).text()
    : await readFile(src, "utf8");
  return JSON.parse(text).features;
}

function sampleDates() {
  const holidayCheck = new OpeningHours("PH,SH", nominatim(53.55, 10));
  const out = [];
  for (const start of WEEKS) {
    const [y, m, d] = start.split("-").map(Number);
    for (let i = 0; i < 7; i++) {
      if (holidayCheck.getState(new Date(y, m - 1, d + i, 12, 0))) {
        console.log(`skipping holiday ${new Date(y, m - 1, d + i).toDateString()}`);
        continue;
      }
      for (let min = 0; min < 24 * 60; min += STEP_MINUTES) {
        out.push(new Date(y, m - 1, d + i, 0, min));
      }
    }
  }
  return out;
}

const sources = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_SOURCES;
const features = (await Promise.all(sources.map(load))).flat();

// Sun-dependent values are evaluated per place; everything else once per value.
const cases = new Map();
let farSun = 0;
for (const f of features) {
  const value = f.properties?.opening_hours;
  if (!value || f.geometry?.type !== "Point") continue;
  const [lon, lat] = f.geometry.coordinates;
  const sun = /sunrise|sunset|dawn|dusk/.test(value);
  // Ours assumes the device is in the place's timezone, and this run pins
  // Europe/Berlin, so sun values are only comparable for places near it.
  if (sun && (lon < -25 || lon > 45)) { farSun++; continue; }
  const key = sun ? `${value}\u0000${lat},${lon}` : value;
  if (!cases.has(key)) cases.set(key, { value, lat, lon, sun: key !== value, places: 0 });
  cases.get(key).places++;
}

const dates = sampleDates();
let rejected = 0, gaps = 0, agreed = 0;
const overnight = [];
const disagreements = [];
const rejectedButOursKnows = [];

for (const c of cases.values()) {
  const coords = { lat: c.lat, lon: c.lon };
  let ref = null;
  try {
    ref = new OpeningHours(c.value, nominatim(c.lat, c.lon));
  } catch {
    rejected++;
  }
  const examples = [];
  const spill = c.sun ? 0 : spillEnd(c.value);
  let bad = 0, spillOnly = 0, knows = false, gap = false;
  for (const at of dates) {
    const ours = isOpenNow(c.value, at, coords);
    if (ours === "unknown") { gap = true; continue; }
    knows = true;
    if (!ref || ref.getUnknown(at)) continue;
    const theirs = ref.getState(at) ? "open" : "closed";
    if (ours === theirs) continue;
    // Sun times: the two use different solar models (ours NOAA, the reference
    // SunCalc), a few minutes apart. Ignore a mismatch right at a transition.
    if (c.sun && ref.getState(shift(at, -SUN_SLACK)) !== ref.getState(shift(at, SUN_SLACK))) continue;
    if (at.getHours() * 60 + at.getMinutes() < spill) { spillOnly++; continue; }
    bad++;
    if (examples.length < EXAMPLES) examples.push(`${at.toString().slice(0, 21)}: ours ${ours}, reference ${theirs}`);
  }
  if (!ref && knows) rejectedButOursKnows.push(c);
  if (gap) gaps++;
  if (bad) disagreements.push({ ...c, bad, examples });
  else if (spillOnly) overnight.push(c);
  else if (knows && ref) agreed++;
}

console.log(`${features.length} features, ${cases.size} distinct values, ${dates.length} timestamps each`);
console.log(`sun-dependent places outside Europe, skipped: ${farSun}`);
console.log(`agree everywhere ours answers: ${agreed}`);
console.log(`ours unknown at some timestamp (coverage gap): ${gaps}`);
console.log(`reference rejects: ${rejected} (of which ours answers: ${rejectedButOursKnows.length})`);
console.log(`known difference, after-midnight spill (not a failure): ${overnight.length}`);
console.log(`disagreements: ${disagreements.length}`);

disagreements.sort((a, b) => b.places - a.places);
for (const d of disagreements) {
  const where = d.sun ? `, at ${d.lat},${d.lon}` : "";
  console.log(`\n${JSON.stringify(d.value)}  [${d.places} place(s)${where}, ${d.bad} timestamps]`);
  for (const e of d.examples) console.log(`  ${e}`);
}
if (rejectedButOursKnows.length) {
  console.log("\nreference rejects, ours answers:");
  for (const c of rejectedButOursKnows) console.log(`  ${JSON.stringify(c.value)}`);
}
process.exitCode = disagreements.length ? 1 : 0;
