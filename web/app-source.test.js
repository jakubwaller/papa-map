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
  assert.match(fin[1], /\bwake\(\);/);
  // wake() queries the card afresh (the one the answer was given on if it is
  // still up, else this object's reopened card, never another pin's).
  const wake = src.match(/const wake = \(\) => ([\s\S]*?);\n/);
  assert.ok(wake, "answer()'s wake helper");
  assert.match(wake[1], /here\(\)\?\.querySelectorAll\("button\.ask-btn, button\.ask-more"\)/);
  assert.match(wake[1], /disabled = false/);
  assert.match(src, /const here = \(\) => \(el\?\.isConnected \? el\n\s+: popupObj\?\.obj\?\.osm_url === obj\.osm_url/);
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

// A chip's visible words are its accessible name (WCAG 2.5.3): an aria-label
// replaced "Mit Spielecke 12" with a sentence, so Voice Control's "Tap Mit
// Spielecke" matched nothing. The explanation is the description instead.
test("the filter chips are named by their text and described by describeBy", () => {
  for (const name of ["blueChip", "highchairChip", "wheelchairChip"]) {
    const start = src.indexOf(`function ${name}(`);
    assert.ok(start > 0, name);
    const body = src.slice(start, src.indexOf("\n}\n", start));
    assert.ok(!/aria-label/.test(body), `${name} sets an aria-label`);
    assert.ok(/describeBy\(b, /.test(body), `${name} does not describe itself`);
  }
  // Nor may the code that wraps or places them name them over again.
  for (const name of ["playChip", "placesChip", "placesHcChip", "renderChips"]) {
    const start = src.indexOf(`function ${name}(`);
    assert.ok(start > 0, name);
    const body = src.slice(start, src.indexOf("\n}\n", start));
    assert.ok(!/aria-label/.test(body), `${name} sets an aria-label`);
  }
});

// popupHTML and placeHTML build HTML from text any OSM mapper can type (name,
// operator, fee, amenity …). app.js cannot be imported, so this reads their
// source: every ${…} must be esc(…) or one of the helpers/locals below that
// already return markup or hold escaped strings. A new interpolation fails
// here until it is escaped or deliberately added to the list.
test("popupHTML and placeHTML interpolate only escaped text or known markup", () => {
  const SAFE = [
    /^rows\.join\(""\)$/, /^parts\.join\(" · "\)$/, /^primary$/, /^route$/, /^primary \? "btn primary" : "textlink"$/,
    /^primary \? "" : '<span aria-hidden="true"> \\u2197<\/span>'$/, /^qs\.join\(""\)$/, /^link$/, /^mcLink\(mcUrl, false\)$/,
    /^foldOpen\(moreOpen, !!\(getUser\(\) || getToken\(\)\)\) \? " open" : ""$/,
    /^sub$/, /^s\.cls$/, /^asks \? " ask-ctx" : ""$/, /^shareButtonHTML\(\)$/,
  ];
  // `fn(...)` whose opening paren closes at the very last character, so a
  // call followed by `+ f.raw` does not pass as "one esc call".
  const wholeCall = (expr) => {
    const open = expr.indexOf("(");
    if (!/^\w+$/.test(expr.slice(0, open)) || !expr.endsWith(")")) return false;
    let d = 0;
    for (let k = open; k < expr.length; k++) {
      d += expr[k] === "(" ? 1 : expr[k] === ")" ? -1 : 0;
      if (d === 0) return k === expr.length - 1;
    }
    return false;
  };
  const CALLS = new Set(["esc", "starHTML", "svgIcon", "tableRowHTML"]);
  // The link helpers are arrow consts: each ends at the first `;` that
  // closes a line and is followed by the next const, a blank line or a comment.
  const ARROWS = new Set(["mcLink", "linksHTML", "moreHTML"]);
  for (const name of ["popupHTML", "placeHTML", "mcLink", "linksHTML", "moreHTML"]) {
    const m = src.match(ARROWS.has(name)
      ? new RegExp(`\\nconst ${name} = [\\s\\S]*?;\\n(?=const |\\n|//)`)
      : new RegExp(`\\nfunction ${name}\\(.*?\\n\\}\\n`, "s"));
    assert.ok(m, name);
    // Walk each ${ … } with brace counting so nested template literals count.
    const body = m[0], bad = [];
    for (let i = body.indexOf("${"); i !== -1; i = body.indexOf("${", i + 2)) {
      let depth = 1, j = i + 2;
      while (depth && j < body.length) depth += body[j] === "{" ? 1 : body[j] === "}" ? -1 : 0, j++;
      const expr = body.slice(i + 2, j - 1).trim();
      if (!(CALLS.has(expr.split("(")[0]) && wholeCall(expr)) && !SAFE.some((re) => re.test(expr))) bad.push(expr);
      // Skip over the expression: its own nested ${} are inside esc(...) etc.
      i = j - 2;
    }
    assert.deepEqual(bad, [], `${name}: unescaped interpolation`);
  }
});

// The high-chair file is optional (v110). Among DATA_URLS, boot's first paint
// and, in the app, stats.json's promotion would wait on it: a slow or missing
// file would hold back the pins, and keep the app downloading them again.
test("the high-chair file is loaded apart from DATA_URLS, after the first paint", () => {
  const urls = src.slice(src.indexOf("const DATA_URLS = ["), src.indexOf("];", src.indexOf("const DATA_URLS = [")));
  assert.ok(!urls.includes("highchair"), "highchair_places.geojson is not one of DATA_URLS");
  const boot = src.slice(src.indexOf("async function boot()"));
  const paint = boot.indexOf("applyDataset(...lastJsons);");
  assert.ok(paint > 0 && boot.indexOf("loadHighchairPlaces(") > paint);
  // An offline boot's retry brings the rings too, one load at a time.
  const retry = src.slice(src.indexOf("async function retryDataset()"), src.indexOf("async function boot()"));
  assert.match(retry, /if \(!baseHcPlacesFC\) loadHighchairPlaces\(\);/);
  assert.match(src, /function loadHighchairPlaces\(statsRefreshed\) \{\n  if \(hcLoading\) return;/);
});

// A layer drawn from the place source that the tap does not query opens
// nothing: the high chair in a high-chair ring (v111) covers its middle.
test("every layer on the place source is hit-tested and opens a place card", () => {
  const onPlaces = [...src.matchAll(/id: (\w+), type: "\w+", source: PLACES\b/g)].map((m) => m[1]);
  const listed = src.match(/const PLACE_LAYERS = \[([^\]]*)\]/)[1].split(",").map((x) => x.trim());
  assert.deepEqual([...onPlaces].sort(), [...listed].sort());
  assert.ok(onPlaces.includes("PLACES_HC"));
  assert.match(src, /const PIN_LAYERS = \[[^\]]*\.\.\.PLACE_LAYERS\];/);
  assert.match(src, /if \(PLACE_LAYERS\.includes\(hit\.layer\.id\)\) openPlacePopup\(/);
});

// The add dialog's venue step (v112): the three questions unfolded, each
// answer written on its own, and a login round trip that brings back the
// place's amenity so the high-chair question renders again.
test("the venue step asks table, play and high chair, and its intent keeps the amenity", () => {
  const ask = src.match(/function askVenue\(row, busy = false\) \{[\s\S]*?\n\}\n/)[0];
  assert.match(ask, /askHTML\("askTable", busy\) \+ askPlayHTML\(busy\) \+\n\s+\(isHighchairVenue\(row\.amenity\) \? askHighchairHTML\(busy\) : ""\)/);
  assert.doesNotMatch(ask, /moreHTML/);
  const fn = src.match(/async function answerVenue\([\s\S]*?\n\}\n/)[0];
  assert.match(fn, /amenity: venue\.amenity \}/);
  assert.match(fn, /a = venueAnswer\(choice\);\n\s+const out = await writeTags\(osm, token, ref, a\.patch, CHANGESET_COMMENT\[a\.comment\]\);/);
  assert.match(fn, /if \(a\.pin\) \{\n\s+writeAddWatch\(/);
  assert.match(src, /const VENUE_Q_SEL = \{ table: "\.ask", play: "\.ask-play", hc: "\.ask-hc" \};/);
  assert.match(src, /const venue = venueFromIntent\(intent\);/);
});
