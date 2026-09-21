import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appShell, localRefs, moduleRefs, unbundled } from "./shell.mjs";

const page = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");

test("the app's shell has no donate link, and loses nothing else", () => {
  const out = appShell(page);
  assert.doesNotMatch(out, /ko-fi\.com/i);
  // And no empty span where it was: the separator is inside the span, so what
  // is left reads as if the coffee link had never been in the line.
  assert.doesNotMatch(out, /class="donate"/);
  assert.match(out, />Status<\/a> · <a href="https:\/\/jakubwaller\.eu"/);
  assert.equal(page.length - out.length,
               page.match(/<span class="donate">[\s\S]*?<\/span>/)[0].length);
});

test("a footer without the span fails the build instead of passing quietly", () => {
  assert.throws(() => appShell("<div id=\"attribution\"></div>"), /no donate span/);
});

test("a donate span that no longer holds the link is caught", () => {
  assert.throws(
    () => appShell('<span class="donate"> · <a href="https://example.com/">x</a></span>'),
    /no Ko-fi link/);
});

test("a second link elsewhere on the page is caught", () => {
  assert.throws(() => appShell(page + '<a href="https://ko-fi.com/x">x</a>'), /left after the cut/);
});

test("a second donate span elsewhere on the page is caught", () => {
  assert.throws(() => appShell(page + '<span class="donate">x</span>'), /second donate span/);
});

test("the page's own files are found, pins cut, pages and absolute URLs left out", () => {
  const refs = localRefs(`
    <link rel="canonical" href="https://example.com/" />
    <link rel="stylesheet" href="style.css?v=app1" />
    <link rel="icon" href="icons/favicon-32.png" />
    <script type="module" src="app.js?v=app1"></script>
    <script src="//cdn.example.com/x.js"></script>
    <a href="leaderboard.html">x</a>
    <img alt="" src="icon.svg#mark">`);
  assert.deepEqual(refs, ["style.css", "icons/favicon-32.png", "app.js", "icon.svg"]);
});

test("a file the page loads that the build does not copy is named", () => {
  assert.deepEqual(unbundled(["app.js", "icons/a.png", "new.css"], ["app.js"], ["icons"]), ["new.css"]);
  // "icons" covers icons/…, not a file that merely starts with the word.
  assert.deepEqual(unbundled(["iconsheet.css"], [], ["icons"]), ["iconsheet.css"]);
});

test("the real page loads the files the build knows about", () => {
  const refs = localRefs(appShell(page));
  for (const f of ["app.js", "style.css", "favicon.svg", "manifest.webmanifest",
                   "icons/favicon-32.png", "icons/apple-touch-icon.png", "vendor/maplibre-gl.js"])
    assert.ok(refs.includes(f), f);
});

test("quoting, case, ./ and / prefixes, srcset and <source> are read; a commented-out tag is not", () => {
  const refs = localRefs(`
    <!-- <link rel="stylesheet" href="gone.css" /> -->
    <LINK rel='stylesheet' href='./a.css'>
    <script src="/b.js"></script>
    <img srcset="c.png 1x, icons/c@2x.png 2x" src="c.png">
    <picture><source src="d.webp"></picture>
    <img src="data:image/png;base64,AAAA">`);
  assert.deepEqual(refs, ["a.css", "b.js", "c.png", "icons/c@2x.png", "d.webp"]);
});

test("a module's imports are found: static, side-effect and dynamic, never a package or a URL", () => {
  const refs = moduleRefs(`
    import { a,
             b } from "./datasource.js?v=app1";
    import './side.js';
    const m = await import("./lazy.js");
    import x from "some-package";
    import y from "https://example.com/y.js";`);
  assert.deepEqual(refs, ["datasource.js", "side.js", "lazy.js"]);
});

test("the real app.js imports the modules the build knows about", () => {
  const js = readFileSync(new URL("../web/app.js", import.meta.url), "utf8");
  const refs = moduleRefs(js);
  for (const f of ["datasource.js", "i18n.js", "osm.js", "me.js", "native.js"])
    assert.ok(refs.includes(f), f);
});
