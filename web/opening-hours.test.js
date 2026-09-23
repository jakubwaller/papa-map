import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpenNow, parseOpeningHours } from "./opening-hours.js";

// Helper: a Date for a given ISO weekday (1 = Monday .. 7 = Sunday) and
// HH:MM, anchored to a known Monday (2026-09-21) so day arithmetic is easy
// to check by eye.
const MONDAY = new Date(2026, 8, 21); // 2026-09-21 is a Monday
function at(isoWeekday, hh, mm) {
  const d = new Date(MONDAY);
  d.setDate(d.getDate() + (isoWeekday - 1));
  d.setHours(hh, mm, 0, 0);
  return d;
}

test("24/7 is always open", () => {
  assert.equal(isOpenNow("24/7", at(1, 0, 0)), "open");
  assert.equal(isOpenNow("24/7", at(7, 23, 59)), "open");
});

test("a plain day range with hours", () => {
  const oh = "Mo-Fr 08:00-18:00";
  assert.equal(isOpenNow(oh, at(1, 8, 0)), "open");   // Monday, opening minute
  assert.equal(isOpenNow(oh, at(5, 17, 59)), "open"); // Friday, last minute
  assert.equal(isOpenNow(oh, at(5, 18, 0)), "closed"); // Friday, closing minute
  assert.equal(isOpenNow(oh, at(6, 12, 0)), "closed"); // Saturday: not listed
});

test("a day list (not a range)", () => {
  const oh = "Mo,We 09:00-12:00";
  assert.equal(isOpenNow(oh, at(1, 10, 0)), "open");
  assert.equal(isOpenNow(oh, at(2, 10, 0)), "closed"); // Tuesday: not in the list
  assert.equal(isOpenNow(oh, at(3, 10, 0)), "open");
});

test("Sa-Su, a same-week range", () => {
  const oh = "Sa-Su 10:00-16:00";
  assert.equal(isOpenNow(oh, at(6, 11, 0)), "open");
  assert.equal(isOpenNow(oh, at(7, 11, 0)), "open");
  assert.equal(isOpenNow(oh, at(1, 11, 0)), "closed");
});

test("Fr-Mo, a wrap-around day range", () => {
  const oh = "Fr-Mo 12:00-14:00";
  assert.equal(isOpenNow(oh, at(5, 13, 0)), "open");  // Friday
  assert.equal(isOpenNow(oh, at(6, 13, 0)), "open");  // Saturday
  assert.equal(isOpenNow(oh, at(7, 13, 0)), "open");  // Sunday
  assert.equal(isOpenNow(oh, at(1, 13, 0)), "open");  // Monday
  assert.equal(isOpenNow(oh, at(2, 13, 0)), "closed"); // Tuesday
});

test("multiple rules separated by ;, later overriding earlier", () => {
  const oh = "Mo-Su 08:00-20:00; Tu off";
  assert.equal(isOpenNow(oh, at(1, 10, 0)), "open");
  assert.equal(isOpenNow(oh, at(2, 10, 0)), "closed"); // Tuesday overridden to off
  assert.equal(isOpenNow(oh, at(3, 10, 0)), "open");
});

test("multiple time spans separated by , (a lunch break)", () => {
  const oh = "Mo-Fr 08:00-12:00,13:00-18:00";
  assert.equal(isOpenNow(oh, at(1, 9, 0)), "open");
  assert.equal(isOpenNow(oh, at(1, 12, 30)), "closed");
  assert.equal(isOpenNow(oh, at(1, 14, 0)), "open");
});

test("a span that crosses midnight", () => {
  const oh = "22:00-02:00";
  assert.equal(isOpenNow(oh, at(3, 23, 0)), "open");  // Wednesday night
  assert.equal(isOpenNow(oh, at(4, 1, 0)), "open");   // early Thursday, still last night's span
  assert.equal(isOpenNow(oh, at(4, 3, 0)), "closed");
  assert.equal(isOpenNow(oh, at(4, 21, 0)), "closed");
});

test("off and closed close a place outright", () => {
  assert.equal(isOpenNow("off", at(1, 12, 0)), "closed");
  assert.equal(isOpenNow("closed", at(1, 12, 0)), "closed");
});

test("PH off is ignored, not evaluated as a holiday guess", () => {
  const oh = "Mo-Su 08:00-20:00; PH off";
  // We have no calendar, so PH off neither opens nor closes anything here —
  // the surrounding Mo-Su rule still governs every day including today.
  assert.equal(isOpenNow(oh, at(1, 10, 0)), "open");
  assert.equal(isOpenNow(oh, at(7, 10, 0)), "open");
});

test("a value that is only PH/SH rules is unknown, not closed", () => {
  assert.equal(isOpenNow("PH off"), "unknown");
  assert.equal(isOpenNow("SH off"), "unknown");
  assert.equal(isOpenNow("PH,SH off"), "unknown");
});

test("unparseable forms return unknown rather than a guess", () => {
  assert.equal(isOpenNow("Jan-Dec 08:00-18:00"), "unknown");
  assert.equal(isOpenNow("week 1-20 Mo-Fr 08:00-18:00"), "unknown");
  assert.equal(isOpenNow("sunrise-sunset"), "unknown");
  assert.equal(isOpenNow("Mo-Fr 10:00+"), "unknown");
  assert.equal(isOpenNow('Mo-Fr 08:00-18:00 "by appointment"'), "unknown");
  assert.equal(isOpenNow("2026 Mo-Fr 08:00-18:00"), "unknown");
});

test("garbage, empty, and missing values are unknown", () => {
  assert.equal(isOpenNow(""), "unknown");
  assert.equal(isOpenNow(undefined), "unknown");
  assert.equal(isOpenNow(null), "unknown");
  assert.equal(isOpenNow("nonsense value"), "unknown");
});

test("parseOpeningHours exposes the parsed rules for the unparseable case", () => {
  assert.equal(parseOpeningHours("Mo-Fr 08:00-18:00").length, 1);
  assert.equal(parseOpeningHours("sunrise-sunset"), null);
});
