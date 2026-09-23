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
// ranges (Fr-Mo); multiple ; -separated rules, later rules overriding
// earlier ones for the days/times they cover; multiple , -separated time
// spans per rule; multiple , -separated *additional* rules within one ;
// -group (Mo-Fr 08:00-12:00, Sa 08:00-12:00 — the comma here adds
// Saturday's hours rather than replacing anything, unlike ";"), now
// including additional rules that share a weekday with an earlier rule in
// the same group: their spans are unioned rather than rejected, unless the
// two rules' own (non-off) hours genuinely overlap in time, which is kept
// "unknown" as genuinely ambiguous (an override or a typo, we can't tell);
// time spans that cross midnight (22:00-02:00), including "hour past 24"
// spellings of the same thing (08:00-25:00 = until 01:00 next day) and
// "00:00-00:00" (all day); the "off" and "closed" modifiers; "open end"
// times (11:00+ = open from 11:00 to midnight, closed before; 00:00+ = open
// all day; "a-b+" is read as the guaranteed a-b span, the "+" uncertainty
// about running later isn't modelled); month and date selectors (Apr-Oct,
// wrapping Nov-Apr, single/listed months, day-precise ranges, single dates,
// an optional trailing ":"), standing alone or ahead of a weekday/time
// selector, obeying the normal ; override and , addition rules, and with
// midnight-spill from yesterday checked against *yesterday's* date, not
// today's; sunrise/sunset/dawn/dusk (civil twilight, -6°) as time-span
// endpoints, plus offsets ((dusk-00:30), (sunset+01:00)), given a `coords`
// argument to isOpenNow — without it, a value that needs a sun event is
// "unknown"; the first alternative of a "||" fallback chain (the rest is
// dropped, unevaluated); a trailing quoted comment on a rule that also
// carries an explicit state keyword (07:00-23:00 open "Restaurant") is
// stripped and the rule evaluated normally, but a comment with no state
// keyword (24/7 "depends on the park") makes the value "unknown" rather
// than guessing what the comment means.
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
// day), minutes 00-59.
const HOUR_SRC = "(?:[0-3]\\d|4[0-7])";
const CLOCK_SRC = `${HOUR_SRC}:[0-5]\\d`;
const SUN_EVENT = "(?:sunrise|sunset|dawn|dusk)";
// A time-span endpoint: a plain clock time, a bare sun event, or a sun event
// with a parenthesised +/-HH:MM offset.
const TIME_POINT_SRC = `(?:\\(${SUN_EVENT}[+-]${CLOCK_SRC}\\)|${SUN_EVENT}|${CLOCK_SRC})`;
const SPAN_RE = new RegExp(`^(${TIME_POINT_SRC})\\s*-\\s*(${TIME_POINT_SRC})(\\+)?$`);
const OPEN_END_POINT_RE = new RegExp(`^(${CLOCK_SRC})\\+$`);
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
// sun event we couldn't compute (no coords, or polar day/night).
function resolvePoint(point, sunTimes) {
  if (!isSunPoint(point)) return point;
  if (!sunTimes) return null;
  const base = sunTimes[point.sun];
  if (base === null || base === undefined) return null;
  return base + point.offset;
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
  if (endDayOnly !== undefined) return { start, end: sm * 100 + Number(endDayOnly) };
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

// Parses a full opening_hours value into an ordered list of evaluable
// rules, or null if any non-PH/SH rule can't be confidently parsed, or if a
// ,-joined group is ambiguous (see isAmbiguousPair). Only the first
// alternative of a "||" fallback chain is considered.
export function parseOpeningHours(value) {
  if (!value || typeof value !== "string") return null;
  const firstAlt = value.split("||")[0];
  const rules = [];
  for (const chunk of firstAlt.split(";")) {
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
    rules.push(...group);
  }
  return rules;
}

// -------------------------------------------------------------------------
// Evaluation
// -------------------------------------------------------------------------

// True if `spans` (as parsed above) covers `minutes` on weekday `day`,
// given the rule applies on weekday `ruleDay` and (if dateSel is set) date
// ordinal `val`/`yval` (today's/yesterday's mm*100+dd), handling midnight
// wrap — a wrap's spillover past midnight is checked against *yesterday's*
// date, since that's the date the rule "started" on. `sunTimes`/`ySunTimes`
// resolve sun-event endpoints for today's/yesterday's date; if a span needs
// one and it's unavailable, that span simply doesn't match (never guessed).
function spanCovers(rule, ruleDay, day, minutes, val, yval, sunTimes, ySunTimes) {
  const { spans, dateSel } = rule;
  return spans.some(([startRaw, endRaw]) => {
    const start = resolvePoint(startRaw, sunTimes);
    const end = resolvePoint(endRaw, sunTimes);
    const yStart = resolvePoint(startRaw, ySunTimes);
    const yEnd = resolvePoint(endRaw, ySunTimes);
    if (start !== null && end !== null && end > start) {
      return day === ruleDay && minutes >= start && minutes < end && dateSelMatches(dateSel, val);
    }
    const todayPart =
      day === ruleDay && start !== null && minutes >= start && dateSelMatches(dateSel, val);
    const spillPart =
      day === (ruleDay + 1) % 7 && yEnd !== null && minutes < yEnd && dateSelMatches(dateSel, yval);
    return todayPart || spillPart;
  });
}

// Evaluates already-parsed rules at a given weekday (0 = Monday), minute-
// of-day, and date. Later rules override earlier ones wherever they match,
// same as OSM's own "last matching rule wins" semantics. Returns "open",
// "closed", or "unknown" if there is nothing to go on (e.g. the whole
// value was PH/SH-only rules, which we skip) or a needed sun event
// couldn't be resolved for every rule that used one.
function evaluateRules(rules, day, minutes, val, yval, sunTimes, ySunTimes) {
  if (!rules.length) return "unknown";
  let result = "closed"; // unlisted time defaults to closed, per OSM
  for (const rule of rules) {
    for (const ruleDay of daysOf(rule)) {
      if (spanCovers(rule, ruleDay, day, minutes, val, yval, sunTimes, ySunTimes)) {
        result = rule.off ? "closed" : "open";
        break;
      }
    }
  }
  return result;
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

// The one function callers need: is `openingHours` open at `now` (a Date,
// defaulting to the caller's clock)? "unknown" whenever the value can't be
// parsed with confidence, or parses to nothing usable, or needs a sun event
// and no `coords` ({ lat, lon }) were given.
export function isOpenNow(openingHours, now = new Date(), coords = null) {
  const rules = parseOpeningHours(openingHours);
  if (rules === null) return "unknown";
  if (usesSun(rules) && !coords) return "unknown";

  const day = (now.getDay() + 6) % 7; // JS: 0 = Sunday -> ours: 0 = Monday
  const minutes = now.getHours() * 60 + now.getMinutes();
  const val = (now.getMonth() + 1) * 100 + now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yval = (yesterday.getMonth() + 1) * 100 + yesterday.getDate();

  let sunTimes = null, ySunTimes = null;
  if (coords) {
    sunTimes = sunTimesForDate(now.getFullYear(), now.getMonth() + 1, now.getDate(), coords.lat, coords.lon);
    ySunTimes = sunTimesForDate(
      yesterday.getFullYear(), yesterday.getMonth() + 1, yesterday.getDate(), coords.lat, coords.lon);
    // Polar day/night: the event this value depends on doesn't occur on
    // today's or yesterday's date at this latitude, so there's nothing
    // confident to say — unknown rather than falling through to a default
    // "closed".
    for (const event of sunEventsUsed(rules)) {
      if (sunTimes[event] === null || ySunTimes[event] === null) return "unknown";
    }
  }

  return evaluateRules(rules, day, minutes, val, yval, sunTimes, ySunTimes);
}
