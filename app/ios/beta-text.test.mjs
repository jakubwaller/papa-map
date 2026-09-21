import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WHATS_NEW_LIMIT,
  whatsNewFiles,
  pollBuild,
  betaTextPush,
  betaTextDistribute,
} from "./asc.mjs";

// api() signs a real JWT the first time it runs, so credentials() needs to
// find something crypto can parse — the value itself is never sent anywhere
// in these tests, since fetch is replaced below.
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
process.env.ASC_ISSUER_ID = "test-issuer";
process.env.ASC_KEY_ID = "TESTKEY123";
process.env.ASC_API_KEY_P8 = privateKey.export({ type: "pkcs8", format: "pem" });

function tmpTestflightDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "papamap-testflight-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

// A minimal fake `fetch`: routes are checked in order, each match pops (or
// repeats, if there is only one) a canned response. Every call is recorded,
// with its parsed JSON body, so a test can assert exactly what was sent —
// or that nothing was.
function fakeFetch(routes) {
  const calls = [];
  const queues = routes.map((r) => ({ ...r, responses: [...r.responses] }));
  const fn = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method ?? "GET";
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ method, path: u.pathname + u.search, body });
    const route = queues.find((r) => r.method === method && r.pattern.test(u.pathname + u.search));
    if (!route) throw new Error(`no fake route for ${method} ${u.pathname}${u.search}`);
    const res = route.responses.length > 1 ? route.responses.shift() : route.responses[0];
    return { status: res.status ?? 200, ok: (res.status ?? 200) < 300, json: async () => res.body ?? null };
  };
  return { fn, calls };
}

function withFetch(t, routes) {
  const { fn, calls } = fakeFetch(routes);
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

const build = (version, processingState, id = "build-1") => ({
  status: 200,
  body: { data: [{ type: "builds", id, attributes: { version, processingState } }] },
});

test("whatsNewFiles: locale comes from the filename, sorted, trimmed, non-matching names ignored", () => {
  const dir = tmpTestflightDir({
    "what-to-test.en-US.txt": "  hello  \n",
    "what-to-test.de-DE.txt": "hallo\n",
    "what-to-test.cs.txt": "ahoj\n",
    "readme.txt": "not a locale file",
  });
  const files = whatsNewFiles(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(files.map((f) => f.locale), ["cs", "de-DE", "en-US"]);
  assert.deepEqual(files.map((f) => f.text), ["ahoj", "hallo", "hello"]);
});

test("beta-text push: refuses a file over the whatsNew limit before any request", async (t) => {
  const dir = tmpTestflightDir({
    "what-to-test.de-DE.txt": "fine",
    "what-to-test.en-US.txt": "x".repeat(WHATS_NEW_LIMIT + 1),
  });
  const calls = withFetch(t, []);
  await assert.rejects(
    () => betaTextPush("100", { dir }),
    /what-to-test\.en-US\.txt.*4001 characters.*4000-character/s,
  );
  rmSync(dir, { recursive: true, force: true });
  assert.equal(calls.length, 0, "no network call before the length check");
});

test("beta-text push: an existing locale is PATCHed, a missing one POSTed", async (t) => {
  const dir = tmpTestflightDir({
    "what-to-test.de-DE.txt": "Testen: alles.",
    "what-to-test.en-US.txt": "Test: everything.",
  });
  const calls = withFetch(t, [
    { method: "GET", pattern: /^\/v1\/apps\?/, responses: [{ body: { data: [{ id: "app-1" }] } }] },
    { method: "GET", pattern: /^\/v1\/builds\?/, responses: [build("100", "VALID")] },
    {
      method: "GET",
      pattern: /^\/v1\/betaBuildLocalizations\?/,
      responses: [{
        body: {
          data: [{ type: "betaBuildLocalizations", id: "loc-de", attributes: { locale: "de-DE", whatsNew: "old" } }],
        },
      }],
    },
    { method: "PATCH", pattern: /^\/v1\/betaBuildLocalizations\/loc-de$/, responses: [{ status: 200, body: null }] },
    {
      method: "POST",
      pattern: /^\/v1\/betaBuildLocalizations$/,
      responses: [{ status: 201, body: { data: { type: "betaBuildLocalizations", id: "loc-en" } } }],
    },
  ]);

  await betaTextPush("100", { dir, intervalMs: 0, timeoutMs: 5000 });
  rmSync(dir, { recursive: true, force: true });

  const patch = calls.find((c) => c.method === "PATCH");
  assert.equal(patch.body.data.attributes.whatsNew, "Testen: alles.");
  const post = calls.find((c) => c.method === "POST" && c.path.startsWith("/v1/betaBuildLocalizations"));
  assert.equal(post.body.data.attributes.locale, "en-US");
  assert.equal(post.body.data.attributes.whatsNew, "Test: everything.");
  assert.equal(post.body.data.relationships.build.data.id, "build-1");
});

test("pollBuild: PROCESSING is polled until VALID", async (t) => {
  withFetch(t, [
    { method: "GET", pattern: /^\/v1\/apps\?/, responses: [] },
    {
      method: "GET",
      pattern: /^\/v1\/builds\?/,
      responses: [build("100", "PROCESSING"), build("100", "PROCESSING"), build("100", "VALID")],
    },
  ]);
  const b = await pollBuild("app-1", "100", { intervalMs: 0, timeoutMs: 5000 });
  assert.equal(b.attributes.processingState, "VALID");
});

test("pollBuild: INVALID fails immediately, not as a timeout", async (t) => {
  withFetch(t, [{ method: "GET", pattern: /^\/v1\/builds\?/, responses: [build("100", "INVALID")] }]);
  await assert.rejects(
    () => pollBuild("app-1", "100", { intervalMs: 0, timeoutMs: 5000 }),
    /build 100 is INVALID/,
  );
});

test("pollBuild: gives up with a clear message once the deadline passes", async (t) => {
  withFetch(t, [{ method: "GET", pattern: /^\/v1\/builds\?/, responses: [build("100", "PROCESSING")] }]);
  await assert.rejects(
    () => pollBuild("app-1", "100", { intervalMs: 0, timeoutMs: 0 }),
    /did not reach VALID/,
  );
});

test("beta-text distribute: already in the group and already reviewed does nothing", async (t) => {
  const calls = withFetch(t, [
    { method: "GET", pattern: /^\/v1\/apps\?/, responses: [{ body: { data: [{ id: "app-1" }] } }] },
    { method: "GET", pattern: /^\/v1\/builds\?/, responses: [build("100", "VALID")] },
    {
      method: "GET",
      pattern: /^\/v1\/betaGroups\?/,
      responses: [{ body: { data: [{ id: "grp-1", attributes: { name: "Friends", isInternalGroup: false } }] } }],
    },
    {
      method: "GET",
      pattern: /^\/v1\/betaGroups\/grp-1\/relationships\/builds/,
      responses: [{ body: { data: [{ type: "builds", id: "build-1" }] } }],
    },
    {
      method: "GET",
      pattern: /^\/v1\/betaAppReviewSubmissions\?/,
      responses: [{ body: { data: [{ attributes: { betaReviewState: "APPROVED" } }] } }],
    },
  ]);

  await betaTextDistribute("100", "Friends");

  assert.ok(calls.every((c) => c.method === "GET"), "no build or review submission POST when both already exist");
});

test("beta-text distribute: adds the build and submits for review when neither exists yet", async (t) => {
  const calls = withFetch(t, [
    { method: "GET", pattern: /^\/v1\/apps\?/, responses: [{ body: { data: [{ id: "app-1" }] } }] },
    { method: "GET", pattern: /^\/v1\/builds\?/, responses: [build("100", "VALID")] },
    {
      method: "GET",
      pattern: /^\/v1\/betaGroups\?/,
      responses: [{ body: { data: [{ id: "grp-1", attributes: { name: "Friends", isInternalGroup: false } }] } }],
    },
    { method: "GET", pattern: /^\/v1\/betaGroups\/grp-1\/relationships\/builds/, responses: [{ body: { data: [] } }] },
    { method: "POST", pattern: /^\/v1\/betaGroups\/grp-1\/relationships\/builds$/, responses: [{ status: 204, body: null }] },
    { method: "GET", pattern: /^\/v1\/betaAppReviewSubmissions\?/, responses: [{ body: { data: [] } }] },
    { method: "POST", pattern: /^\/v1\/betaAppReviewSubmissions$/, responses: [{ status: 201, body: { data: { id: "sub-1" } } }] },
  ]);

  await betaTextDistribute("100", "Friends");

  const addBuild = calls.find((c) => c.method === "POST" && c.path.includes("relationships/builds"));
  assert.deepEqual(addBuild.body.data, [{ type: "builds", id: "build-1" }]);
  const submit = calls.find((c) => c.method === "POST" && c.path.endsWith("/v1/betaAppReviewSubmissions"));
  assert.equal(submit.body.data.relationships.build.data.id, "build-1");
});
