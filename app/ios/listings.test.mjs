import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listingsPush, pickEditable, _resetBearerForTests } from "./asc.mjs";
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

function tmpListings(files) {
  const dir = mkdtempSync(join(tmpdir(), "papamap-listings-"));
  for (const [lang, listing] of Object.entries(files)) writeFileSync(join(dir, `${lang}.json`), JSON.stringify(listing));
  return dir;
}

// Routes are matched in order on method + path (query included); `body` is
// the canned JSON answer, or a function of the request body. Every call is
// recorded so a test can say exactly what went out.
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method ?? "GET";
    const path = u.pathname + u.search;
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ method, path, body });
    const route = routes.find((r) => r.method === method && r.pattern.test(path));
    if (!route) throw new Error(`no fake route for ${method} ${path}`);
    const res = typeof route.body === "function" ? route.body(body) : route.body;
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
    await listingsPush({ dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const writes = calls.filter((c) => c.method !== "GET");
  assert.deepEqual(writes.map((c) => `${c.method} ${c.path}`), [
    // files are read in language order: cs, de, en, et
    "POST /v1/appInfoLocalizations",
    "POST /v1/appStoreVersionLocalizations",
    "PATCH /v1/appInfoLocalizations/AI-de",
    "PATCH /v1/appStoreVersionLocalizations/VL-de",
  ]);
  const [csInfo, csVersion, deInfo, deVersion] = writes.map((c) => c.body.data);
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

test("push stops before any write when no version is being prepared", async (t) => {
  const calls = withFetch(t, [
    appRoute,
    { method: "GET", pattern: /^\/v1\/apps\/APP\/appStoreVersions/,
      body: { data: [{ id: "V11", attributes: { versionString: "1.1", appVersionState: "READY_FOR_DISTRIBUTION" } }] } },
  ]);
  const dir = tmpListings({ en: LISTING });
  try {
    await assert.rejects(() => listingsPush({ dir }), /no App Store version is being prepared/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(calls.every((c) => c.method === "GET"));
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
    await listingsPush({ dir });
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
    await assert.rejects(() => listingsPush({ dir }), /en\.json: "subtitle" is 31 characters/);
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
