import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listingsPush, pickEditable, marketingVersion, _resetBearerForTests } from "./asc.mjs";
import { ascVersionAttributes, privacyUrl } from "../listings.mjs";

// api() signs a real JWT; the key is never sent anywhere since fetch is faked.
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
process.env.ASC_ISSUER_ID = "test-issuer";
process.env.ASC_KEY_ID = "TESTKEY123";
process.env.ASC_API_KEY_P8 = privateKey.export({ type: "pkcs8", format: "pem" });

const LISTING = {
  name: "PapaMap",
  subtitle: "Changing tables for dads",
  keywords: "changing table,dad",
  promotionalText: "Green means dad can get to it.",
  description: "PapaMap shows changing tables that dads can actually get to.",
  shortDescription: "Baby changing tables dads can reach.",
  playDescription: "PapaMap shows changing tables that dads can actually get to.",
};

// A listings directory, and beside it a project.pbxproj that says 1.2 twice
// (Debug and Release, as Xcode writes it) — unless the test says otherwise.
function tmpListings(files, pbxproj = "MARKETING_VERSION = 1.2;\nMARKETING_VERSION = 1.2;\n") {
  const dir = mkdtempSync(join(tmpdir(), "papamap-listings-"));
  for (const [lang, listing] of Object.entries(files)) writeFileSync(join(dir, `${lang}.json`), JSON.stringify(listing));
  writeFileSync(join(dir, "project.pbxproj"), pbxproj);
  return dir;
}
const pushFrom = (dir) => listingsPush({ dir, pbxproj: join(dir, "project.pbxproj") });

// Routes are matched in order on method + path (query included); `body` is
// the canned JSON answer, `bodies` a sequence handed out call by call (the
// last one repeats). Every call is recorded so a test can say exactly what
// went out.
function fakeFetch(routes) {
  const calls = [];
  const queues = routes.map((r) => ({ ...r, bodies: r.bodies ? [...r.bodies] : undefined }));
  const fn = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method ?? "GET";
    const path = u.pathname + u.search;
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ method, path, body });
    const route = queues.find((r) => r.method === method && r.pattern.test(path));
    if (!route) throw new Error(`no fake route for ${method} ${path}`);
    const res = route.bodies ? (route.bodies.length > 1 ? route.bodies.shift() : route.bodies[0]) : route.body;
    return { status: 200, ok: true, json: async () => res ?? null };
  };
  return { fn, calls };
}

function withFetch(t, routes) {
  const { fn, calls } = fakeFetch(routes);
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  _resetBearerForTests();
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

const loc = (id, locale, attributes) => ({ id, attributes: { locale, ...attributes } });

const appRoute = { method: "GET", pattern: /^\/v1\/apps\?filter\[bundleId\]=de\.papamap\.app/,
                   body: { data: [{ id: "APP", attributes: { bundleId: "de.papamap.app" } }] } };

test("push PATCHes a changed locale, POSTs a missing one, leaves an unchanged one alone and skips a language Apple lacks", async (t) => {
  const en = { lang: "en", ...LISTING };
  const enVersion = { ...ascVersionAttributes(en), whatsNew: "typed in the browser" };
  const calls = withFetch(t, [
    appRoute,
    { method: "GET", pattern: /^\/v1\/apps\/APP\/appStoreVersions\?filter\[platform\]=IOS/,
      body: { data: [
        { id: "V11", attributes: { versionString: "1.1", appVersionState: "READY_FOR_DISTRIBUTION" } },
        { id: "V12", attributes: { versionString: "1.2", appVersionState: "PREPARE_FOR_SUBMISSION" } },
      ] } },
    { method: "GET", pattern: /^\/v1\/apps\/APP\/appInfos/,
      body: { data: [
        { id: "I1", attributes: { state: "READY_FOR_DISTRIBUTION" } },
        { id: "I2", attributes: { state: "PREPARE_FOR_SUBMISSION" } },
      ] } },
    { method: "GET", pattern: /^\/v1\/appInfos\/I2\/appInfoLocalizations/,
      body: { data: [
        loc("AI-en", "en-US", { name: "PapaMap", subtitle: LISTING.subtitle, privacyPolicyUrl: privacyUrl("en"), privacyChoicesUrl: null }),
        loc("AI-de", "de-DE", { name: "PapaMap", subtitle: "Wickeltische für Väter", privacyPolicyUrl: privacyUrl("de") }),
      ] } },
    { method: "GET", pattern: /^\/v1\/appStoreVersions\/V12\/appStoreVersionLocalizations/,
      body: { data: [
        loc("VL-en", "en-US", enVersion),
        loc("VL-de", "de-DE", { ...enVersion, promotionalText: "alter Text" }),
      ] } },
    { method: "PATCH", pattern: /^\/v1\/appInfoLocalizations\/AI-de$/, body: { data: { id: "AI-de" } } },
    { method: "POST", pattern: /^\/v1\/appInfoLocalizations$/, body: { data: { id: "AI-new" } } },
    { method: "PATCH", pattern: /^\/v1\/appStoreVersionLocalizations\/VL-de$/, body: { data: { id: "VL-de" } } },
    { method: "POST", pattern: /^\/v1\/appStoreVersionLocalizations$/, body: { data: { id: "VL-new" } } },
  ]);
  const dir = tmpListings({
    en: LISTING,
    de: { ...LISTING, subtitle: "Wickeltische für Papas" },
    cs: { ...LISTING, subtitle: "Přebalovací pulty pro táty" },
    et: { ...LISTING, subtitle: "Mähkimislauad isadele" },
  });
  try {
    await pushFrom(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const writes = calls.filter((c) => c.method !== "GET");
  assert.deepEqual(writes.map((c) => `${c.method} ${c.path}`), [
    // files are read in language order (cs, de, en, et); the app info is
    // written for all of them first, the version after
    "POST /v1/appInfoLocalizations",
    "PATCH /v1/appInfoLocalizations/AI-de",
    "POST /v1/appStoreVersionLocalizations",
    "PATCH /v1/appStoreVersionLocalizations/VL-de",
  ]);
  const [csInfo, deInfo, csVersion, deVersion] = writes.map((c) => c.body.data);
  assert.deepEqual(csInfo, {
    type: "appInfoLocalizations",
    attributes: { locale: "cs", name: "PapaMap", subtitle: "Přebalovací pulty pro táty", privacyPolicyUrl: privacyUrl("cs") },
    relationships: { appInfo: { data: { type: "appInfos", id: "I2" } } },
  });
  assert.equal(csVersion.attributes.locale, "cs");
  assert.deepEqual(csVersion.relationships, { appStoreVersion: { data: { type: "appStoreVersions", id: "V12" } } });
  assert.ok(!("whatsNew" in csVersion.attributes), "a file without whatsNew sends none");
  assert.deepEqual(deInfo, {
    type: "appInfoLocalizations", id: "AI-de",
    attributes: { name: "PapaMap", subtitle: "Wickeltische für Papas", privacyPolicyUrl: privacyUrl("de") },
  });
  assert.equal(deVersion.id, "VL-de");
  assert.equal(deVersion.attributes.promotionalText, LISTING.promotionalText);
  assert.ok(!("whatsNew" in deVersion.attributes), "What's New typed in the browser is left alone");
  assert.ok(!JSON.stringify(calls).includes('"et"'), "Estonian has no App Store locale and is never sent");
  // The live version and the live app info are never touched.
  assert.ok(!calls.some((c) => /V11|I1\b/.test(c.path)));
});

test("the version's locales are listed only after the app info has them: the store adds a new locale to the version by itself", async (t) => {
  const enVersion = ascVersionAttributes({ lang: "en", ...LISTING });
  const blank = Object.fromEntries(Object.keys(enVersion).map((k) => [k, null]));
  const calls = withFetch(t, [
    appRoute,
    { method: "GET", pattern: /^\/v1\/apps\/APP\/appStoreVersions/,
      body: { data: [{ id: "V12", attributes: { versionString: "1.2", appVersionState: "PREPARE_FOR_SUBMISSION" } }] } },
    { method: "GET", pattern: /^\/v1\/apps\/APP\/appInfos/,
      body: { data: [{ id: "I2", attributes: { state: "PREPARE_FOR_SUBMISSION" } }] } },
    { method: "GET", pattern: /^\/v1\/appInfos\/I2\/appInfoLocalizations/,
      body: { data: [loc("AI-en", "en-US", { name: "PapaMap", subtitle: LISTING.subtitle, privacyPolicyUrl: privacyUrl("en") })] } },
    // what the store answers once the app info has cs: the version's record exists, empty
    { method: "GET", pattern: /^\/v1\/appStoreVersions\/V12\/appStoreVersionLocalizations/,
      body: { data: [loc("VL-en", "en-US", enVersion), loc("VL-cs", "cs", blank)] } },
    { method: "POST", pattern: /^\/v1\/appInfoLocalizations$/, body: { data: { id: "AI-cs" } } },
    { method: "PATCH", pattern: /^\/v1\/appStoreVersionLocalizations\/VL-cs$/, body: { data: { id: "VL-cs" } } },
  ]);
  const dir = tmpListings({ en: LISTING, cs: { ...LISTING, subtitle: "Přebalovací pulty pro táty" } });
  try {
    await pushFrom(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const order = calls.map((c) => `${c.method} ${c.path.replace(/\?.*/, "")}`);
  assert.ok(order.indexOf("GET /v1/appStoreVersions/V12/appStoreVersionLocalizations") > order.indexOf("POST /v1/appInfoLocalizations"),
            "the version's records are listed after the last app info write, never before");
  assert.deepEqual(calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`), [
    "POST /v1/appInfoLocalizations",
    "PATCH /v1/appStoreVersionLocalizations/VL-cs",
  ]);
  const patch = calls.at(-1).body.data;
  assert.equal(patch.id, "VL-cs");
  assert.equal(patch.attributes.description, LISTING.description);
});

test("with no version in preparation, push creates the project's MARKETING_VERSION first and fills that", async (t) => {
  const live = { id: "V11", attributes: { versionString: "1.1", appVersionState: "READY_FOR_DISTRIBUTION" } };
  const prep = { id: "V12", attributes: { versionString: "1.2", appVersionState: "PREPARE_FOR_SUBMISSION" } };
  const calls = withFetch(t, [
    appRoute,
    { method: "GET", pattern: /^\/v1\/apps\/APP\/appStoreVersions/, bodies: [{ data: [live] }, { data: [live, prep] }] },
    { method: "POST", pattern: /^\/v1\/appStoreVersions$/, body: { data: { id: "V12" } } },
    { method: "GET", pattern: /^\/v1\/apps\/APP\/appInfos/,
      body: { data: [{ id: "I1", attributes: { state: "READY_FOR_DISTRIBUTION" } }, { id: "I2", attributes: { state: "PREPARE_FOR_SUBMISSION" } }] } },
    { method: "GET", pattern: /^\/v1\/appInfos\/I2\/appInfoLocalizations/, body: { data: [] } },
    { method: "GET", pattern: /^\/v1\/appStoreVersions\/V12\/appStoreVersionLocalizations/, body: { data: [] } },
    { method: "POST", pattern: /^\/v1\/appInfoLocalizations$/, body: { data: { id: "AI-new" } } },
    { method: "POST", pattern: /^\/v1\/appStoreVersionLocalizations$/, body: { data: { id: "VL-new" } } },
  ]);
  const dir = tmpListings({ en: LISTING });
  try {
    await pushFrom(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const writes = calls.filter((c) => c.method !== "GET");
  assert.deepEqual(writes.map((c) => `${c.method} ${c.path}`), [
    "POST /v1/appStoreVersions",
    "POST /v1/appInfoLocalizations",
    "POST /v1/appStoreVersionLocalizations",
  ]);
  assert.deepEqual(writes[0].body.data, {
    type: "appStoreVersions",
    attributes: { versionString: "1.2", platform: "IOS" },
    relationships: { app: { data: { type: "apps", id: "APP" } } },
  });
  assert.equal(writes[2].body.data.relationships.appStoreVersion.data.id, "V12");
});

test("push refuses to create a version whose string already exists, and writes nothing", async (t) => {
  const calls = withFetch(t, [
    appRoute,
    { method: "GET", pattern: /^\/v1\/apps\/APP\/appStoreVersions/,
      body: { data: [{ id: "V12", attributes: { versionString: "1.2", appVersionState: "READY_FOR_DISTRIBUTION" } }] } },
  ]);
  const dir = tmpListings({ en: LISTING });
  try {
    await assert.rejects(() => pushFrom(dir), /1\.2 already exists \(READY_FOR_DISTRIBUTION\) — bump MARKETING_VERSION/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(calls.every((c) => c.method === "GET"));
});

test("push refuses a version in preparation that is not the project's MARKETING_VERSION, and writes nothing", async (t) => {
  const calls = withFetch(t, [
    appRoute,
    { method: "GET", pattern: /^\/v1\/apps\/APP\/appStoreVersions/,
      body: { data: [{ id: "V12", attributes: { versionString: "1.2", appVersionState: "METADATA_REJECTED" } }] } },
  ]);
  const dir = tmpListings({ en: LISTING }, "MARKETING_VERSION = 1.2.1;\nMARKETING_VERSION = 1.2.1;\n");
  try {
    await assert.rejects(() => pushFrom(dir), /version 1\.2 is being prepared \(METADATA_REJECTED\), but MARKETING_VERSION is 1\.2\.1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(calls.every((c) => c.method === "GET"));
});

test("marketingVersion reads the one value Xcode repeats per configuration and refuses two", () => {
  const dir = tmpListings({}, "\t\t\t\tMARKETING_VERSION = 1.2;\n\t\t\t\tMARKETING_VERSION = 1.2;\n");
  try {
    assert.equal(marketingVersion(join(dir, "project.pbxproj")), "1.2");
    writeFileSync(join(dir, "project.pbxproj"), "MARKETING_VERSION = 1.2;\nMARKETING_VERSION = 1.3;\n");
    assert.throws(() => marketingVersion(join(dir, "project.pbxproj")), /MARKETING_VERSION is 1\.2 and 1\.3/);
    writeFileSync(join(dir, "project.pbxproj"), "nothing here\n");
    assert.throws(() => marketingVersion(join(dir, "project.pbxproj")), /MARKETING_VERSION is missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("without an app info in preparation only the version's texts are pushed", async (t) => {
  const calls = withFetch(t, [
    appRoute,
    { method: "GET", pattern: /^\/v1\/apps\/APP\/appStoreVersions/,
      body: { data: [{ id: "V12", attributes: { versionString: "1.2", appVersionState: "PREPARE_FOR_SUBMISSION" } }] } },
    { method: "GET", pattern: /^\/v1\/apps\/APP\/appInfos/,
      body: { data: [{ id: "I1", attributes: { state: "READY_FOR_DISTRIBUTION" } }] } },
    { method: "GET", pattern: /^\/v1\/appStoreVersions\/V12\/appStoreVersionLocalizations/, body: { data: [] } },
    { method: "POST", pattern: /^\/v1\/appStoreVersionLocalizations$/, body: { data: { id: "VL-new" } } },
  ]);
  const dir = tmpListings({ en: LISTING });
  try {
    await pushFrom(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`),
                   ["POST /v1/appStoreVersionLocalizations"]);
});

test("a file over a store limit fails before the first request", async (t) => {
  const calls = withFetch(t, [appRoute]);
  const dir = tmpListings({ en: { ...LISTING, subtitle: "x".repeat(31) } });
  try {
    await assert.rejects(() => pushFrom(dir), /en\.json: "subtitle" is 31 characters/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(calls.length, 0);
});

test("pickEditable: one record in preparation, none, or an ambiguous pair", () => {
  const state = (r) => r.attributes.state;
  const live = { id: "a", attributes: { state: "READY_FOR_DISTRIBUTION" } };
  const prep = { id: "b", attributes: { state: "PREPARE_FOR_SUBMISSION" } };
  const rejected = { id: "c", attributes: { state: "METADATA_REJECTED" } };
  assert.equal(pickEditable([live, prep], state), prep);
  assert.equal(pickEditable([live, rejected], state), rejected);
  assert.equal(pickEditable([live], state), null);
  assert.throws(() => pickEditable([prep, rejected], state), /2 records are being prepared at once: b, c/);
});
