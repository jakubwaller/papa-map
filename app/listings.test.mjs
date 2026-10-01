import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LANGS } from "../web/i18n.js";
import {
  ASC_LOCALES,
  PLAY_LOCALES,
  LIMITS,
  listingsDir,
  validate,
  readListings,
  ascAppInfoAttributes,
  ascVersionAttributes,
  playListingBody,
  same,
  privacyUrl,
} from "./listings.mjs";

// The stores' own locale tables, as fastlane carries them (2026-10-01):
// fastlane_core/lib/fastlane_core/languages.rb and supply/lib/supply/languages.rb.
// A locale that is not in here would be refused by the store with a 409 at
// push time; this catches it at test time.
const ASC_KNOWN = ("ar-SA bn-BD ca cs da de-DE el en-AU en-CA en-GB en-US es-ES es-MX fi fr-CA fr-FR gu-IN " +
  "he hi hr hu id it ja kn-IN ko ml-IN mr-IN ms nl-NL no or-IN pa-IN pl pt-BR pt-PT ro ru sk sl-SI sv ta-IN " +
  "te-IN th tr uk ur-PK vi zh-Hans zh-Hant").split(" ");
const PLAY_KNOWN = ("af am ar az-AZ be bg bn-BD ca cs-CZ da-DK de-DE el-GR en-AU en-CA en-GB en-IN en-SG " +
  "en-US en-ZA es-419 es-ES es-US et eu-ES fa fi-FI fil fr-CA fr-FR gl-ES hi-IN hr hu-HU hy-AM id is-IS it-IT " +
  "iw-IL ja-JP ka-GE km-KH kn-IN ko-KR ky-KG lo-LA lt lv mk-MK ml-IN mn-MN mr-IN ms ms-MY my-MM ne-NP nl-NL " +
  "no-NO pl-PL pt-BR pt-PT rm ro ru-RU si-LK sk sl sr sv-SE sw ta-IN te-IN th tr-TR uk vi zh-CN zh-HK zh-TW zu")
  .split(" ");

const GOOD = {
  name: "PapaMap",
  subtitle: "Changing tables for dads",
  keywords: "changing table,dad",
  promotionalText: "Green means dad can get to it.",
  description: "PapaMap shows changing tables that dads can actually get to.",
  shortDescription: "Baby changing tables dads can reach.",
  playDescription: "PapaMap shows changing tables that dads can actually get to.",
};

test("every map language is on at least one store, and none is mapped to a locale the store lacks", () => {
  for (const [lang, locale] of Object.entries(ASC_LOCALES)) {
    assert.ok(LANGS.includes(lang), `ASC: ${lang} is not a map language`);
    assert.ok(ASC_KNOWN.includes(locale), `ASC: ${locale} is not an App Store Connect locale`);
  }
  for (const [lang, locale] of Object.entries(PLAY_LOCALES)) {
    assert.ok(LANGS.includes(lang), `Play: ${lang} is not a map language`);
    assert.ok(PLAY_KNOWN.includes(locale), `Play: ${locale} is not a Play Console locale`);
  }
  // The two gaps are known and deliberate, not a forgotten line.
  const noAsc = LANGS.filter((l) => !(l in ASC_LOCALES)).sort();
  const noPlay = LANGS.filter((l) => !(l in PLAY_LOCALES)).sort();
  assert.deepEqual(noAsc, ["be", "bg", "bs", "et", "is", "lt", "lv", "mk", "sq", "sr"]);
  assert.deepEqual(noPlay, ["bs", "sq"]);
  assert.equal(Object.keys(ASC_LOCALES).length, 22);
  assert.equal(Object.keys(PLAY_LOCALES).length, 30);
});

test("the two stores' existing locales keep their codes", () => {
  assert.equal(ASC_LOCALES.de, "de-DE");
  assert.equal(ASC_LOCALES.en, "en-US");
  assert.equal(PLAY_LOCALES.de, "de-DE");
  assert.equal(PLAY_LOCALES.en, "en-US");
});

test("validate accepts a complete listing and whatsNew may be left out", () => {
  assert.deepEqual(validate({ ...GOOD }), GOOD);
  assert.ok(validate({ ...GOOD, whatsNew: "New in 1.2: …" }));
});

test("validate refuses a missing field, an unknown one, an over-limit one and stray whitespace", () => {
  const { subtitle, ...missing } = GOOD;
  assert.throws(() => validate(missing, "xx.json"), /xx\.json: missing "subtitle"/);
  assert.throws(() => validate({ ...GOOD, promotionaltext: "x" }, "xx.json"), /unknown field "promotionaltext"/);
  assert.throws(() => validate({ ...GOOD, subtitle: "x".repeat(LIMITS.subtitle + 1) }, "xx.json"),
                /"subtitle" is 31 characters, over the 30 limit/);
  assert.throws(() => validate({ ...GOOD, keywords: "a,b\n" }, "xx.json"), /"keywords" starts or ends with whitespace/);
  assert.throws(() => validate({ ...GOOD, name: "" }, "xx.json"), /"name" must be a non-empty string/);
  assert.throws(() => validate({ ...GOOD, name: 7 }, "xx.json"), /"name" must be a non-empty string/);
});

test("readListings reads <lang>.json files, sorted, validated, and only for map languages", () => {
  const dir = mkdtempSync(join(tmpdir(), "papamap-listings-"));
  try {
    writeFileSync(join(dir, "en.json"), JSON.stringify(GOOD));
    writeFileSync(join(dir, "de.json"), JSON.stringify({ ...GOOD, subtitle: "Wickeltische für Papas" }));
    writeFileSync(join(dir, "README.md"), "not a listing");
    const got = readListings(dir, LANGS);
    assert.deepEqual(got.map((l) => l.lang), ["de", "en"]);
    assert.equal(got[0].file, "de.json");
    assert.equal(got[0].subtitle, "Wickeltische für Papas");
    writeFileSync(join(dir, "xx.json"), JSON.stringify(GOOD));
    assert.throws(() => readListings(dir, LANGS), /xx\.json: "xx" is not one of the map's languages/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the repository's own listings all validate and are map languages", () => {
  const got = readListings(listingsDir, LANGS);
  assert.ok(got.length >= 2, "at least the German and English listings exist");
  assert.ok(got.some((l) => l.lang === "de") && got.some((l) => l.lang === "en"));
});

test("the record bodies carry exactly the store's fields", () => {
  const l = { lang: "de", ...GOOD };
  assert.deepEqual(ascAppInfoAttributes(l),
                   { name: "PapaMap", subtitle: GOOD.subtitle, privacyPolicyUrl: "https://papamap.de/datenschutz.html" });
  assert.equal(privacyUrl("cs"), "https://papamap.de/datenschutz-en.html");
  const v = ascVersionAttributes(l);
  assert.deepEqual(Object.keys(v).sort(), ["description", "keywords", "marketingUrl", "promotionalText", "supportUrl"]);
  assert.equal(ascVersionAttributes({ ...l, whatsNew: "x" }).whatsNew, "x");
  assert.deepEqual(playListingBody(l), {
    language: "de-DE", title: "PapaMap", shortDescription: GOOD.shortDescription, fullDescription: GOOD.playDescription,
  });
  assert.equal(playListingBody(l, { video: "https://youtu.be/x" }).video, "https://youtu.be/x");
});

test("same() ignores fields the store added and treats a missing one as empty", () => {
  assert.ok(same({ name: "PapaMap", subtitle: "x", privacyChoicesUrl: null }, { name: "PapaMap", subtitle: "x" }));
  assert.ok(!same({ name: "PapaMap", subtitle: "y" }, { name: "PapaMap", subtitle: "x" }));
  assert.ok(!same(null, { name: "PapaMap" }));
  assert.ok(same({ name: "PapaMap", whatsNew: null }, { name: "PapaMap" }));
});
