// app.js needs a DOM and MapLibre, so it is not imported here; these pin a
// few things about its source that broke the page before and that a reader
// would only ever see on the one browser that triggers them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STRINGS, LANGS } from "./i18n.js";

const src = readFileSync(new URL("app.js", import.meta.url), "utf8");
const lines = src.split("\n");

// A browser set to block site data throws on merely touching localStorage.
// At module top level that stopped the map from starting at all; in a
// handler it left the change half-done. Every access sits in a try: on its
// own line, or in a try block opened at most four lines above.
test("every localStorage access in app.js is inside a try", () => {
  const bare = [];
  lines.forEach((line, i) => {
    if (!/\blocalStorage\.(getItem|setItem|removeItem)\(/.test(line)) return;
    const window = lines.slice(Math.max(0, i - 4), i + 1).join("\n");
    if (!/\btry\b/.test(window)) bare.push(`${i + 1}: ${line.trim()}`);
  });
  assert.deepEqual(bare, []);
});

// statsMissing is our own markup in every language (a <code> and the
// methods link), rendered unescaped by renderStats. Escaped, the "Mein
// PapaMap" dialog printed the tags as text and lost the link.
test("statsMissing is HTML in every language and never escaped at a call site", () => {
  for (const l of LANGS) assert.ok(STRINGS[l].statsMissing.includes('<a href="{href}">'), l);
  assert.ok(src.includes('t("statsMissing"'));
  assert.doesNotMatch(src, /esc\(\s*t\(\s*"statsMissing"/);
});

// A re-merge while an answer is on its way (the answer's own recolour, or a
// delta poll) redraws the card with fresh, disabled buttons, so the buttons
// answer() quieted are no longer the ones on screen. They come back on the
// live card once the object has left inFlight, or the play and high-chair
// questions under a room answer stay dead until the pin is reopened.
test("answer() gives the live card its buttons back after the write", () => {
  const fin = src.match(/\} finally \{\n\s+inFlight\.delete\(obj\.osm_url\);([\s\S]*?)\n  \}\n\}/);
  assert.ok(fin, "answer()'s finally block");
  assert.match(fin[1], /popup\?\.getElement\(\)\?\.querySelectorAll\("button\.ask-btn, button\.ask-more"\)/);
  assert.match(fin[1], /disabled = false/);
});
