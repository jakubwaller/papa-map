import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NUMBER_LOCALE, DEFAULT_LANG, LANGS, STRINGS } from "./i18n.js";
import { roomChoices } from "./osm.js";

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

test("the back link reopens the map in the page's own language", () => {
  // A bare index.html dropped it: a reader who came by ?lang=fr with nothing
  // stored landed back on a map in their browser's language.
  for (const f of PAGES) {
    const src = read(f);
    const lang = langOf(f);
    assert.ok(LANGS.includes(lang), `${f}: ${lang} is not a map language`);
    assert.ok(src.includes(`<html lang="${lang}">`), `${f}: <html lang> is not ${lang}`);
    const back = (src.match(/<p class="back"><a href="([^"]*)">/) || [])[1];
    assert.equal(back, lang === DEFAULT_LANG ? "./" : `./?lang=${lang}`, f);
  }
});

test("no link anywhere on a translated page drops the language on the way home", () => {
  // The in-body "home page" link (section on toilets:num_chambers) was a bare
  // "./" in 29 pages, so a reader with another browser language landed on the
  // map in that language instead of the page's own.
  for (const f of PAGES) {
    const lang = langOf(f);
    if (lang === DEFAULT_LANG) continue;
    const bare = read(f).match(/href="(\.\/|index\.html)"/);
    assert.equal(bare, null, `${f} still links to the map without ?lang=${lang}`);
  }
});

// The anchors other pages deep-link to (app footers, the leaderboard, the
// native app's help link) and the ones the contents list uses. One id set for
// every language, so a link written for one page works on all of them. There
// are no optional sections: the old "empty blue rings" section is folded into
// the blue-ring section in every language and must not come back.
const H2_IDS = ["what", "colours", "mum-mode", "play-area", "wheelchair", "high-chair",
  "grey-pin", "contribute", "no-ranking", "where-tables", "licence", "privacy", "how-made"];
const H2_IDS_OPTIONAL = [];

test("every h2 on a methods page has the same stable id in every language", () => {
  for (const f of PAGES) {
    const ids = [...read(f).matchAll(/<h2 id="([^"]+)">/g)].map((m) => m[1]);
    const all = [...read(f).matchAll(/<h2[ >]/g)];
    assert.equal(ids.length, all.length, `${f} has an h2 without an id`);
    assert.deepEqual(ids.filter((i) => !H2_IDS_OPTIONAL.includes(i)), H2_IDS, f);
    assert.equal(new Set(ids).size, ids.length, `${f} repeats an id`);
  }
});

test("the contents list links to every h2 and nothing else", () => {
  for (const f of PAGES) {
    const src = read(f);
    const nav = (src.match(/<nav[^>]*>[\s\S]*?<\/nav>/) || [])[0];
    assert.ok(nav, `${f} has no contents list`);
    const linked = [...nav.matchAll(/<a href="#([^"]+)">/g)].map((m) => m[1]);
    const ids = [...src.matchAll(/<h2 id="([^"]+)">/g)].map((m) => m[1]);
    assert.deepEqual(linked, ids, `${f}: contents list and h2 ids differ`);
    // it sits between the intro and the first section
    assert.ok(src.indexOf("<nav") < src.indexOf("<h2"), f);
  }
});

test("the pointer to other family maps is one sentence in the first section", () => {
  for (const f of PAGES) {
    const src = read(f);
    assert.ok(!src.includes('id="related"'), `${f} still has the bottom section`);
    const first = src.slice(src.indexOf('<h2 id="what">'), src.indexOf('<h2 id="colours">'));
    for (const url of ["https://kinderfreundlicheorte.de", "https://spieli.eu", "https://knudli.de"])
      assert.ok(first.includes(`<a href="${url}">`), `${f} lacks ${url} in the first section`);
    assert.equal(src.split("https://knudli.de").length - 1, 1, `${f} links Knudli twice`);
  }
});

test("the iD walkthrough is folded into one <details>", () => {
  for (const f of PAGES) {
    const src = read(f);
    assert.equal(src.split("<details>").length - 1, 1, f);
    const d = src.slice(src.indexOf("<details>"), src.indexOf("</details>"));
    assert.match(d, /<summary>[^<]+\(iD\)[^<]*<\/summary>|<summary>[^<]*iD[^<]*<\/summary>/, f);
    assert.ok(d.includes("<ol>") && d.includes("</ol>"), `${f}: the steps are outside the <details>`);
    assert.equal(src.split("<ol>").length - 1, 1, `${f} has a list outside the <details>`);
  }
});

test("the grey-pin section leads with the in-app question, in the app's own words", () => {
  // The popup's labels are quoted from i18n.js, so a changed label makes this
  // page wrong until it is updated; the check fails there instead of in the field.
  for (const f of PAGES) {
    const lang = langOf(f);
    const s = STRINGS[lang];
    const src = read(f);
    const sec = src.slice(src.indexOf('<h2 id="grey-pin">'), src.indexOf('<h2 id="contribute">'));
    const first = sec.slice(sec.indexOf("<li>"), sec.indexOf("</li>"));
    const esc = (v) => v.replace(/&/g, "&amp;");
    for (const k of ["askRoom", "roomMale", "roomFemale", "roomBoth", "askMore", "roomCardOpen"])
      assert.ok(first.includes(`<em>${esc(s[k])}</em>`), `${f}: first item lacks the ${k} label "${s[k]}"`);
  }
});

test("the grey-pin section names the first-screen room buttons, in the app's order", () => {
  // roomChoices("papa") is the first screen of the popup. Each button's label
  // is quoted from i18n.js, so renaming one in the app fails here instead of
  // leaving the page describing a button that no longer exists.
  const keys = roomChoices("papa").map((c) => "room" + c[0].toUpperCase() + c.slice(1));
  assert.equal(keys.length, 6);
  for (const f of PAGES) {
    const s = STRINGS[langOf(f)];
    const src = read(f);
    const sec = src.slice(src.indexOf('<h2 id="grey-pin">'), src.indexOf('<h2 id="contribute">'));
    const esc = (v) => v.replace(/&/g, "&amp;");
    let at = -1;
    for (const k of keys) {
      const i = sec.indexOf(`<em>${esc(s[k])}</em>`, at + 1);
      assert.ok(i > at, `${f}: ${k} label "${s[k]}" is missing or out of order in the grey-pin section`);
      at = i;
    }
  }
});

// The German page is the reference for what each section says. Every other
// page must carry the same sequence of block elements in each section (the
// same paragraphs, lists with as many items, folds and tables), so a long
// pre-cut translation cannot sit next to a short German original.
const sectionsOf = (src) => {
  const body = src.slice(src.indexOf("<body>"), src.indexOf("<script>"));
  const out = {};
  for (const part of body.split(/(?=<h2 id=")/)) {
    const m = part.match(/^<h2 id="([^"]+)"/);
    if (m) out[m[1]] = part;
  }
  return out;
};
const skeletonOf = (sec) => [...sec.replace(/<h2[^>]*>[\s\S]*?<\/h2>/, "")
  .matchAll(/<(p|ul|ol|li|details|table)[\s>]/g)].map((m) => m[1]).join(" ");

test("every section has the same block skeleton as the German page", () => {
  const de = sectionsOf(read("methods.html"));
  for (const f of PAGES) {
    const sec = sectionsOf(read(f));
    for (const id of H2_IDS)
      assert.equal(skeletonOf(sec[id]), skeletonOf(de[id]), `${f}: section ${id} differs from the German skeleton`);
  }
});

test("paragraphs are opened and closed in equal numbers", () => {
  for (const f of PAGES) {
    const src = bodyOf(read(f));
    const open = (src.match(/<p[\s>]/g) || []).length;
    const close = (src.match(/<\/p>/g) || []).length;
    assert.equal(open, close, `${f}: ${open} <p> against ${close} </p>`);
  }
});
