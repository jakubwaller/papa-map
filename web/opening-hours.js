// A small, deliberately incomplete reader for OSM's opening_hours syntax
// (https://wiki.openstreetmap.org/wiki/Key:opening_hours). It answers one
// question — "is this place open right now, in the browser's own local
// time?" — and it would rather say nothing than say something wrong: any
// construct it does not confidently understand makes the whole value
// "unknown", not a guess.
//
// The places this map shows are local to the person looking at the popup
// (a nappy-change table you can walk to), so evaluating against the
// viewer's local clock rather than the place's own timezone is the right
// approximation — there is no per-place timezone in the data to evaluate
// against anyway. The same assumption extends to sunrise/sunset: the sun
// event is computed for the place's coordinates, but converted to a
// time-of-day using the *device's* timezone, on the same "viewer's clock,
// viewer's location is close enough to the place's" reasoning.
//
// Supported: "24/7"; day ranges and lists (Mo-Fr, Mo,We, Mo, We with spaces,
// Sa-Su), including with spaces around the "-" (Mo - Sa); wrap-around day
// ranges (Fr-Mo); multiple ; -separated rules — a later one that matches a
// given day *replaces that whole day's schedule*, not just the minutes its
// own spans mention (Mo-Su 08:00-20:00; Tu off closes all of Tuesday, not
// merely whatever "Tu off" happens to list); multiple , -separated time
// spans per rule; multiple , -separated *additional* rules within one ;
// -group (Mo-Fr 08:00-12:00, Sa 08:00-12:00 — the comma here adds
// Saturday's hours rather than replacing anything, unlike ";"), including
// additional rules that share a weekday with an earlier rule in the same
// group: their spans are unioned rather than rejected, unless the two
// rules' own (non-off) hours genuinely overlap in time, which is kept
// "unknown" as genuinely ambiguous (an override or a typo, we can't tell);
// a comma-joined "off" carves its own hours back *out* of what the group
// already built for the days it names, rather than wiping the day outright
// (Mo-Sa 09:00-19:00, Sa 13:00-19:00 off — Saturday is 09:00-13:00 only),
// order within the group mattering the same way ; does (a rule after an
// off can re-add hours it took away); an off with more than one of its own
// comma-joined time spans can't be told apart from a new rule that's
// missing its day selector, so it's "unknown" rather than a guess; time
// spans that cross midnight (22:00-02:00), including "hour past 24"
// spellings of the same thing on the *end* of a span (08:00-25:00 = until
// 01:00 next day) and "00:00-00:00" (all day) — a *start* past 24:00
// (Fr 24:00-26:00) doesn't mean anything relative to Friday and is
// "unknown"; the "off" and "closed" modifiers; "open end" times (11:00+ =
// open from 11:00 to midnight, closed before; 00:00+ = open all day; "a-b+"
// is read as the guaranteed a-b span, the "+" uncertainty about running
// later isn't modelled); month and date selectors (Apr-Oct, wrapping
// Nov-Apr, single/listed months, day-precise ranges, single dates, an
// optional trailing ":") — a day-only continuation names a day in the same
// month, so "Dec 20-05" doesn't parse as a year-wrapping range — standing
// alone or ahead of a weekday/time selector, obeying the normal ; override
// and , addition rules, and with midnight-spill from yesterday checked
// against *yesterday's* date, not today's; sunrise/sunset/dawn/dusk (civil
// twilight, -6°) as time-span endpoints, plus offsets ((dusk-00:30),
// (sunset+01:00), folded back into a valid time of day if the offset pushes
// past midnight), given a `coords` argument to isOpenNow ({ lat, lon}, both
// required to be finite numbers) — without it, a value that needs a sun
// event is "unknown", same as on a date where the event doesn't occur at
// that latitude (polar day/night); a "||" fallback chain, tried in order —
// the first alternative that actually says something about today (or, via
// a spillover from yesterday that's still running) decides the answer, one
// that's *positively shown* to be silent about today is skipped in favour
// of the next, but one that simply *can't be evaluated* (doesn't parse, or
// needs a sun event this call can't resolve) makes the whole value
// "unknown" right there rather than silently falling through to an easier
// later alternative; "unknown" for the "nothing applies" reason only once
// every alternative has been positively shown to have nothing to say (a
// plain value with no "||" keeps its original default-closed behaviour for
// a day the rules don't mention); a trailing quoted comment on a rule that
// also carries an explicit state keyword (07:00-23:00 open "Restaurant") is
// stripped and the rule evaluated normally, but a comment with no state
// keyword (24/7 "depends on the park") makes that alternative unparseable
// rather than guessing what the comment means.
//
// PH and SH (public/school holiday) rules are recognised and *skipped* — we
// have no calendar to check them against, so a "PH off" rule neither opens
// nor closes anything here; the closest alternative, guessing at a holiday,
// would risk exactly the false claim this module exists to avoid. PH/SH
// listed alongside weekdays ("PH,Su 10:00-17:00") are dropped from the
// selector and the weekdays kept, on the same not-a-holiday reading.
//
// Mappers routinely write "," where a stricter reading might expect ";", and
// OSM's own grammar gives "," an additional-rule meaning distinct from a
// plain time-span list: a comma starts a new rule only when what precedes it
// already has a time or an explicit off/closed (so it's a complete rule) and
// what follows opens with a day/PH/SH/month selector — that's what separates
// "Mo-Fr 08:00-12:00, Sa 08:00-12:00" (two rules) from "08:00-12:00,14:00-
// 18:00" (one rule, two spans), "Mo, Tu 10:00-18:00" (one rule, a day list),
// and "Dec 25-26,Jan 01 closed" (one rule, a date list).
//
// Not supported, and returned as "unknown" rather than guessed at: year
// ranges, week numbers, easter, nth-weekday selectors (Sa[2]), "+N day(s)"
// offsets, and anything else this parser does not recognise.

const DAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_INDEX = Object.fromEntries(DAY_NAMES.map((d, i) => [d, i]));
const ALL_DAYS = new Set(DAY_NAMES.map((_, i) => i));
const DAY_TOKEN = "(?:Mo|Tu|We|Th|Fr|Sa|Su)";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_INDEX = Object.fromEntries(MONTH_NAMES.map((m, i) => [m, i + 1])); // 1-12
const MONTH_TOKEN = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
// Spaces are allowed around the "-" and the "," in a day list ("Mo, Tu",
// "Mo - Sa"), same as OSM mappers routinely write it even though the spec
// examples don't.
const DAY_LIST_RE = new RegExp(
  `^((?:${DAY_TOKEN}(?:\\s*-\\s*${DAY_TOKEN})?)(?:\\s*,\\s*(?:${DAY_TOKEN}(?:\\s*-\\s*${DAY_TOKEN})?))*)`);
const PH_SH_ONLY_RE = /^(?:PH|SH)(?:,(?:PH|SH))*(?:\s+(?:off|closed))?$/;
const SELECTOR_ITEM = `(?:${DAY_TOKEN}(?:\\s*-\\s*${DAY_TOKEN})?|PH|SH)`;
const MIXED_SELECTOR_RE = new RegExp(
  `^(${SELECTOR_ITEM}(?:\\s*,\\s*${SELECTOR_ITEM})*)(?=\\s|$)`);
// What a "," must be followed by to read as the start of a new additional
// rule rather than a day-list, date-list or time-span separator: a day,
// PH/SH, or a month (the start of a date selector).
const NEW_RULE_START_RE = new RegExp(`^\\s*(?:${DAY_TOKEN}|PH|SH|${MONTH_TOKEN})\\b`);

// -------------------------------------------------------------------------
// Time spans, including sun events
// -------------------------------------------------------------------------

// Hours 00-47 (to cover "past midnight" spellings like 25:00 = 01:00 next
// day), minutes 00-59. Only an *end* of a span may reach past 24: a start
// past 24 ("Fr 24:00-26:00") doesn't mean anything relative to Friday
// itself, so it's kept out of the start grammar and the span fails to
// parse (unknown) rather than silently folding back onto the wrong day.
const HOUR_SRC = "(?:[0-3]\\d|4[0-7])";
const HOUR_START_SRC = "(?:[01]\\d|2[0-3])";
const CLOCK_SRC = `${HOUR_SRC}:[0-5]\\d`;
const CLOCK_START_SRC = `${HOUR_START_SRC}:[0-5]\\d`;
const SUN_EVENT = "(?:sunrise|sunset|dawn|dusk)";
// A time-span endpoint: a plain clock time, a bare sun event, or a sun event
// with a parenthesised +/-HH:MM offset. The start of a span is further
// restricted to a real clock hour (00-23); the end keeps the wider range.
const TIME_POINT_START_SRC = `(?:\\(${SUN_EVENT}[+-]${CLOCK_SRC}\\)|${SUN_EVENT}|${CLOCK_START_SRC})`;
const TIME_POINT_END_SRC = `(?:\\(${SUN_EVENT}[+-]${CLOCK_SRC}\\)|${SUN_EVENT}|${CLOCK_SRC})`;
const SPAN_RE = new RegExp(`^(${TIME_POINT_START_SRC})\\s*-\\s*(${TIME_POINT_END_SRC})(\\+)?$`);
const OPEN_END_POINT_RE = new RegExp(`^(${CLOCK_START_SRC})\\+$`);
const CLOCK_RE = new RegExp(`^(${HOUR_SRC}):([0-5]\\d)$`);
const SUN_OFFSET_RE = new RegExp(`^\\((${SUN_EVENT})([+-])(${CLOCK_SRC})\\)$`);

// Parses one time-span endpoint into either a plain minute-of-day number or
// a { sun, offset } descriptor resolved later against a specific date and
// coordinates.
function parseTimePoint(text) {
  const clock = CLOCK_RE.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  if (["sunrise", "sunset", "dawn", "dusk"].includes(text)) return { sun: text, offset: 0 };
  const off = SUN_OFFSET_RE.exec(text);
  if (off) {
    const [, event, sign, clockText] = off;
    const m = CLOCK_RE.exec(clockText);
    const mins = Number(m[1]) * 60 + Number(m[2]);
    return { sun: event, offset: sign === "-" ? -mins : mins };
  }
  return null; // unreachable given the regexes above, but be safe
}

const isSunPoint = (p) => typeof p === "object" && p !== null;

// Parses a comma-separated time-span list into span descriptors: either
// [startMinute, endMinute] (numbers; endMinute may be <= startMinute,
// meaning the span crosses midnight) or [startPoint, endPoint] where either
// side may be a sun-event descriptor. Returns null if any fragment isn't a
// recognised span or open-ended point.
function parseTimeSpans(text) {
  const spans = [];
  for (const part of text.split(",")) {
    const raw = part.trim();
    if (raw === "") return null;

    const openPoint = OPEN_END_POINT_RE.exec(raw);
    if (openPoint) {
      const start = parseTimePoint(openPoint[1]);
      if (start === null) return null;
      spans.push([start, 24 * 60]);
      continue;
    }

    const m = SPAN_RE.exec(raw);
    if (!m) return null;
    const start = parseTimePoint(m[1]);
    const end = parseTimePoint(m[2]);
    if (start === null || end === null) return null;
    // The "+" on a full a-b span only promises the a-b portion; the
    // uncertain "maybe later" part isn't modelled, so it's otherwise a
    // plain span (m[3] is simply dropped here).
    if (!isSunPoint(start) && !isSunPoint(end)) {
      let s = start, e = end;
      if (s === e) {
        if (s !== 0) return null; // a zero-length span says nothing useful
        spans.push([0, 24 * 60]); // "00:00-00:00" = all day
        continue;
      }
      if (s >= 24 * 60) s -= 24 * 60;
      if (e >= 24 * 60) e -= 24 * 60;
      spans.push([s, e]);
      continue;
    }
    spans.push([start, end]);
  }
  return spans;
}

// -------------------------------------------------------------------------
// Sun events (sunrise/sunset/civil dawn/dusk)
// -------------------------------------------------------------------------

const DEG = Math.PI / 180;

function toJulianDay(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) -
    Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

// Computes the UTC instant of a solar event (sunrise/sunset when
// altitudeDeg = -0.833, civil dawn/dusk when altitudeDeg = -6) for a
// calendar date (y, m 1-12, d) and coordinates, via the standard compact
// "sunrise equation". Returns null for polar day/night, where no such
// instant exists on that date.
function solarEventUTC(y, m, d, lat, lon, altitudeDeg, evening) {
  const jd = toJulianDay(y, m, d);
  const n = jd - 2451545.0 + 0.0008;
  const jStar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const Mrad = M * DEG;
  const C = 1.9148 * Math.sin(Mrad) + 0.02 * Math.sin(2 * Mrad) + 0.0003 * Math.sin(3 * Mrad);
  const lambda = (M + 102.9372 + C + 180) % 360;
  const lambdaRad = lambda * DEG;
  const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(Mrad) - 0.0069 * Math.sin(2 * lambdaRad);
  const sinDelta = Math.sin(lambdaRad) * Math.sin(23.44 * DEG);
  const cosDelta = Math.sqrt(1 - sinDelta * sinDelta);
  const latRad = lat * DEG;
  const cosOmega =
    (Math.sin(altitudeDeg * DEG) - Math.sin(latRad) * sinDelta) / (Math.cos(latRad) * cosDelta);
  if (cosOmega < -1 || cosOmega > 1) return null; // sun never reaches that altitude today
  const omega = Math.acos(cosOmega) / DEG / 360; // radians -> degrees -> fractional days
  const jEvent = evening ? jTransit + omega : jTransit - omega;
  return new Date((jEvent - 2440587.5) * 86400000);
}

// Minute-of-day (in the *device's* local timezone, per the module's stated
// assumption) of the four sun events on the given calendar date, or null
// per event where the date sees polar day/night.
function sunTimesForDate(y, m, d, lat, lon) {
  const toMinutes = (date) => (date === null ? null : date.getHours() * 60 + date.getMinutes());
  return {
    sunrise: toMinutes(solarEventUTC(y, m, d, lat, lon, -0.833, false)),
    sunset: toMinutes(solarEventUTC(y, m, d, lat, lon, -0.833, true)),
    dawn: toMinutes(solarEventUTC(y, m, d, lat, lon, -6, false)),
    dusk: toMinutes(solarEventUTC(y, m, d, lat, lon, -6, true)),
  };
}

// Resolves a time-span endpoint to a minute-of-day number given the
// already-computed sun times for the relevant date, or null if it needs a
// sun event we couldn't compute (no coords, or polar day/night). An offset
// that pushes the result past midnight in either direction ((sunset+05:00))
// is folded back into 0-1439 — the caller tells wrap from non-wrap by
// comparing against the span's start, same as a plain clock time past 24:00.
function resolvePoint(point, sunTimes) {
  if (!isSunPoint(point)) return point;
  if (!sunTimes) return null;
  const base = sunTimes[point.sun];
  if (base === null || base === undefined) return null;
  const DAY_MIN = 24 * 60;
  let m = (base + point.offset) % DAY_MIN;
  if (m < 0) m += DAY_MIN;
  return m;
}

// -------------------------------------------------------------------------
// Date (month/day) selectors
// -------------------------------------------------------------------------

// A day-of-month number is never immediately followed by ":" — that would
// make it a clock time instead (the boundary "May-Oct 09:00-22:00" needs to
// tell "Oct" the month from a would-be "09" day-of-month that's actually the
// start of the time span).
const DAY_NUM_SRC = "\\d{1,2}(?![:\\d])";
const DATE_ITEM_SRC =
  `${MONTH_TOKEN}(?:\\s+${DAY_NUM_SRC})?(?:\\s*-\\s*(?:${MONTH_TOKEN}\\s+${DAY_NUM_SRC}|${MONTH_TOKEN}|${DAY_NUM_SRC}))?`;
const DATE_ITEM_RE = new RegExp(
  `^(${MONTH_TOKEN})(?:\\s+(${DAY_NUM_SRC}))?(?:\\s*-\\s*(?:(${MONTH_TOKEN})\\s+(${DAY_NUM_SRC})|(${MONTH_TOKEN})|(${DAY_NUM_SRC})))?$`);
const DATE_SELECTOR_RE = new RegExp(
  `^((?:${DATE_ITEM_SRC})(?:\\s*,\\s*(?:${DATE_ITEM_SRC}))*)\\s*(:)?\\s*`);

// Parses one date-selector item ("Apr", "Apr-Oct", "Dec 25", "Dec 25-26",
// "Nov 01-Mar 15") into a { start, end } pair of mm*100+dd ordinals. end may
// be < start, meaning the interval wraps the new year (Nov-Apr).
function parseDateItem(text) {
  const m = DATE_ITEM_RE.exec(text.trim());
  if (!m) return null;
  const [, startMonth, startDay, endMonthDay, endDayOfMonth, endMonthOnly, endDayOnly] = m;
  const sm = MONTH_INDEX[startMonth];
  if (startDay === undefined) {
    // A month, or a month-to-month range: cover the whole month(s).
    const start = sm * 100 + 1;
    if (endMonthOnly === undefined) return { start, end: sm * 100 + 31 };
    return { start, end: MONTH_INDEX[endMonthOnly] * 100 + 31 };
  }
  const sd = Number(startDay);
  const start = sm * 100 + sd;
  if (endMonthDay !== undefined) return { start, end: MONTH_INDEX[endMonthDay] * 100 + Number(endDayOfMonth) };
  if (endDayOnly !== undefined) {
    const ed = Number(endDayOnly);
    // A day-only continuation names a day in the *same* month ("Dec 25-26"),
    // so an end before the start ("Dec 20-05") isn't a year-wrapping range —
    // it doesn't parse as any sensible date range at all.
    if (ed < sd) return null;
    return { start, end: sm * 100 + ed };
  }
  return { start, end: start }; // a single date
}

// Parses a full date-selector prefix (a comma list of items) into an array
// of { start, end } intervals, or null if any item doesn't parse.
function parseDateSelector(text) {
  const items = [];
  for (const part of text.split(",")) {
    const item = parseDateItem(part);
    if (!item) return null;
    items.push(item);
  }
  return items;
}

// True if ordinal `val` (mm*100+dd) falls in interval, honouring a
// year-wrapping interval (start > end).
function dateOrdinalIn(val, { start, end }) {
  return start <= end ? val >= start && val <= end : val >= start || val <= end;
}

function dateSelMatches(dateSel, val) {
  if (!dateSel) return true;
  return dateSel.some((iv) => dateOrdinalIn(val, iv));
}

// Splits a (possibly year-wrapping) interval into up to two plain
// [start,end] pieces within a single year, for overlap testing.
function splitInterval({ start, end }) {
  return start <= end ? [[start, end]] : [[start, 1231], [101, end]];
}

function intervalsOverlap([s1, e1], [s2, e2]) {
  return Math.max(s1, s2) <= Math.min(e1, e2);
}

// Conservative: true unless both selectors are given and provably disjoint.
function dateSelCouldOverlap(a, b) {
  if (!a || !b) return true;
  const piecesA = a.flatMap(splitInterval);
  const piecesB = b.flatMap(splitInterval);
  return piecesA.some((pa) => piecesB.some((pb) => intervalsOverlap(pa, pb)));
}

// -------------------------------------------------------------------------
// Rule parsing
// -------------------------------------------------------------------------

// Parses one ;-separated rule (already split into its comma-joined pieces
// by splitAdditiveGroup). Returns:
//  - { skip: true }                     — a PH/SH rule we deliberately ignore
//  - { days, spans, off, dateSel }      — a rule we can evaluate (days: Set
//                                          or null for "every day"; dateSel:
//                                          array of intervals, or null)
//  - null                               — anything we don't confidently
//                                          understand
function parseRule(raw) {
  let rule = raw.trim();
  if (!rule) return { skip: true };
  if (rule === "24/7") return { days: null, spans: [[0, 24 * 60]], off: false, dateSel: null };

  // A trailing quoted comment. It's only safe to drop when the rule also
  // carries an explicit state keyword — otherwise we don't know what the
  // comment is qualifying (a note on an implied-open value? a caveat that
  // changes the meaning entirely?) and the whole value comes back unknown.
  let hasComment = false;
  const commentMatch = /^(.*?)\s*"[^"]*"\s*$/.exec(rule);
  if (commentMatch) {
    hasComment = true;
    rule = commentMatch[1].trim();
  }
  if (hasComment) {
    const openMatch = /^(.*?)\s+open$/.exec(rule);
    if (openMatch) rule = openMatch[1].trim();
    else if (!/(?:^|\s)(?:off|closed)$/.test(rule)) return null;
  }

  if (PH_SH_ONLY_RE.test(rule)) return { skip: true };

  // A month/date selector, if present, always precedes the weekday
  // selector. An optional ":" may separate it from the rest.
  let dateSel = null;
  const dateMatch = DATE_SELECTOR_RE.exec(rule);
  if (dateMatch) {
    dateSel = parseDateSelector(dateMatch[1]);
    if (!dateSel) return null;
    rule = rule.slice(dateMatch[0].length).trim();
  }

  if (rule === "") {
    // A standalone date selector with nothing else: open all day, every
    // matching date.
    return { days: null, spans: [[0, 24 * 60]], off: false, dateSel };
  }
  if (PH_SH_ONLY_RE.test(rule)) return { skip: true };

  // PH/SH mixed into a day selector ("PH,Su 10:00-17:00") drop out, leaving
  // the weekdays — the same "today is not a holiday" reading as skipping a
  // "PH off" rule. A selector of nothing but PH/SH skips the rule.
  const sel = MIXED_SELECTOR_RE.exec(rule);
  if (sel && /\b(?:PH|SH)\b/.test(sel[1])) {
    const dayParts = sel[1].split(",").map((s) => s.trim()).filter((s) => s !== "PH" && s !== "SH");
    if (!dayParts.length) return { skip: true };
    rule = dayParts.join(",") + rule.slice(sel[0].length);
  }

  let off = false;
  let rest = rule;
  const offMatch = /^(.*?)\s+(off|closed)$/.exec(rest);
  if (offMatch) {
    off = true;
    rest = offMatch[1].trim();
  } else if (rest === "off" || rest === "closed") {
    off = true;
    rest = "";
  }

  if (rest === "") return { days: null, spans: [[0, 24 * 60]], off, dateSel };

  const dayMatch = DAY_LIST_RE.exec(rest);
  let days = null;
  let timeText = rest;
  if (dayMatch) {
    days = expandDays(dayMatch[1]);
    timeText = rest.slice(dayMatch[0].length).trim();
  }

  if (timeText === "") return { days, spans: [[0, 24 * 60]], off, dateSel };

  const spans = parseTimeSpans(timeText);
  if (!spans) return null; // week numbers, year ranges, "+N day", ...
  // "Mo-Fr 08:00-18:00, 12:00-13:00 off": the comma before "12:00-13:00"
  // doesn't start a new rule (nothing to its right names a day), so it
  // stays inside this one rule's time list — but "off" trailing the whole
  // thing then reads as closing *every* listed span, when what's actually
  // meant is almost certainly a lunch closure carved out of the first span
  // (08:00-12:00 and 13:00-18:00), not the whole day. There's no way to
  // tell which spans the trailing off was meant to cover once there's more
  // than one, so this comes back unknown rather than closing more than the
  // mapper meant.
  if (off && spans.length > 1) return null;
  return { days, spans, off, dateSel };
}

// Expands a day-list fragment ("Mo-Fr", "Mo,We", "Fr-Mo", "Mo - Sa") into
// weekday indices (0 = Monday .. 6 = Sunday), including wrap-around ranges.
function expandDays(dayList) {
  const days = new Set();
  for (const part of dayList.split(",")) {
    const bits = part.trim().split(/\s*-\s*/);
    const from = bits[0], to = bits[1];
    if (to === undefined) {
      days.add(DAY_INDEX[from]);
      continue;
    }
    let i = DAY_INDEX[from];
    const end = DAY_INDEX[to];
    days.add(i);
    while (i !== end) {
      i = (i + 1) % 7;
      days.add(i);
    }
  }
  return days;
}

const daysOf = (rule) => rule.days ?? ALL_DAYS;

// True if two rules from the same comma-joined group could both match the
// same weekday and date.
function hasDayOverlap(a, b) {
  if (!dateSelCouldOverlap(a.dateSel, b.dateSel)) return false;
  const other = daysOf(b);
  for (const d of daysOf(a)) if (other.has(d)) return true;
  return false;
}

// True if two (numeric-only) spans overlap in time, accounting for
// midnight wrap. Sun-event spans can't be compared without a date and
// coordinates, so they're conservatively treated as always overlapping.
function spanTimeOverlap(spans1, spans2) {
  const expand = (spans) =>
    spans.flatMap(([s, e]) => {
      if (isSunPoint(s) || isSunPoint(e)) return [[0, 24 * 60]]; // conservative
      return e > s ? [[s, e]] : [[s, 24 * 60], [0, e]];
    });
  const a = expand(spans1), b = expand(spans2);
  return a.some(([s1, e1]) => b.some(([s2, e2]) => Math.max(s1, s2) < Math.min(e1, e2)));
}

// True if two rules in the same comma-joined additive group can't be
// resolved without guessing: they share a day and date, both carry their
// own (non-off) hours, and those hours genuinely overlap in time — which
// could mean either "these hours add up" (redundant, harmless) or "the
// later one replaces the earlier one's hours for that day" (a real
// difference we can't tell apart from the text alone).
function isAmbiguousPair(a, b) {
  if (!hasDayOverlap(a, b)) return false;
  if (a.off || b.off) return false; // off always wins outright, no ambiguity
  return spanTimeOverlap(a.spans, b.spans);
}

// Splits one ;-separated chunk into its comma-joined additional rules. A
// comma only starts a new rule when what precedes it is already a complete
// rule (an explicit time, or a trailing off/closed) and what follows opens
// with a day/PH/SH/month selector — that leaves a day list's commas ("Mo,
// Tu 10:00-18:00"), a time-span list's commas ("08:00-12:00,14:00-18:00"),
// and a date list's commas ("Dec 25-26,Jan 01 closed") joined to the rule
// they belong to.
function bufLooksComplete(buf) {
  return /\d:\d\d/.test(buf) || /(?:^|\s)(?:off|closed)$/.test(buf.trim());
}

function splitAdditiveGroup(chunk) {
  const parts = chunk.split(",");
  const out = [];
  let buf = "";
  for (const part of parts) {
    if (buf && bufLooksComplete(buf) && NEW_RULE_START_RE.test(part)) {
      out.push(buf);
      buf = part;
    } else {
      buf = buf ? `${buf},${part}` : part;
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

// Parses one "||"-alternative into an ordered list of ;-groups, each group
// an array of its evaluable (non-PH/SH-skip) rules. Returns null if any
// rule in it can't be confidently parsed, or if a ,-joined group is
// ambiguous (see isAmbiguousPair). A ;-chunk that turns out to carry no
// evaluable rule at all (e.g. it was only a "PH off") contributes no group.
function parseAlt(text) {
  const groups = [];
  for (const chunk of text.split(";")) {
    const group = [];
    for (const raw of splitAdditiveGroup(chunk)) {
      const parsed = parseRule(raw);
      if (parsed === null) return null;
      if (parsed.skip) continue;
      group.push(parsed);
    }
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (isAmbiguousPair(group[i], group[j])) return null;
      }
    }
    if (group.length) groups.push(group);
  }
  return groups;
}

// Parses a full opening_hours value into the ordered list of ;-groups for
// its *first* "||" alternative (see isOpenNow for how the others come into
// play at evaluation time), or null if that alternative can't be
// confidently parsed.
export function parseOpeningHours(value) {
  if (!value || typeof value !== "string") return null;
  return parseAlt(value.split("||")[0].trim());
}

// -------------------------------------------------------------------------
// Evaluation
// -------------------------------------------------------------------------

// Subtracts one [start,end) interval from a list of them, splitting an
// interval that straddles it in two.
function subtractInterval(intervals, [os, oe]) {
  const out = [];
  for (const [s, e] of intervals) {
    if (oe <= s || os >= e) {
      out.push([s, e]); // no overlap
      continue;
    }
    if (os > s) out.push([s, os]);
    if (oe < e) out.push([oe, e]);
  }
  return out;
}

// Resolves the spans of one rule, already filtered to a day it applies to,
// into { add, spill } minute-interval pieces: `add` is the today-side
// portion (truncated to midnight for a wrap span), `spill` is the part of
// a wrap span that lands on the *next* calendar day, resolved against
// `nextSunTimes` since that instant falls on that later date.
function resolveRuleIntervals(rule, sunTimes, nextSunTimes) {
  const add = [], spill = [];
  for (const [s0, e0] of rule.spans) {
    const s = resolvePoint(s0, sunTimes);
    const eSame = resolvePoint(e0, sunTimes);
    if (s === null || eSame === null) continue;
    if (eSame > s) {
      add.push([s, eSame]);
      continue;
    }
    // Wrap: only the today-side portion belongs here; the end instant
    // itself is re-resolved against the next calendar date.
    add.push([s, 24 * 60]);
    const eNext = isSunPoint(e0) ? resolvePoint(e0, nextSunTimes) : eSame;
    if (eNext !== null) spill.push([0, eNext]);
  }
  return { add, spill };
}

// Resolves the final schedule for one concrete calendar day (weekday +
// date ordinal), by walking the ;-groups *in order*: a group that applies
// to this day (any of its members' weekday and date selectors match)
// REPLACES whatever an earlier group had built for this day — OSM's "a
// later rule that matches today replaces the whole day's schedule, not
// just the minutes its own spans cover" semantics. Within that same group,
// its members are then walked *in their own order*: a normal member adds
// its spans to what the group is building, and an `off` member *subtracts*
// its own spans from what's been built so far — a partial closure
// ("Sa 13:00-19:00 off" alongside "Mo-Sa 09:00-19:00") only carves out the
// hours it names, not the whole day; only an `off` with no times of its own
// (spanning all 24h by construction) clears the day outright, which falls
// out of the same subtraction without a special case. A group where
// nothing applies is silently skipped, leaving the day as an earlier group
// left it (or unset, meaning "default closed").
//
// Returns:
//  - today: [start,end) minute intervals (0-1440) open on this calendar day
//  - spill: [0,end) intervals that a wrap span (e.g. 22:00-02:00) pushes
//    into the *next* calendar day — read by the caller against the
//    following day's own minute-of-day
//  - applicable: whether any group said anything about this day at all
//    (used to decide whether a "||" fallback alternative covers this day)
//
// `sunTimes` resolves this day's own sun-event endpoints; `nextSunTimes`
// resolves a wrap span's end specifically, since that instant falls on the
// *next* calendar date (an overnight "sunset-sunrise" ends at tomorrow's
// sunrise, not today's).
function resolveDay(groups, weekday, dateVal, sunTimes, nextSunTimes) {
  let today = [], spill = [], applicable = false;
  for (const group of groups) {
    const matched = group.filter((r) => daysOf(r).has(weekday) && dateSelMatches(r.dateSel, dateVal));
    if (!matched.length) continue;
    applicable = true;
    let nt = [], ns = [];
    for (const rule of matched) {
      const { add, spill: ruleSpill } = resolveRuleIntervals(rule, sunTimes, nextSunTimes);
      if (rule.off) {
        for (const iv of add) nt = subtractInterval(nt, iv);
        for (const iv of ruleSpill) ns = subtractInterval(ns, iv);
      } else {
        nt = nt.concat(add);
        ns = ns.concat(ruleSpill);
      }
    }
    today = nt;
    spill = ns;
  }
  return { today, spill, applicable };
}

const usesSun = (rules) => rules.some((r) => r.spans.some(([s, e]) => isSunPoint(s) || isSunPoint(e)));

// The distinct sun events referenced anywhere in `rules`.
function sunEventsUsed(rules) {
  const events = new Set();
  for (const rule of rules) {
    for (const [s, e] of rule.spans) {
      if (isSunPoint(s)) events.add(s.sun);
      if (isSunPoint(e)) events.add(e.sun);
    }
  }
  return events;
}

// Evaluates one alternative's groups at a specific instant: whether
// `minutes` on weekday `day` falls in today's resolved schedule, or in
// yesterday's schedule where it spills past midnight. `applicable` says
// whether *anything* in this alternative spoke to today's or yesterday's
// weekday/date — used by isOpenNow to decide whether a "||" alternative
// covers this day at all, or whether the next one should be tried instead.
function evaluateGroups(groups, day, minutes, val, yval, sunTimes, ySunTimes) {
  const yday = (day + 6) % 7;
  const todayR = resolveDay(groups, day, val, sunTimes, null);
  const ydayR = resolveDay(groups, yday, yval, ySunTimes, sunTimes);
  const todayOpen = todayR.today.some(([s, e]) => minutes >= s && minutes < e);
  const spillOpen = ydayR.spill.some(([s, e]) => minutes >= s && minutes < e);
  // Yesterday only bears on *today*'s determination for as long as its
  // spillover is still running; once the spill interval has ended, it says
  // nothing about the current instant, and mustn't make an otherwise-silent
  // "||" alternative look like it still covers this moment.
  return { open: todayOpen || spillOpen, applicable: todayR.applicable || spillOpen };
}

const hasCoords = (coords) => Number.isFinite(coords?.lat) && Number.isFinite(coords?.lon);

// The one function callers need: is `openingHours` open at `now` (a Date,
// defaulting to the caller's clock)? "unknown" whenever the value can't be
// parsed with confidence, parses to nothing usable, or needs a sun event
// and no valid `coords` ({ lat, lon }) were given.
//
// A "||" value tries its alternatives in order: the first one whose rules
// actually say something about today (or, via a still-running spillover
// from yesterday) decides the answer; an alternative that's *positively
// shown* to be silent about this day (its weekdays or date selector don't
// match, or it carries no evaluable rule at all, e.g. PH/SH-only) is
// skipped in favour of the next one. An earlier alternative that instead
// *can't be evaluated at all* — it doesn't parse, or it needs a sun event
// this call can't resolve (no coordinates, or polar day/night) — is never
// silently skipped in favour of a later, easier one: the real answer might
// be governed by that first alternative in a way this call can't see, so
// the whole value comes back "unknown" right there. Only when every
// alternative has been positively shown to say nothing about today is the
// result also "unknown" — with just one alternative (the common case, no
// "||" at all), that day-vs-weekday distinction doesn't apply and a day
// simply not mentioned in the rules defaults to "closed", same as it
// always has.
export function isOpenNow(openingHours, now = new Date(), coords = null) {
  if (!openingHours || typeof openingHours !== "string") return "unknown";
  const alts = openingHours.split("||");
  const single = alts.length === 1;

  const day = (now.getDay() + 6) % 7; // JS: 0 = Sunday -> ours: 0 = Monday
  const minutes = now.getHours() * 60 + now.getMinutes();
  const val = (now.getMonth() + 1) * 100 + now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yval = (yesterday.getMonth() + 1) * 100 + yesterday.getDate();
  const coordsOk = hasCoords(coords);

  for (const altText of alts) {
    const groups = parseAlt(altText.trim());
    if (groups === null) return "unknown"; // doesn't parse: can't be evaluated at all
    const rules = groups.flat();
    if (!rules.length) continue; // positively nothing evaluable (e.g. PH/SH-only)

    let sunTimes = null, ySunTimes = null;
    if (usesSun(rules)) {
      if (!coordsOk) return "unknown"; // can't resolve the sun event this needs
      sunTimes = sunTimesForDate(now.getFullYear(), now.getMonth() + 1, now.getDate(), coords.lat, coords.lon);
      ySunTimes = sunTimesForDate(
        yesterday.getFullYear(), yesterday.getMonth() + 1, yesterday.getDate(), coords.lat, coords.lon);
      // Polar day/night: the event this value depends on doesn't occur on
      // today's or yesterday's date at this latitude — can't be evaluated,
      // not positively shown to be silent.
      let polar = false;
      for (const event of sunEventsUsed(rules)) {
        if (sunTimes[event] === null || ySunTimes[event] === null) polar = true;
      }
      if (polar) return "unknown";
    }

    const { open, applicable } = evaluateGroups(groups, day, minutes, val, yval, sunTimes, ySunTimes);
    if (single) return open ? "open" : "closed"; // no fallback chain: default-closed as always
    if (applicable) return open ? "open" : "closed";
    // This alternative has been positively shown to say nothing about
    // today (its own weekdays/dates don't match); try the next one.
  }

  return "unknown";
}
