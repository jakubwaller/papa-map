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
// put a test answer on the real map. It can put one on an unrelated sandbox
// object, though: the pins carry live osm.org ids, and the sandbox holds
// whatever happens to have that number, so a dev tap is only ever meaningful
// on a pin pointed at an object that exists there (the test fixture does
// that). The sandbox client is registered for
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
// The two calls on the return leg run before the map loads its data: a
// hanging OSM must not hold the map hostage (a failed one already does not).
const OSM_TIMEOUT_MS = 15000;
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
  } catch { /* no session storage: the return cannot be verified, so no login */ return false; }
  navigate(authorizeUrl(cfg, { state, challenge: await pkceChallenge(verifier) }));
  return true;
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
    method: "POST", signal: AbortSignal.timeout?.(OSM_TIMEOUT_MS),
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
  const r = await fetchFn(`${cfg.api}/user/details.json`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout?.(OSM_TIMEOUT_MS) });
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
  // The commonest value in OSM by a distance (a quarter of all
  // changing_table:location, taginfo 13 Sep 2026): in Germany the table is
  // very often in the barrier-free toilet. Left out of the first cut by
  // oversight, not by design.
  wheelchair: "wheelchair_toilet",
  dedicated: "dedicated_room",
  // The rare three, offered behind "more": a corridor or multi-purpose room,
  // the shop floor, the open air.
  room: "room",
  sales: "sales_area",
  outdoor: "outdoor",
};

// The i18n key each choice's label lives under, in web/i18n.js — the answer
// buttons' own words. Colocated with ROOMS rather than with the buttons that
// render it, so roomLabelKeys below reuses it instead of re-deriving a key
// from the choice name a second way.
export const ROOM_LABEL = { both: "roomBoth", male: "roomMale", female: "roomFemale",
                             unisex: "roomUnisex", wheelchair: "roomWheelchair", dedicated: "roomDedicated",
                             room: "roomRoom", sales: "roomSales", outdoor: "roomOutdoor" };

// Which rooms a reader can vouch for. A mother has seen the women's room and
// whatever is open to everyone; the men's room is not hers to answer for, and
// "both" would be a guess about it. A father gets the full set: "both" is his
// to say because his partner or the sign told him, and "women's only" is the
// red pin — the answer the whole map exists to record. The barrier-free
// toilet is open to everyone, so both readings get it.
export function roomChoices(mode) {
  return mode === "mama" ? ["female", "unisex", "wheelchair", "dedicated"]
                         : ["both", "male", "female", "unisex", "wheelchair", "dedicated"];
}

// The rest of the vocabulary, one tap further away: together 17 % of the
// values in OSM, none of them a door anyone is kept out of, so the same
// three in either reading. Kept off the first screen so the common answers
// stay a two-tap flow on a phone.
export function roomChoicesMore() {
  return ["room", "sales", "outdoor"];
}

// Only the room. changing_table itself is already yes or limited on every
// pin that gets this question, and "limited" must not be promoted to "yes"
// by a reader who was only asked about the door.
export function roomPatch(choice) {
  if (!(choice in ROOMS)) throw new Error(`unknown room choice ${choice}`);
  return { "changing_table:location": ROOMS[choice] };
}

// The single OSM tokens ROOMS uses, inverted for a lookup back from a tag
// value to the choice that writes it. "both" is left out on purpose: its
// value is the two-token combination roomLabelKeys handles separately below,
// never a token that appears on its own.
const TOKEN_TO_CHOICE = Object.fromEntries(
  Object.entries(ROOMS).filter(([choice]) => choice !== "both").map(([choice, value]) => [value, choice]));

// The reader's-language display for a raw `changing_table:location` value —
// display only, never a classifier: pipeline/classify.py's token matching is
// the one place this project's colour comes from, and this function does not
// touch it. Splits on ";" the way the tag's multi-value reads and OSM writes
// it, trims stray spaces around a ";" a human editor left, and drops
// duplicates and empties. Each part comes back as either `{ key }`, an i18n
// key into web/i18n.js (the answer buttons' own labels, via ROOM_LABEL, so
// the popup and the buttons that wrote the tag always agree), or `{ raw }`
// verbatim — a token this project's vocabulary does not have a label for,
// which the reader must still see rather than have swallowed.
//
// Token matching is EXACT, never substring, the same rule classify.py lives
// by: "female_toilet" contains "male_toilet", so a substring test would read
// a women's-only room as the mixed one. The pair {female_toilet, male_toilet},
// in either order and only that pair, is what a reader calls "both" — it
// collapses to the one label rather than printing two.
export function roomLabelKeys(raw) {
  if (!raw) return [];
  const tokens = [...new Set(raw.split(";").map((s) => s.trim()).filter(Boolean))];
  if (tokens.length === 2 && tokens.includes("female_toilet") && tokens.includes("male_toilet"))
    return [{ key: ROOM_LABEL.both }];
  return tokens.map((tok) => {
    const choice = TOKEN_TO_CHOICE[tok];
    return choice ? { key: ROOM_LABEL[choice] } : { raw: tok };
  });
}

// The play-place answer. There the table is news to OSM, so the yes travels
// with the room; a reader who tapped a room stood in front of one, which is
// `yes`, never `limited`. Same vocabulary, one more tag.
//
// "none" is the one choice roomPatch refuses: a play place with no table at
// all has no room to name, so the patch is changing_table alone. That also
// keeps "none" out of ROOMS and roomChoices — it is not a room a mother or
// father can vouch for, only an answer to "is there a table here" that a
// grey table pin (a table OSM already knows about) must never be able to
// give, which is why roomPatch itself still throws on it.
export function tablePatch(choice) {
  if (choice === "none") return { changing_table: "no" };
  return { changing_table: "yes", ...roomPatch(choice) };
}

// The second question a pin can ask: is there a play area for children? Three
// answers, and they are the theme's own mappings (theme/papamap.theme.json,
// "kids-area"), so the page and MapComplete write the same thing:
//
//   indoors      -> kids_area:indoor=yes plus kids_area=yes. The sub-key is
//                   the form the OSM wiki documents and the one the pipeline
//                   settles the question on; the parent tag rides along the
//                   way the theme's addExtraTags sends it, because
//                   `kids_area` alone is what most objects and most editors
//                   carry.
//   outdoors only-> kids_area=yes plus kids_area:indoor=no. A bakery with a
//                   garden playground and no corner inside: there *is* a play
//                   area, and saying so is not the same as saying there is
//                   none. The pair is the theme's third mapping verbatim.
//   none         -> kids_area=no, alone. The wiki reads that as "nowhere for
//                   children to play", which is now exactly what the reader
//                   was asked — the two-button question this replaces asked
//                   about the corner *indoors* and wrote the answer to the
//                   whole place (issue #119).
//
// All three are values `pipeline/classify.py` already reads: the first passes
// has_play_area and draws the blue ring at the next build, the other two do
// not and never will.
export const PLAY_CHOICES = ["play_yes", "play_outdoor", "play_no"];
export const isPlayChoice = (choice) => PLAY_CHOICES.includes(choice);

// Both keys of the question, in the order a confirmation names them. A play
// answer claims the pair, not just the keys its own patch happens to write:
// see guardKeys.
export const PLAY_KEYS = ["kids_area", "kids_area:indoor"];

export function playPatch(choice) {
  if (choice === "play_yes") return { "kids_area:indoor": "yes", kids_area: "yes" };
  if (choice === "play_outdoor") return { kids_area: "yes", "kids_area:indoor": "no" };
  if (choice === "play_no") return { kids_area: "no" };
  throw new Error(`unknown play choice ${choice}`);
}

// What the "taken" check below has to find empty before it writes. The patch's
// own keys, plus — for a play answer — the whole of PLAY_KEYS, because the two
// keys are one statement: a `kids_area:indoor=yes` tagged since last night's
// build is somebody's answer to this very question, and a "none" written over
// it would leave the object saying both things at once (issue #119). Derived
// from the patch rather than passed in, so no caller can forget it.
export function guardKeys(patch) {
  const keys = Object.keys(patch);
  return keys.some((k) => PLAY_KEYS.includes(k))
    ? [...new Set([...keys, ...PLAY_KEYS])]
    : keys;
}

export const CREATED_BY = "PapaMap";

// `host` is where the answer was given: the live site, or on the sandbox the
// dev server the page was served from — a sandbox changeset must not claim
// to have come from papamap.de.
export function changesetTags(comment, host = "https://papamap.de/") {
  return {
    created_by: CREATED_BY,
    comment,
    hashtags: "#papamap",
    host,
    source: "survey",
  };
}

// ---- OSM API 0.6 ----
// Attribute values, so the line breaks and tabs are escaped too: an XML
// parser normalises a literal newline in an attribute to a space (XML 1.0
// §3.3.3), and every object is written back whole — a two-line description
// somebody wrote on a toilet would come back as one line, in the reader's
// name, with nobody the wiser.
export const xmlEscape = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  .replace(/\n/g, "&#10;").replace(/\r/g, "&#13;").replace(/\t/g, "&#9;");

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
  // Every call bounded: a hung connection (one bar, a captive portal) must
  // fail the answer, not leave the buttons quiet and "Saving…" up for good.
  const bounded = () => AbortSignal.timeout?.(OSM_TIMEOUT_MS);

  const read = await fetchFn(`${cfg.api}/${ref.type}/${ref.id}.json`,
    { headers: auth, cache: "no-store", signal: bounded() });
  if (!read.ok) throw httpError(read.status, "read");
  const el = elementFromApi(await read.json());
  if (!el) throw httpError(read.status, "read");
  // The popup's gate saw a snapshot up to a day old. If somebody has answered
  // since — a room on the live object, a changing_table on the play place,
  // either kids_area key under a play answer — that answer is theirs, and this
  // tap does not write over it (CONTRACT.md v25). Reported as the conflict it
  // is, before any changeset is opened.
  if (guardKeys(patch).some((k) => el.tags[k])) throw httpError(409, "taken");

  const open = await fetchFn(`${cfg.api}/changeset/create`,
    { method: "PUT", headers: xml, body: changesetXml(changesetTags(comment, cfg.host ?? cfg.redirect)), signal: bounded() });
  if (!open.ok) throw httpError(open.status, "changeset");
  const changeset = (await open.text()).trim();

  const tags = { ...el.tags, ...patch };
  let put;
  try {
    put = await fetchFn(`${cfg.api}/${ref.type}/${ref.id}`,
      { method: "PUT", headers: xml, body: elementXml(el, tags, changeset), signal: bounded() });
  } finally {
    // Closed whatever happened, a dropped connection included: an open
    // changeset would otherwise sit on the reader's account for an hour,
    // and the next answer would open another.
    await fetchFn(`${cfg.api}/changeset/${changeset}/close`,
      { method: "PUT", headers: auth, signal: bounded() }).catch(() => null);
  }
  if (!put.ok) throw httpError(put.status, "write");
  return { version: Number(await put.text()), tags, changeset };
}
