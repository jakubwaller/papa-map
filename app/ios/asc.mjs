// The App Store Connect API, as far as signing on a runner needs it. No Xcode
// account, no fastlane, no dependency: Node's own crypto signs the token and
// fetch does the rest. Called by .github/workflows/app-build.yml.
//
//   node ios/asc.mjs ids                  register the two bundle ids, App Groups on
//   node ios/asc.mjs cert <csr> <out.cer> one distribution certificate from a CSR (once a year)
//   node ios/asc.mjs profiles <dir>       fresh App Store profiles for both bundle ids
//
// Reads ASC_ISSUER_ID, ASC_KEY_ID and ASC_API_KEY_P8 (the key's text) from the
// environment — the repository secrets of the same names.
//
// What the API cannot do, and nobody can script with a key: create the App
// Group `group.de.papamap.app` and tick it on both App IDs. That is a one-time
// visit to developer.apple.com (Identifiers); `profiles` says so when it is missing
// from the profile it was handed.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.appstoreconnect.apple.com/v1";

export const BUNDLE_IDS = [
  { identifier: "de.papamap.app", name: "PapaMap" },
  { identifier: "de.papamap.app.widget", name: "PapaMap Widget" },
];
// The name the Xcode project's Release configuration asks for
// (PROVISIONING_PROFILE_SPECIFIER) and the export options repeat.
export const profileName = (identifier) => `PapaMap CI ${identifier}`;

const b64url = (buf) => Buffer.from(buf).toString("base64url");

// ES256 over header.payload, raw r||s (ieee-p1363) as JWS wants it, not DER.
// Apple caps the lifetime at 20 minutes; ten is plenty for one command.
export function token({ issuer, keyId, p8 }, now = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: issuer, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`),
                   { key: createPrivateKey(p8), dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(sig)}`;
}

function credentials() {
  const { ASC_ISSUER_ID: issuer, ASC_KEY_ID: keyId, ASC_API_KEY_P8: p8 } = process.env;
  if (!issuer || !keyId || !p8) throw new Error("ASC_ISSUER_ID, ASC_KEY_ID and ASC_API_KEY_P8 must be set");
  return { issuer, keyId, p8 };
}

let bearer;
async function api(method, path, body) {
  bearer ??= token(credentials());
  const r = await fetch(path.startsWith("http") ? path : API + path, {
    method,
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  const json = await r.json().catch(() => null);
  if (!r.ok) {
    const why = (json?.errors ?? []).map((e) => `${e.code}: ${e.detail}`).join("; ");
    throw new Error(`${method} ${path} → ${r.status} ${why}`);
  }
  return json;
}

// filter[identifier] is a prefix match (de.papamap.app also answers the
// widget), so the exact one is picked here.
async function bundleId(identifier) {
  const r = await api("GET", `/bundleIds?filter[identifier]=${identifier}&filter[platform]=IOS&include=bundleIdCapabilities&limit=200`);
  const hit = r.data.find((b) => b.attributes.identifier === identifier);
  if (!hit) return null;
  const caps = (r.included ?? [])
    .filter((c) => hit.relationships.bundleIdCapabilities.data.some((d) => d.id === c.id))
    .map((c) => c.attributes.capabilityType);
  return { id: hit.id, caps };
}

async function ids() {
  for (const { identifier, name } of BUNDLE_IDS) {
    let b = await bundleId(identifier);
    if (!b) {
      const made = await api("POST", "/bundleIds", {
        data: { type: "bundleIds", attributes: { identifier, name, platform: "IOS" } },
      });
      b = { id: made.data.id, caps: [] };
      console.log(`${identifier}: registered`);
    } else {
      console.log(`${identifier}: already registered`);
    }
    if (!b.caps.includes("APP_GROUPS")) {
      await api("POST", "/bundleIdCapabilities", {
        data: {
          type: "bundleIdCapabilities",
          attributes: { capabilityType: "APP_GROUPS" },
          relationships: { bundleId: { data: { type: "bundleIds", id: b.id } } },
        },
      });
      console.log(`${identifier}: App Groups switched on`);
    }
  }
}

// Idempotent on purpose: a second distribution certificate would be signed for
// the same CSR and buy nothing, and the account only holds a handful. One that
// is already there and is NOT the runner's (made in Xcode, say) has to be
// revoked by hand before this makes a new one — the private key decides.
async function cert(csrPath, outPath) {
  const have = (await api("GET", "/certificates?filter[certificateType]=DISTRIBUTION&limit=200")).data;
  if (have.length) {
    for (const c of have) console.log(`certificate ${c.attributes.serialNumber} exists, expires ${c.attributes.expirationDate} — nothing made`);
    return;
  }
  const made = await api("POST", "/certificates", {
    data: {
      type: "certificates",
      attributes: { certificateType: "DISTRIBUTION", csrContent: readFileSync(csrPath, "utf8") },
    },
  });
  const a = made.data.attributes;
  writeFileSync(outPath, Buffer.from(a.certificateContent, "base64"));
  console.log(`certificate ${a.serialNumber}, expires ${a.expirationDate} → ${outPath}`);
}

// A profile is a snapshot of its App ID: one made before the App Group was
// ticked never learns of it and the archive fails on the entitlement. So the
// profiles are not kept — every build deletes the pair and asks for a new one,
// which costs two requests and no mail to anybody.
async function profiles(dir) {
  mkdirSync(dir, { recursive: true });
  const certs = (await api("GET", "/certificates?filter[certificateType]=DISTRIBUTION&limit=200")).data;
  if (!certs.length) throw new Error("no distribution certificate on the account — run `cert` first");
  for (const { identifier } of BUNDLE_IDS) {
    const b = await bundleId(identifier);
    if (!b) throw new Error(`${identifier} is not registered — run \`ids\` first`);
    const name = profileName(identifier);
    const old = await api("GET", `/profiles?filter[name]=${encodeURIComponent(name)}&limit=200`);
    for (const p of old.data.filter((p) => p.attributes.name === name)) await api("DELETE", `/profiles/${p.id}`);
    const made = await api("POST", "/profiles", {
      data: {
        type: "profiles",
        attributes: { name, profileType: "IOS_APP_STORE" },
        relationships: {
          bundleId: { data: { type: "bundleIds", id: b.id } },
          certificates: { data: certs.map((c) => ({ type: "certificates", id: c.id })) },
        },
      },
    });
    const a = made.data.attributes;
    const file = join(dir, `${a.uuid}.mobileprovision`);
    const content = Buffer.from(a.profileContent, "base64");
    writeFileSync(file, content);
    // The profile is a CMS envelope around a plain-text plist, so the one
    // thing worth checking before an eight-minute archive can be read off it.
    if (!content.toString("latin1").includes("group.de.papamap.app")) {
      throw new Error(`${name} carries no App Group: create group.de.papamap.app on developer.apple.com ` +
                      `(Identifiers → App Groups) and tick it on ${identifier} (App Groups → Configure)`);
    }
    console.log(`${name} → ${file}`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [cmd, ...args] = process.argv.slice(2);
  const run = { ids, cert, profiles }[cmd];
  if (!run || (cmd === "cert" && args.length !== 2) || (cmd === "profiles" && args.length !== 1)) {
    console.error("usage: asc.mjs ids | cert <csr> <out.cer> | profiles <dir>");
    process.exit(2);
  }
  run(...args).catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
