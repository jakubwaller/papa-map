import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGES = fs.readdirSync(DIR)
  .filter((f) => /^methods(-[a-z]+)?\.html$/.test(f))
  .sort();

const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const localeOf = (src) => (src.match(/var LOCALE = "([^"]+)"/) || [])[1];
// The numbers live between <body> and the <script> that overwrites some of
// them; the script itself contains code, not prose.
const bodyOf = (src) => src.slice(src.indexOf("<body>"), src.indexOf("<script>"));

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
