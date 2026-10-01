import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listingsPush } from "./play.mjs";

// accessToken() signs a real assertion; nothing leaves the process since
// fetch is faked, the token endpoint included.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "ci@papamap.iam.gserviceaccount.example.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  token_uri: "https://oauth2.example.com/token",
});

const LISTING = {
  name: "PapaMap",
  subtitle: "Changing tables for dads",
  keywords: "changing table,dad",
  promotionalText: "Green means dad can get to it.",
  description: "PapaMap shows changing tables that dads can actually get to.",
  shortDescription: "Baby changing tables dads can reach.",
  playDescription: "PapaMap shows changing tables that dads can actually get to.",
};

const EDITS = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/de.papamap.app/edits";

function tmpListings(files) {
  const dir = mkdtempSync(join(tmpdir(), "papamap-listings-"));
  for (const [lang, listing] of Object.entries(files)) writeFileSync(join(dir, `${lang}.json`), JSON.stringify(listing));
  return dir;
}

// play.mjs's call() reads status and text(); routes match on method + full URL.
function withFetch(t, routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method ?? "GET";
    const body = opts.body && typeof opts.body === "string" && opts.headers?.["Content-Type"] === "application/json"
      ? JSON.parse(opts.body) : undefined;
    calls.push({ method, url, body });
    const route = routes.find((r) => r.method === method && r.pattern.test(url));
    if (!route) throw new Error(`no fake route for ${method} ${url}`);
    const status = route.status ?? 200;
    const text = JSON.stringify(route.body ?? {});
    // accessToken() reads json(), call() reads text(): both are served.
    return { status, ok: status < 300, text: async () => text, json: async () => JSON.parse(text) };
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

const tokenRoute = { method: "POST", pattern: /^https:\/\/oauth2\.example\.com\/token$/, body: { access_token: "tok" } };
const openRoute = { method: "POST", pattern: new RegExp(`^${EDITS}$`), body: { id: "E1" } };
const enListing = { language: "en-US", title: "PapaMap", shortDescription: LISTING.shortDescription, fullDescription: LISTING.playDescription };

test("push PUTs the changed and the missing language, skips the unchanged one and a language Play lacks, then commits", async (t) => {
  const calls = withFetch(t, [
    tokenRoute,
    openRoute,
    { method: "GET", pattern: new RegExp(`^${EDITS}/E1/listings$`),
      body: { listings: [enListing, { ...enListing, language: "de-DE", shortDescription: "alter Text", video: "https://youtu.be/x" }] } },
    { method: "PUT", pattern: new RegExp(`^${EDITS}/E1/listings/(de-DE|cs-CZ)$`), body: {} },
    { method: "POST", pattern: new RegExp(`^${EDITS}/E1:commit$`), body: { id: "E1" } },
  ]);
  const dir = tmpListings({
    en: LISTING,
    de: { ...LISTING, shortDescription: "Wickeltische, an die auch Papas rankommen." },
    cs: { ...LISTING, shortDescription: "Přebalovací pulty, ke kterým se dostanou i tátové." },
    bs: { ...LISTING, shortDescription: "Stolovi za presvlačenje do kojih tate mogu doći." },
  });
  try {
    await listingsPush({ dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const writes = calls.filter((c) => c.method !== "GET" && c.url !== "https://oauth2.example.com/token");
  assert.deepEqual(writes.map((c) => `${c.method} ${c.url.slice(EDITS.length)}`), [
    "POST ",                       // open the edit
    "PUT /E1/listings/cs-CZ",      // files go in language order: bs (skipped), cs, de, en (unchanged)
    "PUT /E1/listings/de-DE",
    "POST /E1:commit",
  ]);
  assert.deepEqual(writes[1].body, {
    language: "cs-CZ", title: "PapaMap",
    shortDescription: "Přebalovací pulty, ke kterým se dostanou i tátové.", fullDescription: LISTING.playDescription,
  });
  assert.equal(writes[2].body.video, "https://youtu.be/x", "a promo video set in the Console survives the push");
  assert.ok(!calls.some((c) => c.method === "DELETE"), "a committed edit is not deleted");
  assert.ok(!JSON.stringify(calls).includes("bs"), "Bosnian has no Play language and is never sent");
});

test("with nothing to change the edit is deleted, not committed", async (t) => {
  const calls = withFetch(t, [
    tokenRoute,
    openRoute,
    { method: "GET", pattern: new RegExp(`^${EDITS}/E1/listings$`), body: { listings: [enListing] } },
    { method: "DELETE", pattern: new RegExp(`^${EDITS}/E1$`), body: {} },
  ]);
  const dir = tmpListings({ en: LISTING });
  try {
    await listingsPush({ dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(calls.some((c) => c.method === "DELETE"));
  assert.ok(!calls.some((c) => /:commit$/.test(c.url)));
});

test("a refused PUT deletes the edit and nothing is committed", async (t) => {
  const calls = withFetch(t, [
    tokenRoute,
    openRoute,
    { method: "GET", pattern: new RegExp(`^${EDITS}/E1/listings$`), body: { listings: [] } },
    { method: "PUT", pattern: new RegExp(`^${EDITS}/E1/listings/en-US$`), status: 403,
      body: { error: { message: "The caller does not have permission" } } },
    { method: "DELETE", pattern: new RegExp(`^${EDITS}/E1$`), body: {} },
  ]);
  const dir = tmpListings({ en: LISTING });
  try {
    await assert.rejects(() => listingsPush({ dir }), /listings\/en-US: 403 .*does not have permission/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(calls.some((c) => c.method === "DELETE"));
  assert.ok(!calls.some((c) => /:commit$/.test(c.url)));
});

test("a file over a store limit fails before the first request", async (t) => {
  const calls = withFetch(t, [tokenRoute]);
  const dir = tmpListings({ en: { ...LISTING, shortDescription: "x".repeat(81) } });
  try {
    await assert.rejects(() => listingsPush({ dir }), /en\.json: "shortDescription" is 81 characters/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(calls.length, 0);
});
