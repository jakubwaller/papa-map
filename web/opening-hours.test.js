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
  assert.equal(isOpenNow("week 1-20 Mo-Fr 08:00-18:00"), "unknown");
  // A sun-event span needs coordinates; without them it's unknown even
  // though the syntax itself is understood (see the "sun events" tests).
  assert.equal(isOpenNow("sunrise-sunset"), "unknown");
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
  assert.equal(parseOpeningHours("week 1-20 Mo-Fr 08:00-18:00"), null);
});

test("a , between rules adds a day range rather than overriding", () => {
  const oh = "Mo-Fr 08:00-12:00, Sa 08:00-12:00";
  assert.equal(isOpenNow(oh, at(1, 9, 0)), "open");   // Monday
  assert.equal(isOpenNow(oh, at(5, 9, 0)), "open");   // Friday
  assert.equal(isOpenNow(oh, at(6, 9, 0)), "open");   // Saturday, added by the ,
  assert.equal(isOpenNow(oh, at(7, 9, 0)), "closed"); // Sunday: neither rule names it
});

test("a day list with spaces after the comma (Mo, Tu)", () => {
  const oh = "Mo, Tu 10:00-18:00";
  assert.equal(isOpenNow(oh, at(1, 11, 0)), "open");
  assert.equal(isOpenNow(oh, at(2, 11, 0)), "open");
  assert.equal(isOpenNow(oh, at(3, 11, 0)), "closed"); // Wednesday: not in the list
});

test("a , time-span list still behaves as before, not as an additional rule", () => {
  const oh = "Mo-Fr 08:00-12:00,14:00-18:00";
  assert.equal(isOpenNow(oh, at(1, 9, 0)), "open");
  assert.equal(isOpenNow(oh, at(1, 13, 0)), "closed");
  assert.equal(isOpenNow(oh, at(1, 15, 0)), "open");
});

test("a , additional rule combined with a ; override", () => {
  const oh = "Mo-Fr 09:00-17:00, Sa 10:00-14:00; Su off";
  assert.equal(isOpenNow(oh, at(3, 10, 0)), "open");   // Wednesday
  assert.equal(isOpenNow(oh, at(6, 11, 0)), "open");   // Saturday, added by the ,
  assert.equal(isOpenNow(oh, at(6, 15, 0)), "closed"); // Saturday, after its hours
  assert.equal(isOpenNow(oh, at(7, 12, 0)), "closed"); // Sunday, closed by the ; rule
});

test("a , additional rule mixed with a PH off rule", () => {
  const oh = "Mo-Fr 09:00-17:00, Sa 10:00-14:00; PH off";
  // PH off is skipped (no calendar), so the additional Saturday rule still
  // governs — it must not be swallowed by the unrelated PH rule.
  assert.equal(isOpenNow(oh, at(6, 11, 0)), "open");
  assert.equal(isOpenNow(oh, at(1, 10, 0)), "open");
});

test("an ambiguous , group (overlapping days) is unknown, not guessed", () => {
  // Su appears in both the Mo-Su rule and the Su-only rule that follows it
  // with ',' — whether the second is meant to add to or replace the first
  // isn't decidable from the text, so this must not guess either way.
  const oh = "Mo-Su 11:00-23:00, Su 12:00-20:00";
  assert.equal(isOpenNow(oh, at(7, 13, 0)), "unknown");
  assert.equal(parseOpeningHours(oh), null);
});

test("PH mixed into a day selector keeps the weekdays", () => {
  const oh = "Tu-Fr 08:00-17:00; Sa 09:00-17:00; PH,Su 10:00-17:00";
  assert.equal(isOpenNow(oh, at(7, 11, 0)), "open");   // Sunday, from PH,Su
  assert.equal(isOpenNow(oh, at(7, 9, 0)), "closed");  // Sunday, before opening
  assert.equal(isOpenNow(oh, at(1, 10, 0)), "closed"); // Monday, no rule
  assert.equal(isOpenNow(oh, at(2, 9, 0)), "open");    // Tuesday
  assert.equal(isOpenNow("Su,SH 10:00-17:00", at(7, 11, 0)), "open");
});

test("a PH-only rule with times is skipped, never evaluated", () => {
  assert.equal(isOpenNow("Mo-Fr 09:00-18:00, PH 10:00-12:00", at(1, 10, 0)), "open");
  assert.equal(isOpenNow("PH 10:00-12:00", at(1, 10, 0)), "unknown");
});

// Helper: an arbitrary local date+time, for the month/date-selector tests
// where the weekday matters less than the calendar date.
function on(year, month, day, hh, mm) {
  return new Date(year, month - 1, day, hh, mm);
}

test("a month range, open all day within it", () => {
  const oh = "Apr-Oct";
  assert.equal(isOpenNow(oh, on(2026, 6, 15, 3, 0)), "open");   // June, any hour
  assert.equal(isOpenNow(oh, on(2026, 4, 1, 0, 0)), "open");    // first instant of Apr
  assert.equal(isOpenNow(oh, on(2026, 10, 31, 23, 59)), "open"); // last instant of Oct
  assert.equal(isOpenNow(oh, on(2026, 11, 1, 12, 0)), "closed"); // outside the range
  assert.equal(isOpenNow(oh, on(2026, 3, 31, 12, 0)), "closed");
});

test("a wrapping month range (Nov-Apr)", () => {
  const oh = "Nov-Apr";
  assert.equal(isOpenNow(oh, on(2026, 12, 15, 12, 0)), "open");
  assert.equal(isOpenNow(oh, on(2026, 1, 15, 12, 0)), "open");
  assert.equal(isOpenNow(oh, on(2026, 6, 15, 12, 0)), "closed");
});

test("a month selector with a colon, ahead of weekdays and times", () => {
  const oh = "May-Sep: Mo-Fr 08:00-20:00";
  assert.equal(isOpenNow(oh, on(2026, 6, 1, 10, 0)), "open");    // Monday, June
  assert.equal(isOpenNow(oh, on(2026, 6, 1, 21, 0)), "closed");  // Monday, June, after hours
  assert.equal(isOpenNow(oh, on(2026, 12, 1, 10, 0)), "closed"); // outside May-Sep
});

test("a month selector ahead of a plain time span, no weekday", () => {
  const oh = "May-Oct 09:00-22:00; Nov-Apr off";
  assert.equal(isOpenNow(oh, on(2026, 7, 1, 10, 0)), "open");
  assert.equal(isOpenNow(oh, on(2026, 1, 15, 10, 0)), "closed");
});

test("a single month and a list of months", () => {
  assert.equal(isOpenNow("Feb,Nov 09:00-17:00", on(2026, 2, 10, 10, 0)), "open");
  assert.equal(isOpenNow("Feb,Nov 09:00-17:00", on(2026, 11, 10, 10, 0)), "open");
  assert.equal(isOpenNow("Feb,Nov 09:00-17:00", on(2026, 6, 10, 10, 0)), "closed");
});

test("a day-precise month range, same month and crossing months", () => {
  assert.equal(isOpenNow("Nov 01-Mar 15 09:00-17:00", on(2026, 12, 25, 10, 0)), "open");
  assert.equal(isOpenNow("Nov 01-Mar 15 09:00-17:00", on(2026, 3, 15, 10, 0)), "open");
  assert.equal(isOpenNow("Nov 01-Mar 15 09:00-17:00", on(2026, 3, 16, 10, 0)), "closed");
  assert.equal(isOpenNow("Apr 1-Oct 31 09:00-17:00", on(2026, 5, 1, 10, 0)), "open");
});

test("single dates and a date list closed for the holidays", () => {
  const oh = "Mo-Su 09:00-17:00; Dec 25-26,Jan 01 closed";
  assert.equal(isOpenNow(oh, on(2026, 12, 24, 10, 0)), "open");
  assert.equal(isOpenNow(oh, on(2026, 12, 25, 10, 0)), "closed");
  assert.equal(isOpenNow(oh, on(2026, 12, 26, 10, 0)), "closed");
  assert.equal(isOpenNow(oh, on(2027, 1, 1, 10, 0)), "closed");
  assert.equal(isOpenNow(oh, on(2026, 12, 27, 10, 0)), "open");
});

test("comma-joined additive rules each carrying their own date prefix", () => {
  const oh = "Oct-Mar: Mo-Th 06:00-22:00, Oct-Mar: Fr-Su,PH 06:00-02:00, Apr-Sep: Mo-Su 07:00-23:00";
  assert.equal(isOpenNow(oh, on(2026, 1, 5, 10, 0)), "open");   // Jan, Monday, within Oct-Mar hours
  assert.equal(isOpenNow(oh, on(2026, 1, 5, 23, 0)), "closed"); // Jan, Monday, Mo-Th ends 22:00
  assert.equal(isOpenNow(oh, on(2026, 1, 9, 23, 0)), "open");   // Jan, Friday, Fr-Su hours go later
  assert.equal(isOpenNow(oh, on(2026, 7, 6, 22, 0)), "open");   // July, Monday, Apr-Sep hours
});

test("a rule with a non-matching date selector does not override the default", () => {
  const oh = "Mo-Su 08:00-18:00; Apr-Oct Mo-Su 08:00-20:00";
  assert.equal(isOpenNow(oh, on(2026, 12, 1, 19, 0)), "closed"); // Dec: only the default rule applies
  assert.equal(isOpenNow(oh, on(2026, 6, 1, 19, 0)), "open");    // June: the Apr-Oct override applies
});

test("midnight spill from a date-restricted rule respects yesterday's date", () => {
  // The span crosses midnight; the late-night portion on Nov 1 belongs to
  // an Oct 31 application of the rule, so it must still honour Oct 31 being
  // inside Apr-Oct (last day) while Nov 1 itself is not.
  const oh = "Apr-Oct 20:00-02:00";
  assert.equal(isOpenNow(oh, on(2026, 10, 31, 23, 0)), "open");  // Oct 31, still in range
  assert.equal(isOpenNow(oh, on(2026, 11, 1, 1, 0)), "open");    // spill from Oct 31's span
  assert.equal(isOpenNow(oh, on(2026, 11, 1, 21, 0)), "closed"); // Nov 1 itself, out of range
});

test("months/dates that don't parse (year ranges, week numbers) stay unknown", () => {
  assert.equal(isOpenNow("2020-2026 Mo-Fr 08:00-18:00"), "unknown");
  assert.equal(isOpenNow("week 1-20 Mo-Fr 08:00-18:00"), "unknown");
});

test("|| takes only the first alternative", () => {
  const oh = "Mo-Fr 08:00-18:00 || 24/7";
  assert.equal(isOpenNow(oh, at(1, 20, 0)), "closed"); // the 24/7 fallback is never consulted
  assert.equal(isOpenNow(oh, at(1, 10, 0)), "open");
});

test("a comment after an explicit state keyword is stripped and evaluated", () => {
  assert.equal(isOpenNow('07:00-23:00 open "Restaurant"', at(1, 10, 0)), "open");
  assert.equal(isOpenNow('Mo-Fr 08:00-18:00 off "closed for renovation"', at(1, 10, 0)), "closed");
});

test("a comment with no explicit state keyword is unknown, not guessed", () => {
  assert.equal(isOpenNow('24/7 "depends on the park"', at(1, 10, 0)), "unknown");
  assert.equal(isOpenNow('"by appointment only"', at(1, 10, 0)), "unknown");
});

test("open end (+): closed before the start, open until midnight", () => {
  assert.equal(isOpenNow("Mo-Fr 11:00+", at(1, 10, 59)), "closed");
  assert.equal(isOpenNow("Mo-Fr 11:00+", at(1, 11, 0)), "open");
  assert.equal(isOpenNow("Mo-Fr 11:00+", at(1, 23, 59)), "open");
  assert.equal(isOpenNow("Mo-Su 00:00-24:00+", at(1, 0, 0)), "open");
});

test("00:00+ is open all day", () => {
  assert.equal(isOpenNow("00:00+", at(3, 0, 0)), "open");
  assert.equal(isOpenNow("00:00+", at(3, 23, 59)), "open");
});

test("an a-b+ span is the guaranteed a-b portion, the + is not extended", () => {
  assert.equal(isOpenNow("Mo-Fr 12:00-14:00+", at(1, 13, 0)), "open");
  assert.equal(isOpenNow("Mo-Fr 12:00-14:00+", at(1, 15, 0)), "closed");
});

test("times past 24:00 mean the small hours of the next day", () => {
  const oh = "Fr,Sa 08:00-25:00";
  assert.equal(isOpenNow(oh, at(5, 23, 0)), "open");  // Friday night
  assert.equal(isOpenNow(oh, at(6, 0, 30)), "open");  // just after midnight, still Friday's span
  assert.equal(isOpenNow(oh, at(6, 0, 59)), "open");  // last minute before the 25:00 = 01:00 close
  assert.equal(isOpenNow(oh, at(6, 1, 0)), "closed");  // 25:00 = 01:00 Saturday, the closing minute
  assert.equal(isOpenNow(oh, at(6, 1, 30)), "closed"); // past the 01:00 close
  assert.equal(isOpenNow(oh, at(7, 12, 0)), "closed"); // Sunday: not listed
});

test("00:00-00:00 means open all day", () => {
  assert.equal(isOpenNow("Mo-Su 00:00-00:00", at(3, 3, 0)), "open");
  assert.equal(isOpenNow("Mo-Su 00:00-00:00", at(3, 23, 59)), "open");
});

test("whitespace around - in day and time ranges", () => {
  assert.equal(isOpenNow("Mo - Sa 08:00 - 19:00", at(3, 10, 0)), "open");
  assert.equal(isOpenNow("Mo - Sa 08:00 - 19:00", at(7, 10, 0)), "closed"); // Sunday
  assert.equal(isOpenNow("Mo - Sa 08:00 - 19:00", at(3, 20, 0)), "closed");
});

test("a comma-joined additive group unions hours on a shared weekday", () => {
  const oh = "Mo-Sa 10:00-20:00, Fr-Sa 20:00-22:00";
  assert.equal(isOpenNow(oh, at(5, 12, 0)), "open");   // Friday, within the base hours
  assert.equal(isOpenNow(oh, at(5, 21, 0)), "open");   // Friday, within the added evening hours
  assert.equal(isOpenNow(oh, at(1, 21, 0)), "closed"); // Monday: no evening rule applies
  assert.equal(isOpenNow(oh, at(6, 21, 0)), "open");   // Saturday, added hours
});

test("an additive off rule still closes its day within the group", () => {
  const oh = "Mo,PH off, Tu-Sa 18:00-24:00, Su 12:00-24:00";
  assert.equal(isOpenNow(oh, at(1, 12, 0)), "closed"); // Monday: off
  assert.equal(isOpenNow(oh, at(3, 19, 0)), "open");   // Wednesday
  assert.equal(isOpenNow(oh, at(7, 13, 0)), "open");   // Sunday
});

test("sun events: sunrise/sunset without coordinates stay unknown", () => {
  assert.equal(isOpenNow("sunrise-sunset", at(3, 12, 0)), "unknown");
});

test("sun events: sunrise-sunset with coordinates (Berlin)", () => {
  const berlin = { lat: 52.52, lon: 13.405 };
  // 2026-06-21 (summer solstice-ish), Berlin sunrise is roughly 04:43 local.
  const summer = on(2026, 6, 21, 12, 0);
  assert.equal(isOpenNow("sunrise-sunset", summer, berlin), "open");
  assert.equal(isOpenNow("sunrise-sunset", on(2026, 6, 21, 2, 0), berlin), "closed");
  assert.equal(isOpenNow("sunrise-sunset", on(2026, 6, 21, 23, 0), berlin), "closed");
});

test("sun events: computed sunrise matches a known reference within a few minutes", () => {
  // Berlin, 2026-06-21: sunrise ~04:43 local (CEST, UTC+2). Tolerate ±3 min.
  const berlin = { lat: 52.52, lon: 13.405 };
  const justBefore = on(2026, 6, 21, 4, 39);
  const justAfter = on(2026, 6, 21, 4, 47);
  assert.equal(isOpenNow("00:00-sunrise", justBefore, berlin), "open");
  assert.equal(isOpenNow("00:00-sunrise", justAfter, berlin), "closed");
});

test("sun events with offsets, (dusk-00:30) and (sunset+01:00)", () => {
  const berlin = { lat: 52.52, lon: 13.405 };
  // Winter solstice-ish, Berlin sunset ~15:55 local (CET, UTC+1).
  const oh = "(sunset+01:00)-23:00";
  assert.equal(isOpenNow(oh, on(2026, 12, 21, 16, 30), berlin), "closed"); // before sunset+1h
  assert.equal(isOpenNow(oh, on(2026, 12, 21, 17, 30), berlin), "open");   // after sunset+1h
});

test("polar day/night makes a sun-event value unknown rather than guessed", () => {
  // Longyearbyen, Svalbard: polar night in late December, sun never rises.
  const svalbard = { lat: 78.22, lon: 15.65 };
  assert.equal(isOpenNow("sunrise-sunset", on(2026, 12, 21, 12, 0), svalbard), "unknown");
});
