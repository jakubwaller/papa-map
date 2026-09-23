import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpenNow, parseOpeningHours } from "./opening-hours.js";

// The module reads the clock in the device's timezone and assumes it is the
// place's. The sun tests use Berlin coordinates with Berlin wall-clock times,
// so pin the zone: CI runs in UTC.
process.env.TZ = "Europe/Berlin";

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

test("overlapping , rules on a shared weekday simply union, not ambiguous", () => {
  // Su appears in both the Mo-Su rule and the Su-only rule that follows it
  // with ',' — a comma-joined rule never replaces, so it just adds its own
  // (redundant) hours on top of Sunday's.
  const oh = "Mo-Su 11:00-23:00, Su 12:00-20:00";
  assert.equal(isOpenNow(oh, at(7, 13, 0)), "open");
  assert.notEqual(parseOpeningHours(oh), null);
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

test("|| falls through to a later alternative once the first is closed", () => {
  const oh = "Mo-Fr 08:00-18:00 || 24/7";
  assert.equal(isOpenNow(oh, at(1, 20, 0)), "open"); // first alt closed, 24/7 fallback opens it
  assert.equal(isOpenNow(oh, at(1, 10, 0)), "open"); // first alt already open
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

// A later ";" rule that matches today replaces the *whole day's* schedule,
// not just the minutes its own spans mention — the default outside those
// spans is closed, same as any other day the rules are silent about.

test("a date-restricted ; rule replaces the whole day, not just its own spans", () => {
  const oh = "Mo-Sa 08:00-20:00; Dec 24 08:00-14:00";
  assert.equal(isOpenNow(oh, on(2026, 12, 24, 10, 0)), "open");   // within the override's hours
  assert.equal(isOpenNow(oh, on(2026, 12, 24, 16, 0)), "closed"); // Dec 24 governs all of Dec 24
  assert.equal(isOpenNow(oh, on(2026, 12, 23, 16, 0)), "open");   // an ordinary day: base rule
});

test("a month-range ; override replaces the whole day across the range", () => {
  const oh = "Mo-Su 09:00-20:00; Nov-Mar 10:00-17:00";
  assert.equal(isOpenNow(oh, on(2026, 12, 2, 9, 30)), "closed"); // before the Nov-Mar override opens
  assert.equal(isOpenNow(oh, on(2026, 12, 2, 12, 0)), "open");
  assert.equal(isOpenNow(oh, on(2026, 6, 2, 9, 30)), "open");    // outside Nov-Mar: base rule stands
});

test("a month selector combined with a weekday selector replaces the whole day", () => {
  const oh = "Mo-Fr 09:00-18:00; Aug Mo-Fr 10:00-14:00";
  assert.equal(isOpenNow(oh, on(2026, 8, 5, 11, 0)), "open");
  assert.equal(isOpenNow(oh, on(2026, 8, 5, 15, 0)), "closed"); // August governs all of Wednesday
  assert.equal(isOpenNow(oh, on(2026, 7, 1, 15, 0)), "open");   // outside August: base rule stands
});

test("a plain weekday ; override replaces the whole day (not just its own hours)", () => {
  const oh = "Mo-Fr 08:00-18:00; Fr 10:00-12:00";
  assert.equal(isOpenNow(oh, at(5, 9, 0)), "closed");  // Friday, before the override's hours
  assert.equal(isOpenNow(oh, at(5, 11, 0)), "open");   // Friday, within the override's hours
  assert.equal(isOpenNow(oh, at(5, 13, 0)), "closed"); // Friday, after the override's hours
  assert.equal(isOpenNow(oh, at(4, 9, 0)), "open");    // Thursday: base rule stands
});

test('|| with nothing in the first alternative matching today is unknown', () => {
  const oh = 'Mo-Fr 10:00-18:00 || "by appointment"';
  assert.equal(isOpenNow(oh, at(6, 11, 0)), "unknown"); // Saturday: neither alternative says anything
  assert.equal(isOpenNow(oh, at(1, 11, 0)), "open");    // Monday: the first alternative covers it
});

test("|| falls through to a second alternative that does cover the day", () => {
  const oh = "Mo-Fr 10:00-18:00 || Sa 10:00-12:00";
  assert.equal(isOpenNow(oh, at(6, 11, 0)), "open");   // Saturday, within the fallback's hours
  assert.equal(isOpenNow(oh, at(6, 13, 0)), "closed"); // Saturday, outside the fallback's hours
  assert.equal(isOpenNow(oh, at(1, 11, 0)), "open");   // Monday, first alternative
});

test("a start hour of 24 or later doesn't fold back onto the rule's own day", () => {
  assert.equal(isOpenNow("Fr 24:00-26:00", at(5, 1, 0)), "unknown");
  assert.equal(isOpenNow("Fr 24:00-26:00", at(6, 1, 0)), "unknown");
});

test("isOpenNow requires both coordinates to be finite numbers for a sun event", () => {
  assert.equal(isOpenNow("sunrise-sunset", at(3, 12, 0), {}), "unknown");
  assert.equal(isOpenNow("sunrise-sunset", at(3, 12, 0), { lat: 52.52 }), "unknown");
  assert.equal(isOpenNow("sunrise-sunset", at(3, 12, 0), { lat: NaN, lon: 13.4 }), "unknown");
  assert.equal(isOpenNow("sunrise-sunset", at(3, 12, 0), { lat: "52.52", lon: "13.4" }), "unknown");
});

test("an overnight sun span's spill ends at *today's* sunrise, not yesterday's", () => {
  const berlin = { lat: 52.52, lon: 13.405 };
  // Berlin, around 2026-06-21: sunrise creeps a little earlier or later
  // day to day, so yesterday's and today's sunrise are not the same
  // instant — the spillover portion of an overnight span must track
  // *today's* sunrise, the actual closing instant.
  const oh = "sunset-sunrise";
  const justBeforeTodaySunrise = on(2026, 6, 21, 4, 39);
  const justAfterTodaySunrise = on(2026, 6, 21, 4, 47);
  assert.equal(isOpenNow(oh, justBeforeTodaySunrise, berlin), "open");
  assert.equal(isOpenNow(oh, justAfterTodaySunrise, berlin), "closed");
});

test("a sun-event offset that pushes past midnight wraps rather than breaking", () => {
  const berlin = { lat: 52.52, lon: 13.405 };
  // Berlin, 2026-06-21: sunset is late (~21:30 local), so a +5h offset
  // ((sunset+05:00)) lands in the small hours of the *next* day — it must
  // fold back into a valid 0-1439 minute-of-day rather than overflowing
  // past 1440 and comparing nonsensically against the rest of the span.
  const oh = "(sunset+05:00)-23:59";
  assert.equal(isOpenNow(oh, on(2026, 6, 21, 20, 0), berlin), "open");    // within the folded span
  assert.equal(isOpenNow(oh, on(2026, 6, 22, 1, 0), berlin), "closed");   // before the offset time folds open again
});

test("Dec 20-05 (end day before start, same month) is unknown, not a year-wrap", () => {
  assert.equal(isOpenNow("Dec 20-05 08:00-18:00", on(2026, 12, 22, 10, 0)), "unknown");
  assert.equal(isOpenNow("Dec 20-05 08:00-18:00", on(2027, 1, 2, 10, 0)), "unknown");
});

// A comma-joined "off" member is a *partial* closure, carved out of what
// the rest of the group already built — not a wipe of the whole day.

test("a date-restricted comma off carves out only its own hours", () => {
  const oh = "Mo-Fr 08:00-20:00, Dec 24 14:00-20:00 off";
  assert.equal(isOpenNow(oh, on(2026, 12, 24, 10, 0)), "open");   // morning: before the off hours
  assert.equal(isOpenNow(oh, on(2026, 12, 24, 16, 0)), "closed"); // within the off hours
});

test("a comma off on a shared weekday carves out only its own hours", () => {
  const oh = "Mo-Sa 09:00-19:00, Sa 13:00-19:00 off";
  assert.equal(isOpenNow(oh, at(6, 10, 0)), "open");   // Saturday morning
  assert.equal(isOpenNow(oh, at(6, 15, 0)), "closed"); // Saturday afternoon, carved out
  assert.equal(isOpenNow(oh, at(1, 10, 0)), "open");   // an ordinary weekday, untouched
});

test("a comma off in the middle of the day splits the hours around it", () => {
  const oh = "Mo-Fr 08:00-18:00, We 12:00-14:00 off";
  assert.equal(isOpenNow(oh, at(3, 9, 0)), "open");    // Wednesday morning
  assert.equal(isOpenNow(oh, at(3, 13, 0)), "closed"); // Wednesday, during the carved-out lunch
  assert.equal(isOpenNow(oh, at(3, 16, 0)), "open");   // Wednesday afternoon
});

test("order matters: a later additive rule can add hours back after an off", () => {
  const oh = "We off, Mo-Fr 08:00-18:00";
  assert.equal(isOpenNow(oh, at(3, 10, 0)), "open"); // Wednesday: the later rule re-adds it
});

test("|| only counts a spillover while it's still running", () => {
  const withComment = 'Fr 18:00-02:00 || "by appointment"';
  const withFallback = "Fr 18:00-02:00 || Sa 10:00-14:00";
  // Saturday noon: Friday's overnight span closed at 02:00, long before
  // noon, so it says nothing about this instant — the comment fallback
  // can't be evaluated either, so the whole value is unknown; the plain
  // fallback, once tried, does cover Saturday and gives open.
  assert.equal(isOpenNow(withComment, at(6, 12, 0)), "unknown");
  assert.equal(isOpenNow(withFallback, at(6, 12, 0)), "open");
  // Just after midnight Saturday, the spillover from Friday is still live.
  assert.equal(isOpenNow(withFallback, at(6, 1, 0)), "open");
});

test('|| stops at an alternative that can\'t be evaluated, rather than trying a later one', () => {
  assert.equal(isOpenNow('"call first" || Mo-Fr 10:00-18:00', at(1, 12, 0)), "unknown");
  assert.equal(
    isOpenNow("week 01-53 Mo-Fr 10:00-12:00 || Mo-Fr 08:00-18:00", at(3, 15, 0)),
    "unknown");
  // 78°N during the midnight sun: the sun never sets, so the first
  // alternative can't be evaluated — even though the second, plain-hours
  // alternative would otherwise easily resolve.
  const farNorth = { lat: 78, lon: 15.6 };
  assert.equal(isOpenNow("sunrise-sunset || 09:00-17:00", on(2026, 6, 21, 20, 0), farNorth), "unknown");
});

test("an off with more than one comma-joined time span is unknown, not a full-day close", () => {
  const oh = "Mo-Fr 08:00-18:00, 12:00-13:00 off";
  assert.equal(isOpenNow(oh, at(3, 9, 0)), "unknown");
  assert.equal(parseOpeningHours(oh), null);
});

// A comma-joined whole-day "off" closes the day outright, including
// whatever an earlier member's overnight span would otherwise have
// spilled into the next calendar day — the evening that would have run
// into the small hours never happens if the day itself is off.

test("a comma whole-day off also cancels that day's overnight spillover", () => {
  const oh = "Mo-Fr 20:00-02:00, We off";
  assert.equal(isOpenNow(oh, at(4, 1, 0)), "closed"); // Thursday 01:00: no spill from an off Wednesday
  assert.equal(isOpenNow(oh, at(3, 1, 0)), "open");   // Wednesday 01:00: spill from Tuesday still stands
  assert.equal(isOpenNow(oh, at(2, 21, 0)), "open");  // Tuesday evening: untouched
});

test("a comma whole-day off with a date selector also cancels the overnight spillover", () => {
  const oh = "Mo-Su 20:00-02:00, Dec 24 off";
  assert.equal(isOpenNow(oh, on(2026, 12, 25, 1, 0)), "closed"); // no spill from an off Dec 24
  assert.equal(isOpenNow(oh, on(2026, 12, 24, 21, 0)), "closed"); // Dec 24 evening itself is off
  assert.equal(isOpenNow(oh, on(2026, 12, 23, 21, 0)), "open");   // an ordinary evening
});

test("a whole-day off spelled with times also cancels the overnight spillover", () => {
  for (const off of ["We 00:00-24:00 off", "We 00:00-00:00 off", "We closed"]) {
    const oh = `Mo-Fr 20:00-02:00, ${off}`;
    assert.equal(isOpenNow(oh, at(4, 1, 0)), "closed", oh);
    assert.equal(isOpenNow(oh, at(3, 1, 0)), "open", oh);
  }
});

test("the ; spelling of a whole-day off already cancelled the overnight spillover", () => {
  const oh = "Mo-Fr 20:00-02:00; We off";
  assert.equal(isOpenNow(oh, at(4, 1, 0)), "closed"); // Thursday 01:00: no spill from an off Wednesday
  assert.equal(isOpenNow(oh, at(3, 1, 0)), "open");   // Wednesday 01:00: spill from Tuesday still stands
});

// A ; rule with no weekday and no date selector (a bare time span) never
// replaces — it adds its spans to every day alike, or subtracts them (off)
// from every day alike.

test("a ; rule with no day/date selector adds to every day rather than replacing", () => {
  assert.equal(isOpenNow("Mo-Fr 08:00-18:00; 10:00-12:00", at(3, 15, 0)), "open");
});

test("a ; rule with no day/date selector adds the same span to every day", () => {
  const oh = "Mo-Fr 11:30-14:00; 17:30-00:30";
  assert.equal(isOpenNow(oh, at(1, 12, 0)), "open"); // Monday, within the first rule's own hours
  assert.equal(isOpenNow(oh, at(7, 18, 0)), "open"); // Sunday, only ever touched by the second rule
});

test("a ; off rule with no times subtracts from every day alike", () => {
  const oh = "24/7;10:30-13:00 off";
  assert.equal(isOpenNow(oh, at(3, 9, 0)), "open");
  assert.equal(isOpenNow(oh, at(3, 11, 0)), "closed");
});

test("several ; off rules with no day/date selector each subtract independently", () => {
  const oh = "24/7; Mo 00:00-05:00 off; Tu-Fr 03:00-05:00 off";
  assert.equal(isOpenNow(oh, at(1, 5, 0)), "open");
  assert.equal(isOpenNow(oh, at(1, 4, 0)), "closed");
  assert.equal(isOpenNow(oh, at(2, 4, 0)), "closed");
  assert.equal(isOpenNow(oh, at(2, 2, 0)), "open");
});

// A ; rule that is off WITH its own times subtracts only those times from
// the day, rather than replacing (clearing) the whole day.

test("a ; off rule with its own times only carves out those hours", () => {
  const oh = "Mo-Fr 08:00-18:00; We 12:00-14:00 off";
  assert.equal(isOpenNow(oh, at(3, 10, 0)), "open");
  assert.equal(isOpenNow(oh, at(3, 13, 0)), "closed");
});

test("a ; off rule with its own times, spaced-out day range", () => {
  const oh = "Mo - Su 09:00 - 19:00; Mo - Fr 13:15 - 13:45 off";
  assert.equal(isOpenNow(oh, at(1, 9, 0)), "open");
  assert.equal(isOpenNow(oh, at(1, 13, 30)), "closed");
});

// Only the first rule of a ;-group follows the replace/add rules above; a
// rule after a "," never replaces on its own account, regardless of its
// own selector — and does not inherit the selector of the rule before it.

test("a comma rule after a replacing first rule only adds, on its own days", () => {
  const oh = "Mo-Fr 08:00-18:00; We 16:00-20:00, Tu 12:00-13:00";
  assert.equal(isOpenNow(oh, at(3, 10, 0)), "closed"); // We: the first rule of the group replaced it
  assert.equal(isOpenNow(oh, at(2, 12, 30)), "open");  // Tu: within the base hours and the added span
  // Tu 10:00 is inside the base Mo-Fr 08:00-18:00 hours, untouched by the
  // comma rule (which only adds its own 12:00-13:00, it doesn't wipe
  // Tuesday down to just that): the reference library agrees this stays
  // open, even though it reads at first glance like the group "replaced"
  // Tuesday too.
  assert.equal(isOpenNow(oh, at(2, 10, 0)), "open");
});

test("a comma rule can re-add hours an off carved out of the same group", () => {
  const oh = "Mo-Fr 08:00-18:00; We 12:00-14:00 off, We 13:00-13:30";
  assert.equal(isOpenNow(oh, at(3, 13, 15)), "open");
  assert.equal(isOpenNow(oh, at(3, 12, 30)), "closed");
  assert.equal(isOpenNow(oh, at(3, 10, 0)), "open");
});

test("a comma off shared across days, followed by a comma add on one of them", () => {
  const oh = "Mo-Fr 08:00-18:00; Tu,We 12:00-14:00 off, We 16:00-20:00";
  assert.equal(isOpenNow(oh, at(3, 19, 0)), "open");
});

test("a group whose first rule is off never replaces, even across several comma rules", () => {
  const oh = "We-Fr 11:30-14:30; Mo,Tu off, We-Fr 17:00-21:30, Sa 11:30-21:30, PH,Su 11:30-20:30";
  assert.equal(isOpenNow(oh, at(3, 12, 0)), "open");
  assert.equal(isOpenNow(oh, at(3, 18, 0)), "open");
  assert.equal(isOpenNow(oh, at(1, 12, 0)), "closed");
  assert.equal(isOpenNow(oh, at(6, 20, 0)), "open");
});

test("a later off-first group doesn't disturb a day only a comma rule of it covers", () => {
  const oh = "Mo-Fr 08:00-15:00, Sa 09:30-13:00; PH,Su off, Mo-Fr 11:30-13:30";
  assert.equal(isOpenNow(oh, at(1, 8, 0)), "open");
});

test("plain , union, no ; involved at all", () => {
  assert.equal(isOpenNow("Mo-Fr 08:00-18:00, We 10:00-12:00", at(3, 15, 0)), "open");
});

test("a comma rule inside a date-prefixed group doesn't inherit that date selector", () => {
  // The Sa,Su,PH rule in each group has no date selector of its own, so it
  // holds all year — the later Nov-Mar group's own Sa,Su,PH rule only adds
  // (redundantly) on top of it, it doesn't replace it.
  const oh = "Apr-Oct: Mo-Fr 08:00-19:00, Sa,Su,PH 08:00-18:00; " +
    "Nov-Mar: Mo-Fr 08:00-18:00, Sa,Su,PH 08:00-17:00";
  assert.equal(isOpenNow(oh, on(2026, 2, 14, 17, 30)), "open"); // Saturday, in Nov-Mar
});

// A "||" fallback chain is evaluated purely on whether each alternative is
// open right now, trying alternatives in order until one is open.

test("|| tries the next alternative once the first evaluates to closed", () => {
  const oh = "Mo-Fr 08:00-12:00 || Mo-Su 10:00-16:00";
  assert.equal(isOpenNow(oh, at(3, 13, 0)), "open");   // first alt closed, second covers it
  assert.equal(isOpenNow(oh, at(3, 7, 0)), "closed");  // neither alt is open
});

test("|| tries the next alternative once the first is closed via its own ; override", () => {
  const oh = "Mo-Fr 08:00-12:00; We off || Mo-Su 10:00-16:00";
  assert.equal(isOpenNow(oh, at(3, 11, 0)), "open");
});

test("|| tries the next alternative even when it's an off-only rule", () => {
  const oh = "Mo-Fr 08:00-12:00 || We 11:00-13:00 off";
  assert.equal(isOpenNow(oh, at(3, 11, 30)), "open");
});

test("|| falls through past a closed first alternative to an always-open one", () => {
  assert.equal(isOpenNow("Mo-Fr 08:00-12:00 || 24/7", at(3, 20, 0)), "open");
});

test("|| with comments and overnight spans, alternatives tried strictly in order", () => {
  const oh = '07:00-23:00 open "Restaurant" || Su-Th 07:00-01:00; Fr,Sa 07:00-02:00 open "McDrive"';
  assert.equal(isOpenNow(oh, at(1, 23, 30)), "open"); // Restaurant closed, McDrive still running
  assert.equal(isOpenNow(oh, at(2, 0, 30)), "open");  // McDrive spillover from Monday night
  assert.equal(isOpenNow(oh, at(2, 3, 0)), "closed"); // past both alternatives' hours
});

test("|| gives unknown once it reaches an alternative that can't be parsed", () => {
  const oh = 'Mo-Fr 08:00-12:00 || "call"';
  assert.equal(isOpenNow(oh, at(3, 20, 0)), "unknown"); // first alt closed, second doesn't parse
  assert.equal(isOpenNow(oh, at(3, 10, 0)), "open");    // first alt already open
});

// An end past 24:00 is always a wrap into the next day, even when the
// folded end reads later than the start.

test("00:00-24:59 folds correctly instead of reading as [0,59]", () => {
  const oh = "Mo-Su,PH 00:00-24:59";
  assert.equal(isOpenNow(oh, at(3, 12, 0)), "open");
  assert.equal(isOpenNow(oh, at(4, 0, 30)), "open"); // spill from Wednesday's span
});

test("08:00-33:00 spills into the following day until 09:00", () => {
  const oh = "Mo-Su 08:00-33:00";
  assert.equal(isOpenNow(oh, at(4, 8, 30)), "open"); // covered by Thursday's own 08:00-24:00 portion
  assert.equal(isOpenNow(oh, at(4, 9, 30)), "open"); // Thursday's own span, past the spill too
});

test("08:00-26:00 spills into the following day until 02:00", () => {
  assert.equal(isOpenNow("Mo-Su 08:00-26:00", at(4, 1, 30)), "open"); // only reachable via yesterday's spill
});

// S7: the after-midnight part of a span belongs to the day the span
// started; a later ; rule for the next day doesn't retroactively cancel it
// (a deliberate difference from the reference library).

test("an overnight spill isn't cancelled by a later ; rule for the day it lands on", () => {
  assert.equal(isOpenNow("Mo-Th 20:00-02:00; Fr 10:00-12:00", at(5, 1, 0)), "open");
});

test("a partial off for the small hours also closes yesterday's spill", () => {
  // 2026-02-14 is a Saturday: Friday's 20:00-02:00 runs into it.
  const sat = (h, m) => new Date(2026, 1, 14, h, m);
  assert.equal(isOpenNow("Fr 20:00-02:00; Sa 01:00-02:00 off", sat(1, 0)), "closed");
  assert.equal(isOpenNow("Fr 20:00-02:00; Sa 01:00-02:00 off", sat(0, 30)), "open");
  assert.equal(isOpenNow("Mo-Su 22:00-01:00; Mo-Su 00:30-00:45 off", sat(0, 30)), "closed");
  assert.equal(isOpenNow("Mo-Su 22:00-01:00; Mo-Su 00:30-00:45 off", sat(0, 50)), "open");
  // A whole-day off for the next day still leaves the spill alone.
  assert.equal(isOpenNow("Fr 20:00-02:00; Sa off", sat(1, 0)), "open");
});
