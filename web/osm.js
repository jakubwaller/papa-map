// In-page contribution: an OSM login (OAuth 2 with PKCE) and the two-tap room
// answer, written to OpenStreetMap under the reader's own account.
//
// Three things this file is built around.
//
// 1. The reader is the author. Every changeset carries the reader's OSM
//    account and name, the way StreetComplete and MapComplete work; PapaMap
//    is the tool, named in created_by, and owns nothing. The registering
//    account of the OAuth client never appears on an edit.
// 2. No secret, no backend. A page served from a static host is a *public*
//    OAuth client: it authenticates with PKCE (a per-login random verifier
//    whose hash goes out first and whose value goes out with the code) and
//    the token exchange happens in the browser, exactly as iD does it. The
//    client secret OSM generated is unused and is not in this repo.
// 3. Nothing written here changes what the map shows. The pipeline stays
//    the only path from OSM into the map (CONTRACT.md); the answer is sent,
//    OSM's reply is quoted back, and the pin keeps its colour until tonight.
//
// Any host that is not papamap.de talks to the sandbox API, whose database
// is separate from osm.org and wiped periodically — so a dev server can never
// put a test answer on the real map. The sandbox client is registered for
// http://127.0.0.1:8000/ and :8899/ (not localhost: OSM's Doorkeeper insists
// on https for every host but the loopback address written as a number).

export const LIVE = {
  name: "openstreetmap.org",
  site: "https://www.openstreetmap.org",
  api: "https://api.openstreetmap.org/api/0.6",
  clientId: "K5HpTJV2mLrYh3SR8Bx2XksRFSE5lMRSLA44oEVjUuA",
  redirect: "https://papamap.de/",
};

export const SANDBOX = {
  name: "sandbox (master.apis.dev.openstreetmap.org)",
  site: "https://master.apis.dev.openstreetmap.org",
  api: "https://master.apis.dev.openstreetmap.org/api/0.6",
  clientId: "GTKnMqPtTTg9gk1LCcMJmPtah9GQ6UC_UnH4jHVTmZA",
  redirect: null,   // filled in from the page's own origin
};

export const SCOPES = "read_prefs write_api";

// The live client only on the live host. www. and the .eu alias redirect to
// papamap.de before any page runs, so they never reach this branch.
export function endpoints(loc) {
  if (loc.hostname === "papamap.de") return LIVE;
  return { ...SANDBOX, redirect: `${loc.origin}/` };
}

// ---- Storage ----
// The token survives the tab: a login is meant to last, as an editor's
// does. Both keys are named in the Datenschutz. The PKCE state and the
// pending answer live only for the round trip to OSM and back.
export const TOKEN_KEY = "papamap-osm-token";
export const USER_KEY = "papamap-osm-user";
export const PKCE_KEY = "papamap-osm-pkce";
export const INTENT_KEY = "papamap-osm-intent";

const local = () => globalThis.localStorage;
const session = () => globalThis.sessionStorage;

export const getToken = () => { try { return local().getItem(TOKEN_KEY); } catch { return null; } };
export const getUser = () => { try { return local().getItem(USER_KEY); } catch { return null; } };
export function setLogin(token, user) {
  try { local().setItem(TOKEN_KEY, token); if (user) local().setItem(USER_KEY, user); } catch { /* blocked storage: the login lasts this page */ }
}
export function clearLogin() {
  try { local().removeItem(TOKEN_KEY); local().removeItem(USER_KEY); } catch { /* nothing to clear */ }
}

// The answer the reader gave before being sent to log in, so that the round
// trip ends with the answer saved rather than with the reader asked again.
export function takeIntent() {
  try {
    const raw = session().getItem(INTENT_KEY);
    session().removeItem(INTENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ---- PKCE ----
const b64url = (bytes) => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64url(a);
}

export async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

export function authorizeUrl(cfg, { state, challenge }) {
  const u = new URL(`${cfg.site}/oauth2/authorize`);
  u.search = new URLSearchParams({
    response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirect,
    scope: SCOPES, state, code_challenge: challenge, code_challenge_method: "S256",
  }).toString();
  return u.href;
}

// Leaves the page. `intent` is what to do once the reader is back.
export async function startLogin(cfg, intent, navigate = (url) => location.assign(url)) {
  const verifier = randomToken(48), state = randomToken(16);
  try {
    session().setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
    if (intent) session().setItem(INTENT_KEY, JSON.stringify(intent));
  } catch { /* no session storage: the return cannot be verified, so no login */ return; }
  navigate(authorizeUrl(cfg, { state, challenge: await pkceChallenge(verifier) }));
}

// Called on every page load. null when this load is not a return from OSM;
// { token } after a successful exchange; { denied: true } when the reader
// said no on the consent screen. Throws when the exchange itself fails.
export async function finishLogin(cfg, href, fetchFn = fetch) {
  const params = new URL(href).searchParams;
  const code = params.get("code"), state = params.get("state");
  if (!code && !params.get("error")) return null;
  let pkce = null;
  try { pkce = JSON.parse(session().getItem(PKCE_KEY) || "null"); session().removeItem(PKCE_KEY); } catch { /* fall through */ }
  if (!code) return { denied: true };
  // A code with the wrong state is not ours: somebody pasted a URL, or the
  // login was started in another tab. Do not exchange it.
  if (!pkce || pkce.state !== state) throw new Error("oauth state mismatch");
  const r = await fetchFn(`${cfg.site}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: cfg.redirect,
      client_id: cfg.clientId, code_verifier: pkce.verifier,
    }).toString(),
  });
  if (!r.ok) throw httpError(r.status, "token");
  const { access_token } = await r.json();
  if (!access_token) throw httpError(r.status, "token");
  return { token: access_token };
}

// The display name, for "logged in as …". read_prefs is the scope for it.
export async function userName(cfg, token, fetchFn = fetch) {
  const r = await fetchFn(`${cfg.api}/user/details.json`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw httpError(r.status, "user");
  return (await r.json())?.user?.display_name ?? null;
}

// Best effort: OSM forgets the token too, so a stolen device cannot use it.
export function revoke(cfg, token, fetchFn = fetch) {
  return fetchFn(`${cfg.site}/oauth2/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, client_id: cfg.clientId }).toString(),
  }).catch(() => null);
}

// ---- The room answer ----
// The values are the theme's own changing_table:location vocabulary, which is
// also what classify.py reads — the same words MapComplete would write for
// the same tap. "both" is the semicolon list OSM uses for a table in each
// toilet, and it is the commonest true answer in a café.
export const ROOMS = {
  both: "female_toilet;male_toilet",
  male: "male_toilet",
  female: "female_toilet",
  unisex: "unisex_toilet",
  dedicated: "dedicated_room",
};

// Which rooms a reader can vouch for. A mother has seen the women's room and
// whatever is open to everyone; the men's room is not hers to answer for, and
// "both" would be a guess about it. A father gets the full set: "both" is his
// to say because his partner or the sign told him, and "women's only" is the
// red pin — the answer the whole map exists to record.
export function roomChoices(mode) {
  return mode === "mama" ? ["female", "unisex", "dedicated"]
                         : ["both", "male", "female", "unisex", "dedicated"];
}

// Only the room. changing_table itself is already yes or limited on every
// pin that gets this question, and "limited" must not be promoted to "yes"
// by a reader who was only asked about the door.
export function roomPatch(choice) {
  if (!(choice in ROOMS)) throw new Error(`unknown room choice ${choice}`);
  return { "changing_table:location": ROOMS[choice] };
}

// The play-place answer. There the table is news to OSM, so the yes travels
// with the room; a reader who tapped a room stood in front of one, which is
// `yes`, never `limited`. Same vocabulary, one more tag.
export function tablePatch(choice) {
  return { changing_table: "yes", ...roomPatch(choice) };
}

export const CREATED_BY = "PapaMap";

export function changesetTags(comment) {
  return {
    created_by: CREATED_BY,
    comment,
    hashtags: "#papamap",
    host: "https://papamap.de/",
    source: "survey",
  };
}

// ---- OSM API 0.6 ----
export const xmlEscape = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const tagsXml = (tags) => Object.entries(tags)
  .map(([k, v]) => `<tag k="${xmlEscape(k)}" v="${xmlEscape(v)}"/>`).join("");

export function changesetXml(tags) {
  return `<osm><changeset>${tagsXml(tags)}</changeset></osm>`;
}

// The API's single-object JSON, kept whole: a way must be written back with
// its nodes and a relation with its members, or the PUT deletes them.
export function elementFromApi(json) {
  const el = json?.elements?.[0];
  if (!el || !Number.isFinite(el.version) || !["node", "way", "relation"].includes(el.type)) return null;
  return { type: el.type, id: el.id, version: el.version, tags: el.tags ?? {},
           lat: el.lat, lon: el.lon, nodes: el.nodes ?? [], members: el.members ?? [] };
}

export function elementXml(el, tags, changeset) {
  const attrs = `id="${el.id}" version="${el.version}" changeset="${changeset}"`;
  if (el.type === "node")
    return `<osm><node ${attrs} lat="${el.lat}" lon="${el.lon}">${tagsXml(tags)}</node></osm>`;
  if (el.type === "way")
    return `<osm><way ${attrs}>${el.nodes.map((n) => `<nd ref="${n}"/>`).join("")}${tagsXml(tags)}</way></osm>`;
  const members = el.members
    .map((m) => `<member type="${m.type}" ref="${m.ref}" role="${xmlEscape(m.role ?? "")}"/>`).join("");
  return `<osm><relation ${attrs}>${members}${tagsXml(tags)}</relation></osm>`;
}

function httpError(status, step) {
  return Object.assign(new Error(`${step} failed (${status})`), { status, step });
}

// One answer, one changeset: read the object as OSM holds it now, open a
// changeset, write the object back with the patch on top of its tags, close.
// Returns what OSM holds afterwards. A 409 means the object moved on between
// the read and the write — someone else edited it — and the caller says so
// rather than retrying over their work. A 401 means the token is dead.
export async function writeTags(cfg, token, ref, patch, comment, fetchFn = fetch) {
  const auth = { Authorization: `Bearer ${token}` };
  const xml = { ...auth, "Content-Type": "text/xml; charset=utf-8" };

  const read = await fetchFn(`${cfg.api}/${ref.type}/${ref.id}.json`, { headers: auth, cache: "no-store" });
  if (!read.ok) throw httpError(read.status, "read");
  const el = elementFromApi(await read.json());
  if (!el) throw httpError(read.status, "read");

  const open = await fetchFn(`${cfg.api}/changeset/create`,
    { method: "PUT", headers: xml, body: changesetXml(changesetTags(comment)) });
  if (!open.ok) throw httpError(open.status, "changeset");
  const changeset = (await open.text()).trim();

  const tags = { ...el.tags, ...patch };
  const put = await fetchFn(`${cfg.api}/${ref.type}/${ref.id}`,
    { method: "PUT", headers: xml, body: elementXml(el, tags, changeset) });
  // Closed whatever happened: an open changeset would otherwise sit on the
  // reader's account for an hour, and the next answer would open another.
  await fetchFn(`${cfg.api}/changeset/${changeset}/close`, { method: "PUT", headers: auth }).catch(() => null);
  if (!put.ok) throw httpError(put.status, "write");
  return { version: Number(await put.text()), tags, changeset };
}
