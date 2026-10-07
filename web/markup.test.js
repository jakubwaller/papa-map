// The map page's markup and stylesheet, where a rule only holds if two files
// agree and nothing runs them together offline: accessible names against the
// strings that fill them, the safe-area insets against the controls on the
// screen edge, the preloads against the fetch that has to use them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STRINGS, LANGS, DEFAULT_LANG, langUrl } from "./i18n.js";

const dir = new URL(".", import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), "utf8");
const index = read("index.html");
const css = read("style.css");
const appJs = read("app.js");

const attrs = (tag) => Object.fromEntries(
  [...tag.matchAll(/\s([a-z0-9-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [k, v ?? ""]));
// Every opening tag of a kind, with its attributes, comments cut first.
const tags = (html, name) =>
  [...html.replace(/<!--[\s\S]*?-->/g, "").matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))]
    .map(([t]) => attrs(t));
// The declarations of every rule whose selector is exactly `sel`, in order.
const rules = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\#]/g, "\\$&");
  return [...css.matchAll(new RegExp(`(?:^|[\\n}])\\s*${esc}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]);
};
const decl = (body, prop) => (body.match(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+)`)) || [])[1]?.trim();
const px = (v) => Number((v.match(/^(\d+(?:\.\d+)?)px$/) || [])[1]);

test("a control with words on it is named by them, in every language (WCAG 2.5.3)", () => {
  // Voice Control finds a button by what it says. An aria-label replaces the
  // visible text as the name, so it has to contain that text — or not be
  // there, which is what a control with words on it does: its explanation is
  // the description (data-i18n-desc) instead.
  const visible = (s) => s.replace("☕", "").trim();
  let checked = 0;
  for (const name of ["button", "a"])
    for (const a of tags(index, name)) {
      if (!("data-i18n" in a)) continue;
      checked++;
      for (const lang of LANGS) {
        const text = visible(STRINGS[lang][a["data-i18n"]]).toLocaleLowerCase(lang);
        if ("data-i18n-aria" in a) {
          const label = STRINGS[lang][a["data-i18n-aria"]].toLocaleLowerCase(lang);
          assert.ok(label.includes(text), `${lang} ${a["data-i18n"]}: "${label}" lacks "${text}"`);
        } else {
          assert.ok(!("aria-label" in a), `${a["data-i18n"]}: a static aria-label nobody translates`);
        }
        if ("data-i18n-desc" in a)
          assert.ok(STRINGS[lang][a["data-i18n-desc"]]?.trim(), `${lang}: no ${a["data-i18n-desc"]}`);
      }
    }
  assert.ok(checked >= 5, `only ${checked} labelled controls found`);
  // The five that used to fail, by key.
  for (const key of ["ariaNearest", "ariaApp", "ariaKofi", "ariaModePapa", "ariaModeMama"])
    assert.ok(index.includes(`data-i18n-desc="${key}"`), key);
  // And applyI18n is what turns the attribute into a description.
  assert.match(appJs, /querySelectorAll\("\[data-i18n-desc\]"\)/);
  assert.match(appJs, /setAttribute\("aria-describedby"/);
});

test("every dialog is named by a heading inside it", () => {
  const dialogs = tags(index, "dialog");
  assert.ok(dialogs.length >= 5);
  for (const d of dialogs) {
    const by = d["aria-labelledby"];
    assert.ok(by, `#${d.id} has no aria-labelledby`);
    const body = index.slice(index.indexOf(`<dialog id="${d.id}"`), index.indexOf("</dialog>", index.indexOf(`<dialog id="${d.id}"`)));
    assert.match(body, new RegExp(`<h3 id="${by}"`), `#${d.id}: ${by} is not its own heading`);
  }
});

test("the controls on a side edge keep clear of a landscape notch", () => {
  // viewport-fit=cover (and the app's contentInset "never") hands the side
  // edges to the page; on a notched iPhone in landscape the inset is ~59px.
  assert.match(index, /viewport-fit=cover/);
  assert.ok(css.includes("--safe-left: env(safe-area-inset-left, 0px)"));
  assert.ok(css.includes("--safe-right: env(safe-area-inset-right, 0px)"));
  const uses = (sel, prop, inset) => {
    const v = decl(rules(sel)[0], prop);
    assert.ok(v?.includes(`var(--safe-${inset})`), `${sel} ${prop}: ${v}`);
  };
  uses("#search", "left", "left");
  uses("#search", "right", "right");
  uses("#zoom-ctrl", "right", "right");
  uses("#room-card", "left", "left");
  uses("#room-card", "right", "right");
  uses("#attribution", "right", "right");
  // The strips keep their background edge to edge and pad their content.
  for (const sel of ["header", "#stats", ".chip-bar"]) {
    const v = decl(rules(sel)[0], "padding");
    assert.ok(v.includes("var(--safe-left)") && v.includes("var(--safe-right)"), `${sel}: ${v}`);
  }
  assert.equal(decl(rules("#topbar")[0], "padding-left"), undefined);
});

test("the popup's star is a 24px target held clear of the ×", () => {
  // WCAG 2.5.8: an 18px star 4px from MapLibre's close button took the taps
  // meant for it.
  const star = rules(".popup .star-btn")[0];
  assert.ok(px(decl(star, "width")) >= 24 && px(decl(star, "height")) >= 24, star);
  const pads = rules(".popup h3").map((b) => decl(b, "padding-right")).filter(Boolean);
  assert.ok(px(pads.at(-1)) >= 24, `h3 padding-right ${pads.at(-1)}`);
});

test("the dataset preloads are exactly what boot() fetches first", () => {
  // A preload the fetch does not match is a second download, not a head start.
  const preloads = tags(index, "link").filter((l) => l.rel === "preload");
  const boot = appJs.match(/await loadDataset\(\[([^\]]*)\]\)/)[1];
  const urls = [...boot.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(preloads.map((l) => l.href), urls.slice(0, 2));
  for (const l of preloads) {
    assert.equal(l.as, "fetch");
    // crossorigin (anonymous) is fetch()'s own cors + same-origin credentials.
    assert.equal(l.crossorigin, "");
  }
  // And loadJSON's fetch takes no options that would change mode or credentials.
  assert.match(appJs, /async function loadJSON\(url\) \{\n  try \{\n    const r = await fetch\(url\);/);
});

test("the website's logo reloads the map in the language on screen", () => {
  assert.equal(langUrl(DEFAULT_LANG, "./"), "./");
  assert.equal(langUrl("fr", "./"), "./?lang=fr");
  assert.match(appJs, /brand\?\.hasAttribute\("href"\)\) brand\.setAttribute\("href", langUrl\(lang, "\.\/"\)\)/);
});

test("no style.css rule takes a chip's label out of the accessibility tree", () => {
  // The chip's svg is aria-hidden, so its .label is its name. On a phone the
  // word may be hidden visually (clip), never with display:none/visibility:hidden.
  const bad = [];
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/display\s*:\s*none|visibility\s*:\s*hidden/.test(body)) continue;
    for (const s of sel.split(",").map((x) => x.trim()))
      if (/\.chip\b/.test(s) && /\.label\b/.test(s)) bad.push(s);
  }
  assert.deepEqual(bad, []);
});
