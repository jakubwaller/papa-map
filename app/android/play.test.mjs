import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { assertion, trackBody, parseArgs, retryable, withRetry, commitEdit } from "./play.mjs";

test("the assertion is an RS256 JWT Google's token endpoint accepts", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = {
    client_email: "ci@papamap.iam.gserviceaccount.example.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    token_uri: "https://oauth2.googleapis.com/token",
  };
  const jwt = assertion(key, 1_000_000);
  const [head, body, sig] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(head, "base64url")), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(body, "base64url")), {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: key.token_uri,
    iat: 1_000_000,
    exp: 1_003_600,   // Google's ceiling is an hour
  });
  assert.ok(verify("sha256", Buffer.from(`${head}.${body}`), publicKey, Buffer.from(sig, "base64url")));
});

test("the track gets exactly the uploaded version code, as a string", () => {
  assert.deepEqual(trackBody("alpha", 212, "draft"),
                   { track: "alpha", releases: [{ versionCodes: ["212"], status: "draft" }] });
});

test("closed testing and draft unless told otherwise; a typo'd status is refused", () => {
  assert.deepEqual(parseArgs(["app.aab"]), { track: "alpha", status: "draft", files: ["app.aab"] });
  assert.deepEqual(parseArgs(["app.aab", "--track", "internal", "--status", "completed"]),
                   { track: "internal", status: "completed", files: ["app.aab"] });
  assert.throws(() => parseArgs(["app.aab", "--status", "complete"]));
});

test("429 and 5xx are worth another try, other failures are not", () => {
  for (const s of [429, 500, 502, 503]) assert.equal(retryable(s), true, s);
  for (const s of [200, 400, 401, 403, 404, 409]) assert.equal(retryable(s), false, s);
});

test("a transient 503 is retried with a doubling pause until Play answers", async () => {
  const replies = [503, 503, 200];
  const slept = [];
  const res = await withRetry(async () => ({ status: replies.shift() }), { sleep: async (ms) => slept.push(ms) });
  assert.equal(res.status, 200);
  assert.deepEqual(slept, [2000, 4000]);
});

test("retries stop after the last try and hand back the failure", async () => {
  let sent = 0;
  const res = await withRetry(async () => (sent++, { status: 503 }), { tries: 3, sleep: async () => {} });
  assert.equal(res.status, 503);
  assert.equal(sent, 3);
});

test("a 403 fails at once, without a retry", async () => {
  let sent = 0;
  const res = await withRetry(async () => (sent++, { status: 403 }), { sleep: async () => {} });
  assert.equal(res.status, 403);
  assert.equal(sent, 1);
});

// What fetch throws when the request never got an answer.
const reset = () => new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });

test("a request that never got an answer is retried like a 503", async () => {
  let sent = 0;
  const res = await withRetry(async () => { if (++sent < 3) throw reset(); return { status: 200 }; },
                              { sleep: async () => {} });
  assert.equal(res.status, 200);
  assert.equal(sent, 3);
});

test("a network error on the last try is thrown, and a bug is never retried", async () => {
  let sent = 0;
  await assert.rejects(withRetry(async () => { sent++; throw reset(); }, { tries: 2, sleep: async () => {} }),
                       /fetch failed/);
  assert.equal(sent, 2);
  sent = 0;
  await assert.rejects(withRetry(async () => { sent++; throw new RangeError("bug"); }, { sleep: async () => {} }),
                       /bug/);
  assert.equal(sent, 1);
});

// A stand-in for Play: answers the commit from `commits`, and the edit lookup
// from `edit` (200 while it exists, 404 once committed).
function fakePlay(commits, edit) {
  const seen = [];
  const f = async (url, { method = "GET" } = {}) => {
    seen.push(`${method} ${url.replace(/.*\/edits\//, "")}`);
    if (method === "POST") {
      const next = commits.shift();
      if (next instanceof Error) throw next;
      return { status: next, ok: next < 300, text: async () => (next < 300 ? '{"id":"e1"}' : "error") };
    }
    const e = edit.shift() ?? 200;   // a status, or { status, body } for a lookup that explains itself
    return typeof e === "number" ? { status: e } : { status: e.status, text: async () => e.body };
  };
  return { f, seen };
}

test("a commit that failed is re-sent only while the edit still exists", async () => {
  const { f, seen } = fakePlay([503, 200], [200]);
  assert.deepEqual(await commitEdit("t", "e1", { fetch: f, sleep: async () => {} }), { id: "e1" });
  assert.deepEqual(seen, ["POST e1:commit", "GET e1", "POST e1:commit"]);
});

test("an edit gone after a 5xx commit reads as committed, not as a failure, and is not re-sent", async () => {
  const { f, seen } = fakePlay([503], [404]);
  assert.deepEqual(await commitEdit("t", "e1", { fetch: f, sleep: async () => {} }), { probablyCommitted: true });
  assert.deepEqual(seen, ["POST e1:commit", "GET e1"]);
});

test("a commit whose answer was lost is checked the same way", async () => {
  const { f, seen } = fakePlay([reset()], [404]);
  assert.deepEqual(await commitEdit("t", "e1", { fetch: f, sleep: async () => {} }), { probablyCommitted: true });
  assert.deepEqual(seen, ["POST e1:commit", "GET e1"]);
});

test("a commit Play refuses outright fails at once", async () => {
  const { f, seen } = fakePlay([400], []);
  await assert.rejects(commitEdit("t", "e1", { fetch: f, sleep: async () => {} }), /: 400 error/);
  assert.deepEqual(seen, ["POST e1:commit"]);
});

test("a commit that fails on its last attempt is checked once more, and read as committed if the edit is gone", async () => {
  const { f, seen } = fakePlay([503, 503, 503, 503], [200, 200, 200, 404]);
  assert.deepEqual(await commitEdit("t", "e1", { fetch: f, sleep: async () => {} }), { probablyCommitted: true });
  assert.deepEqual(seen, ["POST e1:commit", "GET e1", "POST e1:commit", "GET e1", "POST e1:commit", "GET e1",
                          "POST e1:commit", "GET e1"]);
});

test("a last-attempt failure with the edit still there is the real failure", async () => {
  const { f } = fakePlay([503, 503], [200, 200]);
  await assert.rejects(commitEdit("t", "e1", { fetch: f, tries: 2, sleep: async () => {} }), /: 503 error/);
});

test("a lost answer on the last attempt is checked as well", async () => {
  const { f, seen } = fakePlay([reset(), reset()], [200, 404]);
  assert.deepEqual(await commitEdit("t", "e1", { fetch: f, tries: 2, sleep: async () => {} }), { probablyCommitted: true });
  assert.deepEqual(seen, ["POST e1:commit", "GET e1", "POST e1:commit", "GET e1"]);
});

test("a 400 lookup that names a deleted edit counts as gone", async () => {
  const { f, seen } = fakePlay([503], [{ status: 400, body: "This Edit has been deleted." }]);
  assert.deepEqual(await commitEdit("t", "e1", { fetch: f, sleep: async () => {} }), { probablyCommitted: true });
  assert.deepEqual(seen, ["POST e1:commit", "GET e1"]);
});

test("a 400 lookup that says something else does not", async () => {
  const { f, seen } = fakePlay([503, 200], [{ status: 400, body: "Invalid request" }]);
  assert.deepEqual(await commitEdit("t", "e1", { fetch: f, sleep: async () => {} }), { id: "e1" });
  assert.deepEqual(seen, ["POST e1:commit", "GET e1", "POST e1:commit"]);
});

test("a 4xx on the re-sent commit after a 5xx reads as already applied", async () => {
  const { f, seen } = fakePlay([503, 400], [200]);
  assert.deepEqual(await commitEdit("t", "e1", { fetch: f, sleep: async () => {} }), { probablyCommitted: true });
  assert.deepEqual(seen, ["POST e1:commit", "GET e1", "POST e1:commit"]);
});

test("a 403 on the re-send is still a failure", async () => {
  const { f } = fakePlay([503, 403], [200]);
  await assert.rejects(commitEdit("t", "e1", { fetch: f, sleep: async () => {} }), /: 403 error/);
});
