// Pins index-en.html to its source. The file is generated, not maintained:
// any head edit in index.html lands here only through
// `node web/build-index-en.js`, and this test is what makes forgetting that
// a red CI run instead of a silently-German English card.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildIndexEn } from "./build-index-en.js";
import { STRINGS } from "./i18n.js";

const dir = new URL(".", import.meta.url);
const src = readFileSync(new URL("index.html", dir), "utf8");
const committed = readFileSync(new URL("index-en.html", dir), "utf8");

test("index-en.html is regenerated from index.html (node web/build-index-en.js)", () => {
  assert.equal(committed, buildIndexEn(src));
});

// What the unfurler actually reads off /?lang=en — the card that started
// this: https://hostux.social/@aloissiola/117167688517318993
test("the English page cards in English", () => {
  assert.ok(committed.includes(
    `<meta property="og:title" content="${STRINGS.en.title}" />`));
  assert.ok(committed.includes(
    `<meta property="og:description" content="${STRINGS.en.metaDescription}" />`));
  assert.ok(committed.includes(
    '<meta property="og:url" content="https://papamap.de/?lang=en" />'));
  assert.ok(committed.includes("og-image-en.jpg?v="));
  assert.ok(committed.includes('<html lang="en">'));
  // Nothing German survives in the head above the JSON-LD dataset block,
  // which stays shared and deliberately multilingual.
  const head = committed.slice(0, committed.indexOf("application/ld+json"));
  assert.ok(!head.includes(STRINGS.de.title));
  assert.ok(!head.includes(STRINGS.de.metaDescription));
});

// The rewrite target must stay where deploy/papamap.Caddyfile points.
test("the Caddy rewrite and the generated file agree on the path", () => {
  const caddy = readFileSync(new URL("../deploy/papamap.Caddyfile", dir), "utf8");
  assert.ok(caddy.includes("rewrite @apex_en /index-en.html"));
  assert.ok(caddy.includes("query lang=en"));
});
