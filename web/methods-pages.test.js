import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NUMBER_LOCALE, DEFAULT_LANG, LANGS } from "./i18n.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGES = fs.readdirSync(DIR)
  .filter((f) => /^methods(-[a-z]+)?\.html$/.test(f))
  .sort();

const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const localeOf = (src) => (src.match(/var LOCALE = "([^"]+)"/) || [])[1];
// methods.html is the German original; every other page names its language in
// the filename.
const langOf = (f) => (f.match(/^methods-([a-z]+)\.html$/) || [null, DEFAULT_LANG])[1];
// The numbers live between <body> and the <script> that overwrites some of
// them; the script itself contains code, not prose. The date fallback is cut
// out: its year is not a count to be grouped (lt writes "2026 m. liepos 26 d."),
// and it has a test of its own below.
const bodyOf = (src) => src.slice(src.indexOf("<body>"), src.indexOf("<script>"))
  .replace(/<span data-stat="date">[^<]*<\/span>/g, "");

// A space-like group separator is written as &nbsp; in markup, so the number
// never wraps across a line.
const groupSep = (loc) => {
  const v = new Intl.NumberFormat(loc).formatToParts(1234567.8)
    .find((p) => p.type === "group").value;
  return /[\s   ]/.test(v) ? "&nbsp;" : v;
};
const decimalSep = (loc) => new Intl.NumberFormat(loc).formatToParts(1234567.8)
  .find((p) => p.type === "decimal").value;

test("every methods page declares a LOCALE", () => {
  assert.ok(PAGES.length >= 31, `found only ${PAGES.length} methods pages`);
  for (const f of PAGES) assert.ok(localeOf(read(f)), `${f} has no var LOCALE`);
});

test("a page's LOCALE is the one i18n.js uses for that language", () => {
  // Two tables held the same fact and drifted: methods-en.html said en-GB while
  // NUMBER_LOCALE said en-US, which formats the same numbers but writes the
  // date as "Jul 26, 2026" under otherwise British prose.
  for (const f of PAGES) {
    const lang = langOf(f);
    assert.equal(localeOf(read(f)), NUMBER_LOCALE[lang], `${f} (lang ${lang})`);
  }
});

test("the date fallback is written in the page's own language", () => {
  // The script replaces this span once stats.json loads; until then — and for
  // every reader without JS — the markup is what stands. Pages added by copying
  // the English source kept its "26 Jul 2026".
  //
  // The month name is taken from the formatted date, not from a standalone
  // month lookup, because several languages inflect it there (cs "července",
  // lt "liepos"). Either the short or the long form is accepted: hand-localised
  // pages use both, and "26 юли 2026" is good Bulgarian even though CLDR's long
  // form appends "г.". The comparison is case-sensitive on purpose — that is
  // the whole difference between English "Jul" and Bosnian "jul".
  const d = new Date("2026-07-26T00:00:00Z");
  for (const f of PAGES) {
    const src = read(f);
    const loc = localeOf(src);
    const names = ["short", "long"].map((month) =>
      new Intl.DateTimeFormat(loc, { day: "numeric", month, year: "numeric", timeZone: "UTC" })
        .formatToParts(d).find((p) => p.type === "month").value.replace(/\.$/, ""));
    // &nbsp; back to a plain space: the markup uses it between every part so the
    // date cannot wrap, but Intl hands back ordinary spaces (ca "de juliol").
    const fallback = ((src.match(/data-stat="date">([^<]*)/) || [])[1] || "")
      .replace(/&nbsp;|[   ]/g, " ");
    // Japanese (ja-JP) has no month *name*: Intl's month part is the bare
    // digit and the 月 is a literal, so the whole formatted date is the thing
    // to look for there — "2026年7月26日".
    const whole = new Intl.DateTimeFormat(loc, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      .format(d);
    assert.ok(
      names.some((n) => /\p{L}/u.test(n) && fallback.includes(n))
        || (!names.some((n) => /\p{L}/u.test(n)) && fallback.includes(whole)),
      `${f} (${loc}) has "${fallback}", which is neither ${names.map((n) => `"${n}"`).join(" nor ")} nor "${whole}"`,
    );
  }
});

test("static numbers use the page's own thousands separator", () => {
  // The sample table and the taginfo fallbacks are typed into the markup; the
  // script re-formats only the data-stat spans, and only if the fetch works.
  // An English "9,674" on the Bulgarian page is therefore what a reader sees.
  // House rule: every number >= 1000 is grouped, with this language's
  // separator. (Deliberately not CLDR's minimumGroupingDigits, which would
  // leave four-digit numbers bare in es/it/pt — the pages group them.)
  for (const f of PAGES) {
    const src = read(f);
    const want = groupSep(localeOf(src));
    const found = [...bodyOf(src).matchAll(/\d{1,3}(?:&nbsp;|[.,   ])\d{3}(?!\d)/g)]
      .map((m) => m[0]);
    const wrong = [...new Set(found.filter((n) => !n.includes(want)))];
    assert.deepEqual(wrong, [], `${f} (${localeOf(src)}) wants "${want}" as thousands separator`);
    // and nothing >= 1000 left ungrouped
    const bare = [...new Set([...bodyOf(src).matchAll(/(?<![\d.,  ;])\d{4,}(?![\d.,])/g)]
      .map((m) => m[0]))];
    assert.deepEqual(bare, [], `${f} has ungrouped numbers`);
  }
});

test("static decimals use the page's own decimal separator", () => {
  for (const f of PAGES) {
    const src = read(f);
    const want = decimalSep(localeOf(src));
    const found = [...bodyOf(src).matchAll(/\b\d{1,2}[.,]\d\s?%/g)].map((m) => m[0]);
    const wrong = [...new Set(found.filter((n) => !n.includes(want)))];
    assert.deepEqual(wrong, [], `${f} (${localeOf(src)}) wants "${want}" as decimal separator`);
  }
});

// Each language's words for "nightly" / "overnight", as the methods pages write
// them. Kept by hand next to the pages, so a new language needs an entry here.
const NIGHTLY = {
  de: /nächtlich|über Nacht/i,
  en: /nightly|overnight/i,
  be: /начн|уначы/i,
  bg: /нощн|през нощта/i,
  bs: /noćn|preko noći/i,
  ca: /nocturn|de nit/i,
  cs: /nočn|přes noc/i,
  da: /natlig|om natten/i,
  el: /νυχτερ|τη νύχτα/i,
  es: /nocturn|por la noche/i,
  et: /(^|[^\p{L}])öi[ns]|öösel/iu,
  fi: /yöllis|yöllä|öisin/i,
  fr: /nocturne|la nuit/i,
  hr: /noćn|preko noći/i,
  hu: /éjszaka|éjjel/i,
  is: /nætur/i,
  it: /notturn|di notte/i,
  ja: /夜/,
  lt: /nakt/i,
  lv: /nakt/i,
  mk: /ноќ/i,
  nl: /nachtelijk|'s nachts/i,
  no: /nattlig|om natten/i,
  pl: /nocn|w nocy/i,
  pt: /noturn|durante a noite/i,
  ro: /noapte|nocturn/i,
  sk: /nočn|cez noc/i,
  sl: /nočn|čez noč/i,
  sq: /natës|natën/i,
  sr: /ноћн|преко ноћи/i,
  sv: /nattlig|på natten/i,
  uk: /нічн|вночі/i,
};

test("answers, new places and the play ring are not promised for the nightly build", () => {
  // Since the delta follower (CONTRACT v48) an answer, a new place and the play
  // ring show up within minutes. The stats and region pages are still rebuilt
  // nightly, so the word itself stays on the page — just not from the play
  // paragraph (the one with kids_area=no) through the add-a-place section (up to
  // the <h2> after id="contribute"), which covers the play-only rings, the
  // grey-pin how-to and the iD walkthrough.
  assert.deepEqual(Object.keys(NIGHTLY).sort(), [...LANGS].sort());
  for (const f of PAGES) {
    const src = read(f);
    const re = NIGHTLY[langOf(f)];
    // Guard against a regex that matches nothing: the stats sentence keeps it.
    assert.match(bodyOf(src), re, `${f}: ${re} never matches, so it guards nothing`);
    const k = src.indexOf("<code>kids_area=no</code>");
    const c = src.indexOf('<h2 id="contribute"');
    assert.ok(k > 0 && c > k, `${f} lacks the play paragraph or the contribute section`);
    const text = src.slice(src.lastIndexOf("<p", k), src.indexOf("<h2", c + 1));
    const m = text.match(re);
    assert.equal(m, null, `${f} still says "${m && text.slice(Math.max(0, m.index - 40), m.index + 30)}"`);
  }
});
