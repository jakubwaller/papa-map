import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { assertion, trackBody, parseArgs } from "./play.mjs";

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
