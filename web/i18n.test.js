import { test } from "node:test";
import assert from "node:assert/strict";
import { STRINGS, LANGS, NUMBER_LOCALE, pickLang, nextLang, fmt,
         langUrl, DEFAULT_LANG } from "./i18n.js";

const tokens = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every language defines exactly the same keys", () => {
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(STRINGS[lang]).sort(),
      Object.keys(STRINGS[DEFAULT_LANG]).sort(), `key mismatch in ${lang}`);
  }
  assert.deepEqual(Object.keys(STRINGS).sort(), [...LANGS].sort());
});

test("every template carries the same tokens in every language", () => {
  for (const key of Object.keys(STRINGS[DEFAULT_LANG])) {
    for (const lang of LANGS) {
      assert.deepEqual(tokens(STRINGS[lang][key]), tokens(STRINGS[DEFAULT_LANG][key]),
        `token mismatch in ${lang}.${key}`);
    }
  }
});

test("every language has its own methods page and number locale", () => {
  const hrefs = LANGS.map((l) => STRINGS[l].methodsHref);
  assert.equal(new Set(hrefs).size, LANGS.length, "methods pages must not be shared");
  for (const lang of LANGS) assert.ok(NUMBER_LOCALE[lang], `no number locale for ${lang}`);
});

test("every language counts the swept countries with a live {n}", () => {
  for (const lang of LANGS) {
    for (const key of ["areaCountries", "areaCountriesIn"]) {
      const s = STRINGS[lang][key];
      assert.ok(s, `${lang}.${key} is missing`);
      // A hard-coded number would go stale the moment a country is added; the
      // count has to come from area_key's countries_<n>.
      assert.deepEqual(tokens(s), ["n"], `${lang}.${key} must carry only {n}`);
      assert.equal(fmt(s, { n: 9 }).includes("9"), true, `${lang}.${key}`);
    }
  }
});

test("the counted area label declines in German and only in German", () => {
  // The wordmark says "9 Länder", the statsLocal sentence "… in 9 Ländern".
  assert.notEqual(STRINGS.de.areaCountries, STRINGS.de.areaCountriesIn);
  // English and Danish are identical in both slots on purpose — this pins that
  // down so the duplication does not look like a copy-paste slip worth "fixing".
  assert.equal(STRINGS.en.areaCountries, STRINGS.en.areaCountriesIn);
  assert.equal(STRINGS.da.areaCountries, STRINGS.da.areaCountriesIn);
});

test("pickLang: query beats stored beats browser beats default", () => {
  assert.equal(pickLang("en", null), "en");
  assert.equal(pickLang("de", "en"), "de");
  assert.equal(pickLang(null, "en"), "en");
  assert.equal(pickLang("da", "en"), "da");
  assert.equal(pickLang(null, null), DEFAULT_LANG);
  assert.equal(pickLang("xx", "yy"), DEFAULT_LANG);
});

test("pickLang: only Danish browsers are auto-detected", () => {
  assert.equal(pickLang(null, null, "da-DK"), "da");
  assert.equal(pickLang(null, null, "DA"), "da");
  // A stored or shared choice still wins over the browser.
  assert.equal(pickLang(null, "de", "da-DK"), "de");
  assert.equal(pickLang("en", null, "da-DK"), "en");
  // Everything else keeps the German default — an English-locale browser in
  // Germany must not silently flip the site's language.
  assert.equal(pickLang(null, null, "en-GB"), DEFAULT_LANG);
  assert.equal(pickLang(null, null, undefined), DEFAULT_LANG);
});

test("langUrl gives each language a distinct address, German the bare one", () => {
  assert.equal(langUrl(DEFAULT_LANG), "https://papamap.de/");
  assert.equal(langUrl("en"), "https://papamap.de/?lang=en");
  assert.equal(langUrl("da"), "https://papamap.de/?lang=da");
  // Distinct URLs are the whole point — a collision would make the hreflang
  // alternates in index.html point two languages at one page.
  assert.equal(new Set(LANGS.map((l) => langUrl(l))).size, LANGS.length);
});

test("langUrl round-trips through pickLang", () => {
  for (const lang of LANGS) {
    const query = new URL(langUrl(lang)).searchParams.get("lang");
    assert.equal(pickLang(query, null), lang, `${lang} must survive its own URL`);
  }
});

test("fmt interpolates and leaves unknown tokens visible", () => {
  assert.equal(fmt("{a} von {b}", { a: 1, b: 2 }), "1 von 2");
  assert.equal(fmt("{a} und {missing}", { a: "x" }), "x und {missing}");
});

test("nextLang cycles through every language and back", () => {
  assert.deepEqual(LANGS.map(nextLang), ["en", "da", "de"]);
  assert.equal(nextLang("nonsense"), DEFAULT_LANG);
});

test("the language button always names the language it lands on", () => {
  for (const lang of LANGS) {
    assert.equal(STRINGS[lang].langButton, nextLang(lang).toUpperCase(),
      `${lang}'s button must name ${nextLang(lang)}`);
  }
});
