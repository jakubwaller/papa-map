// The Google Play Developer API, as far as shipping a build needs it. No
// fastlane, no dependency: Node's own crypto signs the service account's token
// and fetch does the rest — the same shape as ios/asc.mjs. Called by the `play`
// task in .github/workflows/app-build.yml.
//
//   node android/play.mjs upload <app.aab> [--track alpha] [--status draft]
//   node android/play.mjs listings pull      print the store listing texts, every language
//   node android/play.mjs listings push      listings/*.json → the listings, in one committed edit
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
import { pathToFileURL } from "node:url";
import { PLAY_LOCALES, listingsDir, readListings, playListingBody, same } from "../listings.mjs";

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

// Play answers a transient 503 now and then mid-edit (run 255, 1 Oct 2026),
// and one of those used to fail the whole upload. 429 and 5xx are retried with
// a doubling pause, the token request included, and so is a request that never
// got an answer (fetch's TypeError, a reset socket); anything else is the
// request's fault and fails at once.
export const retryable = (status) => status === 429 || status >= 500;
export const transient = (e) => e instanceof TypeError || typeof e?.cause?.code === "string";

// stopIf, when given, is asked before every re-send; true ends the retries
// with { stopped: true } instead of sending again (see commitEdit).
export async function withRetry(send, { tries = 4, pause = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), stopIf } = {}) {
  for (let i = 1; ; i++) {
    let why;
    try {
      const res = await send();
      if (!retryable(res.status) || i === tries) return res;
      why = res.status;
    } catch (e) {
      if (!transient(e) || i === tries) throw e;
      why = `${e.message}${e.cause?.code ? ` (${e.cause.code})` : ""}`;
    }
    console.log(`${why}, retrying in ${pause * 2 ** (i - 1) / 1000} s`);
    await sleep(pause * 2 ** (i - 1));
    if (stopIf && await stopIf()) return { stopped: true };
  }
}

async function accessToken(key) {
  const res = await withRetry(() => fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion(key),
    }),
  }));
  const json = await res.json();
  if (!res.ok) throw new Error(`token: ${res.status} ${JSON.stringify(json)}`);
  return json.access_token;
}

async function call(bearer, method, url, { json, body, type } = {}) {
  const res = await withRetry(() => fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(type ? { "Content-Type": type } : {}),
    },
    body: json ? JSON.stringify(json) : body,
  }));
  return parse(res, method, url);
}

async function parse(res, method, url) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url.replace(/\?.*/, "")}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

// The commit is the one request that is not safe to send again blindly: Play
// can apply it and still answer 5xx (or the answer can be lost), and the
// repeat then meets an edit that no longer exists and fails as if nothing had
// shipped. So before each re-send, and once more after the last attempt, the
// edit is looked up; gone means the earlier commit most likely went through,
// and the log says so rather than failing on a confusing "edit not found".
// Gone is a 404 or 410, or a 400 whose body names a deleted or committed edit
// (Google reports it that way too; nothing here can check which, offline).
const editGone = (status, text) =>
  status === 404 || status === 410 || (status === 400 && /delet|committed/i.test(text));

export async function commitEdit(bearer, id, { fetch: f = fetch, ...retry } = {}) {
  const headers = { Authorization: `Bearer ${bearer}` };
  const url = `${API}/edits/${id}:commit`;
  const gone = async () => {
    const r = await f(`${API}/edits/${id}`, { headers }).catch(() => null);
    return !!r && editGone(r.status, r.status === 400 ? await r.text?.().catch(() => "") ?? "" : "");
  };
  const applied = () => {
    console.log(`edit ${id} is gone after a failed commit: Play most likely applied it — check the track in the Play Console`);
    return { probablyCommitted: true };
  };
  let lost = false;   // an earlier attempt failed in a way that may still have been applied
  const send = async () => {
    try {
      const r = await f(url, { method: "POST", headers });
      if (retryable(r.status)) lost = true;
      return r;
    } catch (e) {
      if (transient(e)) lost = true;
      throw e;
    }
  };
  let res;
  try {
    res = await withRetry(send, { ...retry, stopIf: gone });
  } catch (e) {
    if (transient(e) && await gone()) return applied();
    throw e;
  }
  if (res.stopped) return applied();
  if (!res.ok && lost) {
    // The last answer was a 5xx: look the edit up once more. A 4xx on a
    // re-send after a lost answer is Play refusing an edit it already closed.
    if (retryable(res.status) ? await gone() : [400, 404, 409, 410].includes(res.status)) return applied();
  }
  return parse(res, "POST", url);
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
  await commitEdit(bearer, edit.id);
  console.log(`${track}: version code ${bundle.versionCode} as ${status}`);
}

// --- Store listing texts -------------------------------------------------------
//
// Docs: https://developers.google.com/android-publisher/api-ref/rest/v3/edits.listings
// A listing is one language's title, short and full description (and a promo
// video, if any). Like everything else they live inside an edit: open it,
// change, commit — or delete it, which is how `pull` leaves no trace.

export async function listingsPull() {
  const bearer = await accessToken(serviceAccount());
  const edit = await call(bearer, "POST", `${API}/edits`, { json: {} });
  try {
    const details = await call(bearer, "GET", `${API}/edits/${edit.id}/details`);
    console.log(`default language ${details.defaultLanguage}`);
    const { listings = [] } = await call(bearer, "GET", `${API}/edits/${edit.id}/listings`);
    for (const l of listings) console.log(`${l.language}: ${JSON.stringify(l)}`);
  } finally {
    await call(bearer, "DELETE", `${API}/edits/${edit.id}`);
  }
}

// PUT replaces a language's listing whole, so an unchanged one is skipped
// rather than rewritten, and an edit with nothing in it is deleted, not
// committed. A failure half-way deletes the edit too: Play is left as it was.
export async function listingsPush({ dir = listingsDir } = {}) {
  const listings = readListings(dir);   // every file validated before the first request
  const bearer = await accessToken(serviceAccount());
  const edit = await call(bearer, "POST", `${API}/edits`, { json: {} });
  const skipped = [];
  let changed = 0;
  try {
    const { listings: have = [] } = await call(bearer, "GET", `${API}/edits/${edit.id}/listings`);
    for (const l of listings) {
      const language = PLAY_LOCALES[l.lang];
      if (!language) { skipped.push(l.lang); continue; }
      const existing = have.find((h) => h.language === language) ?? null;
      const body = playListingBody(l, existing);
      if (existing && same(existing, body)) { console.log(`${language}: unchanged`); continue; }
      await call(bearer, "PUT", `${API}/edits/${edit.id}/listings/${language}`, { json: body });
      console.log(`${language}: ${existing ? "updated" : "created"}`);
      changed++;
    }
    if (changed) {
      await commitEdit(bearer, edit.id);
      console.log(`committed: ${changed} listing(s) changed`);
    } else {
      await call(bearer, "DELETE", `${API}/edits/${edit.id}`);
      console.log("nothing to change");
    }
  } catch (e) {
    await call(bearer, "DELETE", `${API}/edits/${edit.id}`).catch(() => {});
    throw e;
  }
  if (skipped.length) console.log(`no Google Play language for: ${skipped.join(", ")}`);
}

const USAGE = "usage: play.mjs upload <app.aab> [--track alpha] [--status draft] | listings pull | listings push";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  const run = async () => {
    if (cmd === "upload") {
      const args = parseArgs(rest);
      if (args.files.length !== 1) throw new Error(USAGE);
      await upload(args.files[0], args);
    } else if (cmd === "listings" && rest.length === 1 && rest[0] === "pull") {
      await listingsPull();
    } else if (cmd === "listings" && rest.length === 1 && rest[0] === "push") {
      await listingsPush();
    } else throw new Error(USAGE);
  };
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
