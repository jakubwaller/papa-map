import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appShell } from "./shell.mjs";

const page = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");

test("the app's shell has no donate link, and loses nothing else", () => {
  const out = appShell(page);
  assert.doesNotMatch(out, /ko-fi\.com/i);
  assert.match(out, />Status<\/a> · <a href="https:\/\/jakubwaller\.eu"/);
  assert.equal(page.length - out.length, page.match(/ · <a href="https:\/\/ko-fi[^>]*>[^<]*<\/a>/)[0].length);
});

test("a footer without the link fails the build instead of passing quietly", () => {
  assert.throws(() => appShell("<div id=\"attribution\"></div>"), /no Ko-fi link/);
});

test("a second link elsewhere on the page is caught", () => {
  assert.throws(() => appShell(page + '<a href="https://ko-fi.com/x">x</a>'), /left after the cut/);
});
