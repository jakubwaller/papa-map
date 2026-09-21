import { test } from "node:test";
import assert from "node:assert/strict";
import { signPinKind, signPinInk, signPinSvg, SIGN_PIN_VIEWBOX, SIGN_PIN_ASPECT,
         SIGN_PIN_KINDS } from "./sign-pin.js";
import { STATUSES, MODES, viewFor, BUCKET_COLOR } from "./datasource.js";

// Pictogram by status, colour by bucket (docs/FEATURES.md, CONTRACT.md v44):
// the picture never changes with the reading except for "unknown", which is
// the one status whose picture follows it too.
test("signPinKind: accessible is the dad, female_only the woman, in both readings", () => {
  for (const mode of MODES) {
    assert.equal(signPinKind("accessible", mode), "dad");
    assert.equal(signPinKind("female_only", mode), "woman");
  }
});

test("signPinKind: unknown follows the reading", () => {
  assert.equal(signPinKind("unknown", "papa"), "ask");
  assert.equal(signPinKind("unknown", "mama"), "woman-ask");
});

test("signPinKind: every real status, in both readings, resolves to a real kind", () => {
  for (const status of STATUSES) {
    for (const mode of MODES) {
      assert.ok(SIGN_PIN_KINDS.includes(signPinKind(status, mode)),
        `${status}/${mode} -> unknown kind`);
    }
  }
});

// White everywhere except the amber "maybe" bucket (mama's unknown), where
// white fails contrast (#e69f00 is 1.9:1) and the ink goes dark instead.
test("signPinInk: dark only on the amber bucket, white on every other", () => {
  assert.equal(signPinInk("maybe"), "#1c2b26");
  for (const bucket of ["good", "bad", "ask"]) assert.equal(signPinInk(bucket), "#ffffff");
});

test("signPinSvg: well-formed SVG carrying the requested colour and ink", () => {
  const svg = signPinSvg("dad", "#009e73", "#ffffff");
  assert.match(svg, /^<svg[^>]*>/);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /viewBox="[^"]+"/);
  assert.equal([...svg.matchAll(/<svg/g)].length, 1);
  assert.ok(svg.includes("#009e73"), "the pin's own fill colour is missing");
  assert.ok(svg.includes("#ffffff"), "the ink colour is missing");
});

test("signPinSvg: an unknown kind falls back rather than drawing nothing", () => {
  const fallback = signPinSvg("ask", "#3d4247", "#ffffff");
  const unknown = signPinSvg("not-a-real-kind", "#3d4247", "#ffffff");
  assert.equal(unknown, fallback);
});

test("signPinSvg: every documented kind renders, and no two kinds draw the same picture", () => {
  for (const kind of SIGN_PIN_KINDS) {
    const svg = signPinSvg(kind, "#009e73", "#ffffff");
    assert.match(svg, /^<svg[^>]*>[\s\S]+<\/svg>$/, `${kind} did not render`);
  }
  // Guards against two kinds silently sharing one FIGURES entry (a typo in
  // sign-pin.js's own table, not something the shape assertion above catches).
  const drawn = new Set(SIGN_PIN_KINDS.map((k) => signPinSvg(k, "#000", "#fff")));
  assert.equal(drawn.size, SIGN_PIN_KINDS.length, "two kinds rendered identically");
});

test("signPinSvg respects the requested colour/ink independently of kind", () => {
  for (const kind of SIGN_PIN_KINDS) {
    const svg = signPinSvg(kind, "#e69f00", "#1c2b26");
    assert.ok(svg.includes("#e69f00"), `${kind}: fill colour missing`);
    assert.ok(svg.includes("#1c2b26"), `${kind}: ink missing`);
  }
});

// The geometry app.js sizes its marker element from.
test("SIGN_PIN_ASPECT matches the declared viewBox", () => {
  const [, , w, h] = SIGN_PIN_VIEWBOX.split(/\s+/).map(Number);
  assert.ok(w > 0 && h > 0);
  assert.ok(Math.abs(SIGN_PIN_ASPECT - h / w) < 1e-6);
});

// The rule the marker's colour is built from (web/app.js's paintSignMarker):
// BUCKET_COLOR[viewFor(status, mode).bucket]. Exercised here as a sanity
// check that the two modules agree on the same three statuses.
test("every status/mode pair used for a marker has a real bucket colour", () => {
  for (const status of STATUSES) {
    for (const mode of MODES) {
      const view = viewFor(status, mode);
      assert.ok(BUCKET_COLOR[view.bucket], `${status}/${mode} has no bucket colour`);
    }
  }
});
