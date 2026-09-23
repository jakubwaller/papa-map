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
// against anyway.
//
// Supported: "24/7"; day ranges and lists (Mo-Fr, Mo,We, Sa-Su); wrap-around
// day ranges (Fr-Mo); multiple ; -separated rules, later rules overriding
// earlier ones for the days/times they cover; multiple , -separated time
// spans per rule; time spans that cross midnight (22:00-02:00); the "off"
// and "closed" modifiers. PH and SH (public/school holiday) rules are
// recognised and *skipped* — we have no calendar to check them against, so
// a "PH off" rule neither opens nor closes anything here; the closest
// alternative, guessing at a holiday, would risk exactly the false claim
// this module exists to avoid.
//
// Not supported, and returned as "unknown" rather than guessed at: months
// and date ranges, week numbers, sunrise/sunset/dawn/dusk, "open end" (+),
// comments, year ranges, and anything else this parser does not recognise.

const DAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_INDEX = Object.fromEntries(DAY_NAMES.map((d, i) => [d, i]));
const DAY_TOKEN = "(?:Mo|Tu|We|Th|Fr|Sa|Su)";
const DAY_LIST_RE = new RegExp(
  `^((?:${DAY_TOKEN}(?:-${DAY_TOKEN})?)(?:,(?:${DAY_TOKEN}(?:-${DAY_TOKEN})?))*)`);
const TIME_SPAN_RE = /^([01]\d|2[0-4]):([0-5]\d)-([01]\d|2[0-4]):([0-5]\d)$/;
const PH_SH_ONLY_RE = /^(?:PH|SH)(?:,(?:PH|SH))*(?:\s+(?:off|closed))?$/;

// Expands a day-list fragment ("Mo-Fr", "Mo,We", "Fr-Mo") into weekday
// indices (0 = Monday .. 6 = Sunday), including wrap-around ranges.
function expandDays(dayList) {
  const days = new Set();
  for (const part of dayList.split(",")) {
    const [from, to] = part.split("-");
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

// Parses a comma-separated time-span list into [startMinute, endMinute]
// pairs. endMinute may be <= startMinute, meaning the span crosses
// midnight. Returns null if any fragment isn't a plain HH:MM-HH:MM span.
function parseTimeSpans(text) {
  const spans = [];
  for (const part of text.split(",")) {
    const m = TIME_SPAN_RE.exec(part.trim());
    if (!m) return null;
    const start = Number(m[1]) * 60 + Number(m[2]);
    const end = Number(m[3]) * 60 + Number(m[4]);
    if (start === end) return null; // a zero-length span says nothing useful
    spans.push([start, end]);
  }
  return spans;
}

// Parses one ;-separated rule. Returns:
//  - { skip: true }               — a PH/SH rule we deliberately ignore
//  - { days, spans, off }         — a rule we can evaluate (days: Set or
//                                    null for "every day")
//  - null                         — anything we don't confidently understand
function parseRule(raw) {
  const rule = raw.trim();
  if (!rule) return { skip: true };
  if (rule === "24/7") return { days: null, spans: [[0, 24 * 60]], off: false };
  if (PH_SH_ONLY_RE.test(rule)) return { skip: true };

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

  if (rest === "") return { days: null, spans: [[0, 24 * 60]], off };

  const dayMatch = DAY_LIST_RE.exec(rest);
  let days = null;
  let timeText = rest;
  if (dayMatch) {
    days = expandDays(dayMatch[1]);
    timeText = rest.slice(dayMatch[0].length).trim();
  }

  if (timeText === "") return { days, spans: [[0, 24 * 60]], off };

  const spans = parseTimeSpans(timeText);
  if (!spans) return null; // months, "week", sunrise, "+", comments, ...
  return { days, spans, off };
}

// Parses a full opening_hours value into an ordered list of evaluable
// rules, or null if any non-PH/SH rule can't be confidently parsed.
export function parseOpeningHours(value) {
  if (!value || typeof value !== "string") return null;
  const rules = [];
  for (const raw of value.split(";")) {
    const parsed = parseRule(raw);
    if (parsed === null) return null;
    if (parsed.skip) continue;
    rules.push(parsed);
  }
  return rules;
}

// True if `spans` (as parsed above) covers `minutes` on weekday `day`,
// given the rule applies on weekday `ruleDay`, handling midnight wrap.
function spanCovers(spans, ruleDay, day, minutes) {
  return spans.some(([start, end]) => {
    if (end > start) return day === ruleDay && minutes >= start && minutes < end;
    // Wrap past midnight: open from `start` on ruleDay through `end` on
    // the following day.
    return (day === ruleDay && minutes >= start) ||
           (day === (ruleDay + 1) % 7 && minutes < end);
  });
}

// Evaluates already-parsed rules at a given weekday (0 = Monday) and
// minute-of-day. Later rules override earlier ones wherever they match,
// same as OSM's own "last matching rule wins" semantics. Returns "open",
// "closed", or "unknown" if there is nothing to go on (e.g. the whole
// value was PH/SH-only rules, which we skip).
function evaluateRules(rules, day, minutes) {
  if (!rules.length) return "unknown";
  let result = "closed"; // unlisted time defaults to closed, per OSM
  for (const rule of rules) {
    const days = rule.days ?? new Set(DAY_NAMES.map((_, i) => i));
    for (const ruleDay of days) {
      if (spanCovers(rule.spans, ruleDay, day, minutes)) {
        result = rule.off ? "closed" : "open";
        break;
      }
    }
  }
  return result;
}

// The one function callers need: is `openingHours` open at `now` (a Date,
// defaulting to the caller's clock)? "unknown" whenever the value can't be
// parsed with confidence, or parses to nothing usable.
export function isOpenNow(openingHours, now = new Date()) {
  const rules = parseOpeningHours(openingHours);
  if (rules === null) return "unknown";
  const day = (now.getDay() + 6) % 7; // JS: 0 = Sunday -> ours: 0 = Monday
  const minutes = now.getHours() * 60 + now.getMinutes();
  return evaluateRules(rules, day, minutes);
}
