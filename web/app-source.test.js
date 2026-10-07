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

// A redraw that is really needed must not take the focus from the search
// field either: MapLibre focuses the card's first button inside setHTML
// (options.focusAfterOpen), the field blurs and its list closes, and iOS does
// not bring the keyboard back from a later focus(). So the option is off for
// the redraw when the focus sits outside the card, and back on afterwards.
// The function is lifted out of the source and run against stand-ins.
function loadShowPopupHTML(env) {
  const m = src.match(/function showPopupHTML\(html\) \{[\s\S]*?\n\}\n/);
  assert.ok(m, "showPopupHTML in app.js");
  return new Function("env", `
    let popup = env.popup, popupHtmlShown = env.shown; const document = env.document;
    ${m[0]}
    return { show: showPopupHTML, shown: () => popupHtmlShown };`)(env);
}
function fakePopup(document, cardFocus) {
  const card = { contains: (n) => n === cardFocus };
  const popup = {
    options: { focusAfterOpen: true },
    seen: [],
    getElement: () => card,
    setHTML() {
      popup.seen.push(popup.options.focusAfterOpen);
      // what MapLibre's _focusFirstElement does
      if (popup.options.focusAfterOpen) document.activeElement = cardFocus;
    },
  };
  return popup;
}
test("showPopupHTML keeps MapLibre from taking the focus off the search field", () => {
  const field = { isConnected: true, focus() { throw new Error("must not need a restore"); } };
  const button = {};
  const document = { body: {}, activeElement: field };
  const popup = fakePopup(document, button);
  const { show, shown } = loadShowPopupHTML({ popup, document, shown: "old" });
  assert.equal(show("new"), true);
  assert.deepEqual(popup.seen, [false]);           // off during the redraw
  assert.equal(popup.options.focusAfterOpen, true); // and back on after it
  assert.equal(document.activeElement, field);
  assert.equal(shown(), "new");
  assert.equal(show("new"), false);                // unchanged markup: no redraw
  assert.equal(popup.seen.length, 1);
});
test("showPopupHTML lets the card take the focus when nothing else holds it", () => {
  const button = {};
  const document = { body: {}, activeElement: null };
  const popup = fakePopup(document, button);
  const { show } = loadShowPopupHTML({ popup, document, shown: null });
  show("first");
  assert.deepEqual(popup.seen, [true]);
  assert.equal(document.activeElement, button);
});
test("showPopupHTML restores the option even when setHTML throws", () => {
  const field = { isConnected: true, focus() {} };
  const document = { body: {}, activeElement: field };
  const popup = fakePopup(document, {});
  popup.setHTML = () => { throw new Error("boom"); };
  const { show } = loadShowPopupHTML({ popup, document, shown: null });
  assert.throws(() => show("x"), /boom/);
  assert.equal(popup.options.focusAfterOpen, true);
});
