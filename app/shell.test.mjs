import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appShell } from "./shell.mjs";

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
