// The store listings — name, subtitle, keywords, the descriptions — in every
// language the map speaks, as far as the two stores take them. One file per
// site language in listings/<lang>.json (the language codes of web/i18n.js);
// the two maps below say which store locale each one is sent as. A language a
// store does not offer (Apple has no Estonian listing, Google no Bosnian) is
// skipped there and said so, not guessed at.
//
//   node ios/asc.mjs listings pull        print what App Store Connect holds
//   node ios/asc.mjs listings push        listings/*.json → the editable version
//   node android/play.mjs listings pull   print what the Play Console holds
//   node android/play.mjs listings push   listings/*.json → one committed edit
//
// Both pushes are the `listings-push` task of .github/workflows/app-build.yml,
// both pulls `listings-pull`. The limits are the stores' own and every file is
// checked against them before a single request goes out.
//
// Locale tables consulted (2026-10-01): Apple's, as fastlane keeps it in
// fastlane_core/lib/fastlane_core/languages.rb (ar-SA … zh-Hant, sl-SI among
// the 2025 additions, no et/is/lv/lt/be/bg/mk/sr/bs/sq); Google's in
// supply/lib/supply/languages.rb (no bs, no sq).
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS } from "../web/i18n.js";

export { LANGS };

export const ASC_LOCALES = {
  de: "de-DE", en: "en-US", da: "da", nl: "nl-NL", fr: "fr-FR", it: "it", cs: "cs", pl: "pl",
  sv: "sv", ca: "ca", es: "es-ES", hr: "hr", hu: "hu", no: "no", pt: "pt-PT", ro: "ro", sk: "sk",
  sl: "sl-SI", fi: "fi", el: "el", uk: "uk", ja: "ja",
};

export const PLAY_LOCALES = {
  de: "de-DE", en: "en-US", da: "da-DK", nl: "nl-NL", fr: "fr-FR", it: "it-IT", cs: "cs-CZ",
  pl: "pl-PL", sv: "sv-SE", ca: "ca", et: "et", es: "es-ES", hr: "hr", is: "is-IS", lv: "lv",
  lt: "lt", hu: "hu-HU", no: "no-NO", pt: "pt-PT", ro: "ro", sk: "sk", sl: "sl", fi: "fi-FI",
  el: "el-GR", be: "be", bg: "bg", mk: "mk-MK", sr: "sr", uk: "uk", ja: "ja-JP",
};

// Apple's and Google's own ceilings, in characters. `keywords` is the whole
// comma-separated string. `whatsNew` is the one optional field: it belongs to
// a version, not to the app, so a file may leave it out and the store keeps
// what it has.
export const LIMITS = {
  name: 30,
  subtitle: 30,
  keywords: 100,
  promotionalText: 170,
  description: 4000,
  whatsNew: 4000,
  shortDescription: 80,
  playDescription: 4000,
};
export const OPTIONAL = new Set(["whatsNew"]);

// The same three links on every localization. Only two privacy pages exist.
export const SUPPORT_URL = "https://papamap.de/impressum.html";
export const MARKETING_URL = "https://papamap.de";
export const privacyUrl = (lang) =>
  lang === "de" ? "https://papamap.de/datenschutz.html" : "https://papamap.de/datenschutz-en.html";

export const listingsDir = join(dirname(fileURLToPath(import.meta.url)), "listings");

// Every field present, nothing unknown, nothing over its limit, nothing with
// stray whitespace at either end (a newline that slipped into a JSON string
// is the usual way a listing goes wrong). Returns the listing for chaining.
export function validate(listing, file = "listing") {
  for (const key of Object.keys(listing)) {
    if (!(key in LIMITS)) throw new Error(`${file}: unknown field "${key}"`);
  }
  for (const [key, limit] of Object.entries(LIMITS)) {
    const text = listing[key];
    if (text === undefined) {
      if (OPTIONAL.has(key)) continue;
      throw new Error(`${file}: missing "${key}"`);
    }
    if (typeof text !== "string" || !text.trim()) throw new Error(`${file}: "${key}" must be a non-empty string`);
    if (text !== text.trim()) throw new Error(`${file}: "${key}" starts or ends with whitespace`);
    if (text.length > limit) throw new Error(`${file}: "${key}" is ${text.length} characters, over the ${limit} limit`);
  }
  return listing;
}

// listings/<lang>.json → [{ lang, file, ...fields }], sorted by language, every
// one validated. `langs` is the language allowlist (web/i18n.js's LANGS);
// a file named for a language the map does not speak is a typo, not a listing.
export function readListings(dir = listingsDir, langs = LANGS) {
  return readdirSync(dir)
    .map((name) => /^([a-z]{2})\.json$/.exec(name))
    .filter(Boolean)
    .map(([file, lang]) => {
      if (langs && !langs.includes(lang)) throw new Error(`${file}: "${lang}" is not one of the map's languages`);
      const listing = validate(JSON.parse(readFileSync(join(dir, file), "utf8")), file);
      return { lang, file, ...listing };
    })
    .sort((a, b) => a.lang.localeCompare(b.lang));
}

// The attributes one store record carries, and only those: the comparison
// that decides "unchanged" is over exactly what would be sent.
export function ascAppInfoAttributes(l) {
  return { name: l.name, subtitle: l.subtitle, privacyPolicyUrl: privacyUrl(l.lang) };
}

export function ascVersionAttributes(l) {
  const attrs = {
    description: l.description,
    keywords: l.keywords,
    promotionalText: l.promotionalText,
    supportUrl: SUPPORT_URL,
    marketingUrl: MARKETING_URL,
  };
  if (l.whatsNew !== undefined) attrs.whatsNew = l.whatsNew;
  return attrs;
}

export function playListingBody(l, existing = null) {
  const body = {
    language: PLAY_LOCALES[l.lang],
    title: l.name,
    shortDescription: l.shortDescription,
    fullDescription: l.playDescription,
  };
  // PUT replaces the whole listing; a promo video set in the Console would
  // otherwise vanish with the first push.
  if (existing?.video) body.video = existing.video;
  return body;
}

// True when every key `want` carries reads the same in `have` — extra keys in
// `have` (a privacyChoicesUrl Apple added, say) do not count as a change.
export function same(have, want) {
  return Object.entries(want).every(([k, v]) => (have?.[k] ?? "") === v);
}
