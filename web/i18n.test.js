import { test } from "node:test";
import assert from "node:assert/strict";
import { STRINGS, LANGS, NUMBER_LOCALE, pickLang, fmt,
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
      assert.equal(fmt(s, { n: 11 }).includes("11"), true, `${lang}.${key}`);
    }
  }
});

test("the counted area label declines where the language declines", () => {
  // The wordmark says "11 Länder", the statsLocal sentence "… in 11 Ländern".
  assert.notEqual(STRINGS.de.areaCountries, STRINGS.de.areaCountriesIn);
  // English and Danish are identical in both slots on purpose — this pins that
  // down so the duplication does not look like a copy-paste slip worth "fixing".
  // The languages added in 2026-08 are deliberately NOT pinned either way:
  // Czech and Polish inflect after their preposition, Dutch and French do not,
  // and that is the translator's call, not this file's.
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

test("pickLang: every language is auto-detected, not only Danish", () => {
  for (const lang of LANGS) {
    assert.equal(pickLang(null, null, lang), lang, `${lang} must be detected`);
  }
  assert.equal(pickLang(null, null, "DA"), "da", "case-insensitive");
  // Region subtags are ignored — the tag still names the language.
  assert.equal(pickLang(null, null, "en-GB"), "en");
  assert.equal(pickLang(null, null, "de-AT"), "de");
  assert.equal(pickLang(null, null, "fr-CH"), "fr");
  // Brazilian Portuguese lands on the Portuguese UI — the tag names the
  // language, and pt joined with the Europe-complete ring.
  assert.equal(pickLang(null, null, "pt-BR"), "pt");
  assert.equal(pickLang(null, null, undefined), DEFAULT_LANG);
});

test("pickLang: Norwegian browser tags reach the Norwegian UI", () => {
  // Browsers report Bokmål/Nynorsk as nb/nn, never the macrolanguage code the
  // site uses. Without the alias, no Norwegian visitor would be detected.
  assert.equal(pickLang(null, null, "nb"), "no");
  assert.equal(pickLang(null, null, "nb-NO"), "no");
  assert.equal(pickLang(null, null, "nn-NO"), "no");
  assert.equal(pickLang(null, null, ["nn", "da"]), "no");
});

test("pickLang: reads the whole preference list, skipping what we don't speak", () => {
  // navigator.languages is ordered by preference. An unsupported first entry
  // must fall through to the next, not end the search at the German default.
  assert.equal(pickLang(null, null, ["ga", "cs-CZ", "en"]), "cs");
  assert.equal(pickLang(null, null, ["ko", "zh"]), DEFAULT_LANG);
  assert.equal(pickLang(null, null, []), DEFAULT_LANG);
  assert.equal(pickLang(null, null, ["sv"]), "sv");
});

test("pickLang: a stored or shared choice still beats the browser", () => {
  assert.equal(pickLang(null, "de", ["da-DK"]), "de");
  assert.equal(pickLang("en", null, ["da-DK"]), "en");
  assert.equal(pickLang("pl", "de", ["sv"]), "pl");
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

test("every language names itself, distinctly, for the picker", () => {
  // The picker is the only way to change language, so a reader who cannot read
  // the current UI has to find their own row in it. Endonyms, never
  // translated: a Czech looking for "Čeština" will not recognise "Tschechisch".
  const names = LANGS.map((l) => STRINGS[l].langName);
  for (const [i, lang] of LANGS.entries()) {
    assert.ok(names[i] && names[i].trim(), `${lang} has no langName`);
  }
  assert.equal(new Set(names).size, LANGS.length, "langNames must be distinct");
  assert.equal(STRINGS.de.langName, "Deutsch");
  assert.equal(STRINGS.en.langName, "English");
});

test("every language advertises its own generated leaderboard page", () => {
  // pipeline/leaderboard.py renders one page per language: de and en keep
  // their pre-2026-08-22 filenames (inbound links survive), everyone else is
  // leaderboard-<code>.html. A boardHref that disagrees with that naming is a
  // 404 in the header of every page in that language.
  const built = (l) => l === "de" ? "wickeltische/rangliste.html"
    : l === "en" ? "wickeltische/leaderboard.html"
    : `wickeltische/leaderboard-${l}.html`;
  for (const lang of LANGS) {
    assert.equal(STRINGS[lang].boardHref, built(lang),
      `${lang}.boardHref must be its own generated page`);
  }
});
