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
// ranges (Fr-Mo); multiple ; -separated rule groups and multiple , -separated
// *additional* rules within one ; -group. Within a group, only the *first*
// rule (the one before any comma) decides whether the group REPLACES the
// day's schedule or only ADDS/SUBTRACTS onto it: a first rule that isn't
// `off` and carries its own weekday or date selector replaces the whole
// day's schedule for the days that first rule itself applies to, not just the minutes its own spans mention (Mo-Su 08:00-20:00;
// Tu off closes all of Tuesday, not merely whatever "Tu off" happens to
// list); a first rule with neither a weekday nor a date selector (a bare
// time span, meant the same on every day: Mo-Fr 08:00-18:00; 10:00-12:00)
// only adds its spans, except when it stands alone in its group and no
// earlier rule has named the day (07:00-11:00; 18:30-22:30 is just the
// evening); and a first rule
// that is itself `off` never replaces either, it only subtracts its own
// hours from whatever is already there (Mo-Fr 08:00-18:00; We 12:00-14:00
// off carves the lunch break out of Wednesday, it doesn't wipe Wednesday
// down to just that). Every rule *after* the first in a group — a ,
// -joined additional rule — never replaces on its own account, regardless
// of its own selector: it only adds (Mo-Fr 08:00-12:00, Sa 08:00-12:00 —
// the comma adds Saturday's hours) or subtracts (`off`), carving its own
// hours back *out* of what's been built so far for the days it names,
// rather than wiping the day outright (Mo-Sa 09:00-19:00, Sa 13:00-19:00
// off — Saturday is 09:00-13:00 only) — order within the group matters the
// same way ; does (a rule after an off can re-add hours it took away). An
// off with more than one of its own comma-joined time spans can't be told
// apart from a new rule that's missing its day selector, so it's "unknown"
// rather than a guess. Overlapping comma-joined rules on a shared weekday
// simply union their hours, whether or not the spans themselves overlap —
// there's no attempt to flag that as ambiguous. Time spans that cross
// midnight (22:00-02:00), including "hour past 24" spellings of the same
// thing on the *end* of a span (08:00-25:00 = until 01:00 next day, and
// 08:00-33:00 = until 09:00 the day after — an end past 24:00 is *always* a
// wrap into the next day, even where the folded time of day would otherwise
// read as later than the start) and "00:00-00:00" (all day) — a *start*
// past 24:00 (Fr 24:00-26:00) doesn't mean anything relative to Friday and
// is "unknown"; the "off" and "closed" modifiers; "open end" times (11:00+ =
// open from 11:00 to midnight, closed before; 00:00+ = open all day; "a-b+"
// is read as the guaranteed a-b span, the "+" uncertainty about running
// later isn't modelled); month and date selectors (Apr-Oct, wrapping
// Nov-Apr, single/listed months, day-precise ranges, single dates, an
// optional trailing ":") — a day-only continuation names a day in the same
// month, so "Dec 20-05" doesn't parse as a year-wrapping range — standing
// alone or ahead of a weekday/time selector, obeying the same replace/add
// rules as a weekday selector, and with midnight-spill from yesterday
// checked against *yesterday's* date, not today's; sunrise/sunset/dawn/dusk
// (civil twilight, -6°) as time-span endpoints, plus offsets ((dusk-00:30),
// (sunset+01:00), folded back into a valid time of day if the offset pushes
// past midnight), given a `coords` argument to isOpenNow ({ lat, lon}, both
// required to be finite numbers) — without it, a value that needs a sun
// event is "unknown", same as on a date where the event doesn't occur at
// that latitude (polar day/night); a "||" fallback chain, tried in order,
// purely on whether each alternative is open *right now*: the first
// alternative that resolves to open decides the answer outright; one that
// resolves to closed (it parses and evaluates fine, just isn't open at this
// instant) doesn't end the search, the next alternative is tried; one that
// carries no evaluable rule at all (e.g. it's only "PH off") is silently
// skipped; but one that simply *can't be evaluated* (doesn't parse, or
// needs a sun event this call can't resolve) makes the whole value
// "unknown" right there rather than silently falling through to an easier
// later alternative that might have answered differently. If every
// alternative that could be evaluated came back closed, the result is
// "closed"; "unknown" is reserved for when none could be evaluated at all
// (a plain value with no "||" keeps its original default-closed behaviour
// for a day the rules don't mention); a trailing quoted comment on a rule
// that also carries an explicit state keyword (07:00-23:00 open
// "Restaurant") is stripped and the rule evaluated normally, but a comment
// with no state keyword (24/7 "depends on the park") makes that
// alternative unparseable rather than guessing what the comment means.
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
//
// One deliberate difference from the reference library
// (https://github.com/opening-hours/opening_hours.js): the after-midnight part
// of a span belongs to the day the span started. A later ; rule for the next
// day doesn't cancel it (Mo-Th 08:00-01:00; Fr 08:00-02:00 is open at 00:30
// on Friday), nor does a whole-day off for the next day; a partial off that
// names those hours ("Sa 01:00-02:00 off") does close them.

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
      if (start === end) {
        if (start !== 0) return null; // a zero-length span says nothing useful
        spans.push([0, 24 * 60]); // "00:00-00:00" = all day
        continue;
      }
      // The end is left unfolded past 24:00 (up to 47:59) here: an end past
      // 24:00 always means a wrap into the next day, even when the folded
      // value happens to be numerically greater than the start (00:00-24:59
      // must not read as the single span [0,59]) — resolveRuleIntervals is
      // what does the folding, once it knows the end was genuinely past
      // 24:00 rather than just a small number.
      spans.push([start, end]);
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
// an array of its evaluable (non-PH/SH-skip) rules, in their original
// (comma-additive) order. Returns null if any rule in it can't be
// confidently parsed. A ;-chunk that turns out to carry no evaluable rule
// at all (e.g. it was only a "PH off") contributes no group.
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
    // An end past 24:00 (an "hour past 24" spelling, e.g. 08:00-33:00) is
    // always a wrap into the next day, regardless of whether the raw,
    // unfolded end happens to be numerically greater than the start.
    if (!isSunPoint(e0) && eSame > 24 * 60) {
      add.push([s, 24 * 60]);
      spill.push([0, eSame - 24 * 60]);
      continue;
    }
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
// date ordinal), by walking the ;-groups *in order*. Whether a group
// REPLACES the day's schedule so far, for the days it applies to, or only
// ADDS to it (or SUBTRACTS, for an `off`), is decided once per group by its
// *first* rule (the one before any comma): a non-`off` first rule that
// carries its own weekday or date selector ("explicit") replaces (OSM's "a
// later rule that matches today replaces the whole day's schedule, not
// just the minutes its own spans cover" semantics), and that day is then
// "claimed" — every later bare rule only adds to it, never replaces it
// again. A first rule with neither a weekday nor a date selector ("bare",
// meant to apply to every day alike) only ever replaces when it is its
// group's *sole* member (no comma-joined companions at all, regardless of
// which days they themselves cover) and this day hasn't been claimed:
// "07:00-11:00;18:30-22:30" is not 07:00-11:00 *and* 18:30-22:30, the
// second (solitary) bare rule overwrites the still-unclaimed first one,
// leaving only 18:30-22:30 — the same way explicit groups replace each
// other, just without ever claiming the day themselves. But a bare rule
// that has *any* comma companions never replaces, even on a day none of
// its companions individually name and that isn't otherwise claimed —
// "14:00-16:00, Fr 07:30-12:30" doesn't reset Saturday just because
// Saturday is neither the bare rule's own selector-free "default" case
// nor Friday, the presence of the comma is enough on its own; and once
// some earlier explicit group HAS claimed a day, a bare group of any
// shape only adds to it regardless (Mo-Fr 08:00-18:00; 10:00-12:00 adds
// those two hours to every day, it doesn't wipe Mo-Fr's explicit hours
// down to just 10-12). A first rule that is itself `off` never replaces,
// claimed or not — an `off` always carves hours out of the existing
// schedule rather than wiping the slate first. Every rule *after* the
// first in a group (an additional, comma-joined rule) never replaces on
// its own account, regardless of its own selector — it only adds or
// subtracts, in order, same as always, and never claims the day either.
//
// When a group does replace, that only happens for the days its *first*
// rule itself applies to (weekday and date both match, for an explicit
// first rule; every day, for a bare one) — not merely a day some later,
// comma-joined member happens to mention; for those days the schedule
// built so far is discarded and rebuilt from only this group's matching
// members, walked in their own order. For every other day, or when the
// group doesn't replace at all, the days a member applies to keep
// whatever an earlier group left them at, and this group's matching
// members are layered on top: a normal member adds its spans, and an
// `off` member *subtracts* its
// own spans from what's been built so far — a partial closure
// ("Sa 13:00-19:00 off" alongside "Mo-Sa 09:00-19:00") only carves out the
// hours it names, not the whole day; only an `off` with no times of its own
// (spanning all 24h by construction) clears the day outright, which falls
// out of the same subtraction without a special case. A group with no
// member applying to this day is silently skipped, leaving the day as an
// earlier group left it (or unset, meaning "default closed").
//
// Returns:
//  - today: [start,end) minute intervals (0-1440) open on this calendar day
//  - spill: [0,end) intervals that a wrap span (e.g. 22:00-02:00) pushes
//    into the *next* calendar day — read by the caller against the
//    following day's own minute-of-day
//  - cuts: the hours partial `off` rules name on this day, which the caller
//    also takes out of yesterday's spill
//
// `sunTimes` resolves this day's own sun-event endpoints; `nextSunTimes`
// resolves a wrap span's end specifically, since that instant falls on the
// *next* calendar date (an overnight "sunset-sunrise" ends at tomorrow's
// sunrise, not today's).
function resolveDay(groups, weekday, dateVal, sunTimes, nextSunTimes) {
  let today = [], spill = [];
  // Hours a partial `off` names on this day. They also close the matching
  // part of *yesterday's* spill ("Fr 20:00-02:00; Sa 01:00-02:00 off"), which
  // only the caller can apply. A whole-day off does not: yesterday's evening
  // keeps its after-midnight hours (see the header).
  const cuts = [];
  // Tracks whether this weekday has, at any *earlier* group, been touched
  // by a rule that carries its own weekday or date selector — whether or
  // not that rule was its group's first (replacing) member, or merely a
  // comma-joined addition ("Mo 07:30-16:00, Tu 07:30-13:00" claims Tuesday
  // via its comma rule alone, the group's own first rule only mentions
  // Monday). Together with a solitary (comma-free) group being the other
  // precondition for a bare rule to replace (see below), this is what lets
  // a later bare rule tell "still the untouched default" apart from "a day
  // some earlier rule already said something specific about".
  let explicitClaimed = false;
  for (const group of groups) {
    const matched = group.filter((r) => daysOf(r).has(weekday) && dateSelMatches(r.dateSel, dateVal));
    if (!matched.length) continue;
    const first = group[0];
    const firstIsExplicit = !first.off && (first.days !== null || first.dateSel !== null);
    // The group only replaces the day's schedule when its *first* rule
    // itself applies to this weekday/date (not merely some later,
    // comma-joined member of the group) — a comma rule that reaches a day
    // the first rule doesn't cover only adds to what's already there, the
    // same as it would in a group that never replaces at all.
    const explicitReplace = firstIsExplicit &&
      daysOf(first).has(weekday) && dateSelMatches(first.dateSel, dateVal);
    // A bare first rule only resets the "default" template when it's the
    // *sole* member of its group (no comma companions at all, regardless
    // of which days they cover) and this day hasn't been explicitly
    // claimed yet: a group that carries any comma-joined companion never
    // resets, even on a day none of its own members individually name —
    // "14:00-16:00, Fr 07:30-12:30" doesn't reset Saturday just because
    // Saturday isn't Friday, the presence of the comma alone is enough.
    const implicitReplace = !first.off && !firstIsExplicit && !explicitClaimed && group.length === 1;
    const replaces = explicitReplace || implicitReplace;
    let nt = replaces ? [] : today;
    let ns = replaces ? [] : spill;
    for (const rule of matched) {
      const { add, spill: ruleSpill } = resolveRuleIntervals(rule, sunTimes, nextSunTimes);
      if (rule.off) {
        for (const iv of add) nt = subtractInterval(nt, iv);
        for (const iv of ruleSpill) ns = subtractInterval(ns, iv);
        // A whole-day off (no times of its own, or 00:00-24:00 in any
        // spelling, so its resolved span covers [0,1440)) closes today outright, including whatever the evening
        // would otherwise have spilled into tomorrow: an earlier member's
        // overnight span that *started* today can't survive today being
        // off entirely. A partial off, by contrast, only subtracts the
        // specific hours it names, and a still-running overnight span
        // outside those hours is untouched.
        if (add.some(([s, e]) => s <= 0 && e >= 24 * 60)) ns = [];
        else cuts.push(...add);
      } else {
        nt = nt.concat(add);
        ns = ns.concat(ruleSpill);
      }
    }
    today = nt;
    spill = ns;
    if (matched.some((r) => r.days !== null || r.dateSel !== null)) explicitClaimed = true;
  }
  return { today, spill, cuts };
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
// yesterday's schedule where it spills past midnight, less any hours a
// partial `off` for today names.
function evaluateGroups(groups, day, minutes, val, yval, sunTimes, ySunTimes) {
  const yday = (day + 6) % 7;
  const todayR = resolveDay(groups, day, val, sunTimes, null);
  const ydayR = resolveDay(groups, yday, yval, ySunTimes, sunTimes);
  const todayOpen = todayR.today.some(([s, e]) => minutes >= s && minutes < e);
  const spill = todayR.cuts.reduce(subtractInterval, ydayR.spill);
  const spillOpen = spill.some(([s, e]) => minutes >= s && minutes < e);
  return todayOpen || spillOpen;
}

const hasCoords = (coords) => Number.isFinite(coords?.lat) && Number.isFinite(coords?.lon);

// The one function callers need: is `openingHours` open at `now` (a Date,
// defaulting to the caller's clock)? "unknown" whenever the value can't be
// parsed with confidence, parses to nothing usable, or needs a sun event
// and no valid `coords` ({ lat, lon }) were given.
//
// A "||" value tries its alternatives in order, purely on whether each one
// is open *right now*: the first alternative that resolves to open wins
// outright. An alternative that resolves to "closed" (evaluable, just not
// open at this instant) doesn't end the search — the next alternative is
// tried. An alternative that carries no evaluable rule at all (e.g. it's
// only "PH off") is silently skipped, neither open nor closed. An
// alternative that instead *can't be evaluated* — it doesn't parse (a
// comment with no state keyword, unsupported syntax), or it needs a sun
// event this call can't resolve (no coordinates, or polar day/night) —
// makes the whole value "unknown" right there, rather than silently
// falling through to an easier later alternative: the real answer might be
// governed by that alternative in a way this call can't see. If every
// alternative that could be evaluated came back closed, the answer is
// "closed"; if none could even be evaluated (all skipped), it's "unknown".
// With just one alternative (the common case, no "||" at all) this reduces
// to the same default-closed behaviour it always had.
export function isOpenNow(openingHours, now = new Date(), coords = null) {
  if (!openingHours || typeof openingHours !== "string") return "unknown";
  const alts = openingHours.split("||");

  const day = (now.getDay() + 6) % 7; // JS: 0 = Sunday -> ours: 0 = Monday
  const minutes = now.getHours() * 60 + now.getMinutes();
  const val = (now.getMonth() + 1) * 100 + now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yval = (yesterday.getMonth() + 1) * 100 + yesterday.getDate();
  const coordsOk = hasCoords(coords);

  let evaluatedAny = false;
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

    evaluatedAny = true;
    const open = evaluateGroups(groups, day, minutes, val, yval, sunTimes, ySunTimes);
    if (open) return "open";
    // Closed, not unknown: try the next alternative, if any.
  }

  return evaluatedAny ? "closed" : "unknown";
}
