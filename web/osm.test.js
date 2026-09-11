import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE, SANDBOX, endpoints, authorizeUrl, pkceChallenge, randomToken,
         finishLogin, ROOMS, roomChoices, roomPatch, changesetTags, changesetXml,
         elementFromApi, elementXml, xmlEscape, writeTags, CREATED_BY } from "./osm.js";

// ---- Which OSM ----

test("only papamap.de talks to the live API; every other host gets the sandbox", () => {
  assert.equal(endpoints({ hostname: "papamap.de", origin: "https://papamap.de" }), LIVE);
  for (const loc of [{ hostname: "127.0.0.1", origin: "http://127.0.0.1:8899" },
                     { hostname: "localhost", origin: "http://localhost:8000" },
                     { hostname: "papamap.de.evil.example", origin: "https://papamap.de.evil.example" }]) {
    const cfg = endpoints(loc);
    assert.equal(cfg.api, SANDBOX.api, loc.hostname);
    assert.equal(cfg.clientId, SANDBOX.clientId);
    // The sandbox redirect is the page's own origin: registered as
    // http://127.0.0.1:8000/ and :8899/, and OSM compares it byte for byte.
    assert.equal(cfg.redirect, `${loc.origin}/`);
  }
  // The live redirect is the registered one, not derived — a page at
  // https://papamap.de/?lang=en must still send https://papamap.de/.
  assert.equal(LIVE.redirect, "https://papamap.de/");
});

// ---- PKCE ----

test("the challenge is base64url(sha256(verifier)) — RFC 7636's own example", async () => {
  // Appendix B of RFC 7636.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(await pkceChallenge(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("random tokens are url-safe and different each time", () => {
  const a = randomToken(), b = randomToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.ok(a.length >= 43, "a 32-byte verifier is at least 43 characters, as RFC 7636 requires");
});

test("the authorize URL carries S256, the scopes, the state and no secret", () => {
  const url = new URL(authorizeUrl(LIVE, { state: "st", challenge: "ch" }));
  assert.equal(url.origin + url.pathname, "https://www.openstreetmap.org/oauth2/authorize");
  const p = url.searchParams;
  assert.equal(p.get("response_type"), "code");
  assert.equal(p.get("client_id"), LIVE.clientId);
  assert.equal(p.get("redirect_uri"), "https://papamap.de/");
  assert.equal(p.get("scope"), "read_prefs write_api");
  assert.equal(p.get("code_challenge_method"), "S256");
  assert.equal(p.get("code_challenge"), "ch");
  assert.equal(p.get("state"), "st");
  assert.ok(!url.href.includes("secret"));
});

// A tiny sessionStorage for the return leg.
function fakeSession(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v),
           removeItem: (k) => m.delete(k) };
}

test("finishLogin: not a return, a refusal, a foreign code, and the exchange", async () => {
  globalThis.sessionStorage = fakeSession();
  assert.equal(await finishLogin(LIVE, "https://papamap.de/?lang=en"), null);
  assert.deepEqual(await finishLogin(LIVE, "https://papamap.de/?error=access_denied"), { denied: true });
  // A code whose state is not the one this browser started must never be
  // exchanged — it is someone else's login, pasted or replayed.
  globalThis.sessionStorage = fakeSession({ "papamap-osm-pkce": JSON.stringify({ verifier: "v", state: "mine" }) });
  await assert.rejects(finishLogin(LIVE, "https://papamap.de/?code=c&state=theirs"), /state/);
  // The real exchange: form-encoded, verifier in the body, token out.
  globalThis.sessionStorage = fakeSession({ "papamap-osm-pkce": JSON.stringify({ verifier: "v", state: "mine" }) });
  let seen = null;
  const fetchFn = async (url, init) => {
    seen = { url, init, body: new URLSearchParams(init.body) };
    return { ok: true, status: 200, json: async () => ({ access_token: "tok", token_type: "Bearer" }) };
  };
  assert.deepEqual(await finishLogin(LIVE, "https://papamap.de/?code=c&state=mine", fetchFn), { token: "tok" });
  assert.equal(seen.url, "https://www.openstreetmap.org/oauth2/token");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.body.get("grant_type"), "authorization_code");
  assert.equal(seen.body.get("code"), "c");
  assert.equal(seen.body.get("code_verifier"), "v");
  assert.equal(seen.body.get("client_id"), LIVE.clientId);
  assert.equal(seen.body.get("client_secret"), null, "a public client sends no secret");
  // The PKCE record is single-use.
  assert.equal(globalThis.sessionStorage.getItem("papamap-osm-pkce"), null);
});

// ---- The answer ----

test("room values are the theme's vocabulary, which is what classify.py reads", () => {
  // Every value here must be a token classify.py knows, or the answer would
  // paint the pin grey again tomorrow night.
  const known = new Set(["male_toilet", "unisex_toilet", "dedicated_room", "female_toilet"]);
  for (const v of Object.values(ROOMS))
    for (const tok of v.split(";")) assert.ok(known.has(tok), tok);
  assert.equal(ROOMS.both, "female_toilet;male_toilet");
});

test("a mother is not asked about the men's room; a father gets every answer", () => {
  assert.deepEqual(roomChoices("mama"), ["female", "unisex", "dedicated"]);
  assert.ok(!roomChoices("mama").includes("male") && !roomChoices("mama").includes("both"));
  assert.deepEqual(roomChoices("papa"), ["both", "male", "female", "unisex", "dedicated"]);
  assert.deepEqual(roomChoices("nonsense"), roomChoices("papa"));
  for (const m of ["papa", "mama"]) for (const c of roomChoices(m)) assert.ok(c in ROOMS, c);
});

test("the patch touches only the room — limited is never promoted to yes", () => {
  assert.deepEqual(roomPatch("female"), { "changing_table:location": "female_toilet" });
  assert.ok(!("changing_table" in roomPatch("both")));
  assert.throws(() => roomPatch("garden"));
});

test("changeset tags name the tool, the hashtag and the host", () => {
  const tags = changesetTags("A room answered");
  assert.equal(tags.created_by, CREATED_BY);
  assert.equal(tags.hashtags, "#papamap");
  assert.equal(tags.host, "https://papamap.de/");
  assert.equal(tags.comment, "A room answered");
});

// ---- XML ----

test("xml escaping covers the four characters a tag value can carry", () => {
  assert.equal(xmlEscape(`Café "A&B" <Nord>`), "Café &quot;A&amp;B&quot; &lt;Nord&gt;");
  assert.equal(changesetXml({ comment: "a & b" }),
    '<osm><changeset><tag k="comment" v="a &amp; b"/></changeset></osm>');
});

test("elementFromApi keeps what a write-back needs, and rejects the rest", () => {
  assert.deepEqual(elementFromApi({ elements: [{ type: "node", id: 1, version: 3, lat: 53.5, lon: 9.9, tags: { a: "b" } }] }),
    { type: "node", id: 1, version: 3, tags: { a: "b" }, lat: 53.5, lon: 9.9, nodes: [], members: [] });
  assert.equal(elementFromApi({ elements: [{ type: "node", id: 1 }] }), null, "no version");
  assert.equal(elementFromApi({ elements: [{ type: "area", id: 1, version: 1 }] }), null);
  assert.equal(elementFromApi({}), null);
  assert.equal(elementFromApi(null), null);
});

test("a way is written back with its nodes and a relation with its members", () => {
  // Writing a way without its <nd> list is how an editor deletes a
  // building's outline by accident; the API accepts it.
  const way = { type: "way", id: 7, version: 2, tags: {}, nodes: [1, 2, 3], members: [] };
  assert.equal(elementXml(way, { amenity: "cafe" }, "99"),
    '<osm><way id="7" version="2" changeset="99"><nd ref="1"/><nd ref="2"/><nd ref="3"/><tag k="amenity" v="cafe"/></way></osm>');
  const rel = { type: "relation", id: 8, version: 1, tags: {}, nodes: [],
                members: [{ type: "way", ref: 7, role: "outer" }, { type: "node", ref: 1 }] };
  assert.equal(elementXml(rel, {}, "99"),
    '<osm><relation id="8" version="1" changeset="99"><member type="way" ref="7" role="outer"/><member type="node" ref="1" role=""/></relation></osm>');
  const node = { type: "node", id: 1, version: 3, tags: {}, lat: 53.5, lon: 9.9, nodes: [], members: [] };
  assert.equal(elementXml(node, { changing_table: "yes" }, "5"),
    '<osm><node id="1" version="3" changeset="5" lat="53.5" lon="9.9"><tag k="changing_table" v="yes"/></node></osm>');
});

// ---- The write, end to end against a scripted API ----

function scriptedApi(script) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body, headers: init.headers });
    const step = script.shift();
    if (!step) throw new Error(`unexpected call ${url}`);
    return { ok: step.status < 300, status: step.status,
             text: async () => step.text ?? "", json: async () => step.json };
  };
  return { fetchFn, calls };
}

test("writeTags: read, open, write with the patch on top of the existing tags, close", async () => {
  const { fetchFn, calls } = scriptedApi([
    { status: 200, json: { elements: [{ type: "node", id: 42, version: 5, lat: 53.5, lon: 9.9,
                                        tags: { amenity: "cafe", changing_table: "limited", name: "Herzstück" } }] } },
    { status: 200, text: "1234" },      // changeset id
    { status: 200, text: "6" },         // new version
    { status: 200 },                    // close
  ]);
  const out = await writeTags(SANDBOX, "tok", { type: "node", id: "42" }, roomPatch("female"), "room", fetchFn);
  assert.deepEqual(out, { version: 6, changeset: "1234",
    tags: { amenity: "cafe", changing_table: "limited", name: "Herzstück", "changing_table:location": "female_toilet" } });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url.replace(SANDBOX.api, "")}`),
    ["GET /node/42.json", "PUT /changeset/create", "PUT /node/42", "PUT /changeset/1234/close"]);
  for (const c of calls) assert.equal(c.headers.Authorization, "Bearer tok");
  // "limited" survived, the name survived, and the changeset names the tool.
  assert.ok(calls[2].body.includes('<tag k="changing_table" v="limited"/>'));
  assert.ok(calls[2].body.includes('version="5" changeset="1234"'));
  assert.ok(calls[1].body.includes(`<tag k="created_by" v="${CREATED_BY}"/>`));
});

test("writeTags: a conflict closes the changeset and surfaces the 409", async () => {
  const { fetchFn, calls } = scriptedApi([
    { status: 200, json: { elements: [{ type: "node", id: 42, version: 5, lat: 1, lon: 2, tags: {} }] } },
    { status: 200, text: "77" },
    { status: 409, text: "Version mismatch" },
    { status: 200 },
  ]);
  await assert.rejects(writeTags(SANDBOX, "tok", { type: "node", id: "42" }, roomPatch("both"), "c", fetchFn),
    (e) => e.status === 409 && e.step === "write");
  assert.equal(calls.at(-1).url, `${SANDBOX.api}/changeset/77/close`, "the changeset is closed even on failure");
});

test("writeTags: a dead token stops at the first read with a 401", async () => {
  const { fetchFn, calls } = scriptedApi([{ status: 401 }]);
  await assert.rejects(writeTags(SANDBOX, "old", { type: "way", id: "1" }, roomPatch("male"), "c", fetchFn),
    (e) => e.status === 401);
  assert.equal(calls.length, 1, "nothing is opened on OSM without a valid token");
});
