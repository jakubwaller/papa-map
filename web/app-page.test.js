// The app page asks one question and counts the answer; this pins the parts
// that have to agree without ever running together: the two pages' fetch
// paths, the Caddyfile that answers and logs them, the header pill's per-
// language target, and the sitemap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STRINGS, LANGS } from "./i18n.js";

const dir = new URL(".", import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), "utf8");
const PAGES = ["app.html", "app-en.html"];
const caddy = read("../deploy/papamap.Caddyfile");

test("every language's app link lands on one of the two pages", () => {
  for (const lang of LANGS) {
    assert.ok(PAGES.includes(STRINGS[lang].appHref), `${lang}: ${STRINGS[lang].appHref}`);
    assert.ok(STRINGS[lang].app.trim(), `${lang}: empty label`);
    assert.ok(STRINGS[lang].ariaApp.includes("PapaMap"), `${lang}: aria`);
  }
  assert.equal(STRINGS.de.appHref, "app.html");
  assert.equal(STRINGS.en.appHref, "app-en.html");
});

test("the buttons post to the paths Caddy answers 204 and logs", () => {
  for (const f of PAGES) {
    const html = read(f);
    assert.ok(html.includes('data-tap="iphone"') && html.includes('data-tap="android"'), f);
    assert.ok(html.includes('fetch("/app/ja/" + which, { method: "POST"'), f);
    assert.ok(html.includes('localStorage.getItem(KEY)') && html.includes('"papamap-app"'), f);
  }
  assert.ok(caddy.includes("path /app/ja/iphone /app/ja/android"));
  assert.ok(caddy.includes("header Origin https://papamap.de"));
  assert.ok(caddy.includes("handle @tap {") && caddy.includes("respond 204"));
  // The log holds the taps and nothing else — no page views — and is stripped.
  assert.ok(caddy.includes("not path /app/ja/*"));
  assert.ok(caddy.includes("log_skip @outside_taps"));
  for (const field of ["request>remote_ip", "request>client_ip", "request>headers"])
    assert.ok(caddy.includes(`${field} delete`), field);
});

test("the header pill, the sitemap and the pages know each other", () => {
  const index = read("index.html");
  assert.ok(index.includes('id="app-link"') && index.includes('data-i18n="app"'));
  assert.ok(read("index-en.html").includes('id="app-link"'), "index-en.html is regenerated");
  assert.ok(read("app.js").includes('getElementById("app-link").href = t("appHref")'));
  const sitemap = read("sitemap.xml");
  for (const f of PAGES)
    assert.ok(sitemap.includes(`<loc>https://papamap.de/${f}</loc>`), f);
  assert.ok(read("app.html").includes('hreflang="en" href="https://papamap.de/app-en.html"'));
  assert.ok(read("app-en.html").includes('hreflang="de" href="https://papamap.de/app.html"'));
  // The Datenschutz names the storage key and the count.
  const ds = read("datenschutz.html");
  assert.ok(ds.includes("<code>papamap-app</code>") && ds.includes("keine IP-Adresse"));
});
