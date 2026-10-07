// WCAG 1.4.3 and 1.4.4 on the map page, measured from the stylesheet itself:
// text against its fill reaches 4.5:1 in both colour schemes, the viewport
// lets a reader zoom, and no field is small enough for iOS to zoom on focus.
// Pins, dots, outlines and borders are left alone here — non-text UI needs
// only 3:1, and --green clears that.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUCKET_COLOR } from "./datasource.js";

const dir = new URL(".", import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), "utf8");
const css = read("style.css").replace(/\/\*[\s\S]*?\*\//g, "");

// The custom properties of a `:root { … }` body.
const props = (body) => Object.fromEntries(
  [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
const light = props(css.match(/(?:^|\n):root\s*\{([^}]*)\}/)[1]);
// Dark mode is the light tokens with whatever a dark :root overrides. The page
// has none today; the day one appears, every pair below is held to it too.
const darkRoot = [...css.matchAll(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/g)]
  .map((m) => props(m[1]));
const dark = Object.assign({}, light, ...darkRoot);
const SCHEMES = { light, dark };

const rgb = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  assert.match(full, /^[0-9a-f]{6}$/i, `not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
// Relative luminance and contrast ratio, as WCAG 2.x defines them.
const channel = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (a, b, t) => a.map((v, i) => v * t + b[i] * (1 - t));
const WHITE = [255, 255, 255];
const token = (scheme, name) => {
  const v = SCHEMES[scheme][name];
  assert.ok(v, `${name} is not defined for ${scheme}`);
  return rgb(v);
};

test("contrast() reproduces the published WCAG figures", () => {
  assert.equal(contrast([0, 0, 0], WHITE).toFixed(1), "21.0");
  // The values that started this: white on the Okabe-Ito pair fails.
  assert.ok(contrast(rgb("#009e73"), WHITE) < 4.5);
  assert.ok(contrast(rgb("#cc79a7"), WHITE) < 4.5);
});

for (const scheme of Object.keys(SCHEMES)) {
  test(`white text on every filled control reaches 4.5:1 (${scheme})`, () => {
    for (const fill of ["--green-strong", "--green-press", "--mama-strong"]) {
      const r = contrast(WHITE, token(scheme, fill));
      assert.ok(r >= 4.5, `white on ${fill} is ${r.toFixed(2)}:1`);
    }
  });

  test(`the popup's green room word reaches 4.5:1 on white (${scheme})`, () => {
    const color = css.match(/\.popup \.row\.wc\.ok b\s*\{[^}]*color:\s*var\((--[a-z-]+)\)/)[1];
    const r = contrast(token(scheme, color), WHITE);
    assert.ok(r >= 4.5, `.popup .row.wc.ok b (${color}) is ${r.toFixed(2)}:1`);
  });
}

test("the press state still differs from rest, and is the darker of the two", () => {
  assert.ok(luminance(token("light", "--green-press")) < luminance(token("light", "--green-strong")));
});

test("no rule puts white text on the light --green or --mama", () => {
  // The fills stay in the palette for pins and dots; a rule that sets one as a
  // background together with white text is the 3.4:1 button coming back.
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/(?:^|[;\s])color:\s*(?:#fff\b|#ffffff\b|white\b)/i.test(body)) continue;
    assert.doesNotMatch(body, /background(?:-color)?:\s*var\(--(?:green|mama)\)/,
      `${sel.trim()} has white text on a 3:1 fill`);
  }
  for (const sel of [".mode-btn.on", "#mode-mama.on"]) {
    const body = css.match(new RegExp(`(?:^|[\\n}])\\s*${sel.replace(/[.#]/g, "\\$&")}[^{]*\\{([^}]*)\\}`))[1];
    assert.match(body, /background:\s*var\(--(?:green|mama)-strong\)/, `${sel} is not on a strong fill`);
  }
});

test("the popup's primary pill outranks the plain pill rule", () => {
  // `:is(.popup, #venue-ask) .btn` carries the id's weight, so a plain
  // `.popup .btn.primary` lost its white label to the pill's dark grey.
  const pill = /:is\(\.popup, #venue-ask\) \.btn\s*\{[^}]*color:/;
  assert.match(css, pill);
  assert.match(css, /:is\(\.popup, #venue-ask\) \.btn\.primary\s*\{[^}]*color:\s*#fff/);
});

test("the chip counts reach 4.5:1 over every chip tint", () => {
  const opacity = Number(css.match(/\.chip \.cnt\s*\{[^}]*opacity:\s*([\d.]+)/)[1]);
  const ink = token("light", "--ink");
  // The chip colours as defined: the pin buckets, plus every `.chip.X { --chip: var(--Y) }`.
  const chips = new Map(Object.entries(BUCKET_COLOR).map(([k, hex]) => [`bucket ${k}`, rgb(hex)]));
  for (const [, cls, tok] of css.matchAll(/\.chip\.([a-z-]+)\s*\{\s*--chip:\s*var\((--[a-z-]+)\)/g))
    chips.set(`.chip.${cls} (${tok})`, token("light", tok));
  assert.ok(chips.has("bucket maybe") && [...chips.keys()].some((k) => k.includes("--ink")));
  // A switched-on chip is 14 % of its own colour over white (.chip.on).
  for (const [name, colour] of chips) {
    const bg = mix(colour, WHITE, 0.14);
    const r = contrast(mix(ink, bg, opacity), bg);
    assert.ok(r >= 4.5, `.chip .cnt at ${opacity} on ${name} is ${r.toFixed(2)}:1`);
  }
});

test("the page lets a reader zoom (WCAG 1.4.4), in both index pages", () => {
  for (const f of ["index.html", "index-en.html"]) {
    const vp = read(f).match(/<meta name="viewport" content="([^"]*)"/)[1];
    assert.doesNotMatch(vp, /maximum-scale|user-scalable/, `${f}: ${vp}`);
    assert.match(vp, /width=device-width/);
    assert.match(vp, /viewport-fit=cover/);
  }
});

test("no field is under 16px, so iOS does not zoom the page on focus", () => {
  // With zoom allowed, iOS Safari enlarges the page whenever a control with
  // smaller text takes focus. Every input and select in the shell, by the
  // rule that sizes it.
  const size = (sel) => {
    const esc = sel.replace(/[.#]/g, "\\$&");
    const sizes = [...css.matchAll(new RegExp(`(?:^|[\\n}])\\s*${esc}\\s*\\{([^}]*)\\}`, "g"))]
      .map((m) => (m[1].match(/font-size:\s*([\d.]+)px/) || [])[1]).filter(Boolean);
    assert.ok(sizes.length, `${sel} sets no font-size`);
    return Number(sizes.at(-1));
  };
  for (const sel of ["#search-input", "#venue-search", "select.lang-btn"])
    assert.ok(size(sel) >= 16, `${sel} is ${size(sel)}px`);
  // And nothing later shrinks a field again, inside a media query or not.
  // (A bare .lang-btn rule styles the button the select replaced; the select
  // rule above outranks it.)
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\b(?:input|select|textarea)\b|#search-input|#venue-search/.test(sel) || /\boption\b/.test(sel)) continue;
    const px = (body.match(/font-size:\s*([\d.]+)px/) || [])[1];
    if (px) assert.ok(Number(px) >= 16, `${sel.trim()} sets a field to ${px}px`);
  }
});
