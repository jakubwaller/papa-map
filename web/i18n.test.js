import { test } from "node:test";
import assert from "node:assert/strict";
import { STRINGS, LANGS, pickLang, fmt, DEFAULT_LANG } from "./i18n.js";

const tokens = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("both languages define exactly the same keys", () => {
  assert.deepEqual(Object.keys(STRINGS.de).sort(), Object.keys(STRINGS.en).sort());
  assert.deepEqual(Object.keys(STRINGS).sort(), [...LANGS].sort());
});

test("every template carries the same tokens in both languages", () => {
  for (const key of Object.keys(STRINGS.de)) {
    assert.deepEqual(tokens(STRINGS.de[key]), tokens(STRINGS.en[key]),
      `token mismatch in ${key}`);
  }
});

test("pickLang: query beats stored beats default, junk falls through", () => {
  assert.equal(pickLang("en", null), "en");
  assert.equal(pickLang("de", "en"), "de");
  assert.equal(pickLang(null, "en"), "en");
  assert.equal(pickLang(null, null), DEFAULT_LANG);
  assert.equal(pickLang("xx", "yy"), DEFAULT_LANG);
});

test("fmt interpolates and leaves unknown tokens visible", () => {
  assert.equal(fmt("{a} von {b}", { a: 1, b: 2 }), "1 von 2");
  assert.equal(fmt("{a} und {missing}", { a: "x" }), "x und {missing}");
});

test("the language button always names the other language", () => {
  assert.equal(STRINGS.de.langButton, "EN");
  assert.equal(STRINGS.en.langButton, "DE");
});
