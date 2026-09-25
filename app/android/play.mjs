// The Google Play Developer API, as far as shipping a build needs it. No
// fastlane, no dependency: Node's own crypto signs the service account's token
// and fetch does the rest — the same shape as ios/asc.mjs. Called by the `play`
// task in .github/workflows/app-build.yml.
//
//   node android/play.mjs upload <app.aab> [--track alpha] [--status draft]
//
// Reads PLAY_SERVICE_ACCOUNT_JSON (the key file's text) from the environment —
// the repository secret of that name.
//
// What the API cannot do: create the app, or take its very first bundle. Both
// happen once in the Play Console by hand (android/PLAY.md); every
// upload after that is this script.
//
// --status: Play refuses anything but "draft" for an app that has never been
// published ("Only releases with status draft may be created on draft app"),
// so draft is the default and a person presses "Roll out" in the Console. Once
// the app is out of draft, "completed" sends the release straight to the track.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

export const PACKAGE = "de.papamap.app";
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

// RS256, the service account flow (RFC 7523): a signed assertion traded at the
// key's own token_uri for an hour's bearer token. One upload is minutes.
export function assertion({ client_email, private_key, token_uri }, now = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: client_email, scope: SCOPE, aud: token_uri, iat: now, exp: now + 3600 }));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), createPrivateKey(private_key));
  return `${head}.${body}.${b64url(sig)}`;
}

function serviceAccount() {
  const text = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  if (!text) throw new Error("PLAY_SERVICE_ACCOUNT_JSON must be set");
  const key = JSON.parse(text);
  for (const k of ["client_email", "private_key", "token_uri"])
    if (!key[k]) throw new Error(`PLAY_SERVICE_ACCOUNT_JSON has no ${k} — is it the service account's JSON key?`);
  return key;
}

async function accessToken(key) {
  const res = await fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion(key),
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token: ${res.status} ${JSON.stringify(json)}`);
  return json.access_token;
}

async function call(bearer, method, url, { json, body, type } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(type ? { "Content-Type": type } : {}),
    },
    body: json ? JSON.stringify(json) : body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url.replace(/\?.*/, "")}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

// The release the track gets: this one version code, whole. Pure, so the
// shape Play is sent is tested without a network.
export function trackBody(track, versionCode, status) {
  return { track, releases: [{ versionCodes: [String(versionCode)], status }] };
}

export function parseArgs(argv) {
  const out = { track: "alpha", status: "draft", files: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--track") out.track = argv[++i];
    else if (argv[i] === "--status") out.status = argv[++i];
    else out.files.push(argv[i]);
  }
  if (!["draft", "completed"].includes(out.status)) throw new Error(`--status draft|completed, not ${out.status}`);
  return out;
}

// One edit: open, upload the bundle, point the track at it, commit. An edit
// that fails half-way is never committed, so Play is left as it was.
async function upload(file, { track, status }) {
  const bearer = await accessToken(serviceAccount());
  const edit = await call(bearer, "POST", `${API}/edits`, { json: {} });
  const bundle = await call(bearer, "POST", `${UPLOAD}/edits/${edit.id}/bundles?uploadType=media`,
                            { body: readFileSync(file), type: "application/octet-stream" });
  console.log(`uploaded version code ${bundle.versionCode} (sha256 ${bundle.sha256})`);
  await call(bearer, "PUT", `${API}/edits/${edit.id}/tracks/${track}`,
             { json: trackBody(track, bundle.versionCode, status) });
  await call(bearer, "POST", `${API}/edits/${edit.id}:commit`);
  console.log(`${track}: version code ${bundle.versionCode} as ${status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2);
  const run = async () => {
    if (cmd === "upload") {
      const args = parseArgs(rest);
      if (args.files.length !== 1) throw new Error("usage: play.mjs upload <app.aab> [--track alpha] [--status draft]");
      await upload(args.files[0], args);
    } else throw new Error("usage: play.mjs upload <app.aab> [--track alpha] [--status draft]");
  };
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
